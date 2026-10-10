import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useModuleData } from '../../hooks/useModuleData.ts';
import { Client, LitigationRecord } from '../../types';
import Loader from '../../components/Loader';
import { TableFilter } from '../../components/TableFilter';
import { ViewControl } from '../../components/ViewControl';
import { ExportMenu } from '../../components/ExportMenu';
import { exportToCSV, printList } from '../../exportUtils';
import { toast } from 'sonner';

export type MessengerCategory = 
  | 'all'
  | 'gst'
  | 'it'
  | 'tax_audit'
  | 'monthly'
  | 'quarterly'
  | 'composition'
  | 'annual_04'
  | 'annual_09'
  | 'pending_notice'
  | 'pending_appeal'
  | 'pending_gstat'
  | 'pending_high_court';

const CATEGORIES: { id: MessengerCategory; label: string; shortLabel: string; dot: string }[] = [
  { id: 'all', label: 'All Clients', shortLabel: 'All Clients', dot: 'bg-indigo-500' },
  { id: 'gst', label: 'GST Portfolio', shortLabel: 'GST Portfolio', dot: 'bg-emerald-500' },
  { id: 'it', label: 'IT Portfolio', shortLabel: 'IT Portfolio', dot: 'bg-blue-500' },
  { id: 'tax_audit', label: 'Tax Audit', shortLabel: 'Tax Audit', dot: 'bg-purple-500' },
  { id: 'monthly', label: 'Monthly Filers', shortLabel: 'Monthly', dot: 'bg-teal-500' },
  { id: 'quarterly', label: 'Quarterly Filers', shortLabel: 'Quarterly', dot: 'bg-cyan-500' },
  { id: 'composition', label: 'Composition', shortLabel: 'Composition', dot: 'bg-amber-500' },
  { id: 'annual_04', label: 'Annual 04', shortLabel: 'Annual 04', dot: 'bg-orange-500' },
  { id: 'annual_09', label: 'Annual 09', shortLabel: 'Annual 09', dot: 'bg-yellow-500' },
  { id: 'pending_notice', label: 'Pending Notice', shortLabel: 'Notice', dot: 'bg-rose-500' },
  { id: 'pending_appeal', label: 'Pending Appeal', shortLabel: 'Appeal', dot: 'bg-pink-500' },
  { id: 'pending_gstat', label: 'Pending GSTAT', shortLabel: 'GSTAT', dot: 'bg-red-500' },
  { id: 'pending_high_court', label: 'Pending High Court', shortLabel: 'High Court', dot: 'bg-fuchsia-500' },
];

const DEFAULT_TEMPLATES = [
  { id: 'data', label: 'Data Request', category: 'GST', text: "Dear {{LEGAL_NAME}},\n\nPlease provide purchase/sale data for {{TRADE_NAME}} ({{GSTIN}}) for current filing.\n\nRegards,\nTeam" },
  { id: 'done', label: 'Filing Done', category: 'GST', text: "Dear {{LEGAL_NAME}},\n\nYour GST return for {{TRADE_NAME}} ({{GSTIN}}) has been filed successfully.\n\nRegards,\nTeam" },
  { id: 'tax_payment', label: 'Tax Payment Due', category: 'GST', text: "Dear {{LEGAL_NAME}},\n\nKindly note your tax liability for {{TRADE_NAME}} ({{GSTIN}}) is pending for payment. Please arrange payment at the earliest.\n\nRegards,\nTeam" },
  { id: 'notice_intimation', label: 'Department Notice', category: 'Litigation', text: "Dear {{LEGAL_NAME}},\n\nA department communication has been issued for {{TRADE_NAME}} ({{GSTIN}}). Please review and coordinate with our office for timely reply.\n\nRegards,\nTeam" },
  { id: 'itr_reminder', label: 'ITR Reminder', category: 'Income Tax', text: "Dear {{LEGAL_NAME}},\n\nKindly provide bank statements, interest certificates and investment proofs to complete your Income Tax Return filing.\n\nRegards,\nTeam" },
  { id: 'audit_intimation', label: 'Tax Audit Query', category: 'Tax Audit', text: "Dear {{LEGAL_NAME}},\n\nKindly arrange the books of accounts and ledger confirmations for your tax audit finalization.\n\nRegards,\nTeam" }
];

