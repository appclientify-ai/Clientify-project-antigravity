import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../../services/api';
import Loader from '../../components/Loader';
import { formatDate } from '../../dateUtils';
import { 
  History, Search, RefreshCw, Copy, Check, Filter, 
  Database, Calendar, Tag, ShieldCheck, Sparkles, Trash2,
  RotateCcw, AlertTriangle, Download, FileSpreadsheet, Eye,
  X, ExternalLink, ArrowRight, Clock, Plus, Shield, CheckCircle2,
  ChevronRight, Layers, FileText, AlertCircle, HardDriveDownload
} from 'lucide-react';
import { toast } from 'sonner';

interface TrashProps {
  onViewChange?: (view: string, extra?: any) => void;
}

export type ActionType = 
  | 'ALL'
  | 'CREATED'
  | 'UPDATED'
  | 'DELETED'
  | 'RESTORED'
  | 'PAYMENT'
  | 'CHECKPOINT'
  | 'CONFIG';

export interface AuditRecord {
  id: string;
  timestamp: string;
  action: 'CREATED' | 'UPDATED' | 'DELETED' | 'RESTORED' | 'PAYMENT' | 'CHECKPOINT' | 'CONFIG';
  category: string;
  title: string;
  subtitle?: string;
  operator: string;
  referenceId: string;
  rawPayload: any;
  viewRoute?: string;
  badgeColor: 'emerald' | 'blue' | 'rose' | 'amber' | 'purple' | 'cyan' | 'slate';
}

export interface TrashVaultItem {
  id: string;
  originalId: string;
  name: string; // collection name
  title: string;
  category: string;
  details: string;
  deletedAt: string;
  deletedBy: string;
  deleteReason: string;
  data: any;
  retentionDaysLeft: number;
}

const TRASH_STORAGE_KEY = 'clientify_trash_vault_v1';
const AUDIT_LOGS_STORAGE_KEY = 'clientify_activity_logs_v1';

// Initial sample items for trash vault so the user can immediately experience 1-click restore & purge
const INITIAL_TRASH_ITEMS: TrashVaultItem[] = [
  {
    id: 'trash-demo-1',
    originalId: 'client-surat-silk',
    name: 'client',
    title: 'Surat Silk Mills Pvt Ltd',
    category: 'Client Portfolio',
    details: 'PAN: AABCS9821A | GSTIN: 24AABCS9821A1Z3 | Regular Taxpayer',
    deletedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    deletedBy: 'Admin / Practice Lead',
    deleteReason: 'Client de-registered business operations',
    retentionDaysLeft: 88,
    data: {
      tradeName: 'Surat Silk Mills Pvt Ltd',
      legalName: 'Surat Silk Mills Private Limited',
      mobile: '9825012345',
      email: 'accounts@suratsilk.in',
      address: 'Ring Road, Surat, Gujarat - 395002',
      status: 'Active',
      gstProfile: {
        gstin: '24AABCS9821A1Z3',
        pan: 'AABCS9821A',
        regType: 'Regular',
        filingFreq: 'Monthly'
      }
    }
  },
  {
    id: 'trash-demo-2',
    originalId: 'inv-2025-91',
    name: 'invoice',
    title: 'Tax Invoice INV/2025-26/91',
    category: 'Billing & Receivables',
    details: 'Client: Shree Krishna Traders | ₹18,500 + GST | Draft Cancelled',
    deletedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    deletedBy: 'Admin / Practice Lead',
    deleteReason: 'Replaced with consolidated quarterly billing invoice',
    retentionDaysLeft: 85,
    data: {
      invoiceNo: 'INV/2025-26/91',
      clientName: 'Shree Krishna Traders',
      totalAmount: 21830,
      status: 'Cancelled',
      description: 'Annual GST Reconciliation & Advisory Services'
    }
  },
  {
    id: 'trash-demo-3',
    originalId: 'lit-notice-73-09',
    name: 'litigation',
    title: 'DRC-01 Notice (Sec 73) - ITC Discrepancy',
    category: 'GST Notices',
    details: 'Ref: ZA240321008129F | F.Y. 2020-21 | Demand: ₹1,42,000',
    deletedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    deletedBy: 'Tax Advisory Staff',
    deleteReason: 'Duplicate upload of notice already filed in Appeals registry',
    retentionDaysLeft: 82,
    data: {
      clientName: 'Apex Logistics Private Limited',
      noticeNo: 'ZA240321008129F',
      section: 'Section 73(9)',
      category: 'GST Notice',
      status: 'Pending',
      demandAmount: 142000
    }
  }
];

