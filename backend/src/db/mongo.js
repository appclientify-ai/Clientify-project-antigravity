import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || 'clientify';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

let isUsingFallback = false;
const fallbackData = {
  users: [],
  items: []
};

function loadFallbackData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.users) fallbackData.users = parsed.users;
      if (parsed.items) fallbackData.items = parsed.items;
    }
  } catch (e) {
    console.warn('⚠️ Fallback data load warning:', e.message);
  }
}

let saveFallbackTimeout = null;

function saveFallbackData() {
  if (saveFallbackTimeout) return;
  saveFallbackTimeout = setTimeout(async () => {
    saveFallbackTimeout = null;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        await fs.promises.mkdir(DATA_DIR, { recursive: true });
      }
      const tmpPath = `${DATA_FILE}.tmp`;
      await fs.promises.writeFile(tmpPath, JSON.stringify(fallbackData, null, 2), 'utf-8');
      await fs.promises.rename(tmpPath, DATA_FILE);
    } catch (e) {
      console.warn('⚠️ Fallback data save warning:', e.message);
    }
  }, 200);
}

function setDeepProperty(obj, pathStr, value) {
  const parts = pathStr.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!curr[p] || typeof curr[p] !== 'object') {
      curr[p] = {};
    }
    curr = curr[p];
  }
  curr[parts[parts.length - 1]] = value;
}

function getDeepProperty(obj, pathStr) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (pathStr in obj) return obj[pathStr];
  const parts = pathStr.split('.');
  let curr = obj;
  for (const p of parts) {
    if (curr === null || curr === undefined || typeof curr !== 'object') return undefined;
    curr = curr[p];
  }
  return curr;
}

function matchFilter(doc, filter) {
  if (!filter || Object.keys(filter).length === 0) return true;
  for (const key of Object.keys(filter)) {
    if (key === '$or') {
      const conditions = filter['$or'];
      const anyMatch = conditions.some(cond => matchFilter(doc, cond));
      if (!anyMatch) return false;
      continue;
    }
    if (key === '$and') {
      const conditions = filter['$and'];
      const allMatch = conditions.every(cond => matchFilter(doc, cond));
      if (!allMatch) return false;
      continue;
    }
    const val = filter[key];
    const docVal = getDeepProperty(doc, key);

    if (key === '_id') {
      const targetId = val ? (val.toString ? val.toString() : String(val)) : '';
      const docId = doc._id ? (doc._id.toString ? doc._id.toString() : String(doc._id)) : '';
      if (val && typeof val === 'object' && val.$in && Array.isArray(val.$in)) {
        const idMatches = val.$in.map(v => v ? (v.toString ? v.toString() : String(v)) : '');
        if (!idMatches.includes(docId)) return false;
        continue;
      }
      if (targetId !== docId) return false;
      continue;
    }

    if (val && typeof val === 'object') {
      if (val.$in && Array.isArray(val.$in)) {
        const docValStr = docVal ? (docVal.toString ? docVal.toString() : String(docVal)) : '';
        const inMatch = val.$in.some(item => {
          if (item === docVal) return true;
          if (item && docVal && (item.toString ? item.toString() : String(item)) === docValStr) return true;
          return false;
        });
        if (!inMatch) return false;
        continue;
      }
      if (val.$nin && Array.isArray(val.$nin)) {
        const docValStr = docVal ? (docVal.toString ? docVal.toString() : String(docVal)) : '';
        const ninMatch = val.$nin.some(item => (item === docVal || (item && docVal && (item.toString ? item.toString() : String(item)) === docValStr)));
        if (ninMatch) return false;
        continue;
      }
      if (val.$exists !== undefined) {
        const exists = docVal !== undefined && docVal !== null;
        if (val.$exists && !exists) return false;
        if (!val.$exists && exists) return false;
        continue;
      }
      if (val.$ne !== undefined) {
        if (docVal === val.$ne) return false;
        continue;
      }
      if (val.$regex) {
        const reg = new RegExp(val.$regex.source || val.$regex, val.$regex.flags || 'i');
        if (!reg.test(docVal || '')) return false;
        continue;
      }
    }

    if (docVal !== val) return false;
  }
  return true;
}

function applyUpdates(doc, updateObj, isInsert = false) {
  if (updateObj.$set) {
    for (const [k, v] of Object.entries(updateObj.$set)) {
      setDeepProperty(doc, k, v);
    }
  }
  if (isInsert && updateObj.$setOnInsert) {
    for (const [k, v] of Object.entries(updateObj.$setOnInsert)) {
      setDeepProperty(doc, k, v);
    }
  }
}

class InMemoryCollection {
  constructor(name) {
    this.name = name;
    if (!fallbackData[name]) fallbackData[name] = [];
    this.list = fallbackData[name];
  }

  async createIndex() { return true; }

  async findOne(filter) {
    return this.list.find(doc => matchFilter(doc, filter)) || null;
  }

  async countDocuments(filter) {
    if (!filter || Object.keys(filter).length === 0) return this.list.length;
    return this.list.filter(doc => matchFilter(doc, filter)).length;
  }

