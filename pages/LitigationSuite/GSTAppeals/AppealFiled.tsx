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
import { TableFilter } from '../../../components/TableFilter';
import { exportToCSV, printList } from '../../../exportUtils';

type HearingFilter = 'All' | 'gt15' | 'gt5' | 'urgent';

const AppealFiled: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: pageData, isLoading: isPageLoading } = useModuleData('gst_appeal_filed');

  const allRecords = useMemo(() => pageData?.litigation || [], [pageData]);
  const clients = useMemo(() => pageData?.clients || [], [pageData]);
  const records = useMemo(() => allRecords, [allRecords]);
  const isLoading = isPageLoading && !pageData;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() => 
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'table'
  );
  const [hearingFilter, setHearingFilter] = useState<HearingFilter>('All');
  const [sectionFilter, setSectionFilter] = useState('All');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  const [selectedRecord, setSelectedRecord] = useState<Partial<LitigationRecord> | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingRecord, setViewingRecord] = useState<LitigationRecord | null>(null);

  // 3-dot drawer
  const [activeActionsId, setActiveActionsId] = useState<string | null>(null);
  const selectedActionRecord = useMemo(() => {
    if (!activeActionsId) return null;
    return records.find(r => r.id === activeActionsId) || null;
  }, [records, activeActionsId]);

  // Outcome Modal
  const [isOutcomeModalOpen, setIsOutcomeModalOpen] = useState(false);
  const [recordToUpdate, setRecordToUpdate] = useState<LitigationRecord | null>(null);
  const [outcomeStatus, setOutcomeStatus] = useState<LitigationStatus>('Drop');
  const [outcomeDate, setOutcomeDate] = useState(new Date().toISOString().split('T')[0]);
  const [outcomeRefNo, setOutcomeRefNo] = useState('');

  const [targetCategory, setTargetCategory] = useState<'Appeal' | 'Tribunal' | 'HighCourt'>('Appeal');
  const [isReissueMode, setIsReissueMode] = useState(false);

  // Portal Login Modal
  const [isLoginBoxOpen, setIsLoginBoxOpen] = useState(false);
  const [selectedClientForLogin, setSelectedClientForLogin] = useState<Client | null>(null);

  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['gst_appeal_filed'] });
    queryClient.invalidateQueries({ queryKey: ['gst_appeal_demand'] });
    queryClient.invalidateQueries({ queryKey: ['gst_appeal_pending'] });
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

  // Close filter dropdown on outside click
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
    if (confirm('Permanently delete this filed appeal record?')) {
      try {
        await api.deleteLitigationRecord(id);
        toast.success('Record deleted successfully');
        setIsModalOpen(false);
        setActiveActionsId(null);
        refreshData();
      } catch {
        toast.error('Failed to delete record');
      }
    }
  };

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

  const updateHearingDate = async (record: LitigationRecord, date: string) => {
    try {
      await api.saveLitigationRecord({ ...record, hearingDate: date });
      refreshData();
      toast.success("Hearing date updated");
    } catch {
      toast.error("Hearing date update failed.");
    }
  };

  const openOutcomeModal = (record: LitigationRecord, newStatus: LitigationStatus) => {
    setRecordToUpdate(record);
    setOutcomeStatus(newStatus);
    setOutcomeDate(new Date().toISOString().split('T')[0]);
    setOutcomeRefNo('');
    setIsOutcomeModalOpen(true);
    setActiveActionsId(null);
  };

  const submitOutcome = async () => {
    if (!recordToUpdate) return;
    try {
      const updated = { 
        ...recordToUpdate, 
        status: outcomeStatus,
        orderDate: outcomeDate,
        referenceNo: outcomeRefNo || recordToUpdate.referenceNo
      };
      await api.saveLitigationRecord(updated);
      setIsOutcomeModalOpen(false);
      setRecordToUpdate(null);
      refreshData();
      toast.success("Outcome updated successfully");
    } catch {
      toast.error("Outcome update failed.");
    }
  };

  const getHearingDaysLeft = (hearingDate?: string) => {
    if (!hearingDate) return null;
    const due = new Date(hearingDate);
    due.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = due.getTime() - now.getTime();
    return Math.round(diff / (1000 * 60 * 60 * 24));
  };

  const sections = useMemo(() => Array.from(new Set(records.map(r => r.section).filter((s): s is string => Boolean(s)))).sort(), [records]);

  // Stats calculation for hearing badges
  const stats = useMemo(() => {
    const total = records.length;
    let gt15 = 0;
    let gt5 = 0;
    let urgent = 0;

    records.forEach(r => {
      const hd = getHearingDaysLeft(r.hearingDate);
      if (hd === null) return;
      if (hd > 15) gt15++;
      else if (hd > 5 && hd <= 15) gt5++;
      else urgent++;
    });

    return { total, gt15, gt5, urgent };
  }, [records]);

  const filterOptions = [
    { value: 'All' as const, label: 'All Scheduled Hearings', shortLabel: 'Total Filed', count: stats.total, dot: 'bg-emerald-500' },
    { value: 'gt15' as const, label: '> 15 Days to Hearing', shortLabel: '> 15 Days', count: stats.gt15, dot: 'bg-teal-500' },
    { value: 'gt5' as const, label: '6 - 15 Days to Hearing', shortLabel: '6 - 15 Days', count: stats.gt5, dot: 'bg-amber-500' },
    { value: 'urgent' as const, label: 'Last 5 Days / Urgent', shortLabel: 'Urgent', count: stats.urgent, dot: 'bg-rose-500' }
  ];

  const currentFilterOption = filterOptions.find(o => o.value === hearingFilter) || filterOptions[0];

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

    if (hearingFilter === 'gt15') {
      list = list.filter(r => {
        const hd = getHearingDaysLeft(r.hearingDate);
        return hd !== null && hd > 15;
      });
    } else if (hearingFilter === 'gt5') {
      list = list.filter(r => {
        const hd = getHearingDaysLeft(r.hearingDate);
        return hd !== null && hd > 5 && hd <= 15;
      });
    } else if (hearingFilter === 'urgent') {
      list = list.filter(r => {
        const hd = getHearingDaysLeft(r.hearingDate);
        return hd !== null && hd <= 5;
      });
    }

    return list;
  }, [records, clients, search, sectionFilter, hearingFilter]);

  const handleExportCSV = () => {
    const headers = ['S.No.', 'Trade Name', 'GSTIN', 'Appeal U/s', 'Filing Date', 'Next Hearing', 'Status Ref'];
    const rows = filteredRecords.map((r, idx) => {
      const c = clients.find(cl => cl.id === r.clientId);
      return [
        (idx + 1).toString().padStart(2, '0'),
        r.clientName,
        c?.gstProfile?.gstin || '---',
        'U/s ' + (r.section || '---'),
        r.filedDate || '---',
        r.hearingDate || '---',
        r.referenceNo || '---'
      ];
    });
    exportToCSV(headers, rows, 'Filed_Appeals.csv');
  };

  const handleExportPDF = () => {
    const headers = ['Trade Name', 'GSTIN', 'Appeal U/s', 'Filing Date', 'Next Hearing', 'Status Ref'];
    const rows = filteredRecords.map(r => {
      const c = clients.find(cl => cl.id === r.clientId);
      return [
        r.clientName,
        c?.gstProfile?.gstin || '---',
        'U/s ' + (r.section || '---'),
        r.filedDate || '---',
        r.hearingDate || '---',
        r.referenceNo || '---'
      ];
    });
    printList('Filed Appeals', headers, rows);
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
      let count = 0;

      for (const row of rows) {
        if (!row.trim()) continue;
        const cols = row.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (!cols[0]) continue;

        const tradeName = cols[0];
        const clientId = cols[1] || '';
        const section = cols[2]?.replace(/^U\/s\s*/i, '') || '107';
        const filedDate = cols[3] || new Date().toISOString().split('T')[0];
        const hearingDate = cols[4] || '';
        const referenceNo = cols[5] || `APL-${Date.now().toString().slice(-6)}`;
        const remarks = cols[6] || '';

        const client = clients.find(c => 
          (clientId && c.id === clientId) ||
          (c.tradeName && c.tradeName.toLowerCase() === tradeName.toLowerCase()) ||
          (c.gstProfile?.gstin && c.gstProfile.gstin.toLowerCase() === tradeName.toLowerCase())
        );

        try {
          await api.saveLitigationRecord({
            clientId: client?.id || clientId || 'CLIENT-' + Math.random().toString(36).substr(2, 9),
            clientName: client?.tradeName || tradeName,
            category: 'Appeal',
            status: 'Filed',
            section,
            filedDate,
            hearingDate,
            referenceNo,
            remarks
          });
          count++;
        } catch (err) {
          console.error(err);
        }
      }

      refreshData();
      toast.success(`Successfully imported ${count} filed appeals`);
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const headers = ['clientName', 'clientId', 'section', 'filedDate', 'hearingDate', 'referenceNo', 'remarks'];
    const sample = [['Sample Trade Name', 'optional_client_id', '107', '2026-03-15', '2026-04-10', 'APL/2026/001', 'Hearing scheduled']];
    exportToCSV(headers, sample, 'filed_appeals_template.csv');
  };

  if (isLoading) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* Modern Unified Responsive Toolbar - PC & Mobile Optimized */}
      <div className="relative z-50 flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 sm:gap-2 bg-white dark:bg-slate-900 p-2 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs shrink-0 w-full max-w-full min-w-0 overflow-visible transition-colors">
        
        {/* Left Section: Search Input (First) + Count Dropdown Badge (Second) */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-[200px] w-full sm:w-auto">
          {/* Search Bar - First with maximum available width */}
          <div className="relative group flex-1 min-w-[150px] sm:min-w-[240px]">
            <input 
              type="text" 
              placeholder="Search filed appeals by trade name, GSTIN or ref..." 
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

          {/* Combined Single Count Badge with Dropdown - Second */}
          <div className="relative shrink-0" ref={filterDropdownRef}>
            <button
              type="button"
              onClick={() => setIsFilterDropdownOpen(prev => !prev)}
              className={`h-9 px-2.5 rounded-lg border text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap ${
                isFilterDropdownOpen
                  ? 'bg-slate-900 text-white dark:bg-indigo-600 border-slate-900 dark:border-indigo-600'
                  : hearingFilter !== 'All'
                    ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
              title="Click to view hearing filter counts"
            >
              <span className={`h-2 w-2 rounded-full ${currentFilterOption.dot} ring-2 ring-emerald-500/20`} />
              <span>{currentFilterOption.shortLabel}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${
                isFilterDropdownOpen
                  ? 'bg-slate-800 dark:bg-indigo-700 text-white'
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

            {isFilterDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-[100] p-1.5 animate-in zoom-in-95 origin-top-left">
                <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-1 flex items-center justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <span>Hearing Status</span>
                  <span>Count</span>
                </div>
                <div className="space-y-0.5">
                  {filterOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setHearingFilter(opt.value);
                        setIsFilterDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        hearingFilter === opt.value
                          ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${opt.dot} shrink-0`} />
                        <span>{opt.label}</span>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        hearingFilter === opt.value
                          ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}>
                        {opt.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Section: View Control, Export, Import */}
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
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 min-h-0 w-full max-w-full min-w-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden flex flex-col transition-colors">
        {viewMode === 'grid' ? (
          <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecords.length === 0 ? (
              <div className="col-span-full py-24 text-center text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-xs">
                No filed appeals found
              </div>
            ) : (
              filteredRecords.map((rec, idx) => {
                const client = clients.find(c => c.id === rec.clientId);
                const hDays = getHearingDaysLeft(rec.hearingDate);

                return (
                  <div key={rec.id} className="p-4 bg-slate-50/70 hover:bg-white dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400">
                          #{((idx + 1).toString().padStart(2, '0'))}
                        </span>
                        {hDays !== null ? (
                          <span className={`text-xs font-bold ${hDays < 0 ? 'text-rose-600' : hDays <= 5 ? 'text-rose-600' : hDays <= 15 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {hDays < 0 ? `${Math.abs(hDays)}d Overdue` : `${hDays}d Left`}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Unscheduled</span>
                        )}
                      </div>

                      <h4 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate leading-snug" title={client?.tradeName || rec.clientName}>
                        {client?.tradeName || rec.clientName || '---'}
                      </h4>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5 tracking-wider">
                        {client?.gstProfile?.gstin || '---'}
                      </p>
                    </div>

                    <div className="bg-white dark:bg-slate-850 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-750 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Appeal U/s:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{rec.section ? `U/s ${rec.section}` : '---'}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Filing Date:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{formatDate(rec.filedDate)}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 gap-2">
                        <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Next Hearing:</span>
                        <input 
                          type="date" 
                          value={rec.hearingDate || ''} 
                          onChange={(e) => updateHearingDate(rec, e.target.value)}
                          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 outline-none focus:ring-1 focus:ring-indigo-500" 
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60 relative z-20">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openOutcomeModal(rec, 'Drop')}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-all cursor-pointer"
                        >
                          Relief
                        </button>
                        <button
                          type="button"
                          onClick={() => openOutcomeModal(rec, 'Demand')}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 transition-all cursor-pointer"
                        >
                          Sustained
                        </button>
                      </div>

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
                              ? 'bg-slate-900 text-white dark:bg-indigo-600 border-slate-900 dark:border-indigo-600' 
                              : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                          }`}
                          title="More Actions"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h.01M12 12h.01M19 12h.01" /></svg>
                        </button>
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
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="w-full overflow-x-auto overflow-y-auto no-scrollbar flex-1 relative h-full">
            <table className="w-full text-left border-collapse table-auto min-w-[1100px]">
              <thead className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 shadow-2xs">
                <tr className="font-semibold text-slate-600 dark:text-slate-300 text-[11px] uppercase tracking-wider select-none">
                  <th className="px-3 py-2.5 w-[55px] text-center whitespace-nowrap">S.No.</th>
                  <th className="px-3 py-2.5 min-w-[180px]">Trade Name</th>
                  <th className="px-3 py-2.5 min-w-[110px] whitespace-nowrap">
                    <TableFilter
                      label="Appeal U/s"
                      options={sections}
                      selected={sectionFilter}
                      onSelect={setSectionFilter}
                    />
                  </th>
                  <th className="px-3 py-2.5 min-w-[100px] whitespace-nowrap">Filing Date</th>
                  <th className="px-3 py-2.5 min-w-[140px] whitespace-nowrap">Next Hearing</th>
                  <th className="px-3 py-2.5 min-w-[100px] whitespace-nowrap">Hearing In</th>
                  <th className="px-3 py-2.5 min-w-[140px] text-center whitespace-nowrap">Outcome Update</th>
                  <th className="px-3 py-2.5 min-w-[150px]">Remark</th>
                  <th className="sticky top-0 right-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2.5 text-right w-[120px] min-w-[120px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] border-b border-slate-200/90 dark:border-slate-700/90">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-24 text-center text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                      No filed appeals found in vault
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec, idx) => {
                    const client = clients.find(c => c.id === rec.clientId);
                    const hDays = getHearingDaysLeft(rec.hearingDate);

                    return (
                      <tr key={rec.id} className="group hover:bg-indigo-50/30 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-400 dark:text-slate-500 text-center whitespace-nowrap">
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
                          <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
                            {rec.section ? `U/s ${rec.section}` : '---'}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {formatDate(rec.filedDate)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <input 
                            type="date" 
                            value={rec.hearingDate || ''} 
                            onChange={(e) => updateHearingDate(rec, e.target.value)}
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 outline-none focus:ring-1 focus:ring-indigo-500 font-mono" 
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {hDays !== null ? (
                            <span className={`font-semibold ${hDays < 0 ? 'text-rose-600 font-bold' : hDays <= 5 ? 'text-rose-600 font-bold' : hDays <= 15 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {hDays < 0 ? `${Math.abs(hDays)}d Overdue` : `${hDays}d Left`}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 text-[11px]">Unscheduled</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openOutcomeModal(rec, 'Drop')}
                              className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-all cursor-pointer"
                              title="Relief Granted"
                            >
                              Relief
                            </button>
                            <button
                              type="button"
                              onClick={() => openOutcomeModal(rec, 'Demand')}
                              className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 transition-all cursor-pointer"
                              title="Demand Sustained"
                            >
                              Sustain
                            </button>
                          </div>
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
                  {clients.find(c => c.id === selectedActionRecord.clientId)?.tradeName || selectedActionRecord.clientName || 'Appeal Actions'}
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
              {/* GST Portal Login */}
              {(() => {
                const client = clients.find(c => c.id === selectedActionRecord.clientId);
                return (
                  <button
                    type="button"
                    onClick={() => {
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
                );
              })()}

              {/* View Complete Record */}
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

              {/* Edit Record */}
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

              {/* Relief Granted (Drop) */}
              <button
                type="button"
                onClick={() => {
                  openOutcomeModal(selectedActionRecord, 'Drop');
                  setActiveActionsId(null);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors text-left cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold">Relief Granted (Drop)</div>
                  <div className="text-[10px] text-emerald-600/70 font-normal">Order passed in favor of taxpayer</div>
                </div>
              </button>

              {/* Sustained Demand */}
              <button
                type="button"
                onClick={() => {
                  openOutcomeModal(selectedActionRecord, 'Demand');
                  setActiveActionsId(null);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors text-left cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold">Demand Sustained</div>
                  <div className="text-[10px] text-rose-600/70 font-normal">Confirmed liability to pay or escalate</div>
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

              {/* WhatsApp Notification */}
              {(() => {
                const client = clients.find(c => c.id === selectedActionRecord.clientId);
                const phone = client?.mobile || client?.gstProfile?.primaryMobile || '';
                return (
                  <button
                    type="button"
                    onClick={() => {
                      if (!phone) {
                        toast.error('Client contact number not available');
                        return;
                      }
                      const msg = encodeURIComponent(`Dear ${selectedActionRecord.clientName}, your appeal under section ${selectedActionRecord.section || '---'} with ref ${selectedActionRecord.referenceNo || '---'} is scheduled for hearing on ${formatDate(selectedActionRecord.hearingDate)}.`);
                      window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${msg}`, '_blank');
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
                      <div className="text-[10px] text-slate-400 font-normal">Send hearing notification</div>
                    </div>
                  </button>
                );
              })()}

              {/* Danger Zone: Delete */}
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
                  <div className="text-[10px] text-rose-500/70 font-normal">Remove appeal permanently</div>
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

      {isOutcomeModalOpen && recordToUpdate && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                 <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-1">Outcome Update</p>
                 <h3 className="text-lg font-black truncate">{outcomeStatus === 'Drop' ? 'Relief Granted' : 'Demand Sustained'}</h3>
              </div>
              <button onClick={() => setIsOutcomeModalOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors">
                <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
               <div>
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1 mb-1.5 block">Order Date</label>
                 <input type="date" value={outcomeDate} onChange={e => setOutcomeDate(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-indigo-600/10 transition-all font-mono text-slate-900 dark:text-white" />
               </div>
               <div>
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1 mb-1.5 block">Order Reference No.</label>
                 <input type="text" value={outcomeRefNo} onChange={e => setOutcomeRefNo(e.target.value)} placeholder="Order Reference No..." className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-indigo-600/10 transition-all font-mono text-slate-900 dark:text-white" />
               </div>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 flex gap-3">
              <button onClick={() => setIsOutcomeModalOpen(false)} className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-300 dark:hover:bg-slate-700 transition-all cursor-pointer">Cancel</button>
              <button onClick={submitOutcome} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-indigo-700 transition-all cursor-pointer">Confirm Outcome</button>
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

export default AppealFiled;