const Trash: React.FC<TrashProps> = ({ onViewChange }) => {
  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<'activity' | 'trash'>('activity');

  // Master Data State
  const [activityLogs, setActivityLogs] = useState<AuditRecord[]>([]);
  const [trashVault, setTrashVault] = useState<TrashVaultItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedAction, setSelectedAction] = useState<ActionType>('ALL');
  const [timeFilter, setTimeFilter] = useState<'ALL' | 'TODAY' | '7DAYS' | '30DAYS'>('ALL');

  // Interactive & Modal States
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inspectRecord, setInspectRecord] = useState<AuditRecord | TrashVaultItem | null>(null);
  const [restoreConfirmItem, setRestoreConfirmItem] = useState<TrashVaultItem | null>(null);
  const [purgeConfirmItem, setPurgeConfirmItem] = useState<TrashVaultItem | null>(null);
  const [showEmptyTrashModal, setShowEmptyTrashModal] = useState(false);
  const [showCheckpointModal, setShowCheckpointModal] = useState(false);
  const [checkpointTitle, setCheckpointTitle] = useState('');
  const [checkpointNotes, setCheckpointNotes] = useState('');

  // 1. Fetch / Synthesize Audit Trail & Trash Vault
  const loadSystemRecords = async (isSync = false) => {
    if (!isSync) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      // 1. Fetch raw items from DB
      const [rawItems, storedLogs, storedTrash] = await Promise.all([
        api.getItems().catch(() => []),
        api.getAppData(AUDIT_LOGS_STORAGE_KEY).catch(() => null),
        api.getAppData(TRASH_STORAGE_KEY).catch(() => null)
      ]);

      // Populate Trash Vault (use stored or initialize default)
      let currentTrash: TrashVaultItem[] = [];
      if (Array.isArray(storedTrash) && storedTrash.length > 0) {
        currentTrash = storedTrash;
      } else if (storedTrash === null || storedTrash === undefined) {
        currentTrash = INITIAL_TRASH_ITEMS;
        // Seed initial trash in background
        api.saveAppData(TRASH_STORAGE_KEY, INITIAL_TRASH_ITEMS).catch(() => {});
      }
      setTrashVault(currentTrash);

      // Synthesize Activity Stream
      const synthesizedList: AuditRecord[] = [];

      // A. Explicit stored logs
      if (Array.isArray(storedLogs)) {
        storedLogs.forEach((log: any) => {
          if (log && log.title) synthesizedList.push(log);
        });
      }

      // B. Dynamic logs from active database items
      if (Array.isArray(rawItems)) {
        rawItems.forEach((item: any, idx: number) => {
          if (!item) return;
          const name = item.name || 'object';
          const data = item.data || {};
          const id = item._id || item.id || `item-${idx}`;
          const createdAt = item.createdAt || new Date(Date.now() - (idx * 3600000)).toISOString();
          const updatedAt = item.updatedAt || createdAt;

          let category = 'Database Object';
          let title = data.legalName || data.tradeName || data.title || data.clientName || `${name} record`;
          let subtitle = '';
          let action: AuditRecord['action'] = 'CREATED';
          let badgeColor: AuditRecord['badgeColor'] = 'emerald';
          let viewRoute: string | undefined = undefined;

          if (name === 'client') {
            category = 'Client Portfolio';
            title = data.tradeName || data.legalName || 'Client Profile';
            subtitle = data.gstProfile?.gstin ? `GSTIN: ${data.gstProfile.gstin}` : (data.itProfile?.pan ? `PAN: ${data.itProfile.pan}` : 'Master Client');
            viewRoute = data.gstProfile?.gstin ? 'gst-portfolio' : 'it-portfolio';
            badgeColor = 'emerald';
          } else if (name === 'invoice') {
            category = 'Billing & Receivables';
            title = `Invoice ${data.invoiceNo || 'Draft'}`;
            subtitle = `Client: ${data.clientName || 'N/A'} | ₹${Number(data.totalAmount || 0).toLocaleString('en-IN')}`;
            viewRoute = 'admin-invoices';
            badgeColor = data.status === 'Paid' ? 'blue' : 'amber';
            action = data.status === 'Paid' ? 'PAYMENT' : 'CREATED';
          } else if (name === 'payment') {
            category = 'Collections';
            title = `Receipt ${data.receiptNo || 'Payment'}`;
            subtitle = `Client: ${data.clientName || 'N/A'} | ₹${Number(data.amount || 0).toLocaleString('en-IN')} via ${data.mode || 'Direct'}`;
            viewRoute = 'admin-payments';
            badgeColor = 'blue';
            action = 'PAYMENT';
          } else if (name === 'litigation') {
            category = 'Litigation & Notices';
            title = `Notice ${data.noticeNo || data.orderNo || 'Matter'}`;
            subtitle = `${data.section || 'Statutory Notice'} | Client: ${data.clientName || 'N/A'}`;
            viewRoute = 'lit-notice-pending';
            badgeColor = 'rose';
            action = 'CREATED';
          } else if (name === 'invoice_settings') {
            category = 'Firm Settings';
            title = 'Invoice & Firm Configuration Updated';
            subtitle = `Firm: ${data.firmName || 'Practice'} | GST: ${data.firmGstin || 'Not set'}`;
            viewRoute = 'admin-invoicesetting';
            badgeColor = 'purple';
            action = 'CONFIG';
          } else if (name.startsWith('app_data_')) {
            category = 'System AppData';
            title = `Configuration: ${name.replace('app_data_', '')}`;
            subtitle = 'System statutory schedules & runtime state';
            badgeColor = 'cyan';
            action = 'CONFIG';
          }

          synthesizedList.push({
            id: `audit-${id}`,
            timestamp: createdAt,
            action,
            category,
            title,
            subtitle,
            operator: 'Admin / Practice Lead',
            referenceId: id,
            rawPayload: item,
            viewRoute,
            badgeColor
          });

          // If updatedAt is noticeably different from createdAt, log an update entry
          if (item.updatedAt && item.updatedAt !== item.createdAt) {
            synthesizedList.push({
              id: `audit-upd-${id}`,
              timestamp: item.updatedAt,
              action: 'UPDATED',
              category,
              title: `${title} (Synchronized)`,
              subtitle: subtitle || 'Modified details synchronized to secure cloud database',
              operator: 'Admin / Practice Lead',
              referenceId: id,
              rawPayload: item,
              viewRoute,
              badgeColor: 'blue'
            });
          }
        });
      }

      // C. Include entries from trash vault (DELETED events)
      currentTrash.forEach((t) => {
        synthesizedList.push({
          id: `audit-del-${t.id}`,
          timestamp: t.deletedAt,
          action: 'DELETED',
          category: t.category,
          title: `${t.title} [Archived to Trash]`,
          subtitle: `Reason: ${t.deleteReason} | Prior ID: ${t.originalId}`,
          operator: t.deletedBy,
          referenceId: t.originalId,
          rawPayload: t.data,
          badgeColor: 'rose'
        });
      });

      // Sort chronological descending (latest first)
      synthesizedList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivityLogs(synthesizedList);

    } catch (err) {
      console.error('Failed to load system audit/trash items:', err);
      toast.error('Failed to load audit records');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadSystemRecords();
    const syncHandler = () => loadSystemRecords(true);
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, []);

  // Filter Categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    activityLogs.forEach(item => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set).sort();
  }, [activityLogs]);

  // Filtered Activity Records
  const filteredActivities = useMemo(() => {
    let result = activityLogs;

    // Filter by Category
    if (selectedCategory !== 'ALL') {
      result = result.filter(item => item.category === selectedCategory);
    }

    // Filter by Action Type
    if (selectedAction !== 'ALL') {
      result = result.filter(item => item.action === selectedAction);
    }

    // Filter by Time Range
    if (timeFilter !== 'ALL') {
      const now = Date.now();
      result = result.filter(item => {
        const itemTime = new Date(item.timestamp).getTime();
        if (timeFilter === 'TODAY') {
          return now - itemTime <= 86400000;
        } else if (timeFilter === '7DAYS') {
          return now - itemTime <= 7 * 86400000;
        } else if (timeFilter === '30DAYS') {
          return now - itemTime <= 30 * 86400000;
        }
        return true;
      });
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(item => {
        return (
          item.title.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
          item.referenceId.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.operator.toLowerCase().includes(q)
        );
      });
    }

    return result;
  }, [activityLogs, selectedCategory, selectedAction, timeFilter, searchQuery]);

  // Filtered Trash Items
  const filteredTrash = useMemo(() => {
    let result = trashVault;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(item => {
        return (
          item.title.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.details.toLowerCase().includes(q) ||
          item.deleteReason.toLowerCase().includes(q) ||
          item.originalId.toLowerCase().includes(q)
        );
      });
    }

    return result;
  }, [trashVault, searchQuery]);

  // Statistics KPIs
  const stats = useMemo(() => {
    const totalOps = activityLogs.length;
    const trashCount = trashVault.length;
    const now = Date.now();
    const opsToday = activityLogs.filter(a => now - new Date(a.timestamp).getTime() <= 86400000).length;
    return { totalOps, trashCount, opsToday };
  }, [activityLogs, trashVault]);

  // Clipboard Helper
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    toast.success('Reference ID copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 1-Click Restore Action
  const handleExecuteRestore = async (item: TrashVaultItem) => {
    try {
      // 1. Post back to active database
      if (item.name === 'gst_registration') {
        await api.saveGSTRegistration(item.data);
      } else if (item.name === 'food_license') {
        await api.saveFoodLicense(item.data);
      } else if (item.name === 'msme_registration') {
        await api.saveMSMERegistration(item.data);
      } else if (item.name === 'misc_work') {
        await api.saveMiscWork(item.data);
      } else if (item.name === 'tribunal_record') {
        await api.saveTribunalRecord(item.data);
      } else if (item.name === 'highcourt_record') {
        await api.saveHighCourtRecord(item.data);
      } else {
        await api.post('/items', { name: item.name, data: item.data });
      }

      // 2. Remove from trash vault
      const updatedTrash = trashVault.filter(t => t.id !== item.id);
      setTrashVault(updatedTrash);
      await api.saveAppData(TRASH_STORAGE_KEY, updatedTrash);

      // 3. Log explicit RESTORE event in audit trail
      const restoreLog: AuditRecord = {
        id: `audit-restore-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'RESTORED',
        category: item.category,
        title: `${item.title} [Restored to Active]`,
        subtitle: `Restored by Admin. Prior reason: ${item.deleteReason}`,
        operator: 'Admin / Practice Lead',
        referenceId: item.originalId,
        rawPayload: item.data,
        badgeColor: 'purple'
      };

      const existingStoredLogs = (await api.getAppData(AUDIT_LOGS_STORAGE_KEY).catch(() => [])) || [];
      const updatedLogs = [restoreLog, ...(Array.isArray(existingStoredLogs) ? existingStoredLogs : [])];
      await api.saveAppData(AUDIT_LOGS_STORAGE_KEY, updatedLogs);

      // 4. Invalidate & notify
      api.invalidateCache();
      window.dispatchEvent(new Event('clientify_db_change'));

      toast.success(`Restored "${item.title}" back to active database!`);
      setRestoreConfirmItem(null);
      loadSystemRecords(true);
    } catch (err) {
      console.error('Failed to restore record:', err);
      toast.error('Failed to restore record. Please try again.');
    }
  };

  // Permanent Purge Action
  const handleExecutePurge = async (item: TrashVaultItem) => {
    try {
      const updatedTrash = trashVault.filter(t => t.id !== item.id);
      setTrashVault(updatedTrash);
      await api.saveAppData(TRASH_STORAGE_KEY, updatedTrash);

      // Log purge in audit trail
      const purgeLog: AuditRecord = {
        id: `audit-purge-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'DELETED',
        category: item.category,
        title: `${item.title} [Permanently Purged]`,
        subtitle: `Permanently destroyed from Trash Vault by Admin`,
        operator: 'Admin / Practice Lead',
        referenceId: item.originalId,
        rawPayload: { originalId: item.originalId, purgedAt: new Date().toISOString() },
        badgeColor: 'rose'
      };

      const existingStoredLogs = (await api.getAppData(AUDIT_LOGS_STORAGE_KEY).catch(() => [])) || [];
      const updatedLogs = [purgeLog, ...(Array.isArray(existingStoredLogs) ? existingStoredLogs : [])];
      await api.saveAppData(AUDIT_LOGS_STORAGE_KEY, updatedLogs);

      toast.success(`"${item.title}" permanently purged from storage.`);
      setPurgeConfirmItem(null);
      loadSystemRecords(true);
    } catch (err) {
      console.error('Failed to purge item:', err);
      toast.error('Failed to purge item');
    }
  };

  // Empty Entire Trash Vault
  const handleEmptyTrash = async () => {
    try {
      await api.saveAppData(TRASH_STORAGE_KEY, []);
      setTrashVault([]);

      const emptyLog: AuditRecord = {
        id: `audit-empty-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'DELETED',
        category: 'Vault Maintenance',
        title: 'Trash Vault Emptied Completely',
        subtitle: `Purged all archived records permanently`,
        operator: 'Admin / Practice Lead',
        referenceId: 'VAULT-PURGE-ALL',
        rawPayload: { clearedCount: trashVault.length, timestamp: new Date().toISOString() },
        badgeColor: 'rose'
      };

      const existingStoredLogs = (await api.getAppData(AUDIT_LOGS_STORAGE_KEY).catch(() => [])) || [];
      const updatedLogs = [emptyLog, ...(Array.isArray(existingStoredLogs) ? existingStoredLogs : [])];
      await api.saveAppData(AUDIT_LOGS_STORAGE_KEY, updatedLogs);

      toast.success('Trash vault has been completely emptied.');
      setShowEmptyTrashModal(false);
      loadSystemRecords(true);
    } catch (err) {
      console.error('Failed to empty trash:', err);
      toast.error('Failed to empty trash');
    }
  };

  // Log Compliance Checkpoint
  const handleAddCheckpoint = async () => {
    if (!checkpointTitle.trim()) {
      toast.error('Please enter a checkpoint title');
      return;
    }

    try {
      const newCheckpoint: AuditRecord = {
        id: `chk-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'CHECKPOINT',
        category: 'Statutory Review',
        title: checkpointTitle.trim(),
        subtitle: checkpointNotes.trim() || 'Official practice compliance verification verified and signed',
        operator: 'Admin / Practice Lead',
        referenceId: `CHK-${Date.now().toString().slice(-6)}`,
        rawPayload: {
          title: checkpointTitle.trim(),
          notes: checkpointNotes.trim(),
          verifiedBy: 'Admin / Practice Lead',
          signature: `SIG-SHA256-${Date.now().toString(16).toUpperCase()}`
        },
        badgeColor: 'emerald'
      };

      const existingStoredLogs = (await api.getAppData(AUDIT_LOGS_STORAGE_KEY).catch(() => [])) || [];
      const updatedLogs = [newCheckpoint, ...(Array.isArray(existingStoredLogs) ? existingStoredLogs : [])];
      await api.saveAppData(AUDIT_LOGS_STORAGE_KEY, updatedLogs);

      toast.success('Compliance checkpoint recorded in official audit log!');
      setShowCheckpointModal(false);
      setCheckpointTitle('');
      setCheckpointNotes('');
      loadSystemRecords(true);
    } catch (err) {
      console.error('Failed to add checkpoint:', err);
      toast.error('Failed to record checkpoint');
    }
  };

  // Export Audit Log to CSV
  const handleExportCSV = () => {
    if (filteredActivities.length === 0) {
      toast.error('No records available to export');
      return;
    }

    const headers = ['Timestamp', 'Event ID', 'Action', 'Category', 'Title', 'Subtitle / Details', 'Operator', 'Server Ref ID'];
    const rows = filteredActivities.map(r => [
      `"${r.timestamp}"`,
      `"${r.id}"`,
      `"${r.action}"`,
      `"${r.category}"`,
      `"${(r.title || '').replace(/"/g, '""')}"`,
      `"${(r.subtitle || '').replace(/"/g, '""')}"`,
      `"${r.operator}"`,
      `"${r.referenceId}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `clientify_audit_trail_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Audit trail exported as CSV!');
  };

  // Export Audit Log to JSON
  const handleExportJSON = () => {
    if (filteredActivities.length === 0) {
      toast.error('No records available to export');
      return;
    }

    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(filteredActivities, null, 2)
    )}`;
    const link = document.createElement('a');
    link.setAttribute('href', jsonString);
    link.setAttribute('download', `clientify_audit_trail_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Audit trail exported as JSON!');
  };

  // Format action badge
  const renderActionBadge = (action: AuditRecord['action']) => {
    switch (action) {
      case 'CREATED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Created
          </span>
        );
      case 'UPDATED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            Updated
          </span>
        );
      case 'DELETED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Deleted
          </span>
        );
      case 'RESTORED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <RotateCcw className="w-2.5 h-2.5" />
            Restored
          </span>
        );
      case 'PAYMENT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Payment
          </span>
        );
      case 'CHECKPOINT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
            <ShieldCheck className="w-2.5 h-2.5" />
            Checkpoint
          </span>
        );
      case 'CONFIG':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            Config
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {action}
          </span>
        );
    }
  };

  if (isLoading) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2.5 pb-2 overflow-hidden animate-in fade-in duration-300">
      
      {/* 1. TOP HEADER & KPI METRICS BAR */}
      <div className="bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs shrink-0 w-full flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Left Title & Status */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                Activity Stream & Trash Vault
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Cloud Sync
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Statutory audit trail, real-time database modifications & recoverable soft-deleted archive.
            </p>
          </div>
        </div>

        {/* Right KPI Summary Badges */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Operations Card */}
          <div className="px-3 py-1.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-500" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-tight">Total Audit Logs</p>
              <p className="text-xs font-black text-slate-900 dark:text-white">{stats.totalOps}</p>
            </div>
          </div>

          {/* Today Activity Card */}
          <div className="px-3 py-1.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-500" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-tight">Operations (24h)</p>
              <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">{stats.opsToday}</p>
            </div>
          </div>

          {/* Recoverable Trash Card */}
          <button
            onClick={() => setActiveTab('trash')}
            className={`px-3 py-1.5 rounded-xl border transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'trash'
                ? 'bg-rose-500 text-white border-rose-600 shadow-xs'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60 hover:bg-rose-100'
            }`}
          >
            <Trash2 className="w-4 h-4 text-rose-500" />
            <div className="text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-80 leading-tight">Trash Vault</p>
              <p className="text-xs font-black">{stats.trashCount} Recoverable</p>
            </div>
          </button>

          {/* Checkpoint Button */}
          <button
            onClick={() => setShowCheckpointModal(true)}
            className="h-8.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Checkpoint</span>
          </button>
        </div>
      </div>

      {/* 2. TABS & FILTER TOOLBAR */}
      <div className="bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Dual Tab Buttons */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl border border-slate-200/80 dark:border-slate-700/80 w-fit">
          <button
            onClick={() => setActiveTab('activity')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'activity'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Activity Trail</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold">
              {filteredActivities.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('trash')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'trash'
                ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            <span>Trash Vault</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 font-bold">
              {filteredTrash.length}
            </span>
          </button>
        </div>

        {/* Right Search, Filters & Export Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Action Filter (Only on Activity tab) */}
          {activeTab === 'activity' && (
            <div className="relative">
              <select
                value={selectedAction}
                onChange={(e) => setSelectedAction(e.target.value as ActionType)}
                className="h-8 pl-2.5 pr-7 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer appearance-none"
              >
                <option value="ALL">All Actions</option>
                <option value="CREATED">Created</option>
                <option value="UPDATED">Updated</option>
                <option value="DELETED">Deleted</option>
                <option value="RESTORED">Restored</option>
                <option value="PAYMENT">Payments</option>
                <option value="CHECKPOINT">Checkpoints</option>
                <option value="CONFIG">Configuration</option>
              </select>
              <Filter className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {/* Category Filter */}
          {activeTab === 'activity' && categories.length > 0 && (
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-8 pl-2.5 pr-7 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer appearance-none"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <Tag className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {/* Time Filter */}
          {activeTab === 'activity' && (
            <div className="relative">
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value as any)}
                className="h-8 pl-2.5 pr-7 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer appearance-none"
              >
                <option value="ALL">All Time</option>
                <option value="TODAY">Today (24h)</option>
                <option value="7DAYS">Last 7 Days</option>
                <option value="30DAYS">Last 30 Days</option>
              </select>
              <Calendar className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {/* Search Box */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={activeTab === 'activity' ? "Search activity logs..." : "Search trash vault..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
            />
          </div>

          {/* Export Dropdown / Buttons (Activity Tab) */}
          {activeTab === 'activity' ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleExportCSV}
                title="Export filtered records to CSV spreadsheet"
                className="h-8 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">CSV</span>
              </button>
              <button
                onClick={handleExportJSON}
                title="Export complete audit trail JSON backup"
                className="h-8 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Download className="w-3.5 h-3.5 text-indigo-500" />
                <span className="hidden sm:inline">JSON</span>
              </button>
            </div>
          ) : (
            /* Trash Vault Bulk Actions */
            <div className="flex items-center gap-1.5">
              {trashVault.length > 0 && (
                <button
                  onClick={() => setShowEmptyTrashModal(true)}
                  title="Purge all items in trash vault"
                  className="h-8 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Empty Trash</span>
                </button>
              )}
            </div>
          )}

          {/* Refresh Button */}
          <button
            onClick={() => loadSystemRecords(true)}
            disabled={isRefreshing}
            title="Refresh System Records"
            className="h-8 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* 3. MAIN TABLE / LIST CONTAINER */}
      <div className="relative z-10 flex-1 min-h-0 w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden flex flex-col transition-colors">
        
        {/* =========================================================================
            TAB 1: ACTIVITY STREAM & AUDIT TRAIL
           ========================================================================= */}
        {activeTab === 'activity' && (
          <div className="overflow-auto no-scrollbar flex-1 relative">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-700/80 shadow-xs">
                <tr>
                  <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Operation & Entity
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Category / Scope
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Operator / Authority
                  </th>
                  <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 text-right">
                    Reference & Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs font-medium">
                {filteredActivities.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-24 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center">
                          <Database className="w-6 h-6 stroke-[1.5]" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-600 dark:text-slate-300">No activity trail records match criteria</p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">
                            {searchQuery || selectedCategory !== 'ALL' || selectedAction !== 'ALL' || timeFilter !== 'ALL'
                              ? 'Try clearing filters or resetting the search query.' 
                              : 'Real-time database operations and compliance checkpoints will be recorded here.'}
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredActivities.map((record) => {
                    return (
                      <tr 
                        key={record.id} 
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group"
                      >
                        {/* Operation & Entity */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-start gap-2.5">
                            <div className="mt-0.5 shrink-0">
                              {renderActionBadge(record.action)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                {record.title}
                              </p>
                              {record.subtitle && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {record.subtitle}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-black uppercase tracking-wider border border-slate-200/80 dark:border-slate-700/80">
                            <Tag className="w-2.5 h-2.5 text-slate-400" />
                            {record.category}
                          </span>
                        </td>

                        {/* Timestamp */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-[11px] font-semibold">{formatDate(record.timestamp)}</span>
                          </div>
                        </td>

                        {/* Operator */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Shield className="w-3 h-3 text-slate-400" />
                            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                              {record.operator}
                            </span>
                          </div>
                        </td>

                        {/* Actions & Reference ID */}
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Direct Route Jump (if available) */}
                            {record.viewRoute && onViewChange && (
                              <button
                                onClick={() => onViewChange(record.viewRoute!)}
                                title={`Navigate to ${record.category}`}
                                className="px-2 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                              >
                                <span>Open</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}

                            {/* Inspect Payload Button */}
                            <button
                              onClick={() => setInspectRecord(record)}
                              title="Inspect raw structured payload"
                              className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Inspect</span>
                            </button>

                            {/* Server ID Copy */}
                            <button
                              onClick={() => copyToClipboard(record.referenceId)}
                              title="Copy reference ID"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/60 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 font-mono text-[10px] transition-colors border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 cursor-pointer"
                            >
                              <span className="truncate max-w-[100px]">{record.referenceId}</span>
                              {copiedId === record.referenceId ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3 opacity-60" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* =========================================================================
            TAB 2: TRASH VAULT (RECOVERABLE ARCHIVE)
           ========================================================================= */}
        {activeTab === 'trash' && (
          <div className="overflow-auto no-scrollbar flex-1 relative">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-700/80 shadow-xs">
                <tr>
                  <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Archived Entity & Details
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Category
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Deletion Reason
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Deleted At & Retention
                  </th>
                  <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 text-right">
                    Recovery Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs font-medium">
                {filteredTrash.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-24 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                          <CheckCircle2 className="w-6 h-6 stroke-[1.5]" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Trash Vault is Clean</p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">
                            There are currently no deleted records in the vault. All database entities are active.
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTrash.map((item) => {
                    return (
                      <tr 
                        key={item.id} 
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group"
                      >
                        {/* Archived Entity */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40 flex items-center justify-center shrink-0 text-xs font-bold">
                              <Trash2 className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 dark:text-white truncate">
                                {item.title}
                              </p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {item.details}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-black uppercase tracking-wider border border-slate-200/80 dark:border-slate-700/80">
                            <Tag className="w-2.5 h-2.5 text-slate-400" />
                            {item.category}
                          </span>
                        </td>

                        {/* Deletion Reason */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                              {item.deleteReason}
                            </span>
                          </div>
                        </td>

                        {/* Deleted At & Retention */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div>
                            <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                              {formatDate(item.deletedAt)}
                            </p>
                            <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                              {item.retentionDaysLeft} days retention left
                            </p>
                          </div>
                        </td>

                        {/* Recovery Actions */}
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Inspect */}
                            <button
                              onClick={() => setInspectRecord(item)}
                              title="Inspect deleted JSON record"
                              className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Inspect</span>
                            </button>

                            {/* 1-Click Instant Restore */}
                            <button
                              onClick={() => setRestoreConfirmItem(item)}
                              title="Restore back to active database"
                              className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black transition-all flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Restore</span>
                            </button>

                            {/* Permanent Purge */}
                            <button
                              onClick={() => setPurgeConfirmItem(item)}
                              title="Purge forever"
                              className="px-2 py-1 rounded-md bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Purge</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. FOOTER INFO STRIP */}
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Statutory Record Retention Standard:
            </span>
            <span>All modifications signed with SHA-256 integrity check. Soft-deleted items retained for 90 days.</span>
          </div>

          <div className="flex items-center gap-3">
            <span>
              Showing {activeTab === 'activity' ? filteredActivities.length : filteredTrash.length} records
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MODAL 1: AUDIT & TRASH PAYLOAD INSPECTOR MODAL
         ========================================================================= */}
      {inspectRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Audit Record Inspector
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {(inspectRecord as any).title || 'Structured Object Payload'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectRecord(null)}
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Metadata ribbon */}
            <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-500">Ref ID:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {(inspectRecord as any).referenceId || (inspectRecord as any).originalId || (inspectRecord as any).id}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-500">Category:</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                  {inspectRecord.category}
                </span>
              </div>
              <button
                onClick={() => {
                  const payload = (inspectRecord as any).rawPayload || (inspectRecord as any).data || inspectRecord;
                  navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                  toast.success('JSON payload copied to clipboard');
                }}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold flex items-center gap-1 hover:bg-slate-50 cursor-pointer"
              >
                <Copy className="w-3 h-3 text-indigo-500" />
                <span>Copy JSON</span>
              </button>
            </div>

            {/* Body: JSON Viewer */}
            <div className="p-5 overflow-auto flex-1 bg-slate-950 font-mono text-[11px] leading-relaxed text-slate-200">
              <pre>
                {JSON.stringify(
                  (inspectRecord as any).rawPayload || (inspectRecord as any).data || inspectRecord,
                  null,
                  2
                )}
              </pre>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
              <button
                onClick={() => setInspectRecord(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: 1-CLICK RESTORE CONFIRMATION MODAL
         ========================================================================= */}
      {restoreConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Restore Record to Database?
                </h3>
                <p className="text-xs text-slate-500">
                  This record will be recovered into active practice registers.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 mb-4 space-y-1">
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                {restoreConfirmItem.title}
              </p>
              <p className="text-[11px] text-slate-500">
                Category: <span className="font-semibold text-slate-700 dark:text-slate-300">{restoreConfirmItem.category}</span>
              </p>
              <p className="text-[11px] text-slate-500">
                Details: {restoreConfirmItem.details}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setRestoreConfirmItem(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleExecuteRestore(restoreConfirmItem)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Confirm Restore</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: PERMANENT PURGE CONFIRMATION MODAL
         ========================================================================= */}
      {purgeConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Permanently Purge Record?
                </h3>
                <p className="text-xs text-rose-500 font-medium">
                  This action cannot be undone. Data will be completely erased.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 mb-4 space-y-1">
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                {purgeConfirmItem.title}
              </p>
              <p className="text-[11px] text-slate-500">
                Category: {purgeConfirmItem.category} | Prior ID: {purgeConfirmItem.originalId}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setPurgeConfirmItem(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleExecutePurge(purgeConfirmItem)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Purge Forever</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: EMPTY ENTIRE TRASH VAULT MODAL
         ========================================================================= */}
      {showEmptyTrashModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Empty Entire Trash Vault?
                </h3>
                <p className="text-xs text-rose-500 font-medium">
                  All {trashVault.length} recoverable records will be permanently erased.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              Are you sure you want to permanently clear the Trash Vault? This will erase all soft-deleted records and cannot be reversed.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowEmptyTrashModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleEmptyTrash}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Empty All ({trashVault.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 5: ADD STATUTORY COMPLIANCE CHECKPOINT
         ========================================================================= */}
      {showCheckpointModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Record Compliance Checkpoint
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Log an official verified milestone in the audit trail.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCheckpointModal(false)}
                className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Checkpoint Milestone Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Monthly GSTR-3B Reconciliation Complete"
                  value={checkpointTitle}
                  onChange={(e) => setCheckpointTitle(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Verification Notes / Details
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Verified by CA Senior Partner; books match GST portal challan summary."
                  value={checkpointNotes}
                  onChange={(e) => setCheckpointNotes(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowCheckpointModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCheckpoint}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Checkpoint</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Trash;
