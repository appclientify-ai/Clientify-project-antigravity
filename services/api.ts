import { API_BASE_URL } from '../constants.ts';
import { 
  Client, LitigationRecord, InvoiceRecord, PaymentRecord, 
  InvoiceSettings, GSTRegistrationRecord, FoodLicenseRecord, 
  MSMERegistrationRecord, MiscWorkRecord, PortalCredentialRecord, User
} from '../types.ts';

function getFinancialYear(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  if (month >= 3) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
}

class ApiService {
  private token: string | null = null;
  private itemsCacheData: any[] | null = null;
  private itemsInflightPromise: Promise<any[]> | null = null;
  private categoryCacheMap: Map<string, { data: any[]; timestamp: number }> = new Map();
  private categoryInflightPromises: Map<string, Promise<any[]>> = new Map();

  setToken(token: string | null) {
    this.token = token;
  }

  public invalidateCache(category?: string) {
    if (category) {
      this.categoryCacheMap.delete(category);
      this.categoryInflightPromises.delete(category);
    } else {
      this.categoryCacheMap.clear();
      this.categoryInflightPromises.clear();
      this.itemsCacheData = null;
      this.itemsInflightPromise = null;
    }
  }

  async getItemsByCategory(category: string, forceRefresh = false): Promise<any[]> {
    if (!forceRefresh) {
      const cached = this.categoryCacheMap.get(category);
      if (cached && (Date.now() - cached.timestamp < 1000 * 60 * 5)) {
        return cached.data;
      }
      const inflight = this.categoryInflightPromises.get(category);
      if (inflight) {
        return inflight;
      }
    }

    const promise = (async () => {
      try {
        const items = await this.get(`/items?name=${encodeURIComponent(category)}`);
        const result = Array.isArray(items) ? items : (items && Array.isArray(items.items) ? items.items : []);
        this.categoryCacheMap.set(category, { data: result, timestamp: Date.now() });
        return result;
      } finally {
        this.categoryInflightPromises.delete(category);
      }
    })();

    this.categoryInflightPromises.set(category, promise);
    return promise;
  }

  async getItems(forceRefresh = false): Promise<any[]> {
    if (!forceRefresh && this.itemsCacheData) {
      return this.itemsCacheData;
    }
    if (!forceRefresh && this.itemsInflightPromise) {
      return this.itemsInflightPromise;
    }

    this.itemsInflightPromise = (async () => {
      try {
        const items = await this.get('/items');
        this.itemsCacheData = Array.isArray(items) ? items : (items && Array.isArray(items.items) ? items.items : []);
        return this.itemsCacheData;
      } finally {
        this.itemsInflightPromise = null;
      }
    })();

    return this.itemsInflightPromise;
  }

  private getFullUrl(endpoint: string): string {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const apiPath = cleanEndpoint.startsWith('/api') ? cleanEndpoint : `/api${cleanEndpoint}`;
    return `${API_BASE_URL}${apiPath}`;
  }

  private async handleResponse(response: Response) {
    if (response.status === 401) {
      document.cookie = 'clientify_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      window.location.reload();
      return;
    }
    
    const responseText = await response.text();
    let result;
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
      throw new Error(`Cloud Error ${response.status}: Failed to parse response from ${response.url}`);
    }
    
