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
import { ExportImportMenu } from '../../../components/ExportImportMenu';
import { exportToCSV, printList } from '../../../exportUtils';
import { EditableRemark } from '../../../components/EditableRemark';
import { formatDate } from '../../../dateUtils';
import ViewControl from '../../../components/ViewControl';
import { TableFilter } from '../../../components/TableFilter';

type DueDateFilter = 'All' | 'gt15' | 'gt5' | 'urgent';

const AppealPending: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: pageData, isLoading: isPageLoading } = useModuleData('gst_appeal_pending');

  const allRecords = useMemo(() => pageData?.litigation || [], [pageData]);
  const clients = useMemo(() => pageData?.clients || [], [pageData]);
  const records = useMemo(() => allRecords, [allRecords]);
  const isLoading = isPageLoading && !pageData;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'table');
  const [dueFilter, setDueFilter] = useState<DueDateFilter>('All');
  const [sectionFilter, setSectionFilter] = useState('All');
  const [selectedRecord, setSelectedRecord] = useState<Partial<LitigationRecord> | null>(null);

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingRecord, setViewingRecord] = useState<LitigationRecord | null>(null);
  const [activeActionsId, setActiveActionsId] = useState<string | null>(null);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  const [isLoginBoxOpen, setIsLoginBoxOpen] = useState(false);
  const [selectedClientForLogin, setSelectedClientForLogin] = useState<Client | null>(null);

  const [targetCategory, setTargetCategory] = useState<'Appeal' | 'Tribunal' | 'HighCourt'>('Appeal');
  const [isReissueMode, setIsReissueMode] = useState(false);

  const [isReplyModalOpen, setIsReplyModalOpen] = useState(false);
  const [recordToReply, setRecordToReply] = useState<LitigationRecord | null>(null);
  const [replyDate, setReplyDate] = useState(new Date().toISOString().split('T')[0]);
  const [replyRefNo, setReplyRefNo] = useState('');

  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['gst_appeal_pending'] });
    queryClient.invalidateQueries({ queryKey: ['gst_appeal_filed'] });
    queryClient.invalidateQueries({ queryKey: ['gst_appeal_demand'] });
    queryClient.invalidateQueries({ queryKey: ['tribunal_records'] });
    queryClient.invalidateQueries({ queryKey: ['highcourt_records'] });
    queryClient.invalidateQueries({ queryKey: ['litigation_filing_page_data'] });
    queryClient.invalidateQueries({ queryKey: ['litigationRecords'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard_data'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  }, [queryClient]);

  useEffect(() => {
    const syncHandler = () => { refreshData(); };
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, [refreshData]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = async (data: Partial<LitigationRecord>) => {
    try {
      const finalStatus: LitigationStatus = (data.status as string) === 'Dropped' ? 'Drop' : (data.status || 'Pending');
      const targetCat = data.category || targetCategory;
      const recordToSave = { ...data, status: finalStatus };
      if (isReissueMode || targetCat !== 'Appeal') {
        delete (recordToSave as any).id;
        delete (recordToSave as any)._id;
      }

      if (targetCat === 'Tribunal') {
        await api.saveTribunalRecord({ ...recordToSave, category: 'Tribunal' });
        toast.success('Matter successfully escalated to GSTAT Tribunal Pending!');
      } else if (targetCat === 'HighCourt' || (targetCat as string) === 'High Court') {
        await api.saveHighCourtRecord({ ...recordToSave, category: 'HighCourt' });
        toast.success('Matter successfully escalated to High Court Pending!');
      } else {
        await api.saveLitigationRecord({ ...recordToSave, category: 'Appeal' });
        toast.success('Appeal record saved successfully');
      }

      setIsModalOpen(false);
      setIsViewModalOpen(false);
      setIsReissueMode(false);
      refreshData();
    } catch (err) {
      console.error('Failed to save appeal record:', err);
      toast.error('Failed to save record');
    }
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
      toast.success("Appeal marked as filed");
    } catch (err) { toast.error("Status update failed"); }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteLitigationRecord(id);
      toast.success('Record deleted successfully');
      setIsModalOpen(false);
      setActiveActionsId(null);
      refreshData();
    } catch (error) {
      toast.error('Failed to delete record');
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

  const getAppealTiming = (dueDate?: string) => {
    if (!dueDate) return { label: 'No Due Date', color: 'text-slate-400', dot: 'bg-slate-300' };
    const diff = getDaysLeft(dueDate);

    if (diff < 0) return { label: `${Math.abs(diff)}d Overdue`, color: 'text-rose-600 font-bold', dot: 'bg-rose-500 animate-pulse' };
    if (diff === 0) return { label: 'Today', color: 'text-rose-600 font-bold', dot: 'bg-rose-500 animate-pulse' };
    if (diff <= 5) return { label: `${diff}d Left`, color: 'text-rose-600 font-bold', dot: 'bg-rose-500 animate-pulse' };
    if (diff <= 15) return { label: `${diff}d Left`, color: 'text-amber-600 font-semibold', dot: 'bg-amber-500' };
    return { label: `${diff}d Left`, color: 'text-emerald-600 font-semibold', dot: 'bg-emerald-500' };
  };

  const sections = useMemo(() => Array.from(new Set(records.map(r => r.section).filter(Boolean))).sort() as string[], [records]);

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

  const filterOptions = useMemo(() => [
    { value: 'All' as DueDateFilter, label: 'All Due Appeals', shortLabel: 'All Appeals', count: stats.total, dot: 'bg-indigo-500' },
    { value: 'gt15' as DueDateFilter, label: '> 15 Days Left', shortLabel: '> 15 Days', count: stats.gt15, dot: 'bg-emerald-500' },
    { value: 'gt5' as DueDateFilter, label: '6 - 15 Days Left', shortLabel: '6 - 15 Days', count: stats.gt5, dot: 'bg-amber-500' },
    { value: 'urgent' as DueDateFilter, label: 'Last 5 Days / Overdue', shortLabel: 'Urgent Due', count: stats.urgent, dot: 'bg-rose-500' },
  ], [stats]);

  const currentFilterOption = useMemo(() => {
    return filterOptions.find(o => o.value === dueFilter) || filterOptions[0];
  }, [filterOptions, dueFilter]);

  const filteredRecords = useMemo(() => {
    const s = search.toLowerCase();
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
    const headers = ['S.No.', 'Trade Name', 'GSTIN', 'Order U/s', 'Order Date', 'Due Date', 'Status', 'Remarks'];
    const rows = filteredRecords.map((r, idx) => {
      const c = clients.find(cl => cl.id === r.clientId);
      return [
        (idx + 1).toString().padStart(2, '0'),
        r.clientName,
        c?.gstProfile?.gstin || '---',
        'U/s ' + (r.section || '---'),
        r.orderDate || r.issuedDate || '---',
        r.dueDate || '---',
        r.status,
        r.remarks || ''
      ];
    });
    exportToCSV(headers, rows, 'Pending_Appeals.csv');
  };

  const handleExportPDF = () => {
    const headers = ['Trade Name', 'GSTIN', 'Order U/s', 'Order Date', 'Due Date', 'Status'];
    const rows = filteredRecords.map(r => {
      const c = clients.find(cl => cl.id === r.clientId);
      return [
        r.clientName,
        c?.gstProfile?.gstin || '---',
        'U/s ' + (r.section || '---'),
        r.orderDate || r.issuedDate || '---',
        r.dueDate || '---',
        r.status
      ];
    });
    printList('Pending Appeals', headers, rows);
  };

  const handleDownloadTemplate = () => {
    const headers = ['Trade Name', 'GSTIN', 'Section', 'Order Date (YYYY-MM-DD)', 'Due Date (YYYY-MM-DD)', 'Order Ref No', 'Remarks'];
    const sample = ['ABC Enterprises', '27AABCU9603R1ZM', '107', '2024-04-10', '2024-07-10', 'OIO-8976', 'First appeal pending against adjudication'];
    const csvContent = headers.join(',') + '\n' + sample.join(',');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'appeals_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const lines = text.split(/\r\n|\n/).filter(line => line.trim());
      if (lines.length < 2) return toast.error('CSV file has no data rows');
      const rows = lines.slice(1);
      let count = 0;
      for (const row of rows) {
        const cols = row.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (!cols[0]) continue;
        const tradeName = cols[0];
        const gstin = cols[1] || '';
        const section = cols[2]?.replace(/^U\/s\s*/i, '') || '107';
        const orderDate = cols[3] || new Date().toISOString().split('T')[0];
        const dueDate = cols[4] || '';
        const referenceNo = cols[5] || `APL-${Date.now().toString().slice(-6)}`;
        const remarks = cols[6] || '';
        let client = clients.find(c => 
          (c.gstProfile?.gstin && gstin && c.gstProfile.gstin.toLowerCase() === gstin.toLowerCase()) ||
          (c.tradeName && c.tradeName.toLowerCase() === tradeName.toLowerCase())
        );
        const newRecord: Partial<LitigationRecord> = {
          clientId: client?.id || 'CLIENT-' + Math.random().toString(36).substr(2, 9),
          clientName: tradeName,
          category: 'Appeal',
          status: 'Pending',
          section,
          orderDate,
          dueDate,
          referenceNo,
          remarks
        };
        try {
          await api.saveLitigationRecord(newRecord);
          count++;
        } catch (err) {}
      }
      refreshData();
      toast.success(`Successfully imported ${count} appeal records.`);
    };
    reader.readAsText(file);
  };

  const handleShareWhatsApp = (rec: LitigationRecord) => {
    const client = clients.find(c => c.id === rec.clientId);
    const dl = getDaysLeft(rec.dueDate);
    const msg = `*GST APPEAL ALERT*\n` +
      `Taxpayer: ${rec.clientName}\n` +
      `GSTIN: ${client?.gstProfile?.gstin || 'N/A'}\n` +
      `Order Ref: ${rec.referenceNo || 'N/A'}\n` +
      `Section: U/s ${rec.section || '107'}\n` +
      `Due Date: ${formatDate(rec.dueDate)} (${dl < 0 ? `${Math.abs(dl)}d overdue` : `${dl}d left`})\n` +
      `Status: Pending First Appeal\n\n` +
      `Please provide the required submissions at the earliest.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const selectedActionRecord = useMemo(() => records.find(r => r.id === activeActionsId), [records, activeActionsId]);

  if (isLoading) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* Modern Unified Responsive Toolbar - PC & Mobile Optimized */}
      <div className="relative z-50 flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 sm:gap-2 bg-white dark:bg-slate-900 p-2 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs shrink-0 w-full max-w-full min-w-0 overflow-visible transition-colors">
        
        {/* Left Section: Search First + Single Count Badge Dropdown Second */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-[200px] w-full sm:w-auto">
          <div className="relative group flex-1 min-w-[150px] sm:min-w-[240px]">
            <input 
              type="text" 
              placeholder="Search appeal queue by Trade Name, GSTIN or Order Ref..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-7 sm:pr-8 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none" 
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
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
              title="Click to view all appeal counts and due filters"
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

        {/* Right Section: View Control, Combined Export/Import, Record Appeal */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto flex-nowrap overflow-visible">
          <ViewControl 
            viewMode={viewMode} 
            onViewChange={setViewMode} 
            className="h-9 rounded-lg shrink-0"
          />

          <ExportImportMenu 
            onExportCSV={handleExportCSV}
            onExportPDF={handleExportPDF}
            onImportCSV={handleImportCSV}
            onDownloadTemplate={handleDownloadTemplate}
          />

          <button 
            type="button"
            onClick={() => { setSelectedRecord(null); setIsModalOpen(true); }}
            className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold tracking-wide px-3 sm:px-3.5 rounded-lg shadow-2xs transition-all text-xs flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="whitespace-nowrap">Record Appeal</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 min-h-0 w-full max-w-full min-w-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col transition-colors">
        {viewMode === 'grid' ? (
          <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecords.length === 0 ? (
              <div className="col-span-full py-24 text-center text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider text-xs">
                No pending appeals matching current filter
              </div>
            ) : (
              filteredRecords.map((rec, idx) => {
                const timing = getAppealTiming(rec.dueDate);
                const client = clients.find(c => c.id === rec.clientId);

                return (
                  <div key={rec.id} className="p-4 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                          #{((idx + 1).toString().padStart(2, '0'))}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <div className={`h-2 w-2 rounded-full ${timing.dot}`} />
                          <span className={`text-xs font-bold ${timing.color}`}>{timing.label}</span>
                        </div>
                      </div>

                      <h4 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate leading-snug" title={client?.tradeName || rec.clientName}>
                        {client?.tradeName || rec.clientName || '---'}
                      </h4>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5 tracking-wider">
                        {client?.gstProfile?.gstin || '---'}
                      </p>
                    </div>

                    <div className="bg-white dark:bg-slate-850 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-750 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Section:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{rec.section ? `U/s ${rec.section}` : '---'}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Order Date:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300 uppercase">{formatDate(rec.orderDate || rec.issuedDate)}</span>
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
                        type="button"
                        onClick={() => { setRecordToReply(rec); setIsReplyModalOpen(true); }}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white transition-all cursor-pointer"
                      >
                        Mark Filed
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
                    <TableFilter label="Order U/s" isActive={sectionFilter !== 'All'}>
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

                  <th className="px-3 py-2.5 min-w-[100px] whitespace-nowrap">Order Date</th>
                  <th className="px-3 py-2.5 min-w-[100px] whitespace-nowrap">Due Date</th>
                  <th className="px-3 py-2.5 min-w-[100px] whitespace-nowrap">Due Days</th>
                  <th className="px-3 py-2.5 min-w-[95px] text-center whitespace-nowrap">Status</th>
                  <th className="px-3 py-2.5 min-w-[150px]">Remark</th>
                  <th className="sticky top-0 right-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2.5 text-right w-[120px] min-w-[120px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] border-b border-slate-200/90 dark:border-slate-700/90">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-24 text-center text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">
                      No Pending Appeals Archived
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec, idx) => {
                    const timing = getAppealTiming(rec.dueDate);
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
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/50">
                            {rec.section ? `U/s ${rec.section}` : '---'}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-500 dark:text-slate-400 uppercase whitespace-nowrap text-xs">
                          {formatDate(rec.orderDate || rec.issuedDate)}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums font-medium text-rose-600 dark:text-rose-400 uppercase whitespace-nowrap text-xs">
                          {formatDate(rec.dueDate)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${timing.dot}`} />
                            <span className={`text-xs font-semibold ${timing.color}`}>{timing.label}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <button 
                            type="button"
                            onClick={() => { setRecordToReply(rec); setIsReplyModalOpen(true); }}
                            className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300 border border-slate-200/60 dark:border-slate-700/60 transition-all cursor-pointer"
                          >
                            <span>Pending</span>
                          </button>
                        </td>
                        <td className="px-3 py-2 truncate min-w-[150px] text-xs font-normal text-slate-600 dark:text-slate-300">
                          <EditableRemark 
                            value={rec.remarks || ''} 
                            onSave={async (val) => {
                              await api.saveLitigationRecord({ ...rec, remarks: val });
                              refreshData();
                            }} 
                          />
                        </td>
                        <td className="sticky right-0 z-20 bg-white/95 dark:bg-slate-900/95 group-hover:bg-indigo-50/20 dark:group-hover:bg-slate-800/40 backdrop-blur-md px-3 py-1.5 text-right w-[120px] min-w-[120px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                          <div className="flex items-center justify-end gap-1.5">
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
                              className={`h-7 w-7 rounded-lg border transition-all flex items-center justify-center shadow-2xs cursor-pointer active:scale-95 ${
                                activeActionsId === rec.id 
                                  ? 'bg-slate-900 text-white dark:bg-indigo-600 border-slate-900 dark:border-indigo-600' 
                                  : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                              }`}
                              title="More Actions"
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

      {/* 3-Dot Actions Drawer - Portaled */}
      {activeActionsId && selectedActionRecord && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999998] flex items-center justify-end p-3 sm:p-6 pointer-events-none">
          <div 
            className="fixed inset-0 bg-slate-950/25 backdrop-blur-[2px] pointer-events-auto animate-in fade-in duration-150"
            onClick={() => setActiveActionsId(null)}
          />

          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative pointer-events-auto w-84 max-w-[calc(100vw-24px)] max-h-[calc(100vh-32px)] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl z-10 text-left animate-in fade-in slide-in-from-right-4 duration-200 overflow-hidden ring-1 ring-black/5 dark:ring-white/10"
          >
            {/* Header */}
            <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block mb-0.5">
                  Appeal Actions
                </span>
                <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate" title={clients.find(c => c.id === selectedActionRecord.clientId)?.tradeName || selectedActionRecord.clientName}>
                  {clients.find(c => c.id === selectedActionRecord.clientId)?.tradeName || selectedActionRecord.clientName || 'Appeal Record'}
                </h4>
              </div>
              <button 
                type="button"
                onClick={() => setActiveActionsId(null)}
                className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center transition-all shrink-0 cursor-pointer active:scale-95 shadow-2xs"
                title="Close"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Options list */}
            <div className="p-2 space-y-1 overflow-y-auto no-scrollbar flex-1">
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
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold">GST Portal Login</div>
                  <div className="text-[10px] text-slate-400 font-normal">Open portal credentials session</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewingRecord(selectedActionRecord);
                  setIsViewModalOpen(true);
                  setActiveActionsId(null);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 10z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold">View Complete Record</div>
                  <div className="text-[10px] text-slate-400 font-normal">Case history & attached documents</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedRecord(selectedActionRecord);
                  setIsModalOpen(true);
                  setActiveActionsId(null);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold">Edit Appeal Record</div>
                  <div className="text-[10px] text-slate-400 font-normal">Modify section, dates or details</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setRecordToReply(selectedActionRecord);
                  setIsReplyModalOpen(true);
                  setActiveActionsId(null);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors text-left cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold">Mark As Appeal Filed</div>
                  <div className="text-[10px] text-emerald-600/70 font-normal">Archive filing date and ARN reference</div>
                </div>
              </button>

              {/* Escalate to GSTAT */}
              <button
                type="button"
                onClick={() => {
                  setTargetCategory('Tribunal');
                  setIsReissueMode(true);
                  setSelectedRecord(selectedActionRecord);
                  setIsModalOpen(true);
                  setActiveActionsId(null);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors text-left cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold">Escalate to GSTAT Tribunal</div>
                  <div className="text-[10px] text-indigo-600/70 font-normal">Initiate tribunal proceedings (Sec 112)</div>
                </div>
              </button>

              {/* Escalate to High Court */}
              <button
                type="button"
                onClick={() => {
                  setTargetCategory('HighCourt');
                  setIsReissueMode(true);
                  setSelectedRecord(selectedActionRecord);
                  setIsModalOpen(true);
                  setActiveActionsId(null);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors text-left cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold">Escalate to High Court (WP)</div>
                  <div className="text-[10px] text-purple-600/70 font-normal">File Writ Petition under Article 226</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleShareWhatsApp(selectedActionRecord);
                  setActiveActionsId(null);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors text-left cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold">WhatsApp Alert</div>
                  <div className="text-[10px] text-slate-400 font-normal">Send due date warning to taxpayer</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (confirm('Are you sure you want to delete this appeal record?')) {
                    handleDelete(selectedActionRecord.id);
                  }
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors text-left cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold">Delete Record</div>
                  <div className="text-[10px] text-rose-500/70 font-normal">Remove appeal entry permanently</div>
                </div>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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

      <GSTPortalLoginModal
        isOpen={isLoginBoxOpen}
        onClose={() => setIsLoginBoxOpen(false)}
        client={selectedClientForLogin}
      />

      {isReplyModalOpen && recordToReply && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400 mb-1">Status Update</p>
                <h3 className="text-lg font-bold truncate">Mark as Appeal Filed</h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsReplyModalOpen(false)} 
                className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-2xs"
                title="Close"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1 mb-1.5 block">Appeal Filing Date</label>
                <input type="date" value={replyDate} onChange={e => setReplyDate(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-indigo-600/10 transition-all font-mono text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1 mb-1.5 block">ARN / Appeal Ref No.</label>
                <input type="text" value={replyRefNo} onChange={e => setReplyRefNo(e.target.value)} placeholder="ARN or Appeal Ref..." className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-indigo-600/10 transition-all font-mono text-slate-900 dark:text-slate-100" />
              </div>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 flex gap-3">
              <button type="button" onClick={() => setIsReplyModalOpen(false)} className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-300 dark:hover:bg-slate-600 transition-all cursor-pointer">Cancel</button>
              <button type="button" onClick={submitReply} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-emerald-700 transition-all cursor-pointer">Confirm Filing</button>
            </div>
          </div>
        </div>
      )}

      <NoticeForm 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setIsReissueMode(false); }} 
        onSave={handleSave} 
        onDelete={handleDelete} 
        clients={clients} 
        category={targetCategory} 
        initialData={selectedRecord} 
        isReissue={isReissueMode}
      />
    </div>
  );
};

export default AppealPending;