export const Messenger: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedClients, setSelectedClients] = useState<Record<string, Client>>({});
  const [templateText, setTemplateText] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [compactMode, setCompactMode] = useState(false);
  const [activeCategory, setActiveCategory] = useState<MessengerCategory>('all');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [relFilter, setRelFilter] = useState<string>('All');

  // Custom User Templates
  const [userTemplates, setUserTemplates] = useState<{label: string, text: string, category?: string}[]>(() => {
    try {
      const saved = localStorage.getItem('clientify_custom_templates');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Modal States
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isAddTemplateOpen, setIsAddTemplateOpen] = useState(false);
  const [newTemplateLabel, setNewTemplateLabel] = useState('');
  const [newTemplateText, setNewTemplateText] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState('General');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [isQueueActive, setIsQueueActive] = useState(false);
  const [queueIndex, setQueueIndex] = useState(0);

  // Queries
  const { data: allClients = [], isLoading: isClientsLoading } = useModuleData<Client[]>('clients');
  const { data: noticeData } = useModuleData('gst_notice_pending');
  const { data: appealData } = useModuleData('gst_appeal_pending');
  const { data: tribunalRecords = [] } = useModuleData<LitigationRecord[]>('tribunal_records');
  const { data: highcourtRecords = [] } = useModuleData<LitigationRecord[]>('highcourt_records');

  useEffect(() => {
    const syncHandler = () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['gst_notice_pending'] });
      queryClient.invalidateQueries({ queryKey: ['gst_appeal_pending'] });
      queryClient.invalidateQueries({ queryKey: ['tribunal_records'] });
      queryClient.invalidateQueries({ queryKey: ['highcourt_records'] });
    };
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, [queryClient]);

  // Click outside to close filter dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // GSTR-9 Watchlist reader
  const gstr9WatchlistIds = useMemo(() => {
    try {
      const raw = localStorage.getItem('clientify_gstr9_watchlist_v2');
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw);
      const set = new Set<string>();
      Object.values(parsed).forEach((arr: any) => {
        if (Array.isArray(arr)) arr.forEach((id: string) => set.add(id));
      });
      return set;
    } catch {
      return new Set<string>();
    }
  }, []);

  // Pending Notices sets
  const { pendingNoticeClientIds, pendingNoticeNames } = useMemo(() => {
    const ids = new Set<string>();
    const names = new Set<string>();
    const list = noticeData?.litigation || [];
    list.forEach((r: LitigationRecord) => {
      if (r.clientId) ids.add(r.clientId);
      if (r.clientName) names.add(r.clientName.trim().toLowerCase());
    });
    return { pendingNoticeClientIds: ids, pendingNoticeNames: names };
  }, [noticeData]);

  // Pending Appeals sets
  const { pendingAppealClientIds, pendingAppealNames } = useMemo(() => {
    const ids = new Set<string>();
    const names = new Set<string>();
    const list = appealData?.litigation || [];
    list.forEach((r: LitigationRecord) => {
      if (r.clientId) ids.add(r.clientId);
      if (r.clientName) names.add(r.clientName.trim().toLowerCase());
    });
    return { pendingAppealClientIds: ids, pendingAppealNames: names };
  }, [appealData]);

  // Pending Tribunal (GSTAT) sets
  const { pendingTribunalClientIds, pendingTribunalNames } = useMemo(() => {
    const ids = new Set<string>();
    const names = new Set<string>();
    tribunalRecords.filter(r => r.status === 'Pending').forEach((r: LitigationRecord) => {
      if (r.clientId) ids.add(r.clientId);
      if (r.clientName) names.add(r.clientName.trim().toLowerCase());
    });
    return { pendingTribunalClientIds: ids, pendingTribunalNames: names };
  }, [tribunalRecords]);

  // Pending High Court sets
  const { pendingHighCourtClientIds, pendingHighCourtNames } = useMemo(() => {
    const ids = new Set<string>();
    const names = new Set<string>();
    highcourtRecords.filter(r => r.status === 'Pending').forEach((r: LitigationRecord) => {
      if (r.clientId) ids.add(r.clientId);
      if (r.clientName) names.add(r.clientName.trim().toLowerCase());
    });
    return { pendingHighCourtClientIds: ids, pendingHighCourtNames: names };
  }, [highcourtRecords]);

  // Filter helper for all 13 categories
  const isClientInCategory = (c: Client, category: MessengerCategory): boolean => {
    switch (category) {
      case 'all':
        return true;
      case 'gst':
        return Boolean(c.gstProfile?.gstin || c.services?.includes('GST') || c.gstProfile?.regType);
      case 'it':
        return Boolean(c.itProfile?.pan || c.pan || c.services?.includes('IT') || c.services?.includes('ITR') || c.itProfile?.fileType);
      case 'tax_audit':
        return Boolean(
          c.itProfile?.auditApplicable || 
          c.itProfile?.advisoryWork?.taxAudit || 
          c.services?.includes('Audit') || 
          (c.itProfile?.fileType && c.itProfile.fileType.toLowerCase().includes('audit'))
        );
      case 'monthly':
        return Boolean(c.gstProfile?.gstin) && c.gstProfile?.regType !== 'Composition' && c.gstProfile?.filingFreq !== 'Quarterly';
      case 'quarterly':
        return c.gstProfile?.filingFreq === 'Quarterly';
      case 'composition':
        return c.gstProfile?.regType === 'Composition' || Boolean(c.services?.includes('Composition'));
      case 'annual_04':
        return c.gstProfile?.regType === 'Composition';
      case 'annual_09':
        return gstr9WatchlistIds.has(c.id) || (Boolean(c.gstProfile?.gstin) && c.gstProfile?.regType !== 'Composition');
      case 'pending_notice':
        return pendingNoticeClientIds.has(c.id) || 
          Boolean(c.gstProfile?.gstin && pendingNoticeClientIds.has(c.gstProfile.gstin)) || 
          Boolean(c.legalName && pendingNoticeNames.has(c.legalName.trim().toLowerCase())) || 
          Boolean(c.tradeName && pendingNoticeNames.has(c.tradeName.trim().toLowerCase()));
      case 'pending_appeal':
        return pendingAppealClientIds.has(c.id) || 
          Boolean(c.gstProfile?.gstin && pendingAppealClientIds.has(c.gstProfile.gstin)) || 
          Boolean(c.legalName && pendingAppealNames.has(c.legalName.trim().toLowerCase())) || 
          Boolean(c.tradeName && pendingAppealNames.has(c.tradeName.trim().toLowerCase()));
      case 'pending_gstat':
        return pendingTribunalClientIds.has(c.id) || 
          Boolean(c.gstProfile?.gstin && pendingTribunalClientIds.has(c.gstProfile.gstin)) || 
          Boolean(c.legalName && pendingTribunalNames.has(c.legalName.trim().toLowerCase())) || 
          Boolean(c.tradeName && pendingTribunalNames.has(c.tradeName.trim().toLowerCase()));
      case 'pending_high_court':
        return pendingHighCourtClientIds.has(c.id) || 
          Boolean(c.gstProfile?.gstin && pendingHighCourtClientIds.has(c.gstProfile.gstin)) || 
          Boolean(c.legalName && pendingHighCourtNames.has(c.legalName.trim().toLowerCase())) || 
          Boolean(c.tradeName && pendingHighCourtNames.has(c.tradeName.trim().toLowerCase()));
      default:
        return true;
    }
  };

  // Compute live counts for all 13 count badges
  const categoryCounts = useMemo(() => {
    const counts: Record<MessengerCategory, number> = {
      all: allClients.length,
      gst: 0,
      it: 0,
      tax_audit: 0,
      monthly: 0,
      quarterly: 0,
      composition: 0,
      annual_04: 0,
      annual_09: 0,
      pending_notice: 0,
      pending_appeal: 0,
      pending_gstat: 0,
      pending_high_court: 0
    };

    allClients.forEach(c => {
      if (isClientInCategory(c, 'gst')) counts.gst++;
      if (isClientInCategory(c, 'it')) counts.it++;
      if (isClientInCategory(c, 'tax_audit')) counts.tax_audit++;
      if (isClientInCategory(c, 'monthly')) counts.monthly++;
      if (isClientInCategory(c, 'quarterly')) counts.quarterly++;
      if (isClientInCategory(c, 'composition')) counts.composition++;
      if (isClientInCategory(c, 'annual_04')) counts.annual_04++;
      if (isClientInCategory(c, 'annual_09')) counts.annual_09++;
      if (isClientInCategory(c, 'pending_notice')) counts.pending_notice++;
      if (isClientInCategory(c, 'pending_appeal')) counts.pending_appeal++;
      if (isClientInCategory(c, 'pending_gstat')) counts.pending_gstat++;
      if (isClientInCategory(c, 'pending_high_court')) counts.pending_high_court++;
    });

    return counts;
  }, [allClients, gstr9WatchlistIds, pendingNoticeClientIds, pendingAppealClientIds, pendingTribunalClientIds, pendingHighCourtClientIds]);

  // Filtered client list
  const filteredClients = useMemo(() => {
    const s = search.toLowerCase();
    let list = allClients.filter(c => isClientInCategory(c, activeCategory));

    if (s) {
      list = list.filter(c => {
        return (
          (c.legalName || '').toLowerCase().includes(s) || 
          (c.tradeName || '').toLowerCase().includes(s) ||
          (c.gstProfile?.gstin && c.gstProfile.gstin.toLowerCase().includes(s)) ||
          (c.mobile && String(c.mobile).includes(s))
        );
      });
    }

    if (statusFilter !== 'All') {
      list = list.filter(c => {
        const gstSt = c.gstProfile?.gstStatus || 'Active';
        if (statusFilter === 'Active') return gstSt === 'Active' || c.status?.includes('Active');
        if (statusFilter === 'Suspended') return gstSt === 'Suspended';
        if (statusFilter === 'Closed') return gstSt === 'Closed';
        if (statusFilter === 'Inactive') return c.status === 'Inactive' || gstSt === 'Closed';
        return gstSt === statusFilter || c.status === statusFilter;
      });
    }

    if (relFilter !== 'All') {
      list = list.filter(c => {
        if (relFilter === 'Active') return c.status === 'Active' || c.status === 'Active Filing';
        return c.status === relFilter;
      });
    }

    return list;
  }, [allClients, activeCategory, search, statusFilter, relFilter, gstr9WatchlistIds, pendingNoticeClientIds, pendingAppealClientIds, pendingTribunalClientIds, pendingHighCourtClientIds]);

  const selectedClientsList = useMemo(() => {
    return Object.values(selectedClients);
  }, [selectedClients]);

  // Selection handlers
  const toggleAll = () => {
    if (selectedIds.size === filteredClients.length && filteredClients.length > 0) {
      setSelectedIds(new Set());
      setSelectedClients({});
    } else {
      const nextIds = new Set<string>();
      const nextClients: Record<string, Client> = {};
      filteredClients.forEach(c => {
        nextIds.add(c.id);
        nextClients[c.id] = c;
      });
      setSelectedIds(nextIds);
      setSelectedClients(nextClients);
    }
  };

  const toggleClient = (client: Client) => {
    const nextIds = new Set(selectedIds);
    const nextClients = { ...selectedClients };
    if (nextIds.has(client.id)) {
      nextIds.delete(client.id);
      delete nextClients[client.id];
    } else {
      nextIds.add(client.id);
      nextClients[client.id] = client;
    }
    setSelectedIds(nextIds);
    setSelectedClients(nextClients);
  };

  // Current Category metadata for dropdown badge
  const currentCategory = useMemo(() => {
    return CATEGORIES.find(c => c.id === activeCategory) || CATEGORIES[0];
  }, [activeCategory]);

  // Message formatting
  const formatMessage = (rawText: string, client: Client) => {
    let text = rawText;
    text = text.replace(/{{LEGAL_NAME}}/g, client.legalName || "---");
    text = text.replace(/{{TRADE_NAME}}/g, client.tradeName || client.legalName || "---");
    text = text.replace(/{{GSTIN}}/g, client.gstProfile?.gstin || "N/A");
    text = text.replace(/{{MOBILE}}/g, client.mobile ? String(client.mobile) : "---");
    return text;
  };

  // Sample message formatting for live preview
  const formatSampleMessage = (text: string) => {
    return text
      .replace(/{{LEGAL_NAME}}/g, 'RAJESH KUMAR SHARMA')
      .replace(/{{TRADE_NAME}}/g, 'ABC ENTERPRISES')
      .replace(/{{GSTIN}}/g, '27ABCDE1234F1Z5')
      .replace(/{{MOBILE}}/g, '9876543210');
  };

  // Template handlers
  const handleAddNewTemplate = () => {
    if (!newTemplateLabel.trim() || !newTemplateText.trim()) {
      toast.error("Please enter both template title and message text.");
      return;
    }
    const next = [...userTemplates, { 
      label: newTemplateLabel.trim(), 
      text: newTemplateText.trim(),
      category: newTemplateCategory
    }];
    setUserTemplates(next);
    localStorage.setItem('clientify_custom_templates', JSON.stringify(next));
    toast.success(`Template "${newTemplateLabel.trim()}" saved to library!`);
    setNewTemplateLabel('');
    setNewTemplateText('');
    setNewTemplateCategory('General');
    setIsAddTemplateOpen(false);
  };

  const deleteTemplate = (idx: number) => {
    const next = userTemplates.filter((_, i) => i !== idx);
    setUserTemplates(next);
    localStorage.setItem('clientify_custom_templates', JSON.stringify(next));
    toast.success("Template removed");
  };

  // WhatsApp sequence flow
  const startBroadcast = () => {
    if (selectedIds.size === 0) {
      toast.error("No recipients selected.");
      return;
    }
    setQueueIndex(0);
    setIsQueueActive(true);
    setIsComposerOpen(false);
  };

  const processNext = () => {
    const client = selectedClientsList[queueIndex];
    if (!client) return;
    const personalizedMsg = formatMessage(templateText, client);
    const cleanMobile = String(client.mobile || '').replace(/\D/g, '');
    const url = `whatsapp://send?phone=91${cleanMobile}&text=${encodeURIComponent(personalizedMsg)}`;
    window.location.href = url;
    if (queueIndex < selectedClientsList.length - 1) {
      setQueueIndex(queueIndex + 1);
    } else {
      toast.success("Broadcast Sequence Completed!");
      setIsQueueActive(false);
      setSelectedIds(new Set());
      setSelectedClients({});
    }
  };

  // Export handlers
  const handleExportCSV = () => {
    const headers = ['S.No.', 'Trade Name', 'Legal Name', 'GSTIN', 'Mobile No.', 'GST Status', 'Relationship'];
    const rows = filteredClients.map((c, idx) => [
      (idx + 1).toString().padStart(2, '0'),
      c.tradeName || '---',
      c.legalName || '---',
      c.gstProfile?.gstin || '---',
      c.mobile ? `+91 ${c.mobile}` : '---',
      c.gstProfile?.gstStatus || 'Active',
      c.status || 'Active'
    ]);
    exportToCSV(headers, rows, 'Messenger_Clients_Directory.csv');
  };

  const handleExportPDF = () => {
    const headers = ['Trade Name', 'Legal Name', 'GSTIN', 'Mobile No.', 'Status'];
    const rows = filteredClients.map(c => [
      c.tradeName || '---',
      c.legalName || '---',
      c.gstProfile?.gstin || '---',
      c.mobile ? `+91 ${c.mobile}` : '---',
      c.gstProfile?.gstStatus || 'Active'
    ]);
    printList('Vault Messenger Clients Directory', headers, rows);
  };

  if (isClientsLoading && allClients.length === 0) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* Modern Unified Single-Line Toolbar - Matching FoodLicenses / MSMERegistration Standard */}
      <div className="relative z-50 flex items-center justify-between gap-1.5 sm:gap-2 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs shrink-0 w-full max-w-full min-w-0 flex-nowrap overflow-visible transition-colors">
        
        {/* Left Section: Search Input (First) + Count Dropdown Badge (Second) */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 flex-nowrap">
          
          {/* First: Search Bar */}
          <div className="relative flex-1 min-w-[180px] sm:min-w-[240px] w-full group">
            <input 
              type="text" 
              placeholder="Search client name, trade name, GSTIN, or phone..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 rounded-xl py-2 pl-9 pr-24 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none shadow-2xs" 
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
              <span className="font-mono tabular-nums">{filteredClients.length} found</span>
              {search && (
                <button onClick={() => setSearch('')} className="p-0.5 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Combined Single Count Badge with Dropdown - Second (Shifted after search bar) */}
          <div className="relative shrink-0" ref={filterDropdownRef}>
            <button
              type="button"
              onClick={() => setIsFilterDropdownOpen(prev => !prev)}
              className={`h-9 px-2.5 rounded-lg border text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap ${
                isFilterDropdownOpen
                  ? 'bg-slate-900 text-white dark:bg-indigo-600 border-slate-900 dark:border-indigo-600'
                  : activeCategory !== 'all'
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                    : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
              title="Filter by client portfolio category"
            >
              <span className={`h-2 w-2 rounded-full ${currentCategory.dot}`} />
              <span className="font-bold">{currentCategory.shortLabel}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                isFilterDropdownOpen 
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
              }`}>
                {categoryCounts[activeCategory] || 0}
              </span>
              <svg 
                className={`h-3 w-3 text-slate-400 transition-transform duration-150 ${isFilterDropdownOpen ? 'rotate-180 text-white' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu listing all 13 categories */}
            {isFilterDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-64 max-h-96 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-1.5 z-[100] animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 mb-1 flex items-center justify-between">
                  <span>Client Portfolios</span>
                  <span className="font-mono text-[9px] text-slate-400 font-bold">13 Categories</span>
                </div>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(cat.id);
                      setIsFilterDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      activeCategory === cat.id
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${cat.dot}`} />
                      <span className="truncate">{cat.label}</span>
                    </div>
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0 ml-2">
                      {categoryCounts[cat.id] || 0}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Section: Add Message + Compose Message + ViewControl + ExportMenu */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            
            {/* Add Message Button */}
            <button 
              type="button"
              onClick={() => setIsAddTemplateOpen(true)}
              className="h-9 px-2.5 sm:px-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-xs shadow-2xs hover:shadow-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 uppercase tracking-wider"
              title="Create new message template"
            >
              <svg className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Add Message</span>
              <span className="sm:hidden">Template</span>
            </button>

            {/* Improved Compose Message Button */}
            <button 
              type="button"
              onClick={() => {
                if (selectedIds.size === 0) {
                  toast.info("Please select one or more clients to compose a broadcast message.");
                  return;
                }
                setIsComposerOpen(true);
              }}
              className={`h-9 px-3.5 rounded-xl font-bold text-xs shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95 shrink-0 uppercase tracking-wider ${
                selectedIds.size > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20'
              }`}
              title="Compose and broadcast WhatsApp message"
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347m-5.421 7.403" />
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" />
              </svg>
              <span>Compose Message</span>
              {selectedIds.size > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-white text-emerald-700">
                  {selectedIds.size}
                </span>
              )}
            </button>

            {/* ViewControl */}
            <ViewControl 
              viewMode={viewMode} 
              onViewChange={setViewMode} 
              compactMode={compactMode}
              onCompactToggle={() => setCompactMode(!compactMode)}
            />

            {/* ExportMenu */}
            <ExportMenu 
              onExportCSV={handleExportCSV} 
              onExportPDF={handleExportPDF} 
            />
          </div>
        </div>

      {/* Selected Recipients Banner (if any selected) */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-3.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/50 rounded-xl text-xs shrink-0 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2">
            <span className="font-bold text-indigo-700 dark:text-indigo-300">
              {selectedIds.size} recipient{selectedIds.size > 1 ? 's' : ''} selected for broadcast
            </span>
            <button 
              type="button" 
              onClick={() => { setSelectedIds(new Set()); setSelectedClients({}); }}
              className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 underline cursor-pointer"
            >
              Clear selection
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsComposerOpen(true)}
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all active:scale-95"
          >
            <span>Open Composer</span>
            <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px] font-mono">{selectedIds.size}</span>
          </button>
        </div>
      )}

      {/* Main Table / Grid Container */}
      <div className="relative z-10 flex-1 min-h-0 w-full max-w-full min-w-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-200/90 dark:border-slate-800/90 shadow-2xs overflow-hidden flex flex-col transition-colors">
        {viewMode === 'grid' ? (
          <div className="overflow-y-auto no-scrollbar flex-1 p-3.5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredClients.length === 0 ? (
              <div className="col-span-full py-20 text-center text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-xs">
                No clients found in {CATEGORIES.find(c => c.id === activeCategory)?.label || 'this category'}
              </div>
            ) : (
              filteredClients.map((c, idx) => {
                const isSelected = selectedIds.has(c.id);

                return (
                  <div
                    key={c.id}
                    onClick={() => toggleClient(c)}
                    className={`rounded-2xl p-3.5 border transition-all flex flex-col justify-between gap-3 cursor-pointer select-none ${
                      isSelected 
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-600 ring-2 ring-indigo-500/20 shadow-xs' 
                        : 'bg-slate-50/80 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 border-slate-200/80 dark:border-slate-700/80 hover:border-indigo-300 dark:hover:border-indigo-600/50'
                    }`}
                  >
                    {/* Top Row: Checkbox, S.No., and Status Tags */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleClient(c)}
                          onClick={e => e.stopPropagation()}
                          className="h-4.5 w-4.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                        />
                        <span className="font-mono text-xs font-bold text-slate-400 dark:text-slate-500">
                          #{(idx + 1).toString().padStart(2, '0')}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                          (c.gstProfile?.gstStatus || 'Active') === 'Active' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/60' :
                          (c.gstProfile?.gstStatus || 'Active') === 'Suspended' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/60' : 
                          'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200/80 dark:border-rose-800/60'
                        }`}>
                          {c.gstProfile?.gstStatus || 'Active'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 bg-slate-200/70 dark:bg-slate-700/60">
                          {c.status || 'Active'}
                        </span>
                      </div>
                    </div>

                    {/* Entity Names */}
                    <div className="space-y-0.5">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase truncate" title={c.tradeName || c.legalName}>
                        {c.tradeName || c.legalName || '---'}
                      </h4>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase truncate" title={c.legalName}>
                        {c.legalName || '---'}
                      </p>
                    </div>

                    {/* Identifiers (GSTIN & Mobile) */}
                    <div className="bg-white dark:bg-slate-900/80 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-400 uppercase text-[10px]">GSTIN:</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{c.gstProfile?.gstin || 'N/A'}</span>
                          {c.gstProfile?.gstin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(c.gstProfile?.gstin || '');
                                toast.success('GSTIN copied!');
                              }}
                              className="p-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                              title="Copy GSTIN"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 012-2v-8a2 2 0 01-2-2h-8a2 2 0 01-2 2v8a2 2 0 012 2z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-400 uppercase text-[10px]">Mobile:</span>
                        {c.mobile ? (
                          <a
                            href={`whatsapp://send?phone=91${c.mobile}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-semibold font-mono text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1 hover:underline"
                            title="Direct WhatsApp Chat"
                          >
                            <svg className="h-3.5 w-3.5 fill-emerald-600 dark:fill-emerald-400" viewBox="0 0 24 24">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.558 0 11.894-5.335 11.897-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                            </svg>
                            <span>+91 {c.mobile}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 font-mono text-xs">No Mobile</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto no-scrollbar flex-1 w-full relative h-full">
            <table className={`w-full text-left border-collapse table-fixed min-w-[900px] ${compactMode ? 'compact-mode' : ''}`}>
              <thead className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 shadow-2xs">
                <tr className="text-slate-700 dark:text-slate-200 text-[11px] font-bold uppercase tracking-wider select-none">
                  {/* Selection Column Header with Select All Checkbox */}
                  <th className="px-2 py-2 text-center w-[4%] min-w-[40px] whitespace-nowrap">
                    <input 
                      type="checkbox"
                      checked={filteredClients.length > 0 && selectedIds.size === filteredClients.length}
                      ref={el => {
                        if (el) {
                          el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredClients.length;
                        }
                      }}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600 transition-all"
                      title={selectedIds.size === filteredClients.length ? 'Deselect all' : 'Select all'}
                    />
                  </th>
                  <th className="px-2 py-2 text-center w-[4%] min-w-[36px] whitespace-nowrap text-slate-500 dark:text-slate-400">#</th>
                  <th className="px-2.5 py-2 text-left w-[23%] min-w-[175px]">Trade Name</th>
                  <th className="px-2.5 py-2 text-left w-[21%] min-w-[160px]">Legal Name</th>
                  <th className="px-2.5 py-2 text-left w-[15%] min-w-[135px] whitespace-nowrap">GSTIN</th>
                  <th className="px-2.5 py-2 text-left w-[14%] min-w-[130px] whitespace-nowrap">Mobile No.</th>
                  <th className="px-2 py-2 text-center w-[10%] min-w-[95px] whitespace-nowrap">
                    <TableFilter label="Status" isActive={statusFilter !== 'All'} onClear={() => setStatusFilter('All')}>
                      {['All', 'Active', 'Suspended', 'Closed', 'Inactive'].map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setStatusFilter(f)}
                          className={`w-full text-left px-2.5 py-1 text-xs font-semibold rounded-lg ${
                            statusFilter === f ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </TableFilter>
                  </th>
                  <th className="px-2 py-2 text-center w-[9%] min-w-[95px] whitespace-nowrap">
                    <TableFilter label="Relationship" isActive={relFilter !== 'All'} onClear={() => setRelFilter('All')}>
                      {['All', 'Active', 'Active Filing', 'Litigation', 'Consulting', 'Suspended', 'Inactive'].map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setRelFilter(f)}
                          className={`w-full text-left px-2.5 py-1 text-xs font-semibold rounded-lg ${
                            relFilter === f ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </TableFilter>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-20 text-center text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-xs">
                      No clients found in {CATEGORIES.find(c => c.id === activeCategory)?.label || 'this category'}
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((c, idx) => {
                    const isSelected = selectedIds.has(c.id);

                    return (
                      <tr 
                        key={c.id} 
                        onClick={() => toggleClient(c)} 
                        className={`cursor-pointer transition-all border-b border-slate-100 dark:border-slate-800/60 font-semibold ${
                          isSelected ? 'bg-indigo-50/60 dark:bg-indigo-950/40' : 'hover:bg-indigo-50/30 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        {/* Checkbox Cell */}
                        <td className="px-2 py-2 text-center whitespace-nowrap">
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleClient(c)}
                            onClick={e => e.stopPropagation()}
                            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600 transition-all"
                            title={isSelected ? 'Deselect client' : 'Select client'}
                          />
                        </td>

                        {/* S.No. */}
                        <td className="px-2 py-2 font-bold text-slate-400 dark:text-slate-500 font-mono text-center whitespace-nowrap text-xs">
                          {(idx + 1).toString().padStart(2, '0')}
                        </td>

                        {/* Trade Name */}
                        <td className="px-2.5 py-2 overflow-hidden text-left">
                          <p className="text-sm font-bold text-slate-900 dark:text-white uppercase leading-snug truncate" title={c.tradeName || c.legalName}>
                            {c.tradeName || c.legalName || '---'}
                          </p>
                        </td>

                        {/* Legal Name */}
                        <td className="px-2.5 py-2 overflow-hidden text-left">
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase leading-snug truncate" title={c.legalName}>
                            {c.legalName || '---'}
                          </p>
                        </td>

                        {/* GSTIN */}
                        <td className="px-2.5 py-2 whitespace-nowrap text-left">
                          <div className="flex items-center gap-1 font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">
                            <span>{c.gstProfile?.gstin || 'N/A'}</span>
                            {c.gstProfile?.gstin && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(c.gstProfile?.gstin || '');
                                  toast.success('GSTIN copied!');
                                }}
                                className="p-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                                title="Copy GSTIN"
                              >
                                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 012-2v-8a2 2 0 01-2-2h-8a2 2 0 01-2 2v8a2 2 0 012 2z" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Mobile No. */}
                        <td className="px-2.5 py-2 whitespace-nowrap text-left">
                          {c.mobile ? (
                            <div className="flex items-center gap-1.5">
                              <a
                                href={`whatsapp://send?phone=91${c.mobile}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs font-semibold font-mono text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1 hover:underline"
                                title="Chat on WhatsApp"
                              >
                                <svg className="h-3.5 w-3.5 fill-emerald-600 dark:fill-emerald-400 shrink-0" viewBox="0 0 24 24">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.558 0 11.894-5.335 11.897-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                </svg>
                                <span>+91 {c.mobile}</span>
                              </a>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(c.mobile);
                                  toast.success('Mobile copied!');
                                }}
                                className="p-0.5 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                                title="Copy Mobile"
                              >
                                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 012-2v-8a2 2 0 01-2-2h-8a2 2 0 01-2 2v8a2 2 0 012 2z" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">No Mobile</span>
                          )}
                        </td>

                        {/* GST Status */}
                        <td className="px-2 py-2 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                            (c.gstProfile?.gstStatus || 'Active') === 'Active' 
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/60' :
                            (c.gstProfile?.gstStatus || 'Active') === 'Suspended' 
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/60' : 
                              'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200/80 dark:border-rose-800/60'
                          }`}>
                            {c.gstProfile?.gstStatus || 'Active'}
                          </span>
                        </td>

                        {/* Relationship Status */}
                        <td className="px-2 py-2 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                            c.status === 'Active' || c.status === 'Active Filing'
                              ? 'text-indigo-700 bg-indigo-50 border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/50' :
                            c.status === 'Litigation'
                              ? 'text-amber-700 bg-amber-50 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50' :
                              'text-slate-600 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                          }`}>
                            {c.status || 'Active'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Message Template Modal - Upgraded with High-Fidelity UI and WhatsApp Bubble Preview */}
      {isAddTemplateOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 my-auto max-h-[92vh]">
            
            {/* Dark Premium Header */}
            <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shrink-0">
                  <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.08L2 22l5.08-1.34C8.54 21.52 10.23 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400">Messaging Vault & Library</p>
                  <h3 className="text-lg font-black tracking-tight text-white">Create Message Template</h3>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsAddTemplateOpen(false)} 
                className="h-8 w-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto no-scrollbar flex-1 bg-slate-50/50 dark:bg-slate-900/50 text-xs">
              
              {/* Guidance Info Card */}
              <div className="p-3 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 flex items-start gap-2.5">
                <span className="text-base shrink-0 mt-0.5">💡</span>
                <p className="text-[11px] text-indigo-950 dark:text-indigo-200 leading-relaxed font-medium">
                  Create reusable WhatsApp broadcast templates. Click variable chips below to insert dynamic recipient placeholders that automatically resolve per client.
                </p>
              </div>

              {/* Template Title */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 pl-1 mb-1.5 block">
                  Template Title <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text" 
                  placeholder="e.g., GSTR-3B Filing Reminder, Annual Audit Notice, Income Tax Return..." 
                  value={newTemplateLabel} 
                  onChange={e => setNewTemplateLabel(e.target.value)} 
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
                />
              </div>

              {/* Category Selector */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 pl-1 mb-1.5 block">
                  Category Tag
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {['General', 'GST Compliance', 'Income Tax', 'Tax Audit', 'Litigation', 'Annual Returns'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNewTemplateCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                        newTemplateCategory === cat
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message Body & Variable Insertion Chips */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 pl-1">
                    Message Body <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Insert Tag:</span>
                    {[
                      { tag: '{{TRADE_NAME}}', label: 'Trade Name' },
                      { tag: '{{LEGAL_NAME}}', label: 'Legal Name' },
                      { tag: '{{GSTIN}}', label: 'GSTIN' },
                      { tag: '{{MOBILE}}', label: 'Mobile' },
                    ].map(item => (
                      <button
                        key={item.tag}
                        type="button"
                        onClick={() => setNewTemplateText(prev => (prev ? prev + ' ' + item.tag : item.tag))}
                        className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-300 font-mono text-[10px] font-bold cursor-pointer transition-all shadow-2xs"
                        title={`Insert ${item.tag}`}
                      >
                        +{item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea 
                  rows={5} 
                  placeholder="Dear {{TRADE_NAME}}, kindly note that your compliance filing is scheduled for review. Your GSTIN: {{GSTIN}}. Please submit documents to avoid penalties. Team Clientify." 
                  value={newTemplateText} 
                  onChange={e => setNewTemplateText(e.target.value)} 
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-xs font-medium text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed resize-none shadow-2xs transition-all"
                />
                
                <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                  <span>Formatting: *bold*, _italic_, ~strikethrough~ supported</span>
                  <span className="font-mono">{newTemplateText.length} characters</span>
                </div>
              </div>

              {/* Authentic WhatsApp Bubble Live Preview */}
              <div>
                <div className="flex items-center justify-between mb-1 pl-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Live WhatsApp Bubble Preview
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold font-mono">
                    Sample Client: ABC ENTERPRISES
                  </span>
                </div>
                
                <div className="bg-slate-100 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
                  <div className="max-w-[90%] bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800/60 rounded-2xl rounded-tl-xs p-3 shadow-2xs">
                    <p className="text-xs text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed font-sans">
                      {newTemplateText ? formatSampleMessage(newTemplateText) : (
                        <span className="text-slate-400 italic">
                          Dear ABC ENTERPRISES, kindly note that your compliance filing is due. GSTIN: 27ABCDE1234F1Z5. Team Clientify.
                        </span>
                      )}
                    </p>
                    <div className="flex items-center justify-end gap-1 mt-1.5 text-[9px] font-mono text-emerald-700/70 dark:text-emerald-400/70">
                      <span>10:45 AM</span>
                      <svg className="h-3 w-3 fill-emerald-600 dark:fill-emerald-400" viewBox="0 0 16 16">
                        <path d="M12.354 4.354a.5.5 0 0 0-.708-.708L5 10.293 1.854 7.146a.5.5 0 1 0-.708.708l3.5 3.5a.5.5 0 0 0 .708 0l7-7zm-4 0a.5.5 0 0 0-.708-.708L2 9.293l.646.647 5-5z"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5 shrink-0">
              <button 
                type="button" 
                onClick={() => setIsAddTemplateOpen(false)} 
                className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleAddNewTemplate} 
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md hover:shadow-lg cursor-pointer active:scale-95 transition-all flex items-center gap-1.5"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span>Save Template</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Composer Modal */}
      {isComposerOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999998] flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight">Compose WhatsApp Broadcast</h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mt-0.5">
                  Sending to <span className="font-bold text-emerald-600">{selectedIds.size}</span> selected client recipient{selectedIds.size > 1 ? 's' : ''}.
                </p>
              </div>
              <button onClick={() => setIsComposerOpen(false)} className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 no-scrollbar">
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Select Template</h4>
                  <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">Click to apply to composer</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_TEMPLATES.map(t => (
                    <button 
                      key={t.id} 
                      onClick={() => setTemplateText(t.text)} 
                      className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-600 dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-200 hover:text-white dark:hover:text-white rounded-xl text-xs font-bold uppercase transition-all border border-slate-200/80 dark:border-slate-700 shadow-2xs"
                    >
                      {t.label}
                    </button>
                  ))}
                  {userTemplates.map((t, i) => (
                    <div key={i} className="flex items-center bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800">
                      <button onClick={() => setTemplateText(t.text)} className="px-3 py-1.5 text-indigo-700 dark:text-indigo-300 text-xs font-bold uppercase">
                        {t.label}
                      </button>
                      <button onClick={() => deleteTemplate(i)} className="pr-2 text-indigo-400 hover:text-rose-500 transition-colors" title="Delete custom template">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Message Body</label>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 dark:text-slate-500">
                    <span>Tags:</span>
                    <button type="button" onClick={() => setTemplateText(prev => prev + ' {{LEGAL_NAME}}')} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-700 dark:text-slate-300 font-bold transition-colors">
                      {"{{LEGAL_NAME}}"}
                    </button>
                    <button type="button" onClick={() => setTemplateText(prev => prev + ' {{TRADE_NAME}}')} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-700 dark:text-slate-300 font-bold transition-colors">
                      {"{{TRADE_NAME}}"}
                    </button>
                    <button type="button" onClick={() => setTemplateText(prev => prev + ' {{GSTIN}}')} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-700 dark:text-slate-300 font-bold transition-colors">
                      {"{{GSTIN}}"}
                    </button>
                  </div>
                </div>
                <textarea 
                  value={templateText} 
                  onChange={e => setTemplateText(e.target.value)} 
                  placeholder="Type your message here... Use tags like {{LEGAL_NAME}}, {{TRADE_NAME}}, {{GSTIN}} for personalization."
                  className="w-full flex-1 min-h-[200px] bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 font-medium text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-600/20 transition-all resize-none leading-relaxed" 
                />
              </section>

              {/* Live Preview */}
              {selectedClientsList[0] && templateText && (
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">Live Preview (Recipient: {selectedClientsList[0].tradeName || selectedClientsList[0].legalName})</span>
                    <span className="text-[10px] text-emerald-600 font-bold font-mono">+91 {selectedClientsList[0].mobile}</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-sans bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800">
                    {formatMessage(templateText, selectedClientsList[0])}
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between items-center shrink-0">
              <button 
                onClick={() => {
                  if (!templateText.trim()) return;
                  const label = prompt("Enter template title:");
                  if (label) {
                    const next = [...userTemplates, { label: label.trim(), text: templateText.trim() }];
                    setUserTemplates(next);
                    localStorage.setItem('clientify_custom_templates', JSON.stringify(next));
                    toast.success("Template saved!");
                  }
                }} 
                className="text-indigo-600 dark:text-indigo-400 font-bold uppercase text-xs hover:underline flex items-center gap-1.5"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                <span>Save Current as Template</span>
              </button>
              
              <div className="flex items-center gap-3">
                <button onClick={() => setIsComposerOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold uppercase text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-all">
                  Cancel
                </button>
                <button 
                  onClick={startBroadcast} 
                  disabled={!templateText.trim() || selectedIds.size === 0} 
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase tracking-wider px-6 py-2.5 rounded-xl shadow-lg transition-all disabled:opacity-40 flex items-center gap-2 text-xs"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span>Start WhatsApp Sequence</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Queue Broadcast Progress Modal */}
      {isQueueActive && selectedClientsList[queueIndex] && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col">
            <div className="bg-slate-900 dark:bg-slate-950 p-6 text-white border-b border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">WhatsApp Broadcast Queue</span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 bg-white/10 px-2.5 py-0.5 rounded-full">
                  {queueIndex + 1} of {selectedClientsList.length}
                </span>
              </div>
              <h3 className="text-lg font-bold truncate">
                {selectedClientsList[queueIndex].tradeName || selectedClientsList[queueIndex].legalName}
              </h3>
              <p className="text-xs font-mono text-indigo-300 mt-0.5">
                {selectedClientsList[queueIndex].gstProfile?.gstin || `Phone: +91 ${selectedClientsList[queueIndex].mobile}`}
              </p>
              <div className="mt-5 h-2 w-full bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-500" 
                  style={{ width: `${((queueIndex + 1) / selectedClientsList.length) * 100}%` }} 
                />
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1.5">Formatted Message Preview</p>
                <div className="text-slate-800 dark:text-slate-200 font-medium whitespace-pre-wrap leading-relaxed text-xs max-h-48 overflow-y-auto">
                  {formatMessage(templateText, selectedClientsList[queueIndex])}
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setIsQueueActive(false)} 
                  className="flex-1 py-3 text-slate-500 dark:text-slate-400 font-bold uppercase text-xs hover:text-rose-600 dark:hover:text-rose-400 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                >
                  Abort Queue
                </button>
                <button 
                  onClick={processNext} 
                  className="flex-[2] bg-emerald-600 text-white font-bold uppercase tracking-wider py-3 rounded-xl shadow-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.558 0 11.894-5.335 11.897-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                  <span>{queueIndex === selectedClientsList.length - 1 ? 'Final Send' : 'Send & Next Client'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Messenger;