    if (!response.ok) {
      throw new Error(result.message || result.error || `Vault Access Failed (${response.status}) at ${response.url}`);
    }
    return result;
  }

  
  async patch(endpoint: string, data: any) {
    this.invalidateCache();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const url = this.getFullUrl(endpoint);
    try {
      const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(data) });
      return this.handleResponse(res);
    } catch (err: any) {
      throw new Error(`Connection Failed: Could not reach ${url}.`);
    }
  }

  async get(endpoint: string) {
    const headers: HeadersInit = this.token ? { 'Authorization': `Bearer ${this.token}` } : {};
    const url = this.getFullUrl(endpoint);
    try {
      const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
      return this.handleResponse(res);
    } catch (err: any) {
      throw new Error(`Connection Failed: Could not reach ${url}. Check VITE_BACKEND_URL.`);
    }
  }

  async post(endpoint: string, data: any) {
    this.invalidateCache();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
    };
    const url = this.getFullUrl(endpoint);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });
      return this.handleResponse(res);
    } catch (err: any) {
      throw new Error(`Connection Failed: Could not reach ${url}.`);
    }
  }

  async put(endpoint: string, data: any) {
    this.invalidateCache();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
    };
    const url = this.getFullUrl(endpoint);
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
    return this.handleResponse(res);
  }

  async delete(endpoint: string) {
    this.invalidateCache();
    const headers: HeadersInit = this.token ? { 'Authorization': `Bearer ${this.token}` } : {};
    const url = this.getFullUrl(endpoint);
    const res = await fetch(url, { method: 'DELETE', headers });
    return this.handleResponse(res);
  }

  private transformItem<T>(item: any): T {
    if (!item) return null as any;
    return {
      ...item.data,
      id: item._id,
      createdAt: item.createdAt
    } as T;
  }

  async updateProfile(data: Partial<User>): Promise<{ user: User }> {
    return this.put('/auth/update', data);
  }

  async backupAllData(): Promise<string> {
    const items = await this.getItems();
    return JSON.stringify(items, null, 2);
  }

  async restoreData(items: any[]): Promise<void> {
    for (const item of items) {
      const payload = { name: item.name, data: item.data };
      await this.post('/items', payload);
    }
  }

  async getDashboardData(): Promise<{ summary: any; filingDataCache: Record<string, any> }> {
    try {
      const res = await this.get('/items/dashboard/summary');
      if (res && res.summary) {
        const [tribunal, highcourt] = await Promise.all([
          this.getTribunalRecords().catch(() => []),
          this.getHighCourtRecords().catch(() => [])
        ]);
        const tribunalList = tribunal || [];
        const highcourtList = highcourt || [];

        const isMatch = (a: any, b: any) => {
          if (a.id && b.id && String(a.id) === String(b.id)) return true;
          if (a._id && b._id && String(a._id) === String(b._id)) return true;
          if (a.id && b._id && String(a.id) === String(b._id)) return true;
          if (a._id && b.id && String(a._id) === String(b.id)) return true;
          const clientA = (a.clientName || '').trim().toLowerCase();
          const clientB = (b.clientName || '').trim().toLowerCase();
          if (clientA && clientA === clientB) {
            const refA = (a.noticeNo || a.orderNo || a.replyReferenceNo || a.caseNo || a.filingNo || '').trim().toLowerCase();
            const refB = (b.noticeNo || b.orderNo || b.replyReferenceNo || b.caseNo || b.filingNo || '').trim().toLowerCase();
            if (refA && refA === refB) return true;
            if (a.hearingDate && a.hearingDate === b.hearingDate) return true;
            if (a.appDate && a.appDate === b.appDate) return true;
          }
          return false;
        };

        const filteredLitigation = (res.summary.litigation || []).filter((r: any) => {
          if (r.category === 'Tribunal' && tribunalList.length > 0) {
            if (tribunalList.some(t => isMatch(r, t))) return false;
          }
          if (r.category === 'HighCourt' && highcourtList.length > 0) {
            if (highcourtList.some(h => isMatch(r, h))) return false;
          }
          return true;
        });

        const extraTribunal = tribunalList.filter(t => !filteredLitigation.some(r => isMatch(r, t))).map(r => ({ ...r, category: r.category || 'Tribunal' }));
        const extraHighcourt = highcourtList.filter(h => !filteredLitigation.some(r => isMatch(r, h))).map(r => ({ ...r, category: r.category || 'HighCourt' }));

        res.summary.litigation = [
          ...filteredLitigation,
          ...extraTribunal,
          ...extraHighcourt
        ];
        return res;
      }
    } catch (e) {
      console.warn('Dedicated dashboard endpoint failed, falling back:', e);
    }
    const summary = await this.getDashboardSummary();
    return { summary, filingDataCache: {} };
  }

  async getMonthlyFilingData(): Promise<{ clients: Client[]; filingData: any; dueDates: any }> {
    try {
      const res = await this.get('/items/filing/monthly');
      if (res && res.clients) return res;
    } catch (e) {
      console.warn('Dedicated monthly filing endpoint failed, falling back:', e);
    }
    const clients = await this.getClients();
    const monthlyClients = clients.filter(c => c && c.gstProfile?.regType === 'Regular' && c.gstProfile?.filingFreq === 'Monthly');
    const filingData = (await this.getAppData('clientify_monthly_filing_v3')) || {};
    const dueDates = (await this.getAppData('clientify_monthly_due_dates_v1')) || {};
    return { clients: monthlyClients, filingData, dueDates };
  }

  async getQuarterlyFilingData(): Promise<{ clients: Client[]; filingData: any; dueDates: any }> {
    try {
      const res = await this.get('/items/filing/quarterly');
      if (res && res.clients) return res;
    } catch (e) {
      console.warn('Dedicated quarterly filing endpoint failed, falling back:', e);
    }
    const clients = await this.getClients();
    const quarterlyClients = clients.filter(c => c && c.gstProfile?.regType === 'Regular' && c.gstProfile?.filingFreq === 'Quarterly');
    const filingData = (await this.getAppData('clientify_quarterly_filing_v3')) || {};
    const dueDates = (await this.getAppData('clientify_quarterly_due_dates_v1')) || {};
    return { clients: quarterlyClients, filingData, dueDates };
  }

  async getCompositionFilingData(): Promise<{ clients: Client[]; filingData: any; dueDates: any }> {
    try {
      const res = await this.get('/items/filing/composition');
      if (res && res.clients) return res;
    } catch (e) {
      console.warn('Dedicated composition filing endpoint failed, falling back:', e);
    }
    const clients = await this.getClients();
    const compClients = clients.filter(c => c && (c.gstProfile?.regType === 'Composition' || (c.gstProfile as any)?.taxpayerType === 'Composition' || (c.gstProfile as any)?.registrationType === 'Composition'));
    const filingData = (await this.getAppData('clientify_composition_filing_v3')) || {};
    const dueDates = (await this.getAppData('clientify_composition_due_dates_v1')) || {};
    return { clients: compClients, filingData, dueDates };
  }

  async getGSTR4FilingData(): Promise<{ clients: Client[]; filingData: any; dueDates: any; cmp08Data: any }> {
    try {
      const res = await this.get('/items/filing/gstr4');
      if (res && res.clients) return res;
    } catch (e) {
      console.warn('Dedicated GSTR-4 filing endpoint failed, falling back:', e);
    }
    const clients = await this.getClients();
    const compClients = clients.filter(c => c && (c.gstProfile?.regType === 'Composition' || (c.gstProfile as any)?.taxpayerType === 'Composition' || (c.gstProfile as any)?.registrationType === 'Composition'));
    const filingData = (await this.getAppData('clientify_gstr4_filing_v1')) || {};
    const dueDates = (await this.getAppData('clientify_gstr4_due_dates_v1')) || {};
    const cmp08Data = (await this.getAppData('clientify_composition_filing_v3')) || {};
    return { clients: compClients, filingData, dueDates, cmp08Data };
  }

  async getGSTR9FilingData(): Promise<{ clients: Client[]; watchlist: any; config: any; filingData: any; dueDates: any }> {
    try {
      const res = await this.get('/items/filing/gstr9');
      if (res && res.clients) return res;
    } catch (e) {
      console.warn('Dedicated GSTR-9 filing endpoint failed, falling back:', e);
    }
    const clients = await this.getClients();
    const watchlist = (await this.getAppData('clientify_gstr9_watchlist_v2')) || {};
    const config = (await this.getAppData('clientify_gstr9_config_v2')) || {};
    const filingData = (await this.getAppData('clientify_gstr9_filing_data_v2')) || {};
    const dueDates = (await this.getAppData('clientify_gstr9_due_dates_v2')) || {};
    return { clients, watchlist, config, filingData, dueDates };
  }

  async getITRReturnFilingData(): Promise<{ clients: Client[]; filingData: any; dueDates: any }> {
    try {
      const res = await this.get('/items/filing/itr');
      if (res && res.clients) return res;
    } catch (e) {
      console.warn('Dedicated ITR return filing endpoint failed, falling back:', e);
    }
    const clients = await this.getClients();
    const itrClients = clients.filter(c => c && c.itProfile && (c.status === 'Active' || c.status === 'Active Filing'));
    const filingData = (await this.getAppData('clientify_itr_filing_data_v2')) || {};
    const dueDates = (await this.getAppData('clientify_itr_due_dates_v1')) || {};
    return { clients: itrClients, filingData, dueDates };
  }

  async getTaxAuditFilingData(): Promise<{ clients: Client[]; watchlist: any; filingData: any; dueDates: any }> {
    try {
      const res = await this.get('/items/filing/audit');
      if (res && res.clients) return res;
    } catch (e) {
      console.warn('Dedicated Tax Audit filing endpoint failed, falling back:', e);
    }
    const clients = await this.getClients();
    const watchlist = (await this.getAppData('clientify_audit_watchlist_v3')) || {};
    const filingData = (await this.getAppData('clientify_audit_fin_data_v3')) || {};
    const dueDates = (await this.getAppData('clientify_audit_due_dates_v1')) || {};
    return { clients, watchlist, filingData, dueDates };
  }

  async getLitigationFilingData(): Promise<{ clients: Client[]; litigation: LitigationRecord[] }> {
    const isMatch = (a: any, b: any) => {
      if (a.id && b.id && String(a.id) === String(b.id)) return true;
      if (a._id && b._id && String(a._id) === String(b._id)) return true;
      if (a.id && b._id && String(a.id) === String(b._id)) return true;
      if (a._id && b.id && String(a._id) === String(b.id)) return true;
      const clientA = (a.clientName || '').trim().toLowerCase();
      const clientB = (b.clientName || '').trim().toLowerCase();
      if (clientA && clientA === clientB) {
        const refA = (a.noticeNo || a.orderNo || a.replyReferenceNo || a.caseNo || a.filingNo || '').trim().toLowerCase();
        const refB = (b.noticeNo || b.orderNo || b.replyReferenceNo || b.caseNo || b.filingNo || '').trim().toLowerCase();
        if (refA && refA === refB) return true;
        if (a.hearingDate && a.hearingDate === b.hearingDate) return true;
        if (a.appDate && a.appDate === b.appDate) return true;
      }
      return false;
    };

    try {
      const res = await this.get('/items/filing/litigation');
      if (res && res.clients && res.litigation) {
        const [tribunal, highcourt] = await Promise.all([
          this.getTribunalRecords().catch(() => []),
          this.getHighCourtRecords().catch(() => [])
        ]);
        const tribunalList = tribunal || [];
        const highcourtList = highcourt || [];

        const filteredLitigation = (res.litigation || []).filter((r: any) => {
          if (r.category === 'Tribunal' && tribunalList.length > 0) {
            if (tribunalList.some(t => isMatch(r, t))) return false;
          }
          if (r.category === 'HighCourt' && highcourtList.length > 0) {
            if (highcourtList.some(h => isMatch(r, h))) return false;
          }
          return true;
        });

        const extraTribunal = tribunalList.filter(t => !filteredLitigation.some(r => isMatch(r, t))).map(r => ({ ...r, category: r.category || 'Tribunal' }));
        const extraHighcourt = highcourtList.filter(h => !filteredLitigation.some(r => isMatch(r, h))).map(r => ({ ...r, category: r.category || 'HighCourt' }));
        return { clients: res.clients, litigation: [...filteredLitigation, ...extraTribunal, ...extraHighcourt] };
      }
    } catch (e) {
      console.warn('Dedicated litigation endpoint failed, falling back:', e);
    }
    const [clients, litigation, tribunal, highcourt] = await Promise.all([
      this.getClients(),
      this.getLitigationRecords(),
      this.getTribunalRecords().catch(() => []),
      this.getHighCourtRecords().catch(() => [])
    ]);
    const tribunalList = tribunal || [];
    const highcourtList = highcourt || [];

    const filteredLitigation = (litigation || []).filter((r: any) => {
      if (r.category === 'Tribunal' && tribunalList.length > 0) {
        if (tribunalList.some(t => isMatch(r, t))) return false;
      }
      if (r.category === 'HighCourt' && highcourtList.length > 0) {
        if (highcourtList.some(h => isMatch(r, h))) return false;
      }
      return true;
    });

    const extraTribunal = tribunalList.filter(t => !filteredLitigation.some(r => isMatch(r, t))).map(r => ({ ...r, category: r.category || 'Tribunal' }));
    const extraHighcourt = highcourtList.filter(h => !filteredLitigation.some(r => isMatch(r, h))).map(r => ({ ...r, category: r.category || 'HighCourt' }));

    return { clients, litigation: [...filteredLitigation, ...extraTribunal, ...extraHighcourt] };
  }

  async getGstNoticePending(): Promise<{ clients: Client[]; litigation: LitigationRecord[] }> {
    try {
      return await this.get('/items/litigation/gst-notice/pending');
    } catch (e) {
      console.warn('Dedicated GST notice pending endpoint failed, falling back:', e);
      const data = await this.getLitigationFilingData();
      return { clients: data.clients, litigation: data.litigation.filter(r => r.category !== 'Appeal' && r.status === 'Pending') };
    }
  }

  async getGstNoticeFiled(): Promise<{ clients: Client[]; litigation: LitigationRecord[] }> {
    try {
      return await this.get('/items/litigation/gst-notice/filed');
    } catch (e) {
      console.warn('Dedicated GST notice filed endpoint failed, falling back:', e);
      const data = await this.getLitigationFilingData();
      return { clients: data.clients, litigation: data.litigation.filter(r => r.category !== 'Appeal' && r.status === 'Filed') };
    }
  }

  async getGstNoticeDemand(): Promise<{ clients: Client[]; litigation: LitigationRecord[] }> {
    try {
      return await this.get('/items/litigation/gst-notice/demand');
    } catch (e) {
      console.warn('Dedicated GST notice demand endpoint failed, falling back:', e);
      const data = await this.getLitigationFilingData();
      return { clients: data.clients, litigation: data.litigation.filter(r => r.category !== 'Appeal' && r.status === 'Demand') };
    }
  }

  async getGstNoticeDrop(): Promise<{ clients: Client[]; litigation: LitigationRecord[] }> {
    try {
      return await this.get('/items/litigation/gst-notice/drop');
    } catch (e) {
      console.warn('Dedicated GST notice drop endpoint failed, falling back:', e);
      const data = await this.getLitigationFilingData();
      return { clients: data.clients, litigation: data.litigation.filter(r => r.category !== 'Appeal' && (r.status === 'Drop' || (r.status as string) === 'Dropped')) };
    }
  }

  async getGstAppealPending(): Promise<{ clients: Client[]; litigation: LitigationRecord[] }> {
    try {
      return await this.get('/items/litigation/gst-appeal/pending');
    } catch (e) {
      console.warn('Dedicated GST appeal pending endpoint failed, falling back:', e);
      const data = await this.getLitigationFilingData();
      return { clients: data.clients, litigation: data.litigation.filter(r => r.category === 'Appeal' && r.status === 'Pending') };
    }
  }

  async getGstAppealFiled(): Promise<{ clients: Client[]; litigation: LitigationRecord[] }> {
    try {
      return await this.get('/items/litigation/gst-appeal/filed');
    } catch (e) {
      console.warn('Dedicated GST appeal filed endpoint failed, falling back:', e);
      const data = await this.getLitigationFilingData();
      return { clients: data.clients, litigation: data.litigation.filter(r => r.category === 'Appeal' && r.status === 'Filed') };
    }
  }

  async getGstAppealDemand(): Promise<{ clients: Client[]; litigation: LitigationRecord[] }> {
    try {
      return await this.get('/items/litigation/gst-appeal/demand');
    } catch (e) {
      console.warn('Dedicated GST appeal demand endpoint failed, falling back:', e);
      const data = await this.getLitigationFilingData();
      return { clients: data.clients, litigation: data.litigation.filter(r => r.category === 'Appeal' && r.status === 'Demand') };
    }
  }

  async getGstAppealDrop(): Promise<{ clients: Client[]; litigation: LitigationRecord[] }> {
    try {
      return await this.get('/items/litigation/gst-appeal/drop');
    } catch (e) {
      console.warn('Dedicated GST appeal drop endpoint failed, falling back:', e);
      const data = await this.getLitigationFilingData();
      return { clients: data.clients, litigation: data.litigation.filter(r => r.category === 'Appeal' && (r.status === 'Drop' || (r.status as string) === 'Dropped')) };
    }
  }

  async getGstClients(): Promise<Client[]> {
    try {
      const res = await this.get('/items/clients/gst');
      if (Array.isArray(res) && res.length > 0) return res;
    } catch (e) {
      console.warn('Dedicated GST clients endpoint failed, falling back:', e);
    }
    const clients = await this.getClients();
    return clients.filter(c => c && (c.gstProfile || (c as any).gstin || c.tradeName || c.legalName));
  }

  async getItClients(): Promise<Client[]> {
    try {
      return await this.get('/items/clients/it');
    } catch (e) {
      console.warn('Dedicated IT clients endpoint failed, falling back:', e);
      const clients = await this.getClients();
      return clients.filter(c => c && c.itProfile);
    }
  }

  async getMessengerClientsAll(): Promise<Client[]> {
    try {
      return await this.get('/items/messenger/all');
    } catch (e) {
      console.warn('Dedicated messenger all endpoint failed, falling back:', e);
      return this.getClients();
    }
  }

  async getMessengerClientsGst(): Promise<Client[]> {
    try {
      return await this.get('/items/messenger/gst');
    } catch (e) {
      console.warn('Dedicated messenger gst endpoint failed, falling back:', e);
      const clients = await this.getClients();
      return clients.filter(c => Boolean(c.gstProfile?.gstin || c.services?.includes('GST') || c.gstProfile?.regType));
    }
  }

  async getMessengerClientsItr(): Promise<Client[]> {
    try {
      return await this.get('/items/messenger/itr');
    } catch (e) {
      console.warn('Dedicated messenger itr endpoint failed, falling back:', e);
      const clients = await this.getClients();
      return clients.filter(c => Boolean(c.itProfile?.pan || c.services?.includes('IT') || c.services?.includes('ITR') || c.itProfile?.fileType));
    }
  }

  async getMessengerClientsAudit(): Promise<Client[]> {
    try {
      return await this.get('/items/messenger/audit');
    } catch (e) {
      console.warn('Dedicated messenger audit endpoint failed, falling back:', e);
      const clients = await this.getClients();
      return clients.filter(c => Boolean(c.itProfile?.auditApplicable || c.itProfile?.advisoryWork?.taxAudit || c.services?.includes('Audit') || (c.itProfile?.fileType && c.itProfile.fileType.toLowerCase().includes('audit'))));
    }
  }

  async getMessengerClientsGstr4(): Promise<Client[]> {
    try {
      return await this.get('/items/messenger/gstr4');
    } catch (e) {
      console.warn('Dedicated messenger gstr4 endpoint failed, falling back:', e);
      const clients = await this.getClients();
      return clients.filter(c => c.gstProfile?.regType === 'Composition');
    }
  }

  async getMessengerClientsGstr9(): Promise<Client[]> {
    try {
      return await this.get('/items/messenger/gstr9');
    } catch (e) {
      console.warn('Dedicated messenger gstr9 endpoint failed, falling back:', e);
      const [clients, watchlist] = await Promise.all([
        this.getClients(),
        this.getAppData('clientify_gstr9_watchlist_v2') || {}
      ]);
      const watchlistIds = new Set();
      Object.values(watchlist).forEach((arr: any) => {
        if (Array.isArray(arr)) arr.forEach(id => watchlistIds.add(id));
      });
      return clients.filter(c => watchlistIds.has(c.id) || Boolean(c.gstProfile?.gstin));
    }
  }

  async getRemindersAll(): Promise<{ litigation: LitigationRecord[]; work: MiscWorkRecord[]; foodLicenses: FoodLicenseRecord[] }> {
    try {
      return await this.get('/items/reminders/all');
    } catch (e) {
      console.warn('Dedicated reminders all endpoint failed, falling back:', e);
      const [litigation, work, foodLicenses] = await Promise.all([
        this.getLitigationRecords().catch(() => []),
        this.getMiscWork().catch(() => []),
        this.getFoodLicenses().catch(() => [])
      ]);
      return {
        litigation: litigation.filter(r => r.status === 'Pending'),
        work: work.filter(r => r.status !== 'Completed'),
        foodLicenses: foodLicenses.filter(l => l.expiryDate || l.dueDate)
      };
    }
  }

  async getRemindersLitigation(): Promise<LitigationRecord[]> {
    try {
      return await this.get('/items/reminders/litigation');
    } catch (e) {
      console.warn('Dedicated reminders litigation endpoint failed, falling back:', e);
      const litigation = await this.getLitigationRecords();
      return litigation.filter(r => r.status === 'Pending');
    }
  }

  async getRemindersWork(): Promise<MiscWorkRecord[]> {
    try {
      return await this.get('/items/reminders/work');
    } catch (e) {
      console.warn('Dedicated reminders work endpoint failed, falling back:', e);
      const work = await this.getMiscWork();
      return work.filter(r => r.status !== 'Completed');
    }
  }

  async getRemindersMiscWork(): Promise<MiscWorkRecord[]> {
    return this.getRemindersWork();
  }

  async getRemindersFoodLicenses(): Promise<FoodLicenseRecord[]> {
    try {
      return await this.get('/items/reminders/food_licenses');
    } catch (e) {
      console.warn('Dedicated reminders food licenses endpoint failed, falling back:', e);
      const foodLicenses = await this.getFoodLicenses();
      return foodLicenses.filter(l => l.expiryDate || l.dueDate);
    }
  }

  async getDashboardSummary() {
    const [clients, litigation, invoices, work, gstReg, foodLic, msme, payments, tribunal, highcourt] = await Promise.all([
      this.getClients(),
      this.getLitigationRecords(),
      this.getInvoices(),
      this.getMiscWork(),
      this.getGSTRegistrations(),
      this.getFoodLicenses(),
      this.getMSMERegistrations(),
      this.getPayments(),
      this.getTribunalRecords().catch(() => []),
      this.getHighCourtRecords().catch(() => [])
    ]);

    const tribunalList = tribunal || [];
    const highcourtList = highcourt || [];

    const isMatch = (a: any, b: any) => {
      if (a.id && b.id && String(a.id) === String(b.id)) return true;
      if (a._id && b._id && String(a._id) === String(b._id)) return true;
      if (a.id && b._id && String(a.id) === String(b._id)) return true;
      if (a._id && b.id && String(a._id) === String(b.id)) return true;
      const clientA = (a.clientName || '').trim().toLowerCase();
      const clientB = (b.clientName || '').trim().toLowerCase();
      if (clientA && clientA === clientB) {
        const refA = (a.noticeNo || a.orderNo || a.replyReferenceNo || a.caseNo || a.filingNo || '').trim().toLowerCase();
        const refB = (b.noticeNo || b.orderNo || b.replyReferenceNo || b.caseNo || b.filingNo || '').trim().toLowerCase();
        if (refA && refA === refB) return true;
        if (a.hearingDate && a.hearingDate === b.hearingDate) return true;
        if (a.appDate && a.appDate === b.appDate) return true;
      }
      return false;
    };

    const filteredLitigation = (litigation || []).filter((r: any) => {
      if (r.category === 'Tribunal' && tribunalList.length > 0) {
        if (tribunalList.some(t => isMatch(r, t))) return false;
      }
      if (r.category === 'HighCourt' && highcourtList.length > 0) {
        if (highcourtList.some(h => isMatch(r, h))) return false;
      }
      return true;
    });

    const extraTribunal = tribunalList.filter(t => !filteredLitigation.some(r => isMatch(r, t))).map(r => ({ ...r, category: r.category || 'Tribunal' }));
    const extraHighcourt = highcourtList.filter(h => !filteredLitigation.some(r => isMatch(r, h))).map(r => ({ ...r, category: r.category || 'HighCourt' }));

    const allLitigation = [
      ...filteredLitigation,
      ...extraTribunal,
      ...extraHighcourt
    ];
    return { clients, litigation: allLitigation, invoices, work, gstReg, foodLic, msme, payments };
  }

  // --- Clients ---
  async getClients(forceRefresh = false): Promise<Client[]> {
    const items = await this.getItemsByCategory('client', forceRefresh);
    return items.map((i: any) => this.transformItem<Client>(i));
  }

  async saveClient(client: Partial<Client>): Promise<Client> {
    const payload = { name: 'client', data: client };
    const res = client.id 
      ? await this.put(`/items/${client.id}`, payload)
      : await this.post('/items', payload);
    return this.transformItem<Client>(res);
  }

  async bulkCreateClients(clients: Partial<Client>[]): Promise<{ success: boolean; insertedCount: number }> {
    try {
      return await this.post('/items/clients/bulk', { clients });
    } catch (e) {
      console.warn('Bulk client creation failed on dedicated endpoint, falling back to sequential save:', e);
      for (const client of clients) {
        await this.saveClient(client);
      }
      return { success: true, insertedCount: clients.length };
    }
  }

  async seedSampleGstClients(): Promise<{ count: number }> {
    const samples: Partial<Client>[] = [
      {
        tradeName: 'Shree Krishna Traders',
        legalName: 'Rameshwar Lal Sharma',
        mobile: '9820123456',
        email: 'krishna.traders@gmail.com',
        address: '104, APMC Market, Vashi, Navi Mumbai, Maharashtra - 400703',
        status: 'Active',
        gstProfile: {
          gstin: '27AABCS1429B1Z8',
          pan: 'AABCS1429B',
          username: 'shree_krishna_gst',
          password: 'Password@123',
          gstStatus: 'Active',
          regDate: '2017-07-01',
          regType: 'Regular',
          filingFreq: 'Monthly',
          constitution: 'Proprietorship',
          jurisdictionType: 'State',
          sector: 'Ward 04',
          range: 'Range I',
          stakeholders: [
            {
              id: 'stk_1',
              name: 'Rameshwar Lal Sharma',
              mobile: '9820123456',
              pan: 'AABCS1429B',
              email: 'krishna.traders@gmail.com',
              address: 'Navi Mumbai, Maharashtra'
            }
          ]
        },
        bankDetails: {
          bankName: 'State Bank of India',
          accountNo: '30129482910',
          ifsc: 'SBIN0001234'
        },
        remarks: 'Proprietorship retail and wholesale client.'
      },
      {
        tradeName: 'Apex Logistics & Transport Pvt Ltd',
        legalName: 'Apex Logistics Private Limited',
        mobile: '9811223344',
        email: 'accounts@apexlogistics.in',
        address: 'Plot 45, GIDC Industrial Estate, Naroda, Ahmedabad, Gujarat - 382330',
        status: 'Active',
        gstProfile: {
          gstin: '24AAACA5678C1Z2',
          pan: 'AAACA5678C',
          username: 'apex_gst_portal',
          password: 'Password@123',
          gstStatus: 'Active',
          regDate: '2018-04-12',
          regType: 'Regular',
          filingFreq: 'Monthly',
          constitution: 'Company',
          jurisdictionType: 'Center',
          sector: 'Sector 12',
          range: 'Range II',
          stakeholders: [
            {
              id: 'stk_2',
              name: 'Ketan Patel (Director)',
              mobile: '9811223344',
              pan: 'AAACA5678C',
              email: 'accounts@apexlogistics.in',
              address: 'Ahmedabad, Gujarat'
            }
          ]
        },
        bankDetails: {
          bankName: 'HDFC Bank',
          accountNo: '50200012345678',
          ifsc: 'HDFC0000123'
        },
        remarks: 'Private limited logistics company with multiple state trucks.'
      },
      {
        tradeName: 'Radhika Fashion & Textiles',
        legalName: 'Radhika Fabrics Partnership Firm',
        mobile: '9414012345',
        email: 'radhikafabrics@yahoo.com',
        address: '12, Johari Bazar, Jaipur, Rajasthan - 302003',
        status: 'Active',
        gstProfile: {
          gstin: '08AAFFR9876D1Z5',
          pan: 'AAFFR9876D',
          username: 'radhika_tax',
          password: 'Password@123',
          gstStatus: 'Active',
          regDate: '2019-09-20',
          regType: 'Composition',
          filingFreq: 'Quarterly',
          constitution: 'Partnership',
          jurisdictionType: 'State',
          sector: 'Ward 08',
          range: 'Circle B',
          stakeholders: [
            {
              id: 'stk_3',
              name: 'Mahesh Agarwal (Partner)',
              mobile: '9414012345',
              pan: 'AAFFR9876D',
              email: 'radhikafabrics@yahoo.com',
              address: 'Jaipur, Rajasthan'
            }
          ]
        },
        bankDetails: {
          bankName: 'ICICI Bank',
          accountNo: '001205001234',
          ifsc: 'ICIC0000012'
        },
        remarks: 'Composition scheme quarterly filer.'
      },
      {
        tradeName: 'TechnoCraft Innovations LLP',
        legalName: 'TechnoCraft Innovations LLP',
        mobile: '9740011223',
        email: 'billing@technocraft.co',
        address: '4th Floor, Tech Park, Whitefield, Bengaluru, Karnataka - 560066',
        status: 'Litigation',
        gstProfile: {
          gstin: '29AABCT3456E1Z1',
          pan: 'AABCT3456E',
          username: 'technocraft_gst',
          password: 'Password@123',
          gstStatus: 'Active',
          regDate: '2020-01-15',
          regType: 'Regular',
          filingFreq: 'Quarterly',
          constitution: 'Partnership',
          jurisdictionType: 'Center',
          sector: 'Range 03',
          range: 'Division 1',
          stakeholders: [
            {
              id: 'stk_4',
              name: 'Arjun Rao (Designated Partner)',
              mobile: '9740011223',
              pan: 'AABCT3456E',
              email: 'billing@technocraft.co',
              address: 'Bengaluru, Karnataka'
            }
          ]
        },
        bankDetails: {
          bankName: 'Axis Bank',
          accountNo: '918020012345678',
          ifsc: 'UTIB0000123'
        },
        remarks: 'ITC mismatch notice pending under section 73.'
      },
      {
        tradeName: 'Bharat Agro Industries',
        legalName: 'Bharat Singh Chauhan',
        mobile: '9899123450',
        email: 'bharat.foods@gmail.com',
        address: 'Khari Baoli, Chandni Chowk, Delhi - 110006',
        status: 'Inactive',
        gstProfile: {
          gstin: '07AAGCB2345F1Z9',
          pan: 'AAGCB2345F',
          username: 'bharat_agro_gst',
          password: 'Password@123',
          gstStatus: 'Suspended',
          regDate: '2017-10-05',
          cancelDate: '2025-12-31',
          regType: 'Regular',
          filingFreq: 'Monthly',
          constitution: 'Proprietorship',
          jurisdictionType: 'State',
          sector: 'Ward 02',
          range: 'Range A',
          stakeholders: [
            {
              id: 'stk_5',
              name: 'Bharat Singh Chauhan',
              mobile: '9899123450',
              pan: 'AAGCB2345F',
              email: 'bharat.foods@gmail.com',
              address: 'Delhi'
            }
          ]
        },
        bankDetails: {
          bankName: 'Punjab National Bank',
          accountNo: '0123000123456789',
          ifsc: 'PUNB0001200'
        },
        remarks: 'Business closed temporarily, GST suspended.'
      }
    ];

    const res = await this.bulkCreateClients(samples);
    return { count: res.insertedCount || samples.length };
  }

  async deleteClient(id: string): Promise<void> {
    try {
      await this.delete(`/items/clients/${id}/cascade`);
    } catch (err) {
      console.warn('Cascade delete endpoint failed, falling back to direct delete:', err);
      await this.delete(`/items/${id}`);
    }
  }

  // --- Litigation ---
  async getLitigationRecords(forceRefresh = false): Promise<LitigationRecord[]> {
    const items = await this.getItemsByCategory('litigation', forceRefresh);
    return items.map((i: any) => this.transformItem<LitigationRecord>(i));
  }

  async deleteLitigationRecord(id: string): Promise<void> {
    await Promise.allSettled([
      this.delete(`/items/${id}`),
      this.delete(`/tribunal_records/${id}`),
      this.delete(`/highcourt_records/${id}`)
    ]);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('clientify_db_change'));
  }
  async saveLitigationRecord(record: Partial<LitigationRecord>): Promise<LitigationRecord> {
    if (record.category === 'Tribunal') {
      return this.saveTribunalRecord(record);
    }
    if (record.category === 'HighCourt' || (record.category as string) === 'High Court') {
      return this.saveHighCourtRecord(record);
    }
    const payload = { name: 'litigation', data: record };
    const res = record.id 
      ? await this.put(`/items/${record.id}`, payload)
      : await this.post('/items', payload);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('clientify_db_change'));
    return this.transformItem<LitigationRecord>(res);
  }

  // --- Tribunal Records (Separate Dataset) ---
  async getTribunalRecords(forceRefresh = false): Promise<LitigationRecord[]> {
    const docs = await this.get('/tribunal_records');
    return (docs || []).map((d: any) => ({
      ...d,
      id: d._id || d.id
    }));
  }
  async saveTribunalRecord(record: Partial<LitigationRecord>): Promise<LitigationRecord> {
    const payload = { ...record, category: 'Tribunal' };
    const id = record.id || (record as any)._id;
    delete payload.id;
    delete (payload as any)._id;
    const res = id 
      ? await this.put(`/tribunal_records/${id}`, payload)
      : await this.post('/tribunal_records', payload);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('clientify_db_change'));
    return { ...res, id: res._id || res.id };
  }
  async deleteTribunalRecord(id: string): Promise<void> {
    await this.delete(`/tribunal_records/${id}`);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('clientify_db_change'));
  }

  // --- High Court Records (Separate Dataset) ---
  async getHighCourtRecords(forceRefresh = false): Promise<LitigationRecord[]> {
    const docs = await this.get('/highcourt_records');
    return (docs || []).map((d: any) => ({
      ...d,
      id: d._id || d.id
    }));
  }
  async saveHighCourtRecord(record: Partial<LitigationRecord>): Promise<LitigationRecord> {
    const payload = { ...record, category: 'HighCourt' };
    const id = record.id || (record as any)._id;
    delete payload.id;
    delete (payload as any)._id;
    const res = id 
      ? await this.put(`/highcourt_records/${id}`, payload)
      : await this.post('/highcourt_records', payload);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('clientify_db_change'));
    return { ...res, id: res._id || res.id };
  }
  async deleteHighCourtRecord(id: string): Promise<void> {
    await this.delete(`/highcourt_records/${id}`);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('clientify_db_change'));
  }

  // --- Invoices & Billing ---
  async getPaginatedCategory<T>(category: string, page = 1, limit = 25, search = ''): Promise<{ items: T[]; total: number; page: number; limit: number; totalPages: number }> {
    const params = new URLSearchParams({ name: category, page: page.toString(), limit: limit.toString() });
    if (search) params.append('search', search);
    const res = await this.get(`/items?${params.toString()}`);
    if (res && Array.isArray(res.items)) {
      return {
        ...res,
        items: res.items.map((i: any) => this.transformItem<T>(i))
      };
    }
    const itemsArray = Array.isArray(res) ? res : [];
    return {
      items: itemsArray.map((i: any) => this.transformItem<T>(i)),
      total: itemsArray.length,
      page,
      limit,
      totalPages: Math.ceil(itemsArray.length / limit) || 1
    };
  }

  async getInvoices(forceRefresh = false): Promise<InvoiceRecord[]> {
    const items = await this.getItemsByCategory('invoice', forceRefresh);
    return items.map((i: any) => this.transformItem<InvoiceRecord>(i));
  }

  async getInvoicesPaginated(page = 1, limit = 25, search = '') {
    return this.getPaginatedCategory<InvoiceRecord>('invoice', page, limit, search);
  }

  async getClientsPaginated(page = 1, limit = 25, search = '') {
    return this.getPaginatedCategory<Client>('client', page, limit, search);
  }

  async generateNextInvoiceNo(): Promise<string> {
    const invs = await this.getInvoices();
    const sets = await this.getInvoiceSettings();
    const fy = getFinancialYear();
    const prefix = sets.invoicePrefix || 'INV';
    
    // Filter invoices by the same financial year to find the next number
    const sameFyInvs = invs.filter(inv => inv.invoiceNo.includes(`${prefix}/${fy}/`));
    
    const existingNums = new Set<number>();
    for (const inv of sameFyInvs) {
       const parts = inv.invoiceNo.split('/');
       if (parts.length >= 3) {
          const numStr = parts[parts.length - 1];
          const num = parseInt(numStr, 10);
          if (!isNaN(num)) {
             existingNums.add(num);
          }
       }
    }
    
    let count = 1;
    while (existingNums.has(count)) {
       count++;
    }
    return `${prefix}/${fy}/${count.toString().padStart(2, '0')}`;
  }

  async migrateToPayment(invoiceId: string, paymentData: { date: string; mode: string; chequeNo?: string; amount?: number; discount?: number; isFullSettlementWithDiscount?: boolean }): Promise<PaymentRecord | undefined> {
    const invs = await this.getInvoices();
    const inv = invs.find(i => i.id === invoiceId || (i as any)._id === invoiceId);
    if (!inv) return;

    const currentPaid = Number(inv.amountPaid) || 0;
    const totalAmount = Number(inv.totalAmount) || 0;
    const currentDiscount = Number(inv.discount) || 0;
    const remainingBefore = Math.max(0, totalAmount - currentPaid - currentDiscount);

    const paidAmount = (paymentData.amount !== undefined && paymentData.amount !== null && !isNaN(Number(paymentData.amount)))
      ? Number(paymentData.amount)
      : remainingBefore;

    const discountAmount = Number(paymentData.discount) || 0;
    const totalDiscount = currentDiscount + discountAmount;
    const newPaid = currentPaid + paidAmount;

    inv.amountPaid = newPaid;
    inv.discount = totalDiscount;

    if (paymentData.isFullSettlementWithDiscount || (newPaid + totalDiscount) >= totalAmount) {
      inv.status = 'Paid';
      inv.balanceDue = 0;
    } else {
      inv.status = 'Partial';
      inv.balanceDue = Math.max(0, totalAmount - newPaid - totalDiscount);
    }

    inv.paymentDate = paymentData.date;
    inv.paymentMode = paymentData.mode;
    await this.saveInvoice(inv);
    
    const savedPayment = await this.savePayment({
      clientId: inv.clientId,
      clientName: inv.clientName,
      clientTradeName: inv.clientTradeName,
      clientGstin: inv.clientGstin,
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.date,
      date: paymentData.date,
      amount: paidAmount,
      discount: discountAmount > 0 ? discountAmount : undefined,
      mode: paymentData.mode as any,
      chequeNo: paymentData.chequeNo,
      referenceNo: paymentData.chequeNo,
      originalItems: inv.items
    });
    return savedPayment;
  }

  async saveInvoice(invoice: Partial<InvoiceRecord>): Promise<InvoiceRecord> {
    const payload = { name: 'invoice', data: invoice };
    const res = invoice.id ? await this.put(`/items/${invoice.id}`, payload) : await this.post('/items', payload);
    this.invalidateCache('invoice');
    this.invalidateCache('payment');
    this.invalidateCache();
    const transformed = this.transformItem<InvoiceRecord>(res);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('clientify_db_change', {
        detail: {
          type: invoice.id ? 'update' : 'insert',
          data: { name: 'invoice', data: transformed, _id: transformed.id },
          id: transformed.id
        }
      }));
    }
    return transformed;
  }

  async deleteInvoice(id: string): Promise<void> {
    try {
      const invoices = await this.getInvoices();
      const invoice = invoices.find(i => i.id === id || (i as any)._id === id);
      if (invoice) {
        const payments = await this.getPayments();
        const paymentsToDelete = payments.filter(p => 
          (p.invoiceNo && invoice.invoiceNo && p.invoiceNo.trim().toLowerCase() === invoice.invoiceNo.trim().toLowerCase()) ||
          (p.clientId && invoice.clientId && p.clientId === invoice.clientId && p.invoiceNo === invoice.invoiceNo)
        );
        for (const p of paymentsToDelete) {
          try {
            await this.delete(`/items/${p.id}`);
          } catch (e) {
            console.error('Cascade payment delete error:', e);
          }
        }
      }
    } catch (err) {
      console.error('Error during cascade delete invoice payments:', err);
    }
    await this.delete(`/items/${id}`);
    this.invalidateCache('invoice');
    this.invalidateCache('payment');
    this.invalidateCache();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('clientify_db_change', {
        detail: { type: 'delete', category: 'invoice', id }
      }));
    }
  }

  async purgeOrphanAndCancelledRecords(): Promise<{ purgedCount: number }> {
    try {
      const rawItems = await this.getItems();
      const invoices = rawItems.filter((i: any) => i.name === 'invoice').map((i: any) => this.transformItem<InvoiceRecord>(i));
      const activeInvoiceNos = new Set(invoices.filter(i => i.status !== 'Cancelled').map(i => i.invoiceNo));

      let purgedCount = 0;

      for (const item of rawItems) {
        if (item.name === 'invoice' && item.data?.status === 'Cancelled') {
          await this.delete(`/items/${item._id}`);
          purgedCount++;
        } else if (item.name === 'payment' && item.data?.invoiceNo) {
          if (!activeInvoiceNos.has(item.data.invoiceNo)) {
            await this.delete(`/items/${item._id}`);
            purgedCount++;
          }
        }
      }

      if (purgedCount > 0) {
        this.invalidateCache('invoice');
        this.invalidateCache('payment');
        this.invalidateCache();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('clientify_db_change'));
        }
      }
      return { purgedCount };
    } catch (err) {
      console.error('Error during database purge:', err);
      return { purgedCount: 0 };
    }
  }

  async getPayments(forceRefresh = false): Promise<PaymentRecord[]> {
    const items = await this.getItemsByCategory('payment', forceRefresh);
    return items.map((i: any) => this.transformItem<PaymentRecord>(i));
  }

  async deletePayment(id: string): Promise<void> {
    try {
      // 1. If synthetic ID from client ledger
      if (id.startsWith('inv-part-')) {
        const invoiceId = id.replace('inv-part-', '');
        const invoices = await this.getInvoices();
        const invoice = invoices.find(i => i.id === invoiceId || (i as any)._id === invoiceId);
        if (invoice) {
          const allPayments = await this.getPayments();
          const realPaymentsForInv = allPayments.filter(p => 
            p.invoiceNo && invoice.invoiceNo && p.invoiceNo.trim().toLowerCase() === invoice.invoiceNo.trim().toLowerCase()
          );
          const realTotalPaid = realPaymentsForInv.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
          
          invoice.amountPaid = realTotalPaid;
          invoice.discount = 0;
          invoice.balanceDue = Math.max(0, (invoice.totalAmount || 0) - realTotalPaid);
          invoice.status = realTotalPaid >= (invoice.totalAmount || 0) ? 'Paid' : (realTotalPaid > 0 ? 'Partial' : 'Sent');
          await this.saveInvoice(invoice);
        }
        return;
      }

      // 2. Real payment record
      const payments = await this.getPayments();
      const paymentToDelete = payments.find(p => p.id === id || (p as any)._id === id);
      
      await this.delete(`/items/${id}`);

      // Update associated invoice if linked
      if (paymentToDelete && paymentToDelete.invoiceNo) {
        const invoices = await this.getInvoices();
        const associatedInvoice = invoices.find(i => 
          i.invoiceNo && i.invoiceNo.trim().toLowerCase() === paymentToDelete.invoiceNo!.trim().toLowerCase()
        );
        if (associatedInvoice) {
          const remainingPayments = payments.filter(p => 
            p.id !== id && (p as any)._id !== id && 
            p.invoiceNo && p.invoiceNo.trim().toLowerCase() === paymentToDelete.invoiceNo!.trim().toLowerCase()
          );
          const totalPaid = remainingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
          const remainingDiscounts = remainingPayments.reduce((sum, p) => sum + (Number(p.discount) || 0), 0);
          const discount = remainingPayments.length > 0 
            ? remainingDiscounts 
            : Math.max(0, (Number(associatedInvoice.discount) || 0) - (Number(paymentToDelete.discount) || 0));
          const balanceDue = Math.max(0, (associatedInvoice.totalAmount || 0) - totalPaid - discount);
          const status: InvoiceRecord['status'] = balanceDue <= 0 
            ? 'Paid' 
            : (totalPaid > 0 ? 'Partial' : (discount > 0 ? 'Partial' : (associatedInvoice.status === 'Paid' || associatedInvoice.status === 'Partial' ? 'Sent' : associatedInvoice.status)));
          
          await this.saveInvoice({
            ...associatedInvoice,
            amountPaid: totalPaid,
            discount: discount > 0 ? discount : undefined,
            balanceDue,
            status,
            paymentDate: remainingPayments.length > 0 ? remainingPayments[remainingPayments.length - 1].date : undefined,
            paymentMode: remainingPayments.length > 0 ? remainingPayments[remainingPayments.length - 1].mode : undefined
          });
        }
      }
    } catch (err) {
      console.error('Error deleting payment:', err);
      await this.delete(`/items/${id}`);
    } finally {
      this.invalidateCache('payment');
      this.invalidateCache('invoice');
      this.invalidateCache();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('clientify_db_change', {
          detail: { type: 'delete', category: 'payment', id }
        }));
      }
    }
  }

  async savePayment(payment: Partial<PaymentRecord>): Promise<PaymentRecord> {
    const payload = { name: 'payment', data: payment };
    const res = payment.id ? await this.put(`/items/${payment.id}`, payload) : await this.post('/items', payload);
    this.invalidateCache('payment');
    this.invalidateCache('invoice');
    this.invalidateCache();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('clientify_db_change', {
        detail: { type: payment.id ? 'update' : 'insert', category: 'payment', id: payment.id || res._id }
      }));
    }
    return this.transformItem<PaymentRecord>(res);
  }

  async getInvoiceSettings(forceRefresh = false): Promise<InvoiceSettings> {
    const items = await this.getItemsByCategory('invoice_settings', forceRefresh);
    const set = items[0];
    if (set) return this.transformItem<InvoiceSettings>(set);
    return {
      firmName: 'Your Firm',
      firmAddress: '', firmMobile: '', firmEmail: '', firmGstin: '',
      invoicePrefix: 'INV/', bankName: '', accountNo: '', ifsc: '',
      upiId: '', terms: '', isGstEnabled: true
    };
  }

  async saveInvoiceSettings(settings: InvoiceSettings): Promise<void> {
    const all = await this.getItemsByCategory('invoice_settings', true);
    const existing = all[0];
    const payload = { name: 'invoice_settings', data: settings };
    if (existing) await this.put(`/items/${existing.id || existing._id}`, payload);
    else await this.post('/items', payload);
  }

  // --- Miscellaneous ---
  async getGSTRegistrations(forceRefresh = false): Promise<GSTRegistrationRecord[]> {
    const docs = await this.get('/gst_registrations');
    return (docs || []).map((d: any) => ({
      ...d,
      id: d._id || d.id
    }));
  }
  async saveGSTRegistration(reg: Partial<GSTRegistrationRecord>) {
    const payload = { ...reg };
    delete payload.id;
    const res = reg.id 
      ? await this.put(`/gst_registrations/${reg.id}`, payload) 
      : await this.post('/gst_registrations', payload);
    return { ...res, id: res._id || res.id };
  }
  async deleteGSTRegistration(id: string) { await this.delete(`/gst_registrations/${id}`); }

  async getFoodLicenses(forceRefresh = false): Promise<FoodLicenseRecord[]> {
    const docs = await this.get('/food_licenses');
    return (docs || []).map((d: any) => ({
      ...d,
      id: d._id || d.id
    }));
  }
  async saveFoodLicense(lic: Partial<FoodLicenseRecord>) {
    const payload = { ...lic };
    delete payload.id;
    const res = lic.id 
      ? await this.put(`/food_licenses/${lic.id}`, payload) 
      : await this.post('/food_licenses', payload);
    return { ...res, id: res._id || res.id };
  }
  async deleteFoodLicense(id: string) { await this.delete(`/food_licenses/${id}`); }

  async getMSMERegistrations(forceRefresh = false): Promise<MSMERegistrationRecord[]> {
    const docs = await this.get('/msme_registrations');
    return (docs || []).map((d: any) => ({
      ...d,
      id: d._id || d.id
    }));
  }
  async saveMSMERegistration(reg: Partial<MSMERegistrationRecord>) {
    const payload = { ...reg };
    delete payload.id;
    const res = reg.id 
      ? await this.put(`/msme_registrations/${reg.id}`, payload) 
      : await this.post('/msme_registrations', payload);
    return { ...res, id: res._id || res.id };
  }
  async deleteMSMERegistration(id: string) { await this.delete(`/msme_registrations/${id}`); }

  async getMiscWork(forceRefresh = false): Promise<MiscWorkRecord[]> {
    const docs = await this.get('/misc_work');
    return (docs || []).map((d: any) => ({
      ...d,
      id: d._id || d.id
    }));
  }
  async saveMiscWork(work: Partial<MiscWorkRecord>) {
    const payload = { ...work };
    delete payload.id;
    const res = work.id 
      ? await this.put(`/misc_work/${work.id}`, payload) 
      : await this.post('/misc_work', payload);
    return { ...res, id: res._id || res.id };
  }
  async deleteMiscWork(id: string) { await this.delete(`/misc_work/${id}`); }

  async patchAppData(key: string, updates: Record<string, any>): Promise<any> {
    return this.patch(`/items/app_data/${key}/patch`, { updates });
  }
  
  async getAppData(key: string, forceRefresh = false): Promise<any> {
    const items = await this.getItemsByCategory('app_data_' + key, forceRefresh);
    const existing = items[0];
    return existing ? existing.data : null;
  }
  async saveAppData(key: string, data: any): Promise<void> {
    const items = await this.getItemsByCategory('app_data_' + key, true);
    const existing = items[0];
    const payload = { name: 'app_data_' + key, data: data };
    if (existing) {
      await this.put(`/items/${existing.id || existing._id}`, payload);
    } else {
      await this.post('/items', payload);
    }
  }

  // --- Portal Credentials Vault ---
  async getPortalCredentials(forceRefresh = false): Promise<PortalCredentialRecord[]> {
    const items = await this.getItemsByCategory('portal_credentials', forceRefresh);
    return (items || []).map((item: any) => ({
      ...item.data,
      id: item.id || item._id
    }));
  }

  async savePortalCredential(cred: Partial<PortalCredentialRecord>): Promise<PortalCredentialRecord> {
    const payload = { name: 'portal_credentials', data: { ...cred, updatedAt: Date.now() } };
    let res;
    if (cred.id) {
      res = await this.put(`/items/${cred.id}`, payload);
    } else {
      res = await this.post('/items', payload);
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('clientify_db_change'));
    return this.transformItem<PortalCredentialRecord>(res);
  }

  async deletePortalCredential(id: string): Promise<void> {
    await this.delete(`/items/${id}`);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('clientify_db_change'));
  }

}

export const api = new ApiService();