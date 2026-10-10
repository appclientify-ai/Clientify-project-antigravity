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
import { EditableRemark } from '../../../components/EditableRemark';
import { formatDate } from '../../../dateUtils';
import ViewControl from '../../../components/ViewControl';
import { ExportImportMenu } from '../../../components/ExportImportMenu';
import { exportToCSV, printList } from '../../../exportUtils';
import { TableFilter } from '../../../components/TableFilter';

export const NoticeDrop: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: pageData, isLoading: isPageLoading } = useModuleData('gst_notice_drop');

  const allRecords = useMemo(() => pageData?.litigation || [], [pageData]);
  const clients = useMemo(() => pageData?.clients || [], [pageData]);
  const records = useMemo(() => allRecords, [allRecords]);
  const isLoading = isPageLoading && !pageData;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() => 
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'table'
  );
  const [selectedRecord, setSelectedRecord] = useState<Partial<LitigationRecord> | null>(null);

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingRecord, setViewingRecord] = useState<LitigationRecord | null>(null);

  const [sectionFilter, setSectionFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Dropped' | 'Paid'>('All');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  const [isLoginBoxOpen, setIsLoginBoxOpen] = useState(false);
  const [selectedClientForLogin, setSelectedClientForLogin] = useState<Client | null>(null);

  // 3-dot Action drawer state
  const [activeActionsId, setActiveActionsId] = useState<string | null>(null);
  const selectedActionRecord = useMemo(() => {
    if (!activeActionsId) return null;
    return records.find(r => r.id === activeActionsId) || null;
  }, [records, activeActionsId]);

  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['gst_notice_drop'] });
    queryClient.invalidateQueries({ queryKey: ['litigation_filing_page_data'] });
    queryClient.invalidateQueries({ queryKey: ['litigationRecords'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  }, [queryClient]);

  useEffect(() => {
    const syncHandler = () => { refreshData(); };
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, [refreshData]);

  // Click outside filter dropdown
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

  const handleDelete = async (id: string) => {
    if (confirm('Permanently remove this dropped notice record?')) {
      try {
        await api.deleteLitigationRecord(id);
        toast.success('Record deleted successfully');
        setIsModalOpen(false);
        refreshData();
      } catch (error) {
        toast.error('Failed to delete record');
      }
    }
  };

  const handleSave = async (data: Partial<LitigationRecord>) => {
    await api.saveLitigationRecord({ ...data, category: 'Notice' });
    setIsModalOpen(false);
    setIsViewModalOpen(false);
    refreshData();
    toast.success(selectedRecord?.id ? 'Notice record updated' : 'Notice recorded successfully');
  };

  const updateRecordStatus = async (record: LitigationRecord, newStatus: LitigationStatus) => {
    try {
      const updated = { ...record, status: newStatus };
      await api.saveLitigationRecord(updated);
      refreshData();
      toast.success('Status updated');
    } catch (err) {
      toast.error("Revert failed.");
    }
    setActiveActionsId(null);
  };

  const sections = useMemo<string[]>(() => (Array.from(new Set(records.map(r => r.section).filter((s): s is string => Boolean(s)))) as string[]).sort(), [records]);

  // Count stats
  const stats = useMemo(() => {
    const total = records.length;
    let dropped = 0;
    let paid = 0;
    records.forEach(r => {
      if (r.isDemandPaid) paid++;
      else dropped++;
    });
    return { total, dropped, paid };
  }, [records]);

  const filterOptions = [
    { value: 'All' as const, label: 'All Closed Notices', shortLabel: 'Total', count: stats.total, dot: 'bg-emerald-500' },
    { value: 'Dropped' as const, label: 'Dropped / Relief Orders', shortLabel: 'Dropped', count: stats.dropped, dot: 'bg-teal-500' },
    { value: 'Paid' as const, label: 'Demand Paid & Closed', shortLabel: 'Paid', count: stats.paid, dot: 'bg-amber-500' }
  ];

  const currentFilterOption = filterOptions.find(o => o.value === statusFilter) || filterOptions[0];

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

    if (statusFilter === 'Dropped') {
      list = list.filter(r => !r.isDemandPaid);
    } else if (statusFilter === 'Paid') {
      list = list.filter(r => !!r.isDemandPaid);
    }

    return list;
  }, [records, clients, search, sectionFilter, statusFilter]);

  const handleExportCSV = () => {
    const headers = ['S.No.', 'Trade Name', 'GSTIN', 'Notice Ref', 'Section', 'Order Date', 'Outcome', 'Remark'];
    const rows = filteredRecords.map((r, idx) => {
      const c = clients.find(cl => cl.id === r.clientId);
      return [
        (idx + 1).toString().padStart(2, '0'),
        r.clientName || '---',
        c?.gstProfile?.gstin || '---',
        r.referenceNo || '---',
        r.section ? 'U/s ' + r.section : '---',
        r.orderDate || r.issuedDate || '---',
        r.isDemandPaid ? 'Paid & Closed' : 'Dropped / Relief',
        r.remarks || ''
      ];
    });
    exportToCSV(headers, rows, 'GST_Notice_Dropped.csv');
  };

  const handleExportPDF = () => {
    const headers = ['Trade Name', 'GSTIN', 'Notice Ref', 'Section', 'Order Date', 'Outcome'];
    const rows = filteredRecords.map(r => {
      const c = clients.find(cl => cl.id === r.clientId);
      return [
        r.clientName || '---',
        c?.gstProfile?.gstin || '---',
        r.referenceNo || '---',
        r.section ? 'U/s ' + r.section : '---',
        r.orderDate || r.issuedDate || '---',
        r.isDemandPaid ? 'Paid & Closed' : 'Dropped / Relief'
      ];
    });
    printList('GST Dropped Notices', headers, rows);
  };

  const handleDownloadTemplate = () => {
    const headers = ['Trade Name', 'GSTIN', 'Section', 'Tax Period', 'Order Date (YYYY-MM-DD)', 'Notice Ref', 'Outcome (Dropped / Paid)', 'Remarks'];
    const sampleRows = [
      ['Apex Enterprises', '27ABCDE1234F1Z5', '73', '2024-25', new Date().toISOString().split('T')[0], 'DRP-998822', 'Dropped', 'Dropped in ASMT-12 proceeding'],
      ['Bright Future Traders', '24XYZAB5678C1Z2', '61', '2023-24', new Date().toISOString().split('T')[0], 'DRP-554411', 'Paid', 'Paid u/s 73(5) & closed']
    ];
    exportToCSV(headers, sampleRows, 'Sample_GST_Dropped_Notices_Template.csv');
    toast.success('Sample dropped notices template downloaded.');
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
        toast.error('The selected CSV file has no data rows.');
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
        const orderDate = cols[4] || new Date().toISOString().split('T')[0];
        const referenceNo = cols[5] || `DROP-${Date.now().toString().slice(-6)}`;
        const outcome = cols[6]?.toLowerCase() || 'dropped';
        const remarks = cols[7] || '';

        let client = clients.find(c => 
          (c.gstProfile?.gstin && gstin && c.gstProfile.gstin.toLowerCase() === gstin.toLowerCase()) ||
          (c.tradeName && c.tradeName.toLowerCase() === tradeName.toLowerCase())
        );

        const newRecord: Partial<LitigationRecord> = {
          clientId: client?.id || 'CLIENT-' + Math.random().toString(36).substr(2, 9),
          clientName: tradeName,
          category: 'Notice',
          status: 'Drop',
          section,
          taxPeriod,
          orderDate,
          referenceNo,
          isDemandPaid: outcome.includes('paid'),
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
      toast.success(`Successfully imported ${successCount} dropped notice records.`);
    };
    reader.readAsText(file);
  };

  const handleShareWhatsApp = (rec: LitigationRecord) => {
    const client = clients.find(c => c.id === rec.clientId);
    const message = `*GST NOTICE DROP / RELIEF NOTIFICATION*\n` +
      `Taxpayer: ${rec.clientName}\n` +
      `GSTIN: ${client?.gstProfile?.gstin || 'N/A'}\n` +
      `Notice Ref: ${rec.referenceNo}\n` +
      `Section: U/s ${rec.section || 'N/A'}\n` +
      `Order Date: ${formatDate(rec.orderDate || rec.issuedDate)}\n` +
      `Status: ${rec.isDemandPaid ? 'Demand Paid & Closed' : 'Dropped / Complete Relief Granted'}\n\n` +
      `The proceedings under this notice have concluded successfully.`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  if (isLoading) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* Modern Unified Responsive Toolbar - PC & Mobile Optimized */}
      <div className="relative z-50 flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 sm:gap-2 bg-white dark:bg-slate-900 p-2 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs shrink-0 w-full max-w-full min-w-0 overflow-visible transition-colors">
        
        {/* Left Section: Search Input + Count Dropdown Badge */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-[200px] w-full sm:w-auto">
          
          {/* Search Bar - First with maximum available space */}
          <div className="relative group flex-1 min-w-[150px] sm:min-w-[240px]">
            <input 
              type="text" 
              placeholder="Search dropped notices..." 
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
              className={`h-9 px-2 sm:px-2.5 rounded-lg border text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap ${
                isFilterDropdownOpen
                  ? 'bg-slate-900 text-white dark:bg-emerald-600 border-slate-900 dark:border-emerald-600'
                  : statusFilter !== 'All'
                    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
              title="Click to view outcome filter counts"
            >
              <span className={`h-2 w-2 rounded-full ${currentFilterOption.dot} shrink-0`} />
              <span className="hidden xs:inline">{currentFilterOption.shortLabel}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${
                isFilterDropdownOpen
                  ? 'bg-slate-800 dark:bg-emerald-700 text-white'
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
                  <span>Filter Outcome</span>
                  <span>Count</span>
                </div>
                <div className="space-y-0.5">
                  {filterOptions.map((option) => {
                    const isSelected = statusFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setStatusFilter(option.value);
                          setIsFilterDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${option.dot} shrink-0`} />
                          <span>{option.label}</span>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          isSelected
                            ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100'
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

        {/* Right Section: View Control, Export, Import, Record Notice */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto w-full sm:w-auto justify-end flex-wrap sm:flex-nowrap overflow-visible">
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
                No dropped notices found
              </div>
            ) : (
              filteredRecords.map((rec, idx) => {
                const client = clients.find(c => c.id === rec.clientId);

                return (
                  <div key={rec.id} className="p-4 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                          #{((idx + 1).toString().padStart(2, '0'))}
                        </span>
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          Order: {formatDate(rec.orderDate || rec.issuedDate)}
                        </span>
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
                        <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Tax Period:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{rec.taxPeriod || '---'}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Notice Date:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{formatDate(rec.issuedDate)}</span>
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
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border ${
                        rec.isDemandPaid 
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' 
                          : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      }`}>
                        {rec.isDemandPaid ? 'Paid' : 'Dropped'}
                      </span>

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
                          className={`h-7 w-7 rounded-lg border transition-all flex items-center justify-center shadow-2xs cursor-pointer active:scale-95 ${
                            activeActionsId === rec.id
                              ? 'bg-slate-900 text-white dark:bg-emerald-600 border-slate-900 dark:border-emerald-600'
                              : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                          }`}
                          title="More Actions"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h.01M12 12h.01M19 12h.01" />
                          </svg>
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
            <table className="w-full text-left border-collapse table-auto min-w-[1100px]">
              <thead className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 shadow-2xs">
                <tr className="text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px] select-none">
                  <th className="px-3 py-2.5 w-[55px] text-center whitespace-nowrap">S.No.</th>
                  <th className="px-3 py-2.5 min-w-[180px]">Trade Name</th>
                  
                  {/* Clean Section Header with TableFilter */}
                  <th className="px-3 py-2.5 min-w-[110px] whitespace-nowrap">
                    <TableFilter label="Section" isActive={sectionFilter !== 'All'}>
                      <div className="p-1 space-y-0.5">
                        <button
                          onClick={() => setSectionFilter('All')}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-between ${
                            sectionFilter === 'All'
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 font-bold'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span>All Sections</span>
                          {sectionFilter === 'All' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>}
                        </button>
                        {sections.map(sec => (
                          <button
                            key={sec}
                            onClick={() => setSectionFilter(sec)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-between ${
                              sectionFilter === sec
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 font-bold'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span>U/s {sec}</span>
                            {sectionFilter === sec && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>}
                          </button>
                        ))}
                      </div>
                    </TableFilter>
                  </th>

                  <th className="px-3 py-2.5 min-w-[100px] whitespace-nowrap">Tax Period</th>
                  <th className="px-3 py-2.5 min-w-[110px] whitespace-nowrap">Notice Date</th>
                  <th className="px-3 py-2.5 min-w-[110px] whitespace-nowrap">Order Date</th>
                  <th className="px-3 py-2.5 min-w-[110px] text-center whitespace-nowrap">Outcome</th>
                  <th className="px-3 py-2.5 min-w-[150px]">Remark</th>
                  <th className="sticky top-0 right-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2.5 text-right w-[120px] min-w-[120px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] border-b border-slate-200/90 dark:border-slate-700/90">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-24 text-center text-slate-400 dark:text-slate-500 font-medium">
                      No dropped notices in vault
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec, idx) => {
                    const client = clients.find(c => c.id === rec.clientId);

                    return (
                      <tr key={rec.id} className="group hover:bg-emerald-50/20 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                        <td className="px-3 py-2 font-mono text-center whitespace-nowrap text-xs font-medium text-slate-400 dark:text-slate-500">
                          {(idx + 1).toString().padStart(2, '0')}
                        </td>
                        <td className="px-3 py-2 truncate min-w-[180px]">
                          <div className="font-bold text-slate-900 dark:text-slate-100 text-base sm:text-lg tracking-tight truncate leading-snug" title={client?.tradeName || rec.clientName}>
                            {client?.tradeName || rec.clientName || '---'}
                          </div>
                          <div className="flex items-center gap-1 text-xs font-mono text-slate-500 dark:text-slate-400 tracking-wider">
                            <span>{client?.gstProfile?.gstin || '---'}</span>
                            {client?.gstProfile?.gstin && (
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(client.gstProfile?.gstin || '');
                                  toast.success('GSTIN Copied!');
                                }}
                                className="p-0.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
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
                        <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap text-xs">
                          {rec.taxPeriod || '---'}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-500 dark:text-slate-400 uppercase whitespace-nowrap text-xs">
                          {formatDate(rec.issuedDate)}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums font-medium text-emerald-600 dark:text-emerald-400 uppercase whitespace-nowrap text-xs">
                          {formatDate(rec.orderDate || rec.issuedDate)}
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                              rec.isDemandPaid 
                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/60' 
                                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/60'
                            }`}
                          >
                            {rec.isDemandPaid ? 'Paid' : 'Dropped'}
                          </span>
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

                        {/* Actions Column: View Button, 3-dot Button */}
                        <td className="sticky right-0 z-20 bg-white/95 dark:bg-slate-900/95 group-hover:bg-emerald-50/20 dark:group-hover:bg-slate-800/40 backdrop-blur-md px-3 py-1.5 text-right w-[120px] min-w-[120px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* View Button */}
                            <button 
                              type="button"
                              onClick={() => { setViewingRecord(rec); setIsViewModalOpen(true); }} 
                              className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-1 shadow-2xs cursor-pointer text-xs font-medium active:scale-95"
                              title="View Complete Notice Record"
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
                                  ? 'bg-slate-900 text-white dark:bg-emerald-600 border-slate-900 dark:border-emerald-600' 
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

      {/* 3-Dot Actions Drawer - Portaled to document.body */}
      {activeActionsId && selectedActionRecord && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999998] flex items-center justify-end p-3 sm:p-6 pointer-events-none">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-950/20 backdrop-blur-[2px] pointer-events-auto animate-in fade-in duration-150"
            onClick={() => setActiveActionsId(null)}
          />

          {/* Action Options Panel */}
          <div className="relative pointer-events-auto w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col animate-in slide-in-from-right-4 zoom-in-95 duration-200 text-left">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100 block truncate">
                  {selectedActionRecord.clientName}
                </span>
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 truncate block">
                  Closed Notice U/s {selectedActionRecord.section || '---'} {selectedActionRecord.referenceNo ? `• ${selectedActionRecord.referenceNo}` : ''}
                </span>
              </div>
              <button 
                type="button"
                onClick={() => setActiveActionsId(null)} 
                className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center cursor-pointer transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-2 space-y-1">
              {/* 1. View Complete Details */}
              <button 
                type="button"
                onClick={() => {
                  setViewingRecord(selectedActionRecord);
                  setIsViewModalOpen(true);
                  setActiveActionsId(null);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-base shrink-0">
                  👁️
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">View Complete Details</span>
                  <span className="text-[10px] text-slate-400 block truncate">Full dossier, timeline & drop order</span>
                </div>
              </button>

              {/* 2. Modify Notice Record */}
              <button 
                type="button"
                onClick={() => {
                  setSelectedRecord(selectedActionRecord);
                  setIsModalOpen(true);
                  setActiveActionsId(null);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-amber-50/60 dark:hover:bg-amber-950/30 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400 text-base shrink-0">
                  ✏️
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 block truncate">Modify Notice Record</span>
                  <span className="text-[10px] text-slate-400 block truncate">Edit section, dates, order ref, or notes</span>
                </div>
              </button>

              {/* 3. Revert Status to Filed */}
              <button 
                type="button"
                onClick={() => updateRecordStatus(selectedActionRecord, 'Filed')}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400 text-base shrink-0">
                  ↩️
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">Revert to Reply Filed</span>
                  <span className="text-[10px] text-slate-400 block truncate">Move back to filed status for further hearing</span>
                </div>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* 4. GST Portal Credentials */}
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

              {/* 5. Copy Reference No */}
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
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">Copy Notice Ref No.</span>
                  <span className="text-[10px] text-slate-400 block truncate">{selectedActionRecord.referenceNo || 'Copy reference number'}</span>
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
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 block truncate">Share Order on WhatsApp</span>
                  <span className="text-[10px] text-slate-400 block truncate">Send drop / relief confirmation to client</span>
                </div>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* 8. Delete Record */}
              <button 
                type="button"
                onClick={() => {
                  handleDelete(selectedActionRecord.id);
                  setActiveActionsId(null);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400 text-base shrink-0">
                  🗑️
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 block truncate">Delete Record</span>
                  <span className="text-[10px] text-rose-400/80 block truncate">Permanently remove dropped record from vault</span>
                </div>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Detail Modal */}
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

export default NoticeDrop;