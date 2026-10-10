import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useModuleData } from '../../../hooks/useModuleData.ts';
import { formatDate } from '../../../exportUtils';
import { Client } from '../../../types';
import { api } from '../../../services/api.ts';
import Loader from '../../../components/Loader';
import { TableFilter } from '../../../components/TableFilter';
import { useITRReturnLogic, RefundStatus } from './ITRReturnlogic';
import { EditableRemark } from '../../../components/EditableRemark';
import { YEARS } from '../GSTReturn/filinglogic/MonthlyFilingLogic';
import { toast } from 'sonner';
import { ExportMenu } from '../../../components/ExportMenu';
import { exportToCSV, printList } from '../../../exportUtils';
import { useGlobalDueDates } from '../../../hooks/useGlobalDueDates';
import { formatISOToDDMMYYYY } from '../../../dateUtils';
import { ViewControl } from '../../../components/ViewControl';
import { CustomSelect } from '../../../components/CustomSelect';
import ITDetailModal from '../../../components/ITDetailModal';

const ITRReturn: React.FC = () => {
  const queryClient = useQueryClient();
  const getPreviousAY = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const startYear = currentMonth >= 3 ? currentYear : currentYear - 1;
    return `${startYear}-${(startYear + 1).toString().slice(-2)}`;
  };

  const { data: pageData, isLoading: isPageLoading } = useModuleData('itr_filing_page_data');

  const clients = useMemo(() => pageData?.clients || [], [pageData]);

  const [search, setSearch] = useState('');
  const [selectedAY, setSelectedAY] = useState(getPreviousAY());
  
  const { getGlobalDueDate } = useGlobalDueDates(selectedAY);
  const itrDueDate = getGlobalDueDate('itr_return', 'Annual');
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'All' | 'Filed' | 'Prepared' | 'Pending'>('All');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [refundStatusFilter, setRefundStatusFilter] = useState<'All' | 'Pending' | 'Received' | 'No Refund'>('All');
  const [itrFilter, setItrFilter] = useState<'All' | 'ITR-1' | 'ITR-2' | 'ITR-3' | 'ITR-4' | 'N/A'>('All');

  // Modals & Tools
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isLoginBoxOpen, setIsLoginBoxOpen] = useState(false);
  const [detailClient, setDetailClient] = useState<Client | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  
  const [editingPasswordId, setEditingPasswordId] = useState<string | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');

  // Actions Menu State
  const [activeActionsId, setActiveActionsId] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const { getStatus, toggleStatus, updateRemark, updateFilingDate, cycleRefundStatus, getDueDate } = useITRReturnLogic(
    selectedAY,
    pageData?.filingData,
    pageData?.dueDates
  );

  const isClientsLoading = isPageLoading && !pageData;

  const handleRefreshClients = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['itr_filing_page_data'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  }, [queryClient]);

  useEffect(() => {
    const syncHandler = () => handleRefreshClients();
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, [handleRefreshClients]);

  // Close count dropdown on outside click
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

  // Ctrl+K shortcut for search
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

  const getClientDisplayId = useCallback((client: Client) => {
    const itGroup = clients.slice().sort((a, b) => (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime()));
    const rank = itGroup.findIndex(c => c.id === client.id) + 1;
    return `IT/${rank.toString().padStart(2, '0')}`;
  }, [clients]);

  const stats = useMemo(() => {
    const total = clients.length;
    let filed = 0;
    let pending = 0;
    let prepared = 0;
    clients.forEach(c => {
      const st = getStatus(c.id);
      if (st.filed) filed++;
      else if (st.prepared) prepared++;
      else pending++;
    });
    return { total, filed, prepared, pending };
  }, [clients, getStatus]);

  const filterOptions = useMemo(() => [
    { value: 'All', label: 'Total Clients', shortLabel: 'Total', count: stats.total, dot: 'bg-slate-400' },
    { value: 'Filed', label: 'ITR Filed', shortLabel: 'Filed', count: stats.filed, dot: 'bg-emerald-500' },
    { value: 'Prepared', label: 'ITR Prepared', shortLabel: 'Prepared', count: stats.prepared, dot: 'bg-amber-500' },
    { value: 'Pending', label: 'ITR Pending', shortLabel: 'Pending', count: stats.pending, dot: 'bg-rose-500' },
  ], [stats]);

  const currentFilterOption = useMemo(() => {
    return filterOptions.find(o => o.value === statusFilter) || filterOptions[0];
  }, [filterOptions, statusFilter]);

  const filteredClients = useMemo(() => {
    let list = clients.filter(c => 
      (c.legalName || '').toLowerCase().includes(search.toLowerCase()) || 
      (c.tradeName || '').toLowerCase().includes(search.toLowerCase()) || 
      (c.itProfile?.pan || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.itProfile?.fatherName || '').toLowerCase().includes(search.toLowerCase())
    );
    
    if (statusFilter !== 'All') {
      list = list.filter(c => {
         const st = getStatus(c.id);
         if (statusFilter === 'Filed') return st.filed;
         if (statusFilter === 'Prepared') return st.prepared && !st.filed;
         if (statusFilter === 'Pending') return !st.filed && !st.prepared;
         return true;
      });
    }

    if (refundStatusFilter !== 'All') {
      list = list.filter(c => {
        const rs = getStatus(c.id).refundStatus || 'N/A';
        if (refundStatusFilter === 'Pending') return rs === 'Pending';
        if (refundStatusFilter === 'Received') return rs === 'Issued' || rs === 'Processed';
        if (refundStatusFilter === 'No Refund') return rs === 'N/A';
        return true;
      });
    }

    if (itrFilter !== 'All') {
      list = list.filter(c => {
        const itr = c.itProfile?.itrFiled || 'N/A';
        return itr === itrFilter;
      });
    }

    return [...list].sort((a, b) => (a.legalName || '').localeCompare(b.legalName || ''));
  }, [clients, search, statusFilter, refundStatusFilter, itrFilter, getStatus]);

  const handleExportCSV = () => {
    const headers = ["ID", "Name", "ITR", "Father Name", "Status", "Filing Date", "Refund Status", "PAN", "Password"].join(",");
    const rows = filteredClients.map(c => {
      const s = getStatus(c.id);
      return [
        getClientDisplayId(c),
        c.legalName,
        c.itProfile?.itrFiled || 'N/A',
        c.itProfile?.fatherName || '---',
        s.filed ? 'Filed' : (s.prepared ? 'Prepared' : 'Pending'),
        s.date || '---',
        s.refundStatus || 'N/A',
        c.itProfile?.pan || '---',
        c.itProfile?.password || '---'
      ];
    });
    exportToCSV(headers.split(','), rows, `IT_Returns_AY_${selectedAY}.csv`);
  };

  const handleExportPDF = () => {
    const headers = ["ID", "Name", "ITR", "Father Name", "Status", "Filing Date", "Refund Status", "PAN"];
    const rows = filteredClients.map(c => {
      const s = getStatus(c.id);
      return [
        getClientDisplayId(c),
        c.legalName,
        c.itProfile?.itrFiled || 'N/A',
        c.itProfile?.fatherName || '---',
        s.filed ? 'Filed' : (s.prepared ? 'Prepared' : 'Pending'),
        s.date || '---',
        s.refundStatus || 'N/A',
        c.itProfile?.pan || '---'
      ];
    });
    printList(`IT Returns - AY ${selectedAY}`, headers, rows);
  };

  const handleViewProfile = (client: Client) => {
    setDetailClient(client);
    setIsDetailModalOpen(true);
  };

  const saveQuickPassword = async (client: Client) => {
    try {
      const updated = { ...client, itProfile: { ...client.itProfile!, password: newPasswordValue } };
      await api.saveClient(updated);
      handleRefreshClients();
      setEditingPasswordId(null);
      toast.success("Password updated");
    } catch (err) { toast.error("Update failed."); }
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
              placeholder="Search client name, trade name, PAN, father name..." 
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
                  : statusFilter !== 'All'
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
                  : statusFilter !== 'All'
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
                    const isSelected = statusFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setStatusFilter(option.value as any);
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
          {(itrDueDate || getDueDate()) && (
            <div className="h-9 px-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-700 dark:text-indigo-300 whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-indigo-500 dark:text-indigo-400">ITR Due:</span>
              <span className="font-mono tabular-nums font-bold">{formatISOToDDMMYYYY(itrDueDate || getDueDate() || '')}</span>
            </div>
          )}
        </div>

        {/* Right Section: ViewControl, ExportMenu, AY Selector */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto flex-nowrap overflow-visible">
          <ViewControl 
            viewMode={viewMode} 
            onViewChange={setViewMode} 
            className="h-9 rounded-lg shrink-0"
          />

          <ExportMenu onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />

          <CustomSelect 
            value={selectedAY} 
            onChange={setSelectedAY} 
            options={YEARS} 
            labelPrefix="AY "
            title="Select Assessment Year"
            align="right"
          />
        </div>
      </div>

      {/* Main Table / Grid Container */}
      <div className="relative z-10 flex-1 min-h-0 w-full max-w-full min-w-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col transition-colors">
        {viewMode === 'grid' ? (
          <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredClients.map((client, idx) => {
              const status = getStatus(client.id);
              return (
                <div key={client.id} className="p-3.5 bg-slate-50/80 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 hover:border-indigo-300 dark:hover:border-indigo-600/50 hover:shadow-lg rounded-2xl transition-all flex flex-col justify-between space-y-3 group">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400">#{idx + 1}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 font-mono tabular-nums">{client.itProfile?.pan || 'NO PAN'}</span>
                        {client.itProfile?.pan && (
                          <button onClick={() => { navigator.clipboard.writeText(client.itProfile?.pan || ''); toast.success('PAN Copied!'); window.open('https://eportal.incometax.gov.in/iec/foservices/#/login', '_blank'); }} className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400" title="Search PAN on IT Portal">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate" title={client.legalName}>{client.legalName || client.tradeName}</h4>
                    <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate">Father: {client.itProfile?.fatherName || '---'}</p>

                    {/* Credentials Section */}
                    <div className="mt-2 p-2.5 bg-white dark:bg-slate-900/80 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-[9px] text-slate-400 uppercase">PAN / ID:</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{client.itProfile?.pan || '---'}</span>
                          {client.itProfile?.pan && (
                            <button onClick={() => { navigator.clipboard.writeText(client.itProfile?.pan || ''); toast.success('PAN copied'); }} className="p-0.5 text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all inline-flex" title="Copy PAN">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-[9px] text-slate-400 uppercase">PWD:</span>
                        <div className="flex items-center gap-1">
                          {editingPasswordId === client.id ? (
                            <input 
                              autoFocus 
                              value={newPasswordValue} 
                              onChange={e => setNewPasswordValue(e.target.value)} 
                              onBlur={() => saveQuickPassword(client)} 
                              onKeyDown={e => e.key === 'Enter' && saveQuickPassword(client)} 
                              className="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-600 rounded px-1.5 py-0.5 text-[10px] font-bold w-20 outline-none h-5 text-slate-900 dark:text-white" 
                            />
                          ) : (
                            <>
                              <span className="font-mono font-bold text-indigo-500 dark:text-indigo-400">{client.itProfile?.password || '---'}</span>
                              <button 
                                onClick={() => { setEditingPasswordId(client.id); setNewPasswordValue(client.itProfile?.password || ''); }} 
                                className="p-0.5 text-slate-300 hover:text-amber-500 transition-all inline-flex"
                                title="Edit Password"
                              >
                                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <button 
                                onClick={() => { 
                                  navigator.clipboard.writeText(client.itProfile?.pan || client.itProfile?.username || ''); 
                                  window.open('https://eportal.incometax.gov.in/iec/foservices/#/login', '_blank'); 
                                }} 
                                className="p-0.5 text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all inline-flex" 
                                title="Login to Portal"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[10px]">
                    <span className="font-semibold text-slate-500 dark:text-slate-400">ITR Status ({client.itProfile?.itrFiled || 'ITR'}):</span>
                    <button 
                      type="button"
                      onClick={() => toggleStatus(client.id)} 
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-tight border shadow-2xs transition-all cursor-pointer ${
                        status.filed 
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' 
                          : status.prepared 
                            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' 
                            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${status.filed ? 'bg-emerald-500' : status.prepared ? 'bg-amber-500' : 'bg-rose-500'}`} />
                      <span>{status.filed ? 'Filed' : (status.prepared ? 'Prepared' : 'Pending')}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">AY {selectedAY}</span>
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
        <div className="overflow-auto no-scrollbar flex-1 w-full relative h-full">
          <table className="w-full text-left border-collapse table-fixed min-w-full itr-returns-table min-w-[1150px]">
            <thead className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 shadow-2xs">
              <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 select-none">
                <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[50px] text-center whitespace-nowrap">S.No.</th>
                <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[22%] min-w-[170px]">Name</th>
                <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[8%] min-w-[80px] text-center whitespace-nowrap">
                  <div className="flex justify-center flex-col items-center">
                    <TableFilter label="ITR" isActive={itrFilter !== 'All'}>
                      {['All', 'ITR-1', 'ITR-2', 'ITR-3', 'ITR-4', 'N/A'].map(f => (
                        <button key={f} type="button" onClick={() => setItrFilter(f as any)} className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer ${itrFilter === f ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>{f}</button>
                      ))}
                    </TableFilter>
                  </div>
                </th>
                <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[11%] min-w-[105px] text-center whitespace-nowrap">
                  <div className="flex justify-center flex-col items-center">
                    <TableFilter label="Status" isActive={statusFilter !== 'All'}>
                      {['All', 'Filed', 'Prepared', 'Pending'].map(f => (
                        <button key={f} type="button" onClick={() => setStatusFilter(f as any)} className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer ${statusFilter === f ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>{f}</button>
                      ))}
                    </TableFilter>
                  </div>
                </th>
                <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[11%] min-w-[115px] text-center whitespace-nowrap">Filing Date</th>
                <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[12%] min-w-[115px] text-center whitespace-nowrap">
                  <div className="flex justify-center flex-col items-center">
                    <TableFilter label="Refund Status" isActive={refundStatusFilter !== 'All'}>
                      {['All', 'Pending', 'Received', 'No Refund'].map(f => (
                        <button key={f} type="button" onClick={() => setRefundStatusFilter(f as any)} className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer ${refundStatusFilter === f ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>{f}</button>
                      ))}
                    </TableFilter>
                  </div>
                </th>
                <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[12%] min-w-[130px] whitespace-nowrap">Pan No.</th>
                <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[12%] min-w-[120px] whitespace-nowrap">Password</th>
                <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[13%] min-w-[150px]">Remark</th>
                <th className="sticky top-0 right-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 text-right w-[95px] min-w-[95px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-20 text-center text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-xs">
                    No matching IT return records found
                  </td>
                </tr>
              ) : (
                filteredClients.map((client, idx) => {
                  const status = getStatus(client.id);
                  const isEditingPass = editingPasswordId === client.id;
                  return (
                    <tr key={client.id} className="transition-all group border-b border-slate-100 dark:border-slate-800/60 hover:bg-indigo-50/30 dark:hover:bg-slate-800/40 animate-in fade-in slide-in-from-bottom-1 duration-150">
                      <td className="px-3 py-1.5 font-bold text-indigo-500 dark:text-indigo-400 font-mono text-center whitespace-nowrap">
                        {(idx + 1).toString().padStart(2, '0')}
                      </td>
                      <td className="px-3 py-1.5 truncate min-w-[170px]" title={client.legalName}>
                        <div className="font-semibold text-slate-900 dark:text-white truncate text-xs leading-normal">{client.legalName || '---'}</div>
                        {client.tradeName && (
                          <p className="trade-subtitle truncate leading-tight font-medium text-slate-500 dark:text-slate-400 text-[11px]" title={client.tradeName}>
                            Trade: {client.tradeName}
                          </p>
                        )}
                        <p className="father-subtitle truncate leading-tight font-medium text-slate-400 dark:text-slate-500 text-[10px]" title={client.itProfile?.fatherName}>
                          {client.itProfile?.fatherName ? `Father: ${client.itProfile.fatherName}` : 'Father: ---'}
                        </p>
                      </td>
                      <td className="px-3 py-1.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center">
                          <span className="inline-flex items-center justify-center bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-md font-bold text-[11px] tracking-wide">
                            {client.itProfile?.itrFiled || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center">
                          <button 
                            type="button"
                            onClick={() => toggleStatus(client.id)} 
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-tight border shadow-2xs transition-all cursor-pointer active:scale-95 ${
                              status.filed 
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60' 
                                : status.prepared 
                                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60' 
                                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/60'
                            }`}
                            title="Click to toggle status"
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              status.filed ? 'bg-emerald-500' : status.prepared ? 'bg-amber-500' : 'bg-rose-500'
                            }`} />
                            <span>{status.filed ? 'Filed' : (status.prepared ? 'Prepared' : 'Pending')}</span>
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-center whitespace-nowrap">
                        {status.filed ? (
                          <input 
                            type="date" 
                            value={status.date || ''} 
                            onChange={e => updateFilingDate(client.id, e.target.value)} 
                            className="bg-transparent border-none p-0 text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none uppercase cursor-pointer text-center" 
                          />
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600 font-semibold text-xs">---</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center">
                          <button 
                            type="button"
                            onClick={() => status.filed && cycleRefundStatus(client.id)} 
                            disabled={!status.filed} 
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-tight border shadow-2xs transition-all ${
                              !status.filed 
                                ? 'opacity-40 cursor-not-allowed bg-slate-50 dark:bg-slate-800/40 text-slate-400 border-slate-200 dark:border-slate-700' 
                                : 'cursor-pointer active:scale-95 ' + (
                                  status.refundStatus === 'Issued' || status.refundStatus === 'Processed'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                                    : status.refundStatus === 'Pending'
                                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                                      : status.refundStatus === 'Adjusted'
                                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100'
                                        : status.refundStatus === 'Rejected'
                                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100'
                                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                                )
                            }`}
                            title={status.filed ? "Click to change refund status" : "File return to track refund"}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              status.refundStatus === 'Issued' || status.refundStatus === 'Processed'
                                ? 'bg-emerald-500'
                                : status.refundStatus === 'Pending'
                                  ? 'bg-amber-500'
                                  : status.refundStatus === 'Adjusted'
                                    ? 'bg-blue-500'
                                    : status.refundStatus === 'Rejected'
                                      ? 'bg-rose-500'
                                      : 'bg-slate-400'
                            }`} />
                            <span>{status.refundStatus || 'No Refund'}</span>
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 group/pan">
                          <span className="font-semibold font-mono tracking-wider text-emerald-600 dark:text-emerald-400 uppercase text-xs">
                            {client.itProfile?.pan || '---'}
                          </span>
                          {client.itProfile?.pan && (
                            <button 
                              onClick={() => { 
                                navigator.clipboard.writeText(client.itProfile?.pan || ''); 
                                toast.success('PAN Copied!'); 
                              }} 
                              className="h-5 w-5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center opacity-0 group-hover/pan:opacity-100 shadow-2xs border border-emerald-100 dark:border-emerald-800 shrink-0 cursor-pointer" 
                              title="Copy PAN"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 group/pass">
                          {isEditingPass ? (
                            <input 
                              autoFocus 
                              value={newPasswordValue} 
                              onChange={e => setNewPasswordValue(e.target.value)} 
                              onBlur={() => saveQuickPassword(client)} 
                              onKeyDown={e => { if (e.key === 'Enter') saveQuickPassword(client); }} 
                              className="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-600 rounded px-2 h-7 font-semibold w-24 outline-none text-xs text-slate-900 dark:text-white" 
                            />
                          ) : (
                            <>
                              <span className="font-semibold text-indigo-500 dark:text-indigo-400 font-mono tracking-wider truncate text-xs">
                                {client.itProfile?.password || '---'}
                              </span>
                              <button 
                                onClick={() => { setEditingPasswordId(client.id); setNewPasswordValue(client.itProfile?.password || ''); }} 
                                className="p-1 text-slate-300 hover:text-amber-500 opacity-0 group-hover/pass:opacity-100 transition-all shrink-0 cursor-pointer" 
                                title="Edit Password"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              {client.itProfile?.pan && (
                                <button 
                                  onClick={() => { 
                                    navigator.clipboard.writeText(client.itProfile?.pan || client.itProfile?.username || ''); 
                                    toast.success('PAN/User ID copied');
                                    window.open('https://eportal.incometax.gov.in/iec/foservices/#/login', '_blank'); 
                                  }} 
                                  className="p-1 text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 opacity-0 group-hover/pass:opacity-100 transition-all shrink-0 cursor-pointer" 
                                  title="Login to IT Portal"
                                >
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 truncate min-w-[150px]">
                        <EditableRemark value={status?.remark || getStatus?.(client.id)?.remark || ''} onSave={val => updateRemark(client.id, val)} />
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

      {/* Global Actions Menu - Opened in Right Side Center & Portaled to body to never hide */}
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
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Client Actions</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 font-mono text-[9px] font-bold">
                    {selectedClient.itProfile?.pan || 'NO PAN'}
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                  {selectedClient.legalName || selectedClient.tradeName}
                </h4>
                <p className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 truncate">
                  AY {selectedAY} • {selectedClient.itProfile?.itrFiled || 'ITR'}
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
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Full Dossier & IT Credentials</span>
                </div>
              </button>

              {/* Portal Access Modal */}
              <button 
                type="button"
                onClick={() => { 
                  setIsLoginBoxOpen(true); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-base shrink-0">
                  🔑
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">Portal Access Box</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Quick credentials & login link</span>
                </div>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* Share Credentials on WhatsApp */}
              <button 
                type="button"
                onClick={() => { 
                  shareViaWhatsApp(`*IT Return Credentials*\n*Entity:* ${selectedClient.legalName}\n*PAN:* ${selectedClient.itProfile?.pan || '---'}\n*User ID:* ${selectedClient.itProfile?.username || selectedClient.itProfile?.pan || '---'}\n*Password:* ${selectedClient.itProfile?.password || '---'}`); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:bg-white dark:group-hover:bg-slate-800 shadow-xs shrink-0">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.558 0 11.894-5.335 11.897-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 block truncate">Share Credentials</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Send PAN & portal password</span>
                </div>
              </button>

              {/* Share Full Details on WhatsApp */}
              <button 
                type="button"
                onClick={() => { 
                  shareViaWhatsApp(`*IT Return Profile*\nName: ${selectedClient.legalName || 'N/A'}\nMobile: ${selectedClient.mobile || 'N/A'}\nEmail: ${selectedClient.email || 'N/A'}\n\n*IT Details*\nPAN: ${selectedClient.itProfile?.pan || 'N/A'}\nFather Name: ${selectedClient.itProfile?.fatherName || 'N/A'}\nDOB: ${formatDate(selectedClient.itProfile?.dob)}\nAddress: ${selectedClient.address || (selectedClient.itProfile as any)?.address || 'N/A'}`); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:bg-white dark:group-hover:bg-slate-800 shadow-xs shrink-0">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 block truncate">Share Full Profile</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Contact & address dossier</span>
                </div>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* LOGIN BOX MODAL */}
      {isLoginBoxOpen && selectedClient && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/80 backdrop-blur-xl p-4 animate-in fade-in duration-200">
           <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200/80 dark:border-slate-800">
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
                 <div><p className="text-[10px] font-bold tracking-[0.3em] text-indigo-400 uppercase mb-1">Portal Access</p><h3 className="text-xl font-bold truncate">{selectedClient.legalName}</h3></div>
                 <button onClick={() => setIsLoginBoxOpen(false)} className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors"><svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6" /></svg></button>
              </div>
              <div className="p-6 space-y-6">
                 <div className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col gap-4">
                    <div><p className="text-[9px] font-bold uppercase text-slate-400 mb-1">PAN Identity</p><p className="text-lg font-bold text-indigo-600 dark:text-indigo-400 font-mono tracking-widest">{selectedClient.itProfile?.pan}</p></div>
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200/60 dark:border-slate-700/60">
                       <div><p className="text-[9px] font-bold text-slate-400 mb-1">User ID</p><p className="text-sm font-bold text-slate-900 dark:text-white font-mono break-all select-all">{selectedClient.itProfile?.username || selectedClient.itProfile?.pan || '---'}</p></div>
                       <div><p className="text-[9px] font-bold text-slate-400 mb-1">Password</p><p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 font-mono tracking-wider break-all select-all">{selectedClient.itProfile?.password || '---'}</p></div>
                    </div>
                 </div>
              </div>
              <div className="p-6 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200/80 dark:border-slate-800">
                <button onClick={() => { navigator.clipboard.writeText(selectedClient.itProfile?.username || selectedClient.itProfile?.pan || ''); window.open('https://eportal.incometax.gov.in/iec/foservices/#/login', '_blank'); }} className="w-full py-3.5 bg-slate-900 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-xl font-bold text-xs tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer">Launch IT Portal & Copy ID</button>
              </div>
           </div>
        </div>
      )}

      {/* Complete IT Detail Modal */}
      <ITDetailModal 
        isOpen={isDetailModalOpen} 
        onClose={() => setIsDetailModalOpen(false)} 
        client={detailClient} 
        onDataChange={handleRefreshClients} 
      />
    </div>
  );
};

export default ITRReturn;
