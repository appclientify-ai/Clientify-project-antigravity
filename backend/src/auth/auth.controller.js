import { getCollection } from '../db/mongo.js';
import { generateToken } from './jwt.js';
import { ObjectId } from 'mongodb';
import { hashPassword, verifyPassword } from './password.js';

const escapeRegex = (str) => {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const signup = async (req, res) => {
  const { username, mobile_no, email_id, firm_name, gstn, user_id, password } = req.body;

  if (!username || !email_id || !user_id || !password) {
    return res.status(400).json({ error: 'Principal identity fields are mandatory' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    const users = getCollection('users');
    
    // Check for collisions in unique identifier space
    const existing = await users.findOne({ 
      $or: [
        { email_id: email_id.toLowerCase().trim() },
        { user_id: user_id.trim() }
      ]
    });

    if (existing) {
      if (existing.email_id === email_id.toLowerCase().trim()) {
        return res.status(400).json({ error: 'Professional email already registered' });
      }
      if (existing.user_id === user_id.trim()) {
        return res.status(400).json({ error: 'Master User ID is already claimed' });
      }
    }

    const hashedPassword = hashPassword(password);

    const newUser = {
      username: username.trim(),
      mobile_no: mobile_no ? mobile_no.trim() : null,
      email_id: email_id.toLowerCase().trim(),
      firm_name: firm_name ? firm_name.trim() : null,
      gstn: gstn ? gstn.trim() : null,
      user_id: user_id.trim(),
      password: hashedPassword,
      createdAt: new Date(),
      status: 'online',
      avatar: null
    };

    const result = await users.insertOne(newUser);
    const userResponse = { 
      id: result.insertedId, 
      username: newUser.username, 
      user_id: newUser.user_id, 
      email_id: newUser.email_id,
      firm_name: newUser.firm_name,
      gstn: newUser.gstn,
      avatar: newUser.avatar
    };
    const token = generateToken({ ...newUser, _id: result.insertedId });

    res.status(201).json({
      token,
      user: userResponse
    });
  } catch (err) {
    console.error('Onboarding Error:', err);
    res.status(500).json({ error: 'Firm registration failed during vault initialization' });
  }
};

export const login = async (req, res) => {
  const { user_id, password } = req.body;

  if (!user_id || !password) {
    return res.status(400).json({ error: 'Credentials required for vault access' });
  }

  try {
    const users = getCollection('users');
    const user = await users.findOne({ 
      $or: [
        { user_id: user_id.trim() },
        { email_id: user_id.toLowerCase().trim() }
      ]
    });

    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ error: 'Authentication failed. Invalid User ID or Password.' });
    }

    // Transparently migrate legacy unhashed password if detected
    if (user.password && !user.password.includes(':')) {
      const secureHash = hashPassword(password);
      users.updateOne({ _id: user._id }, { $set: { password: secureHash } }).catch(err => {
        console.warn('Password hash migration deferred:', err.message);
      });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: { 
        id: user._id, 
        username: user.username, 
        user_id: user.user_id, 
        email_id: user.email_id,
        firm_name: user.firm_name,
        gstn: user.gstn,
        avatar: user.avatar
      }
    });
  } catch (err) {
    console.error('Authentication Error:', err);
    res.status(500).json({ error: 'Vault access denied due to internal error' });
  }
};

export const recoverIdentity = async (req, res) => {
  const { username, mobile_no, email_id } = req.body;

  if (!username || !mobile_no || !email_id) {
    return res.status(400).json({ error: 'Name, Mobile, and Email are required for identity lookup' });
  }

  try {
    const users = getCollection('users');
    const user = await users.findOne({
      username: { $regex: new RegExp(`^${escapeRegex(username.trim())}$`, 'i') },
      mobile_no: mobile_no.trim(),
      email_id: { $regex: new RegExp(`^${escapeRegex(email_id.trim())}$`, 'i') }
    });

    if (!user) {
      return res.status(404).json({ error: 'No practitioner found with these details.' });
    }

    res.json({ user_id: user.user_id });
  } catch (err) {
    console.error('Recovery Error:', err);
    res.status(500).json({ error: 'Lookup failed during vault synchronization.' });
  }
};

export const resetPasswordRecovery = async (req, res) => {
  const { user_id, new_password, username, mobile_no, email_id } = req.body;

  if (!user_id || !new_password || !username || !mobile_no || !email_id) {
    return res.status(400).json({ error: 'Missing security verification parameters.' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    const users = getCollection('users');
    const user = await users.findOne({
      user_id: user_id.trim(),
      username: { $regex: new RegExp(`^${escapeRegex(username.trim())}$`, 'i') },
      mobile_no: mobile_no.trim(),
      email_id: { $regex: new RegExp(`^${escapeRegex(email_id.trim())}$`, 'i') }
    });

    if (!user) {
      return res.status(403).json({ error: 'Identity validation failed. Access denied.' });
    }

    const hashedPassword = hashPassword(new_password);

    await users.updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword, updatedAt: new Date() } }
    );

    res.json({ message: 'Success' });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error: 'Password vault rotation failed.' });
  }
};

export const me = async (req, res) => {
  res.json({ 
    user: {
      id: req.user._id,
      username: req.user.username,
      user_id: req.user.user_id,
      email_id: req.user.email_id,
      firm_name: req.user.firm_name,
      gstn: req.user.gstn,
      avatar: req.user.avatar
    } 
  });
};

export const updateProfile = async (req, res) => {
  const { username, mobile_no, email_id, firm_name, gstn, user_id, password, avatar } = req.body;
  const userId = req.user._id;

  try {
    const users = getCollection('users');
    const updateData = {};
    if (username) updateData.username = username.trim();
    if (mobile_no) updateData.mobile_no = mobile_no.trim();
    if (email_id) updateData.email_id = email_id.toLowerCase().trim();
    if (firm_name !== undefined) updateData.firm_name = firm_name ? firm_name.trim() : null;
    if (gstn !== undefined) updateData.gstn = gstn ? gstn.trim() : null;
    if (user_id) updateData.user_id = user_id.trim();
    if (password) updateData.password = hashPassword(password);
    if (avatar !== undefined) updateData.avatar = avatar;

    // Check if new user_id is taken
    if (user_id && user_id.trim() !== req.user.user_id) {
      const existing = await users.findOne({ user_id: user_id.trim() });
      if (existing) return res.status(400).json({ error: 'New Master User ID is already claimed' });
    }

    const result = await users.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      { $set: updateData },
      { returnDocument: 'after' }
    );

    const updatedUser = result && result.value ? result.value : result;
    if (!updatedUser) return res.status(404).json({ error: 'User not found' });

    res.json({
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        user_id: updatedUser.user_id,
        email_id: updatedUser.email_id,
        firm_name: updatedUser.firm_name,
        gstn: updatedUser.gstn,
        avatar: updatedUser.avatar
      }
    });
  } catch (err) {
    console.error('Profile Update Error:', err);
    res.status(500).json({ error: 'Failed to update professional profile' });
  }
};