  find(filter, projectionObj) {
    let result = [...this.list.filter(doc => matchFilter(doc, filter))];
    let skipCount = 0;
    let limitCount = Infinity;

    const cursor = {
      project: () => cursor,
      select: () => cursor,
      sort: (sortObj) => {
        const keys = Object.keys(sortObj || {});
        if (keys.length > 0) {
          const key = keys[0];
          const dir = sortObj[key];
          result.sort((a, b) => {
            const valA = getDeepProperty(a, key) ?? a[key] ?? '';
            const valB = getDeepProperty(b, key) ?? b[key] ?? '';
            if (valA < valB) return dir > 0 ? -1 : 1;
            if (valA > valB) return dir > 0 ? 1 : -1;
            return 0;
          });
        }
        return cursor;
      },
      skip: (n) => {
        skipCount = Math.max(0, n || 0);
        return cursor;
      },
      limit: (n) => {
        if (n > 0) limitCount = n;
        return cursor;
      },
      toArray: async () => {
        return result.slice(skipCount, skipCount + limitCount);
      }
    };
    return cursor;
  }

  async insertOne(doc) {
    const _id = doc._id || new ObjectId();
    const newDoc = { ...doc, _id };
    this.list.push(newDoc);
    saveFallbackData();
    return { insertedId: _id, value: newDoc };
  }

  async insertMany(docs) {
    const insertedIds = {};
    const newDocs = docs.map((doc, idx) => {
      const _id = doc._id || new ObjectId();
      insertedIds[idx] = _id;
      return { ...doc, _id };
    });
    this.list.push(...newDocs);
    saveFallbackData();
    return { insertedCount: newDocs.length, insertedIds };
  }

  async updateOne(filter, update) {
    const doc = this.list.find(d => matchFilter(d, filter));
    if (doc) {
      applyUpdates(doc, update, false);
      saveFallbackData();
      return { modifiedCount: 1, matchedCount: 1 };
    }
    return { modifiedCount: 0, matchedCount: 0 };
  }

  async findOneAndUpdate(filter, update, options = {}) {
    let doc = this.list.find(d => matchFilter(d, filter));
    if (!doc && options.upsert) {
      const _id = new ObjectId();
      doc = { _id };
      applyUpdates(doc, update, true);
      this.list.push(doc);
      saveFallbackData();
      return doc;
    }
    if (doc) {
      applyUpdates(doc, update, false);
      saveFallbackData();
      return doc;
    }
    return null;
  }

  async deleteOne(filter) {
    const index = this.list.findIndex(d => matchFilter(d, filter));
    if (index !== -1) {
      this.list.splice(index, 1);
      saveFallbackData();
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  async deleteMany(filter) {
    const initialLen = this.list.length;
    this.list = this.list.filter(d => !matchFilter(d, filter));
    fallbackData[this.name] = this.list;
    const deletedCount = initialLen - this.list.length;
    if (deletedCount > 0) {
      saveFallbackData();
    }
    return { deletedCount };
  }

  async updateMany(filter, update) {
    let modifiedCount = 0;
    this.list.forEach(doc => {
      if (matchFilter(doc, filter)) {
        applyUpdates(doc, update, false);
        modifiedCount++;
      }
    });
    if (modifiedCount > 0) {
      saveFallbackData();
    }
    return { modifiedCount, matchedCount: modifiedCount };
  }

  watch() {
    return {
      on: () => {},
      close: () => {}
    };
  }
}

let realClient = null;

if (uri) {
  realClient = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    connectTimeoutMS: 5000,
    serverSelectionTimeoutMS: 5000
  });
}

export const client = {
  close: async () => {
    if (realClient) {
      try { await realClient.close(); } catch (e) {}
    }
  }
};

export async function connectDB() {
  if (!uri) {
    console.warn('⚠️ MONGODB_URI environment variable is missing. Operating in resilient local storage mode.');
    isUsingFallback = true;
    loadFallbackData();
    return;
  }

  try {
    console.log('🛡️ Initializing Vault Connection...');
    await realClient.connect();
    await realClient.db("admin").command({ ping: 1 });
    console.log("✅ Secure connection established with MongoDB Cluster.");

    const db = realClient.db(dbName);
    await db.collection('users').createIndex({ user_id: 1 }, { unique: true });
    await db.collection('users').createIndex({ email_id: 1 }, { unique: true });
    await db.collection('items').createIndex({ createdBy: 1, name: 1, updatedAt: -1 });
    await db.collection('items').createIndex({ createdBy: 1, updatedAt: -1 });
    await db.collection('items').createIndex({ name: 1, updatedAt: -1 });
    return db;
  } catch (error) {
    console.warn('⚠️ Connection to remote MongoDB cluster failed:', error.message);
    console.warn('🛡️ Falling back to resilient local storage mode for uninterrupted server operation.');
    isUsingFallback = true;
    loadFallbackData();
  }
}

export const getDB = () => {
  if (isUsingFallback || !realClient) {
    return {
      collection: (name) => new InMemoryCollection(name)
    };
  }
  return realClient.db(dbName);
};

export const getCollection = (name) => {
  if (isUsingFallback || !realClient) {
    return new InMemoryCollection(name);
  }
  return realClient.db(dbName).collection(name);
};
