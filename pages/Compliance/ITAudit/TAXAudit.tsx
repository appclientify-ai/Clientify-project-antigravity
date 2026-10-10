import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useModuleData } from '../../../hooks/useModuleData.ts';
import { Client } from '../../../types';
import { api } from '../../../services/api.ts';
import Loader from '../../../components/Loader';
import { useTaxAuditLogic, BSStatus } from './TAXAuditlogic';
import { EditableRemark } from '../../../components/EditableRemark';
import { YEARS } from '../GSTReturn/filinglogic/MonthlyFilingLogic';
import { TableFilter } from '../../../components/TableFilter';
import { useGlobalDueDates } from '../../../hooks/useGlobalDueDates';
import { formatISOToDDMMYYYY } from '../../../dateUtils';
import { ViewControl } from '../../../components/ViewControl';
import { CustomSelect } from '../../../components/CustomSelect';
import { ExportMenu } from '../../../components/ExportMenu';
import { exportToCSV, printList } from '../../../exportUtils';
import GSTDetailModal from '../../../components/GSTDetailModal';
import ITDetailModal from '../../../components/ITDetailModal';
import { toast } from 'sonner';

const TAXAudit: React.FC = () => {
  const queryClient = useQueryClient();
  const getPreviousFY = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const startYear = currentMonth >= 3 ? currentYear - 1 : currentYear - 2;
    return `${startYear}-${(startYear + 1).toString().slice(-2)}`;
  };

  const { data: pageData, isLoading: isPageLoading } = useModuleData('tax_audit_filing_page_data');

  const allClients = useMemo(() => pageData?.clients || [], [pageData]);
  const [search, setSearch] = useState('');
  const [selectedYear, setSelectedYear] = useState(getPreviousFY());
  
  const { getGlobalDueDate } = useGlobalDueDates(selectedYear);
  const auditTaxDueDate = getGlobalDueDate('audit_tax', 'Annual');
  
  const [bsFilter, setBsFilter] = useState<'All' | BSStatus>('All');
  const [auditFilter, setAuditFilter] = useState<'All' | 'Filed' | 'Pending'>('All');
  const [quickFilter, setQuickFilter] = useState<'All' | 'Ready' | 'Filed' | 'Pending'>('All');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Add Client to Audit Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [pendingClientForAdd, setPendingClientForAdd] = useState<Client | null>(null);
  const [newCaName, setNewCaName] = useState('');
  const [newBsStatus, setNewBsStatus] = useState<BSStatus>('Pending');
  const [newAuditFiled, setNewAuditFiled] = useState(false);
  const [newRemark, setNewRemark] = useState('');

  // Edit / Audit Details Modal
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [editCaName, setEditCaName] = useState('');

  // Client Details Modal
  const [detailClient, setDetailClient] = useState<Client | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Actions Drawer State
  const [activeActionsId, setActiveActionsId] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const { getStatus, toggleAuditStatus, setBSStatus, updateCaName, updateRemark, getDueDate, watchlist, addToWatchlist, removeFromWatchlist } = useTaxAuditLogic(
    selectedYear,
    pageData?.watchlist,
    pageData?.filingData,
    pageData?.dueDates
  );

  const currentDueDate = auditTaxDueDate || getDueDate() || '';

  const isClientsLoading = isPageLoading && !pageData;

  const handleRefreshClients = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['tax_audit_filing_page_data'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  }, [queryClient]);

  useEffect(() => {
    const syncHandler = () => handleRefreshClients();
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, [handleRefreshClients]);

  // Click outside to close filter count dropdown
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

  // Keyboard shortcut Ctrl+K and ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setActiveActionsId(null);
        setIsFilterDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const trackedClients = useMemo(() => {
    const selectedStartYear = parseInt(selectedYear.split('-')[0]);
    const activeIds = new Set<string>();

    Object.keys(watchlist).forEach(fy => {
      const ids = watchlist[fy] as string[];
      const fyStart = parseInt(fy.split('-')[0]);
      if (fyStart <= selectedStartYear) {
        ids.forEach(id => activeIds.add(id));
      }
    });

    return allClients.filter(c => activeIds.has(c.id));
  }, [allClients, watchlist, selectedYear]);

  const filteredTracked = useMemo(() => {
    const s = search.toLowerCase();
    let list = trackedClients.filter(c => 
      (c.legalName || '').toLowerCase().includes(s) || 
      (c.tradeName || '').toLowerCase().includes(s) || 
      (c.itProfile?.pan || '').toLowerCase().includes(s) ||
      (c.gstProfile?.gstin || '').toLowerCase().includes(s)
    );

    if (quickFilter !== 'All') {
      if (quickFilter === 'Ready') {
        list = list.filter(c => getStatus(c.id).bsStatus === 'Ready');
      } else if (quickFilter === 'Filed') {
        list = list.filter(c => getStatus(c.id).auditFiled);
      } else if (quickFilter === 'Pending') {
        list = list.filter(c => !getStatus(c.id).auditFiled);
      }
    }

    if (bsFilter !== 'All') {
      list = list.filter(c => getStatus(c.id).bsStatus === bsFilter);
    }
    if (auditFilter !== 'All') {
      list = list.filter(c => auditFilter === 'Filed' ? getStatus(c.id).auditFiled : !getStatus(c.id).auditFiled);
    }

    return list;
  }, [trackedClients, search, quickFilter, bsFilter, auditFilter, getStatus]);

  const availableToAdd = useMemo(() => {
    const s = addSearch.toLowerCase();
    const selectedStartYear = parseInt(selectedYear.split('-')[0]);
    
    const alreadyTrackedIds = new Set<string>();
    Object.keys(watchlist).forEach(fy => {
      const ids = watchlist[fy] as string[];
      const fyStart = parseInt(fy.split('-')[0]);
      if (fyStart <= selectedStartYear) {
        ids.forEach(id => alreadyTrackedIds.add(id));
      }
    });

    return allClients.filter(c => 
      !alreadyTrackedIds.has(c.id) && 
      ((c.legalName || '').toLowerCase().includes(s) || 
       (c.tradeName || '').toLowerCase().includes(s) || 
       (c.itProfile?.pan || '').toLowerCase().includes(s) || 
       (c.gstProfile?.gstin || '').toLowerCase().includes(s))
    ).slice(0, 15);
  }, [allClients, watchlist, addSearch, selectedYear]);

  const handleFinalizeAdd = () => {
    if (!pendingClientForAdd) return;
    addToWatchlist(pendingClientForAdd.id);
    if (newCaName.trim()) {
      updateCaName(pendingClientForAdd.id, newCaName.trim());
    }
    if (newBsStatus !== 'Pending') {
      setBSStatus(pendingClientForAdd.id, newBsStatus);
    }
    if (newAuditFiled) {
      toggleAuditStatus(pendingClientForAdd.id);
    }
    if (newRemark.trim()) {
      updateRemark(pendingClientForAdd.id, newRemark.trim());
    }
    toast.success(`${pendingClientForAdd.tradeName || pendingClientForAdd.legalName} added to Audit list`);
    setPendingClientForAdd(null);
    setNewCaName('');
    setNewBsStatus('Pending');
    setNewAuditFiled(false);
    setNewRemark('');
    setIsAddModalOpen(false);
  };

  const handleUpdateAudit = () => {
    if (viewingClient) {
      updateCaName(viewingClient.id, editCaName.trim());
      toast.success("Audit & CA details saved");
      setIsAuditModalOpen(false);
    }
  };

  const cycleBSStatus = (clientId: string) => {
    const current = getStatus(clientId).bsStatus;
    const flow: BSStatus[] = ['Pending', 'Document Required', 'In progress', 'Ready'];
    const nextIdx = (flow.indexOf(current) + 1) % flow.length;
    setBSStatus(clientId, flow[nextIdx]);
  };

  const stats = useMemo(() => {
    const total = trackedClients.length;
    const audited = trackedClients.filter(c => getStatus(c.id).auditFiled).length;
    const bsReady = trackedClients.filter(c => getStatus(c.id).bsStatus === 'Ready').length;
    const pendingAudit = total - audited;
    return {
      total,
      audited,
      bsReady,
      pendingAudit
    };
  }, [trackedClients, getStatus]);

  const filterOptions = useMemo(() => [
    { value: 'All', label: 'Total Clients', shortLabel: 'Total', count: stats.total, dot: 'bg-slate-400' },
    { value: 'Ready', label: 'B/S Ready', shortLabel: 'B/S Ready', count: stats.bsReady, dot: 'bg-emerald-500' },
    { value: 'Filed', label: 'Audited', shortLabel: 'Audited', count: stats.audited, dot: 'bg-indigo-500' },
    { value: 'Pending', label: 'Audit Pending', shortLabel: 'Pending', count: stats.pendingAudit, dot: 'bg-rose-500' },
  ], [stats]);

  const currentFilterOption = useMemo(() => {
    return filterOptions.find(o => o.value === quickFilter) || filterOptions[0];
  }, [filterOptions, quickFilter]);

  const handleExportCSV = () => {
    const headers = ["S.No.", "Trade Name", "Legal Name", "GSTIN / PAN", "Responsible CA", "Balance Sheet", "Audit Status", "Remark"];
    const rows = filteredTracked.map((client, index) => {
      const status = getStatus(client.id);
      return [
        (index + 1).toString().padStart(2, '0'),
        client.tradeName || '---',
        client.legalName || '---',
        client.gstProfile?.gstin || client.itProfile?.pan || '---',
        status.caName || '---',
        status.bsStatus || 'Pending',
        status.auditFiled ? 'Filed' : 'Pending',
        status.remark || ''
      ];
    });
    exportToCSV(headers, rows, `Tax_Audit_FY_${selectedYear}.csv`);
  };

  const handleExportPDF = () => {
    const headers = ["S.No.", "Trade Name", "Legal Name", "GSTIN / PAN", "Responsible CA", "Balance Sheet", "Audit Status"];
    const rows = filteredTracked.map((client, index) => {
      const status = getStatus(client.id);
      return [
        (index + 1).toString().padStart(2, '0'),
        client.tradeName || '---',
        client.legalName || '---',
        client.gstProfile?.gstin || client.itProfile?.pan || '---',
        status.caName || '---',
        status.bsStatus || 'Pending',
        status.auditFiled ? 'Filed' : 'Pending'
      ];
    });
    printList(`Tax Audit & Financials - FY ${selectedYear}`, headers, rows);
  };

  const handleViewProfile = (client: Client) => {
    setDetailClient(client);
    setIsDetailModalOpen(true);
  };

  const shareViaWhatsApp = (text: string) => {
    window.open(`whatsapp://send?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (isClientsLoading) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* Modern Unified Single-Line Toolbar */}
      <div className="relative z-50 flex items-center justify-between gap-1.5 sm:gap-2 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs shrink-0 w-full max-w-full min-w-0 flex-nowrap overflow-visible transition-colors">
        
        {/* Left Section: Search Bar + Count Dropdown + Due Dates */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 flex-nowrap">
          {/* Search Bar - Full Available Space */}
          <div className="relative group flex-1 min-w-[180px] sm:min-w-[240px]">
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search trade name, legal name, GSTIN, PAN, CA name..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-7 sm:pr-14 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none" 
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-slate-600 dark:group-focus-within:text-slate-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {search ? (
              <button 
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            ) : (
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[9px] font-mono font-medium text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-700 px-1 py-0.5 rounded shadow-2xs hidden lg:inline-block">
                Ctrl K
              </kbd>
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
                  : quickFilter !== 'All'
                    ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
              title="Click to view all status counts and filters"
            >
              <span className={`h-2 w-2 rounded-full ${currentFilterOption.dot} shrink-0`} />
              <span>{currentFilterOption.shortLabel}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${
                isFilterDropdownOpen
                  ? 'bg-slate-800 dark:bg-indigo-700 text-white'
                  : quickFilter !== 'All'
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
              <div className="absolute left-0 mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-[1000] p-1.5 animate-in zoom-in-95 origin-top-left">
                <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-1 flex items-center justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <span>Filter by Status</span>
                  <span>Count</span>
                </div>
                <div className="space-y-0.5">
                  {filterOptions.map((option) => {
                    const isSelected = quickFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setQuickFilter(option.value as any);
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
                            ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200'
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

          {/* Due Date */}
          {currentDueDate && (
            <div className="h-9 px-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-700 dark:text-indigo-300 whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-indigo-500 dark:text-indigo-400">Audit Due:</span>
              <span className="font-mono tabular-nums font-bold">{formatISOToDDMMYYYY(currentDueDate)}</span>
            </div>
          )}
        </div>

        {/* Right Section: ViewControl, + Add Client, ExportMenu, FY Selector */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto flex-nowrap overflow-visible">
          <ViewControl 
            viewMode={viewMode} 
            onViewChange={setViewMode} 
            className="h-9 rounded-lg shrink-0"
          />

          {/* Add Client to Audit Button */}
          <button 
            type="button"
            onClick={() => { setPendingClientForAdd(null); setAddSearch(''); setIsAddModalOpen(true); }} 
            className="h-9 px-2.5 sm:px-3 bg-slate-900 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-lg font-semibold text-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
            title="Add Client to Tax Audit"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            <span className="hidden sm:inline">+ Add Client</span>
            <span className="sm:hidden">+ Add</span>
          </button>

          <ExportMenu onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />

          <CustomSelect 
            value={selectedYear} 
            onChange={setSelectedYear} 
            options={YEARS} 
            labelPrefix="FY "
            title="Select Financial Year"
            align="right"
          />
        </div>
      </div>

      {/* Main Table / Grid Container */}
      <div className="relative z-10 flex-1 min-h-0 w-full max-w-full min-w-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col transition-colors">
        {viewMode === 'grid' ? (
          <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredTracked.map((client, idx) => {
              const status = getStatus(client.id);
              return (
                <div key={client.id} className="p-3.5 bg-slate-50/80 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 hover:border-indigo-300 dark:hover:border-indigo-600/50 hover:shadow-lg rounded-2xl transition-all flex flex-col justify-between space-y-3 group">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400">#{idx + 1}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 font-mono">{client.gstProfile?.gstin || client.itProfile?.pan || 'NO ID'}</span>
                        {(client.gstProfile?.gstin || client.itProfile?.pan) && (
                          <button onClick={() => { navigator.clipboard.writeText(client.gstProfile?.gstin || client.itProfile?.pan || ''); toast.success('ID Copied!'); window.open(client.gstProfile?.gstin ? 'https://services.gst.gov.in/services/searchtp' : 'https://eportal.incometax.gov.in', '_blank'); }} className="p-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors inline-flex cursor-pointer" title="Search Taxpayer">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate" title={client.tradeName}>{client.tradeName || client.legalName}</h4>
                    <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate mb-2">{client.legalName}</p>

                    {/* CA & Credentials Section */}
                    <div className="mt-2 p-2.5 bg-white dark:bg-slate-900/80 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-[9px] text-slate-400 uppercase">Responsible CA:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{status.caName || 'Not Assigned'}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-[9px] text-slate-400 uppercase">ID:</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{client.gstProfile?.username || client.itProfile?.pan || '---'}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-[9px] text-slate-400 uppercase">PWD:</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-bold text-indigo-500 dark:text-indigo-400">{client.gstProfile?.password || client.itProfile?.password || '---'}</span>
                          {(client.gstProfile?.password || client.itProfile?.password) && (
                            <button 
                              onClick={() => { 
                                navigator.clipboard.writeText(client.gstProfile?.password || client.itProfile?.password || ''); 
                                toast.success('Password Copied!'); 
                              }} 
                              className="p-0.5 text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all inline-flex cursor-pointer"
                              title="Copy Password"
                            >
                              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            </button>
                          )}
                          <button 
                            onClick={() => window.open(client.gstProfile?.gstin ? 'https://services.gst.gov.in/services/login' : 'https://eportal.incometax.gov.in', '_blank')} 
                            className="p-0.5 text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all inline-flex cursor-pointer" 
                            title="Login to Portal"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[10px]">
                    <span className="font-semibold text-slate-500 dark:text-slate-400">Audit Status:</span>
                    <button 
                      type="button"
                      onClick={() => toggleAuditStatus(client.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-tight border shadow-2xs transition-all cursor-pointer ${
                        status.auditFiled 
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' 
                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${status.auditFiled ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <span>{status.auditFiled ? 'Audited' : 'Pending'}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">FY {selectedYear}</span>
                    <div className="flex items-center gap-1">
                      <button 
                        type="button"
                        onClick={() => handleViewProfile(client)} 
                        className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-1 shadow-2xs cursor-pointer text-xs font-medium active:scale-95"
                        title="View Client Profile"
                      >
                        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 12z" />
                        </svg>
                        <span>View</span>
                      </button>
                      <button 
                        type="button"
                        onClick={() => { setSelectedClient(client); setActiveActionsId(client.id); }} 
                        className="px-2.5 py-1 text-[10px] font-bold uppercase bg-slate-900 dark:bg-indigo-600 text-white rounded-lg shadow-xs hover:bg-indigo-600 dark:hover:bg-indigo-500 transition-colors cursor-pointer"
                      >
                        Actions
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
        <div className="w-full overflow-x-auto overflow-y-auto no-scrollbar flex-1 relative h-full">
          <table className="w-full text-left border-collapse table-auto min-w-[1100px] gst-portfolio-table">
            <thead className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 shadow-2xs">
              <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 select-none">
                <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[55px] text-center whitespace-nowrap">S.No.</th>
                <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[24%] min-w-[180px]">Entity Name</th>
                <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[16%] min-w-[150px] whitespace-nowrap">GSTIN / PAN</th>
                <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[16%] min-w-[140px] whitespace-nowrap">Responsible CA</th>
                <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[14%] min-w-[130px] text-center whitespace-nowrap">
                  <div className="flex justify-center flex-col items-center">
                    <TableFilter label="Balance Sheet" isActive={bsFilter !== 'All'}>
                      {['All', 'Ready', 'In progress', 'Document Required', 'Pending'].map(f => (
                        <button key={f} type="button" onClick={() => setBsFilter(f as any)} className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer ${bsFilter === f ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>{f}</button>
                      ))}
                    </TableFilter>
                  </div>
                </th>
                <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[12%] min-w-[115px] text-center whitespace-nowrap">
                  <div className="flex justify-center flex-col items-center">
                    <TableFilter label="Audit Status" isActive={auditFilter !== 'All'}>
                      {['All', 'Filed', 'Pending'].map(f => (
                        <button key={f} type="button" onClick={() => setAuditFilter(f as any)} className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer ${auditFilter === f ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>{f}</button>
                      ))}
                    </TableFilter>
                  </div>
                </th>
                <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[14%] min-w-[180px]">Remark</th>
                <th className="sticky top-0 right-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 text-right w-[95px] min-w-[95px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredTracked.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-20 text-center text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-xs">
                    No clients added to audit list for FY {selectedYear}
                  </td>
                </tr>
              ) : (
                filteredTracked.map((client, idx) => {
                  const status = getStatus(client.id);
                  return (
                    <tr key={client.id} className="transition-all group border-b border-slate-100 dark:border-slate-800/60 hover:bg-indigo-50/30 dark:hover:bg-slate-800/40 animate-in fade-in slide-in-from-bottom-1 duration-150">
                      <td className="px-3 py-1.5 font-bold text-indigo-500 dark:text-indigo-400 font-mono text-center whitespace-nowrap">
                        {(idx + 1).toString().padStart(2, '0')}
                      </td>
                      <td className="px-3 py-1.5 truncate min-w-[180px]" title={client.tradeName || client.legalName}>
                        <div className="font-semibold text-slate-900 dark:text-white truncate text-xs leading-normal">
                          {client.tradeName || client.legalName || '---'}
                        </div>
                        {client.tradeName && client.legalName && (
                          <p className="legal-subtitle truncate leading-tight font-medium text-slate-500 dark:text-slate-400 text-[11px]" title={client.legalName}>
                            Legal: {client.legalName}
                          </p>
                        )}
                        {!client.tradeName && client.itProfile?.fatherName && (
                          <p className="legal-subtitle truncate leading-tight font-medium text-slate-400 dark:text-slate-500 text-[10px]" title={client.itProfile.fatherName}>
                            Father: {client.itProfile.fatherName}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 group/id">
                          <span className="font-semibold font-mono tracking-wider text-indigo-600 dark:text-indigo-400 uppercase text-xs">
                            {client.gstProfile?.gstin || client.itProfile?.pan || 'N/A'}
                          </span>
                          {(client.gstProfile?.gstin || client.itProfile?.pan) && (
                            <button 
                              onClick={() => { 
                                const identifier = client.gstProfile?.gstin || client.itProfile?.pan || '';
                                navigator.clipboard.writeText(identifier); 
                                toast.success('ID Copied!'); 
                              }} 
                              className="h-5 w-5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center opacity-0 group-hover/id:opacity-100 shadow-2xs border border-indigo-100 dark:border-indigo-800 shrink-0 cursor-pointer" 
                              title="Copy GSTIN / PAN"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {/* Display CA Name exactly as typed by user - NO uppercase forcing */}
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate text-xs">
                          {status.caName || '---'}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center">
                          <button 
                            type="button"
                            onClick={() => cycleBSStatus(client.id)} 
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-tight border shadow-2xs transition-all cursor-pointer active:scale-95 ${
                              status.bsStatus === 'Ready'
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                                : status.bsStatus === 'In progress'
                                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                                  : status.bsStatus === 'Document Required'
                                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100'
                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                            }`}
                            title="Click to cycle Balance Sheet status"
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              status.bsStatus === 'Ready'
                                ? 'bg-emerald-500'
                                : status.bsStatus === 'In progress'
                                  ? 'bg-amber-500'
                                  : status.bsStatus === 'Document Required'
                                    ? 'bg-blue-500'
                                    : 'bg-slate-400'
                            }`} />
                            <span>{status.bsStatus === 'Document Required' ? 'Docs Required' : status.bsStatus}</span>
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center">
                          <button 
                            type="button"
                            onClick={() => toggleAuditStatus(client.id)} 
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-tight border shadow-2xs transition-all cursor-pointer active:scale-95 ${
                              status.auditFiled 
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100' 
                                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100'
                            }`}
                            title="Click to toggle Audit status"
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${status.auditFiled ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            <span>{status.auditFiled ? 'Audited' : 'Pending'}</span>
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 truncate min-w-[180px]">
                        <EditableRemark value={status.remark || ''} onSave={val => updateRemark(client.id, val)} />
                      </td>
                      <td className="sticky right-0 bg-white/95 dark:bg-slate-900/95 group-hover:bg-indigo-50/40 dark:group-hover:bg-slate-850 backdrop-blur-md z-20 px-3 py-1.5 text-right w-[95px] min-w-[95px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] overflow-visible">
                        <div className="flex items-center justify-end gap-1">
                          <button 
                            type="button"
                            onClick={() => handleViewProfile(client)} 
                            className="h-7 px-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 transition-all flex items-center gap-1 shadow-2xs text-[11px] font-semibold cursor-pointer active:scale-95" 
                            title="View Client Profile"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 10z" />
                            </svg>
                            <span>View</span>
                          </button>
                          <button 
                            type="button"
                            onClick={() => {
                              setSelectedClient(client);
                              setActiveActionsId(client.id);
                            }} 
                            className={`h-7 w-7 rounded-lg border transition-all flex items-center justify-center shadow-2xs cursor-pointer active:scale-95 ${
                              activeActionsId === client.id 
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

      {/* Global Actions Menu - Opened in Right Side Center & Portaled to body */}
      {activeActionsId && selectedClient && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999998] flex items-center justify-end p-3 sm:p-6 pointer-events-none">
          {/* Dismiss Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-950/20 backdrop-blur-[2px] pointer-events-auto animate-in fade-in duration-150"
            onClick={(e) => {
              e.stopPropagation();
              setActiveActionsId(null);
            }} 
          />

          {/* Action Options Panel in Right Side Center */}
          <div 
            ref={actionsRef}
            onClick={(e) => e.stopPropagation()}
            className="relative pointer-events-auto w-80 max-w-[calc(100vw-24px)] max-h-[calc(100vh-32px)] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl z-[999999] text-left animate-in fade-in slide-in-from-right-4 duration-200 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden"
          >
            {/* Header */}
            <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Audit Actions</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 font-mono text-[9px] font-bold">
                    FY {selectedYear}
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                  {selectedClient.tradeName || selectedClient.legalName}
                </h4>
                <p className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 truncate">
                  CA: {getStatus(selectedClient.id).caName || 'Not Assigned'}
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

            {/* Scrollable Action Buttons */}
            <div className="overflow-y-auto p-2 space-y-1 no-scrollbar flex-1">
              {/* View Complete Profile */}
              <button 
                type="button"
                onClick={() => { 
                  handleViewProfile(selectedClient); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:bg-white dark:group-hover:bg-slate-800 shadow-xs text-base font-bold shrink-0">
                  👁️
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 block truncate">View Client Profile</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Client details & credentials</span>
                </div>
              </button>

              {/* Edit CA & Audit Info */}
              <button 
                type="button"
                onClick={() => { 
                  setViewingClient(selectedClient);
                  setEditCaName(getStatus(selectedClient.id).caName || '');
                  setIsAuditModalOpen(true);
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-base shrink-0">
                  ✍️
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">Edit Auditor & Status</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Update CA name & review info</span>
                </div>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* Share Info on WhatsApp */}
              <button 
                type="button"
                onClick={() => { 
                  const st = getStatus(selectedClient.id);
                  shareViaWhatsApp(`*Tax Audit & Financials - FY ${selectedYear}*\n*Entity:* ${selectedClient.tradeName || selectedClient.legalName}\n*GSTIN/PAN:* ${selectedClient.gstProfile?.gstin || selectedClient.itProfile?.pan || '---'}\n*Responsible CA:* ${st.caName || '---'}\n*Balance Sheet:* ${st.bsStatus}\n*Audit Status:* ${st.auditFiled ? 'Filed' : 'Pending'}`); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:bg-white dark:group-hover:bg-slate-800 shadow-xs shrink-0">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.558 0 11.894-5.335 11.897-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 block truncate">Share Audit Status</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Send summary via WhatsApp</span>
                </div>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* Remove from Audit */}
              <button 
                type="button"
                onClick={() => { 
                  if (confirm(`Remove ${selectedClient.tradeName || selectedClient.legalName} from Audit tracking?`)) {
                    removeFromWatchlist(selectedClient.id);
                    toast.success("Client removed from Audit list");
                    setActiveActionsId(null);
                  }
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors text-left group cursor-pointer text-rose-600 dark:text-rose-400"
              >
                <div className="h-8 w-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400 group-hover:bg-white dark:group-hover:bg-slate-800 shadow-xs shrink-0">
                  🗑️
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold block truncate">Remove from Audit</span>
                  <span className="text-[10px] text-rose-400/80 block truncate">Cease tracking for this FY</span>
                </div>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* EDIT AUDIT & CA DETAILS MODAL */}
      {isAuditModalOpen && viewingClient && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
           <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 border border-slate-200 dark:border-slate-800">
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                 <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight truncate">{viewingClient.tradeName || viewingClient.legalName}</h3>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">Audit & Auditor Assignment • FY {selectedYear}</p>
                 </div>
                 <button onClick={() => setIsAuditModalOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer">
                    <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6" /></svg>
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5 no-scrollbar">
                 <div className="bg-indigo-50/50 dark:bg-indigo-950/30 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/40">
                    <label className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 block mb-1.5">
                      Responsible Auditor (CA Name)
                    </label>
                    {/* Casing preserved exactly as written by the user - NO uppercase forcing */}
                    <input 
                      autoFocus 
                      type="text"
                      value={editCaName} 
                      onChange={e => setEditCaName(e.target.value)} 
                      className="w-full bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 rounded-xl py-2 px-3 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400" 
                      placeholder="e.g. CA Rahul Sharma"
                    />
                    <p className="text-[10px] text-indigo-500/80 dark:text-indigo-400/80 mt-1">Name will display exactly as entered here.</p>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                      <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Balance Sheet</p>
                      <button 
                        type="button"
                        onClick={() => cycleBSStatus(viewingClient.id)} 
                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        {getStatus(viewingClient.id).bsStatus} ↻
                      </button>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                      <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Audit Filing Status</p>
                      <button 
                        type="button"
                        onClick={() => toggleAuditStatus(viewingClient.id)} 
                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        {getStatus(viewingClient.id).auditFiled ? 'Audited' : 'Pending'} ↻
                      </button>
                    </div>
                 </div>

                 <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Legal Name:</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{viewingClient.legalName || '---'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">GSTIN / PAN:</span>
                      <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">{viewingClient.gstProfile?.gstin || viewingClient.itProfile?.pan || '---'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Portal User ID:</span>
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{viewingClient.gstProfile?.username || viewingClient.itProfile?.username || '---'}</span>
                    </div>
                 </div>
              </div>

              <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex gap-3 shrink-0">
                <button 
                  type="button"
                  onClick={() => setIsAuditModalOpen(false)} 
                  className="flex-1 py-2 text-slate-600 dark:text-slate-300 font-semibold text-xs border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={handleUpdateAudit} 
                  className="flex-1 bg-slate-900 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-semibold text-xs py-2 rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
           </div>
        </div>
      )}

      {/* UPGRADED ADD CLIENT TO AUDIT MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
           <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-5 flex flex-col space-y-4 animate-in zoom-in-95 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between shrink-0">
                 <div>
                   <h3 className="text-base font-bold text-slate-900 dark:text-white">
                     {pendingClientForAdd ? 'Add Audit Form' : `Add Client to Audit (FY ${selectedYear})`}
                   </h3>
                   <p className="text-[11px] text-slate-500 dark:text-slate-400">
                     {pendingClientForAdd ? 'Fill in auditor & filing details' : 'Select a client to track for tax audit'}
                   </p>
                 </div>
                 <button onClick={() => { setIsAddModalOpen(false); setPendingClientForAdd(null); }} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer">
                   <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6" /></svg>
                 </button>
              </div>

              {!pendingClientForAdd ? (
                <>
                  <div className="relative shrink-0">
                     <input 
                       type="text" 
                       placeholder="Search client by trade, legal name, GSTIN, PAN..." 
                       value={addSearch} 
                       onChange={e => setAddSearch(e.target.value)}
                       className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 pl-8 font-semibold text-xs outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-white transition-all" 
                     />
                     <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                     </svg>
                  </div>
                  <div className="flex-1 max-h-[360px] overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
                     {availableToAdd.length === 0 ? (
                       <p className="text-center py-10 text-slate-400 font-semibold text-xs">No clients available to add</p>
                     ) : (
                       availableToAdd.map(c => (
                         <button 
                           key={c.id} 
                           type="button"
                           onClick={() => { 
                             setPendingClientForAdd(c); 
                             setNewCaName(''); 
                             setNewBsStatus('Pending');
                             setNewAuditFiled(false);
                             setNewRemark('');
                           }} 
                           className="w-full text-left p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-indigo-600 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-all flex items-center justify-between group cursor-pointer"
                         >
                            <div className="min-w-0 flex-1">
                               <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">{c.tradeName || c.legalName || '---'}</p>
                               <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate leading-tight">{c.legalName ? `Legal: ${c.legalName}` : '---'}</p>
                               <p className="text-[10px] text-slate-400 font-mono tracking-tight mt-0.5">{c.gstProfile?.gstin || c.itProfile?.pan || 'NO IDENTIFIER'}</p>
                            </div>
                            <svg className="h-4 w-4 text-slate-300 group-hover:text-indigo-600 shrink-0 ml-3 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                         </button>
                       ))
                     )}
                  </div>
                </>
              ) : (
                <div className="space-y-4 animate-in slide-in-from-right-4 duration-200">
                  <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                    <p className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-0.5">Selected Client</p>
                    <p className="text-sm font-bold text-indigo-950 dark:text-indigo-100 leading-tight">{pendingClientForAdd.tradeName || pendingClientForAdd.legalName}</p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 font-mono mt-0.5">{pendingClientForAdd.gstProfile?.gstin || pendingClientForAdd.itProfile?.pan || '---'}</p>
                  </div>
                  
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                      Responsible Auditor (CA Name)
                    </label>
                    {/* Casing preserved exactly as written by the user - NO uppercase forcing */}
                    <input 
                      autoFocus 
                      type="text" 
                      placeholder="e.g. CA Rahul Sharma" 
                      value={newCaName} 
                      onChange={e => setNewCaName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-400" 
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                        Balance Sheet Status
                      </label>
                      <select 
                        value={newBsStatus} 
                        onChange={e => setNewBsStatus(e.target.value as BSStatus)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-2.5 text-xs font-semibold text-slate-900 dark:text-white outline-none"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Document Required">Document Required</option>
                        <option value="In progress">In progress</option>
                        <option value="Ready">Ready</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                        Audit Filing Status
                      </label>
                      <select 
                        value={newAuditFiled ? 'Filed' : 'Pending'} 
                        onChange={e => setNewAuditFiled(e.target.value === 'Filed')}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-2.5 text-xs font-semibold text-slate-900 dark:text-white outline-none"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Filed">Audited (Filed)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                      Initial Remark / Note
                    </label>
                    <input 
                      type="text" 
                      placeholder="Optional notes or remarks..." 
                      value={newRemark} 
                      onChange={e => setNewRemark(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500" 
                    />
                  </div>

                  <div className="flex gap-2.5 pt-2">
                    <button 
                      type="button"
                      onClick={() => setPendingClientForAdd(null)} 
                      className="flex-1 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-xs rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      Back
                    </button>
                    <button 
                      type="button"
                      onClick={handleFinalizeAdd} 
                      className="flex-[2] bg-slate-900 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md transition-all cursor-pointer py-2"
                    >
                      Add Client to Audit
                    </button>
                  </div>
                </div>
              )}
           </div>
        </div>
      )}

      {/* CLIENT PROFILE DETAIL MODAL */}
      {detailClient?.gstProfile ? (
        <GSTDetailModal 
          isOpen={isDetailModalOpen} 
          onClose={() => setIsDetailModalOpen(false)} 
          client={detailClient} 
          onDataChange={handleRefreshClients} 
        />
      ) : (
        <ITDetailModal 
          isOpen={isDetailModalOpen} 
          onClose={() => setIsDetailModalOpen(false)} 
          client={detailClient} 
          onDataChange={handleRefreshClients} 
        />
      )}
    </div>
  );
};

export default TAXAudit;