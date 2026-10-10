import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useModuleData } from '../../../hooks/useModuleData.ts';
import { LitigationRecord, Client, LitigationStatus } from '../../../types';
import { api } from '../../../services/api.ts';
import Loader from '../../../components/Loader';
import NoticeForm from '../../Clientform/NoticeForm';
import LitigationDetailModal from '../../../components/LitigationDetailModal';
import GSTPortalLoginModal from '../../../components/GSTPortalLoginModal';
import { toast } from 'sonner';
import { exportToCSV, printList } from '../../../exportUtils';
import { EditableRemark } from '../../../components/EditableRemark';
import { formatDate } from '../../../dateUtils';
import ViewControl from '../../../components/ViewControl';
import { TableFilter } from '../../../components/TableFilter';
import { ExportImportMenu } from '../../../components/ExportImportMenu';

type DueDateFilter = 'All' | 'gt15' | 'gt5' | 'urgent';

export const NoticePending: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: pageData, isLoading: isPageLoading } = useModuleData('gst_notice_pending');

  const allRecords = useMemo(() => pageData?.litigation || [], [pageData]);
  const clients = useMemo(() => pageData?.clients || [], [pageData]);
  const records = useMemo(() => allRecords, [allRecords]);
  const isLoading = isPageLoading && !pageData;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'table');
  const [dueFilter, setDueFilter] = useState<DueDateFilter>('All');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  const [sectionFilter, setSectionFilter] = useState('All');
  const [selectedRecord, setSelectedRecord] = useState<Partial<LitigationRecord> | null>(null);

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingRecord, setViewingRecord] = useState<LitigationRecord | null>(null);

  const [isLoginBoxOpen, setIsLoginBoxOpen] = useState(false);
  const [selectedClientForLogin, setSelectedClientForLogin] = useState<Client | null>(null);

  const [isReplyModalOpen, setIsReplyModalOpen] = useState(false);
  const [recordToReply, setRecordToReply] = useState<LitigationRecord | null>(null);
  const [replyDate, setReplyDate] = useState(new Date().toISOString().split('T')[0]);
  const [replyRefNo, setReplyRefNo] = useState('');

  // 3-dot Action drawer state
  const [activeActionsId, setActiveActionsId] = useState<string | null>(null);
  const selectedActionRecord = useMemo(() => {
    if (!activeActionsId) return null;
    return records.find(r => r.id === activeActionsId) || null;
  }, [records, activeActionsId]);

  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['gst_notice_pending'] });
    queryClient.invalidateQueries({ queryKey: ['litigation_filing_page_data'] });
    queryClient.invalidateQueries({ queryKey: ['litigationRecords'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  }, [queryClient]);

  useEffect(() => {
    const syncHandler = () => { refreshData(); };
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, [refreshData]);

  // Click outside to close filter dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    if (isFilterDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterDropdownOpen]);

  const handleSave = async (data: Partial<LitigationRecord>) => {
    if (!data.clientId || !data.referenceNo) { 
      toast.error("Please provide Taxpayer and Reference Number."); 
      return; 
    }
    await api.saveLitigationRecord({ ...data, category: 'Notice' });
    setIsModalOpen(false); 
    setIsViewModalOpen(false); 
    refreshData();
    toast.success(selectedRecord?.id ? "Notice record updated" : "Notice recorded successfully");
  };

  const submitReply = async () => {
    if (!recordToReply) return;
    try {
      const updated = { 
        ...recordToReply, 
        status: 'Filed' as LitigationStatus, 
        filedDate: replyDate, 
        replyReferenceNo: replyRefNo 
      };
      await api.saveLitigationRecord(updated);
      setIsReplyModalOpen(false);
      setRecordToReply(null);
      setReplyDate(new Date().toISOString().split('T')[0]);
      setReplyRefNo('');
      refreshData();
      toast.success("Notice marked as replied");
    } catch (err) { toast.error("Status update failed"); }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Permanently remove this notice record from vault?')) {
      try { 
        await api.deleteLitigationRecord(id); 
        refreshData(); 
        toast.success("Notice record deleted");
      } catch (err) { 
        toast.error("Deletion failed."); 
      }
    }
  };

  const getDaysLeft = (dueDate?: string) => {
    if (!dueDate) return 999;
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = due.getTime() - now.getTime();
    return Math.round(diff / (1000 * 60 * 60 * 24));
  };

  const sections = useMemo<string[]>(() => (Array.from(new Set(records.map(r => r.section).filter((s): s is string => Boolean(s)))) as string[]).sort(), [records]);

  // Statistics
  const stats = useMemo(() => {
    const total = records.length;
    let gt15 = 0;
    let gt5 = 0;
    let urgent = 0;

    records.forEach(r => {
      const dl = getDaysLeft(r.dueDate);
      if (dl > 15) gt15++;
      else if (dl > 5 && dl <= 15) gt5++;
      else urgent++;
    });

    return { total, gt15, gt5, urgent };
  }, [records]);

  const filterOptions = [
    { value: 'All' as DueDateFilter, label: 'Total Pending Notices', shortLabel: 'Total', count: stats.total, dot: 'bg-slate-400' },
    { value: 'gt15' as DueDateFilter, label: 'Due > 15 Days (Safe)', shortLabel: '> 15 Days', count: stats.gt15, dot: 'bg-emerald-500' },
    { value: 'gt5' as DueDateFilter, label: 'Due > 5 Days (Moderate)', shortLabel: '> 5 Days', count: stats.gt5, dot: 'bg-amber-500' },
    { value: 'urgent' as DueDateFilter, label: 'Urgent / Due in ≤ 5 Days', shortLabel: 'Urgent', count: stats.urgent, dot: 'bg-rose-500' },
  ];

  const currentFilterOption = filterOptions.find(o => o.value === dueFilter) || filterOptions[0];

  const filteredRecords = useMemo(() => {
    const s = search.toLowerCase().trim();
    let list = records.filter(r => {
      const client = clients.find(c => c.id === r.clientId);
      return (r.clientName || '').toLowerCase().includes(s) || 
             (r.referenceNo || '').toLowerCase().includes(s) ||
             (client?.gstProfile?.gstin || '').toLowerCase().includes(s);
    });

    if (sectionFilter !== 'All') {
      list = list.filter(r => r.section === sectionFilter);
    }

    if (dueFilter === 'gt15') {
      list = list.filter(r => getDaysLeft(r.dueDate) > 15);
    } else if (dueFilter === 'gt5') {
      list = list.filter(r => {
        const dl = getDaysLeft(r.dueDate);
        return dl > 5 && dl <= 15;
      });
    } else if (dueFilter === 'urgent') {
      list = list.filter(r => getDaysLeft(r.dueDate) <= 5);
    }

    return [...list].sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [records, clients, search, sectionFilter, dueFilter]);

  const handleExportCSV = () => {
    const headers = ['S.No.', 'Trade Name', 'GSTIN', 'Section', 'Tax Period', 'Notice Date', 'Due Date', 'Status', 'Ref No', 'Remark'];
    const rows = filteredRecords.map((r, idx) => {
      const c = clients.find(cl => cl.id === r.clientId);
      return [
        (idx + 1).toString().padStart(2, '0'),
        r.clientName || '---',
        c?.gstProfile?.gstin || '---',
        r.section ? 'U/s ' + r.section : '---',
        r.taxPeriod || '---',
        r.issuedDate || '---',
        r.dueDate || '---',
        r.status || 'Pending',
        r.referenceNo || '---',
        r.remarks || ''
      ];
    });
    exportToCSV(headers, rows, 'Pending_Notices.csv');
  };

  const handleExportPDF = () => {
    const headers = ['Trade Name', 'GSTIN', 'Section', 'Notice Date', 'Due Date', 'Status', 'Ref No'];
    const rows = filteredRecords.map(r => {
      const c = clients.find(cl => cl.id === r.clientId);
      return [
        r.clientName || '---',
        c?.gstProfile?.gstin || '---',
        r.section ? 'U/s ' + r.section : '---',
        r.issuedDate || '---',
        r.dueDate || '---',
        r.status || 'Pending',
        r.referenceNo || '---'
      ];
    });
    printList('Pending Notices', headers, rows);
  };

  const handleDownloadTemplate = () => {
    const headers = ['Trade Name', 'GSTIN', 'Section', 'Tax Period', 'Notice Date', 'Due Date', 'Reference No', 'Remarks'];
    const sampleRows = [
      ['ABC Enterprises', '27AAAAA0000A1Z5', '73', '2023-24', '2024-01-15', '2024-02-15', 'NOT-2024-001', 'ITC mismatch inquiry'],
      ['XYZ Traders', '24BBBBB1111B2Z6', '61', '2022-23', '2024-02-10', '2024-03-12', 'ASMT10-9921', 'Scrutiny of returns']
    ];
    exportToCSV(headers, sampleRows, 'Notice_Import_Template.csv');
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length <= 1) {
        toast.error('The selected CSV file has no notice data rows.');
        return;
      }

      const rows = lines.slice(1);
      let successCount = 0;

      for (const row of rows) {
        if (!row.trim()) continue;
        const cols = row.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (!cols[0]) continue;

        const tradeName = cols[0];
        const gstin = cols[1] || '';
        const section = cols[2]?.replace(/^U\/s\s*/i, '') || '73';
        const taxPeriod = cols[3] || '2024-25';
        const issuedDate = cols[4] || new Date().toISOString().split('T')[0];
        const dueDate = cols[5] || '';
        const referenceNo = cols[6] || `NOT-${Date.now().toString().slice(-6)}`;
        const remarks = cols[7] || '';

        let client = clients.find(c => 
          (c.gstProfile?.gstin && gstin && c.gstProfile.gstin.toLowerCase() === gstin.toLowerCase()) ||
          (c.tradeName && c.tradeName.toLowerCase() === tradeName.toLowerCase())
        );

        const newRecord: Partial<LitigationRecord> = {
          clientId: client?.id || 'CLIENT-' + Math.random().toString(36).substr(2, 9),
          clientName: tradeName,
          category: 'Notice',
          status: 'Pending',
          section,
          taxPeriod,
          issuedDate,
          dueDate,
          referenceNo,
          remarks
        };

        try {
          await api.saveLitigationRecord(newRecord);
          successCount++;
        } catch (err) {
          console.error(err);
        }
      }

      refreshData();
      toast.success(`Successfully imported ${successCount} notice records.`);
    };
    reader.readAsText(file);
  };

  const handleShareWhatsApp = (rec: LitigationRecord) => {
    const client = clients.find(c => c.id === rec.clientId);
    const dl = getDaysLeft(rec.dueDate);
    const message = `*GST NOTICE ALERT*\n` +
      `Taxpayer: ${rec.clientName}\n` +
      `GSTIN: ${client?.gstProfile?.gstin || 'N/A'}\n` +
      `Notice Ref: ${rec.referenceNo}\n` +
      `Section: U/s ${rec.section || 'N/A'}\n` +
      `Tax Period: ${rec.taxPeriod || 'N/A'}\n` +
      `Notice Date: ${formatDate(rec.issuedDate)}\n` +
      `Due Date: ${formatDate(rec.dueDate)} (${dl < 0 ? `${Math.abs(dl)}d overdue` : `${dl}d left`})\n` +
      `Status: Pending Reply\n\n` +
      `Please provide the required reply submissions at the earliest.`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  if (isLoading) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* Modern Unified Responsive Toolbar - PC & Mobile Optimized */}
      <div className="relative z-50 flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 sm:gap-2 bg-white dark:bg-slate-900 p-2 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs shrink-0 w-full max-w-full min-w-0 overflow-visible transition-colors">
        
        {/* Left Section: Search Input + Count Dropdown Badge */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-[200px] w-full sm:w-auto">
          
          {/* Search Bar - First with maximum available width */}
          <div className="relative group flex-1 min-w-[150px] sm:min-w-[240px]">
            <input 
              type="text" 
              placeholder="Search trade name, GSTIN or notice ref..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-7 sm:pr-8 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none" 
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {search && (
              <button 
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          {/* Combined Single Count Badge with Dropdown */}
          <div className="relative shrink-0" ref={filterDropdownRef}>
            <button
              type="button"
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
              className={`h-9 px-2.5 rounded-lg border text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap ${
                isFilterDropdownOpen
                  ? 'bg-slate-900 text-white dark:bg-indigo-600 border-slate-900 dark:border-indigo-600'
                  : dueFilter !== 'All'
                    ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
              title="Click to view all notice counts and due filters"
            >
              <span className={`h-2 w-2 rounded-full ${currentFilterOption.dot} shrink-0`} />
              <span>{currentFilterOption.shortLabel}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${
                isFilterDropdownOpen
                  ? 'bg-slate-800 dark:bg-indigo-700 text-white'
                  : dueFilter !== 'All'
                    ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
              }`}>
                {currentFilterOption.count}
              </span>
              <svg 
                className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${isFilterDropdownOpen ? 'rotate-180 text-white' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor" 
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu showing all options with counts */}
            {isFilterDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-[100] p-1.5 animate-in zoom-in-95 origin-top-left">
                <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-1 flex items-center justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <span>Due Status</span>
                  <span>Count</span>
                </div>
                <div className="space-y-0.5">
                  {filterOptions.map((option) => {
                    const isSelected = dueFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setDueFilter(option.value);
                          setIsFilterDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${option.dot} shrink-0`} />
                          <span>{option.label}</span>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          isSelected
                            ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}>
                          {option.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Section: View Control, Combined Export/Import (Like GST Portfolio), Record Notice */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto flex-nowrap overflow-visible">
          <ViewControl 
            viewMode={viewMode} 
            onViewChange={setViewMode} 
            className="h-9 rounded-lg shrink-0"
          />

          {/* Combined Export/Import Dropdown - Like GST Portfolio */}
          <ExportImportMenu 
            onExportCSV={handleExportCSV}
            onExportPDF={handleExportPDF}
            onImportCSV={handleImportCSV}
            onDownloadTemplate={handleDownloadTemplate}
          />

          {/* Record Notice Button */}
          <button 
            type="button"
            onClick={() => { setSelectedRecord(null); setIsModalOpen(true); }}
            className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold tracking-wide px-3 sm:px-3.5 rounded-lg shadow-2xs transition-all text-xs flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="whitespace-nowrap">Record Notice</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 min-h-0 w-full max-w-full min-w-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col transition-colors">
        {viewMode === 'grid' ? (
          <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecords.length === 0 ? (
              <div className="col-span-full py-24 text-center text-slate-400 font-bold uppercase tracking-wider text-xs">
                No pending notices found matching current filters
              </div>
            ) : (
              filteredRecords.map((rec, idx) => {
                const dl = getDaysLeft(rec.dueDate);
                const isOverdue = dl < 0;
                const isCritical = dl <= 5 && dl >= 0;
                const client = clients.find(c => c.id === rec.clientId);

                return (
                  <div key={rec.id} className="p-4 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                          #{((idx + 1).toString().padStart(2, '0'))}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <div className={`h-2 w-2 rounded-full ${isOverdue || isCritical ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                          <span className={`text-[11px] font-bold ${isOverdue || isCritical ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                            {dl < 0 ? `${Math.abs(dl)}d Overdue` : dl === 0 ? 'Due Today' : `${dl}d Left`}
                          </span>
                        </div>
                      </div>

                      <h4 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate leading-snug" title={client?.tradeName || rec.clientName}>
                        {client?.tradeName || rec.clientName || '---'}
                      </h4>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5 tracking-wider">
                        {client?.gstProfile?.gstin || '---'}
                      </p>
                    </div>

                    <div className="bg-white dark:bg-slate-855 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-750 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Section:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{rec.section ? `U/s ${rec.section}` : '---'}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Notice Date:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300 uppercase">{formatDate(rec.issuedDate)}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Due Date:</span>
                        <span className="font-bold text-rose-600 dark:text-rose-400 uppercase">{formatDate(rec.dueDate)}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Ref No:</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[140px]">{rec.referenceNo || '---'}</span>
                      </div>
                    </div>

                    <div className="pt-1">
                      <EditableRemark 
                        value={rec.remarks || ''} 
                        onSave={async (val) => {
                          await api.saveLitigationRecord({ ...rec, remarks: val });
                          refreshData();
                        }} 
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-750">
                      <button 
                        onClick={() => { setRecordToReply(rec); setIsReplyModalOpen(true); }}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white transition-all cursor-pointer"
                      >
                        Reply Filed
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button 
                          type="button"
                          onClick={() => { setViewingRecord(rec); setIsViewModalOpen(true); }} 
                          className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-1 shadow-2xs cursor-pointer text-xs font-medium active:scale-95"
                          title="View Details"
                        >
                          <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 12z" />
                          </svg>
                          <span>View</span>
                        </button>
                        <button 
                          type="button"
                          onClick={() => setActiveActionsId(rec.id)}
                          className="h-7 w-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all flex items-center justify-center shadow-2xs cursor-pointer active:scale-95"
                          title="More Actions"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h.01M12 12h.01M19 12h.01" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="w-full overflow-x-auto overflow-y-auto no-scrollbar flex-1 relative h-full">
            <table className="w-full text-left border-collapse table-auto min-w-[1020px]">
              <thead className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 shadow-2xs">
                <tr className="text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px] select-none">
                  <th className="px-3 py-2.5 w-[50px] text-center whitespace-nowrap">S.No.</th>
                  <th className="px-3 py-2.5 min-w-[180px]">Trade Name</th>
                  
                  {/* Clean Section Header with TableFilter */}
                  <th className="px-3 py-2.5 min-w-[110px] whitespace-nowrap">
                    <TableFilter label="Section" isActive={sectionFilter !== 'All'}>
                      <div className="p-1 space-y-0.5">
                        <button
                          type="button"
                          onClick={() => setSectionFilter('All')}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-between ${
                            sectionFilter === 'All'
                              ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-bold'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span>All Sections</span>
                          {sectionFilter === 'All' && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600"></span>}
                        </button>
                        {sections.map(sec => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => setSectionFilter(sec)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-between ${
                              sectionFilter === sec
                                ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-bold'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span>U/s {sec}</span>
                            {sectionFilter === sec && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600"></span>}
                          </button>
                        ))}
                      </div>
                    </TableFilter>
                  </th>

                  <th className="px-3 py-2.5 min-w-[100px] whitespace-nowrap">Tax Period</th>
                  <th className="px-3 py-2.5 min-w-[100px] whitespace-nowrap">Notice Date</th>
                  <th className="px-3 py-2.5 min-w-[100px] whitespace-nowrap">Due Date</th>
                  <th className="px-3 py-2.5 min-w-[110px] whitespace-nowrap">Remaining</th>
                  <th className="px-3 py-2.5 min-w-[95px] text-center whitespace-nowrap">Status</th>
                  <th className="px-3 py-2.5 min-w-[150px]">Remark</th>
                  <th className="sticky top-0 right-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2.5 text-right w-[120px] min-w-[120px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] border-b border-slate-200/90 dark:border-slate-700/90">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-24 text-center text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">
                      No Pending Notices in Vault
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec, idx) => {
                    const dl = getDaysLeft(rec.dueDate);
                    const isOverdue = dl < 0;
                    const isCritical = dl <= 5 && dl >= 0;
                    const client = clients.find(c => c.id === rec.clientId);

                    return (
                      <tr key={rec.id} className="group hover:bg-indigo-50/20 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800/50 last:border-0">
                        <td className="px-3 py-2 text-center text-xs font-medium font-mono tabular-nums text-slate-400 dark:text-slate-500 whitespace-nowrap">
                          {(idx + 1).toString().padStart(2, '0')}
                        </td>
                        <td className="px-3 py-2 truncate min-w-[180px]">
                          <div className="font-bold text-slate-900 dark:text-slate-100 truncate text-base sm:text-lg tracking-tight leading-snug" title={client?.tradeName || rec.clientName}>
                            {client?.tradeName || rec.clientName || '---'}
                          </div>
                          <div className="flex items-center gap-1 text-xs font-mono text-slate-500 dark:text-slate-400 tracking-wider">
                            <span>{client?.gstProfile?.gstin || '---'}</span>
                            {client?.gstProfile?.gstin && (
                              <button 
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(client.gstProfile?.gstin || '');
                                  toast.success('GSTIN Copied!');
                                }}
                                className="p-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                                title="Copy GSTIN"
                              >
                                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m-6 4h6m-6 4h6" /></svg>
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {rec.section ? `U/s ${rec.section}` : '---'}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {rec.taxPeriod || '---'}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                          {formatDate(rec.issuedDate)}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap text-xs">
                          {formatDate(rec.dueDate)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${isOverdue || isCritical ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                            <span className={`text-xs ${isOverdue ? 'font-semibold text-rose-600 dark:text-rose-400' : isCritical ? 'font-semibold text-amber-600 dark:text-amber-400' : 'font-medium text-slate-600 dark:text-slate-300'}`}>
                              {dl < 0 ? `${Math.abs(dl)}d Overdue` : dl === 0 ? 'Due Today' : `${dl}d Left`}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <button 
                            type="button"
                            onClick={() => { setRecordToReply(rec); setIsReplyModalOpen(true); }}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium tracking-tight border transition-all cursor-pointer ${
                              isOverdue 
                                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/40' 
                                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                            }`}
                          >
                            {isOverdue ? 'Overdue' : 'Pending'}
                          </button>
                        </td>
                        <td className="px-3 py-2 truncate min-w-[150px]">
                          <EditableRemark 
                            value={rec.remarks || ''} 
                            onSave={async (val) => {
                              await api.saveLitigationRecord({ ...rec, remarks: val });
                              refreshData();
                            }} 
                          />
                        </td>

                        {/* Actions Column: View Icon, 3-dot Button */}
                        <td className="sticky right-0 z-20 bg-white/95 dark:bg-slate-900/95 group-hover:bg-indigo-50/20 dark:group-hover:bg-slate-800/40 backdrop-blur-md px-3 py-1.5 text-right w-[120px] min-w-[120px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* View Details Icon Button */}
                            <button 
                              type="button"
                              onClick={() => { setViewingRecord(rec); setIsViewModalOpen(true); }} 
                              className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-1 shadow-2xs cursor-pointer text-xs font-medium active:scale-95"
                              title="View Notice Details"
                            >
                              <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 12z" />
                              </svg>
                              <span>View</span>
                            </button>

                            {/* 3-Dot More Actions Button */}
                            <button 
                              type="button"
                              onClick={() => setActiveActionsId(rec.id)}
                              className={`h-7 w-7 rounded-lg border transition-all flex items-center justify-center shadow-2xs cursor-pointer active:scale-95 ${
                                activeActionsId === rec.id 
                                  ? 'bg-slate-900 text-white dark:bg-indigo-600 border-slate-900 dark:border-indigo-600' 
                                  : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                              }`}
                              title="More Actions & Modify Notice"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h.01M12 12h.01M19 12h.01" />
                              </svg>
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
      </div>
      
      {/* 3-Dot Actions Drawer - Portaled with short subtitle description under every option */}
      {activeActionsId && selectedActionRecord && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999998] flex items-center justify-end p-3 sm:p-6 pointer-events-none">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-950/25 backdrop-blur-[2px] pointer-events-auto animate-in fade-in duration-150"
            onClick={() => setActiveActionsId(null)}
          />

          {/* Action Options Panel in Right Side Center */}
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative pointer-events-auto w-84 max-w-[calc(100vw-24px)] max-h-[calc(100vh-32px)] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl z-10 text-left animate-in fade-in slide-in-from-right-4 duration-200 overflow-hidden ring-1 ring-black/5 dark:ring-white/10"
          >
            {/* Header */}
            <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Notice Actions</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 font-mono text-[9px] font-bold">
                    U/s {selectedActionRecord.section || '---'}
                  </span>
                </div>
                <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                  {clients.find(c => c.id === selectedActionRecord.clientId)?.tradeName || selectedActionRecord.clientName}
                </h4>
                <p className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 truncate">
                  {selectedActionRecord.referenceNo || '---'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveActionsId(null)}
                className="h-7 w-7 rounded-xl bg-slate-200/60 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer text-xs shrink-0"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Action Options with short subtitle underneath each option */}
            <div className="overflow-y-auto p-2 space-y-1 no-scrollbar flex-1">
              
              {/* 1. View Complete Notice Dossier */}
              <button 
                type="button"
                onClick={() => { 
                  setViewingRecord(selectedActionRecord); 
                  setIsViewModalOpen(true); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:bg-white dark:group-hover:bg-slate-800 shadow-xs text-base font-bold shrink-0">
                  👁️
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 block truncate">View Complete Notice</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Full dossier, timeline & documents</span>
                </div>
              </button>

              {/* 2. Modify Notice Record (User Request: "modify page of notice") */}
              <button 
                type="button"
                onClick={() => { 
                  setSelectedRecord(selectedActionRecord); 
                  setIsModalOpen(true); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-amber-50/70 dark:hover:bg-amber-950/30 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400 text-base shrink-0">
                  ✏️
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">Modify Notice Record</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Edit section, dates, ref no, or notes</span>
                </div>
              </button>

              {/* 3. Mark Reply Filed */}
              <button 
                type="button"
                onClick={() => { 
                  setRecordToReply(selectedActionRecord); 
                  setIsReplyModalOpen(true); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-base shrink-0">
                  📬
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 block truncate">Mark Reply Filed</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Log reply filing date & ARN reference</span>
                </div>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* 4. GST Portal Direct Login */}
              <button 
                type="button"
                onClick={() => { 
                  const client = clients.find(c => c.id === selectedActionRecord.clientId);
                  if (client) {
                    setSelectedClientForLogin(client);
                    setIsLoginBoxOpen(true);
                  } else {
                    window.open('https://services.gst.gov.in/services/login', '_blank');
                  }
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400 text-base shrink-0">
                  🔐
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">GST Portal Credentials</span>
                  <span className="text-[10px] text-slate-400 block truncate">Direct auto-login & password vault</span>
                </div>
              </button>

              {/* 5. Copy Notice Reference No */}
              <button 
                type="button"
                onClick={() => { 
                  navigator.clipboard.writeText(selectedActionRecord.referenceNo || '');
                  toast.success('Notice Reference Copied!');
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-base shrink-0">
                  📋
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">Copy Notice Reference</span>
                  <span className="text-[10px] text-slate-400 block truncate">{selectedActionRecord.referenceNo || 'Copy to clipboard'}</span>
                </div>
              </button>

              {/* 6. Copy GSTIN */}
              <button 
                type="button"
                onClick={() => { 
                  const client = clients.find(c => c.id === selectedActionRecord.clientId);
                  navigator.clipboard.writeText(client?.gstProfile?.gstin || '');
                  toast.success('GSTIN Copied!');
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-base shrink-0">
                  🔢
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">Copy GSTIN</span>
                  <span className="text-[10px] text-slate-400 block truncate">Copy 15-digit GST number</span>
                </div>
              </button>

              {/* 7. Share on WhatsApp */}
              <button 
                type="button"
                onClick={() => { 
                  handleShareWhatsApp(selectedActionRecord);
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-base shrink-0">
                  💬
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 block truncate">Share Notice on WhatsApp</span>
                  <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 block truncate">Send structured alert to taxpayer</span>
                </div>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* 8. Delete Notice Record */}
              <button 
                type="button"
                onClick={() => { 
                  handleDelete(selectedActionRecord.id);
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400 text-base shrink-0">
                  🗑️
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 block truncate">Delete Notice Record</span>
                  <span className="text-[10px] text-rose-500/80 dark:text-rose-400/70 block truncate">Permanently remove from vault</span>
                </div>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Detail Modal - Guaranteed never to hide */}
      <LitigationDetailModal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        record={viewingRecord}
        clients={clients}
        onEdit={(rec) => {
          setSelectedRecord(rec);
          setIsModalOpen(true);
        }}
        onDataChange={refreshData}
      />

      {/* Portal Login Modal */}
      <GSTPortalLoginModal
        isOpen={isLoginBoxOpen}
        onClose={() => setIsLoginBoxOpen(false)}
        client={selectedClientForLogin}
      />

      {/* Reply Modal - Portaled to document.body */}
      {isReplyModalOpen && recordToReply && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                 <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400 mb-1">Status Update</p>
                 <h3 className="text-lg font-black truncate">Mark Reply Filed</h3>
              </div>
              <button onClick={() => setIsReplyModalOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors text-slate-400 hover:text-white cursor-pointer"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6" /></svg></button>
            </div>
            <div className="p-5 sm:p-6 space-y-4">
               <div>
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1 mb-1.5 block">Reply Date</label>
                 <input type="date" value={replyDate} onChange={e => setReplyDate(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-indigo-600/20 text-slate-900 dark:text-white transition-all font-mono" />
               </div>
               <div>
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1 mb-1.5 block">Reply ARN / Reference No.</label>
                 <input type="text" value={replyRefNo} onChange={e => setReplyRefNo(e.target.value)} placeholder="ARN or Ref Code..." className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-indigo-600/20 text-slate-900 dark:text-white transition-all" />
               </div>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 flex gap-3">
              <button onClick={() => setIsReplyModalOpen(false)} className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-300 dark:hover:bg-slate-600 transition-all cursor-pointer">Cancel</button>
              <button onClick={submitReply} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-emerald-700 transition-all cursor-pointer shadow-md">Confirm Reply</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Record Notice / Modify Notice Form */}
      <NoticeForm 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setSelectedRecord(null); }} 
        onSave={handleSave} 
        onDelete={handleDelete} 
        clients={clients} 
        category="Notice" 
        initialData={selectedRecord} 
      />
    </div>
  );
};

export default NoticePending;
