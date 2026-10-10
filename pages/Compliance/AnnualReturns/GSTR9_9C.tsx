import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useModuleData } from '../../../hooks/useModuleData.ts';
import { formatDate } from '../../../exportUtils';
import { Client } from '../../../types';
import { api } from '../../../services/api.ts';
import Loader from '../../../components/Loader';
import GSTViewIcon from '../../../components/GSTViewIcon';
import GSTClientFormModal from '../../Clientform/GSTClientFormModal.tsx';
import GSTPortalLoginModal from '../../../components/GSTPortalLoginModal';
import { GSTCertificateModal } from '../../../components/GSTCertificateModal';
import { CredentialShareModal } from '../../../components/CredentialShareModal';
import GSTDetailModal from '../../../components/GSTDetailModal';
import { TableFilter } from '../../../components/TableFilter';
import { SectorJurisdictionFilter, filterClientsBySectorJurisdiction } from '../../../components/SectorJurisdictionFilter';
import { useGSTR9Logic } from './GSTR9_9Clogic';
import { EditableRemark } from '../../../components/EditableRemark';
import { YEARS, isClientVisibleInFY } from '../GSTReturn/filinglogic/MonthlyFilingLogic';
import { toast } from 'sonner';
import { ExportMenu } from '../../../components/ExportMenu';
import { exportToCSV, printList, getSectorGroupLabel, getClientColorTheme } from '../../../exportUtils';
import { useGlobalDueDates } from '../../../hooks/useGlobalDueDates';
import { formatISOToDDMMYYYY } from '../../../dateUtils';
import { ViewControl } from '../../../components/ViewControl';
import { CustomSelect } from '../../../components/CustomSelect';

const GSTR9_9C: React.FC = () => {
  const queryClient = useQueryClient();
  const getPreviousFY = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const startYear = currentMonth >= 3 ? currentYear - 1 : currentYear - 2;
    return `${startYear}-${(startYear + 1).toString().slice(-2)}`;
  };

  const { data: pageData, isLoading: isPageLoading } = useModuleData('gstr9_filing_page_data');

  const allClients = useMemo(() => pageData?.clients || [], [pageData]);

  const [search, setSearch] = useState('');
  const [selectedYear, setSelectedYear] = useState(getPreviousFY());
  
  const { getGlobalDueDate } = useGlobalDueDates(selectedYear);
  const gstr9DueDate = getGlobalDueDate('annual_gstr9', 'Annual');
  const gstr9cDueDate = getGlobalDueDate('annual_gstr9c', 'Annual');
  
  // Modals & Tools
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditApplicabilityOpen, setIsEditApplicabilityOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [is9CApplicableState, setIs9CApplicableState] = useState(true);
  const [turnoverState, setTurnoverState] = useState('');
  const [editingPasswordId, setEditingPasswordId] = useState<string | null>(null);
  const [newPassVal, setNewPassVal] = useState('');

  // Filters
  const [quickFilter, setQuickFilter] = useState<'All' | 'Filed' | 'Pending'>('All');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [gstr9Filter, setGstr9Filter] = useState<'All' | 'Filed' | 'Pending'>('All');
  const [gstr9cFilter, setGstr9cFilter] = useState<'All' | 'Filed' | 'Pending' | 'N/A'>('All');
  const [authorityFilter, setAuthorityFilter] = useState<'All' | 'State' | 'Center'>('All');
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);

  // Actions Menu State & Refs
  const [activeActionsId, setActiveActionsId] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  // Portfolio Action Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailClient, setDetailClient] = useState<Client | null>(null);
  const [shareText, setShareText] = useState('');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [isCredentialShareModalOpen, setIsCredentialShareModalOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState('');

  // Login Tool Box State
  const [isLoginBoxOpen, setIsLoginBoxOpen] = useState(false);
  const [loginToolClient, setLoginToolClient] = useState<Client | null>(null);
  const [loginPortalType, setLoginPortalType] = useState<'gst' | 'eway' | 'gstat'>('gst');

  const { 
    getStatus, toggleStatus, updateRemark, watchlist, addToWatchlist, 
    removeFromWatchlist, is9CApplicable, update9CApplicability
  } = useGSTR9Logic(
    selectedYear,
    pageData?.watchlist,
    pageData?.config,
    pageData?.filingData,
    pageData?.dueDates
  );

  const isClientsLoading = isPageLoading && !pageData;

  const handleRefreshClients = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['gstr9_filing_page_data'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  }, [queryClient]);

  useEffect(() => {
    const syncHandler = () => handleRefreshClients();
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, [handleRefreshClients]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close Filter dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    if (isFilterDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isFilterDropdownOpen]);

  const getClientDisplayId = useCallback((client: Client) => {
    if (!client.gstProfile) return '---';
    const isState = client.gstProfile.jurisdictionType === 'State';
    const val = isState ? client.gstProfile.sector : client.gstProfile.range;
    const prefix = isState ? 'S' : 'C';
    const sameGroup = allClients.filter(c => 
      c.gstProfile?.jurisdictionType === client.gstProfile?.jurisdictionType &&
      (isState ? c.gstProfile?.sector === val : c.gstProfile?.range === val)
    ).sort((a, b) => (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime()));
    const rank = sameGroup.findIndex(c => c.id === client.id) + 1;
    return `${prefix}/${val || '?'}/${rank}`;
  }, [allClients]);

  const baseDisplayList = useMemo(() => {
    const s = search.toLowerCase();
    const list = allClients.filter(c => {
      const inWatchlist = (watchlist[selectedYear] || []).includes(c.id);
      if (!inWatchlist) return false;
      
      return (c.legalName || '').toLowerCase().includes(s) || 
             (c.tradeName || '').toLowerCase().includes(s) || 
             (c.gstProfile?.gstin && c.gstProfile.gstin.toLowerCase().includes(s)) ||
             (c.pan && c.pan.toLowerCase().includes(s));
    }).filter(c => {
      if (gstr9Filter !== 'All') {
        const filed = getStatus(c.id).gstr9;
        if (gstr9Filter === 'Filed' && !filed) return false;
        if (gstr9Filter === 'Pending' && filed) return false;
      }
      if (gstr9cFilter !== 'All') {
        const isApp = is9CApplicable(c.id);
        if (gstr9cFilter === 'N/A' && isApp) return false;
        if (gstr9cFilter !== 'N/A' && !isApp) return false;
        if (gstr9cFilter === 'Filed' && !getStatus(c.id).gstr9c) return false;
        if (gstr9cFilter === 'Pending' && getStatus(c.id).gstr9c) return false;
      }
      return true;
    });

    return filterClientsBySectorJurisdiction(list, authorityFilter, selectedSectors);
  }, [allClients, search, selectedYear, watchlist, gstr9Filter, gstr9cFilter, authorityFilter, selectedSectors, getStatus, is9CApplicable]);

  const stats = useMemo(() => {
    const total = baseDisplayList.length;
    let filed = 0, pending = 0;
    baseDisplayList.forEach(c => {
      if (getStatus(c.id).gstr9) filed++;
      else pending++;
    });
    return { total, filed, pending };
  }, [baseDisplayList, getStatus]);

  const filterOptions = useMemo(() => [
    { label: 'Total Clients', shortLabel: 'Total', value: 'All' as const, count: stats.total, dot: 'bg-indigo-500' },
    { label: 'GSTR-9 Filed', shortLabel: 'Filed', value: 'Filed' as const, count: stats.filed, dot: 'bg-emerald-500' },
    { label: 'Pending Filing', shortLabel: 'Pending', value: 'Pending' as const, count: stats.pending, dot: 'bg-rose-500' },
  ], [stats]);

  const currentFilterOption = filterOptions.find(opt => opt.value === quickFilter) || filterOptions[0];

  const filteredDisplayList = useMemo(() => {
    if (quickFilter === 'Filed') return baseDisplayList.filter(c => getStatus(c.id).gstr9);
    if (quickFilter === 'Pending') return baseDisplayList.filter(c => !getStatus(c.id).gstr9);
    return baseDisplayList;
  }, [baseDisplayList, quickFilter, getStatus]);

  const groupedClients = useMemo(() => {
    const groups: Record<string, typeof filteredDisplayList> = {};
    filteredDisplayList.forEach(c => {
      const sector = getSectorGroupLabel(c);
      if (!groups[sector]) groups[sector] = [];
      groups[sector].push(c);
    });
    const sortedKeys = Object.keys(groups).sort((a, b) => {
       if (a.startsWith('Uncategorized')) return 1;
       if (b.startsWith('Uncategorized')) return -1;
       return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    return sortedKeys.map(k => ({ sector: k, clients: groups[k].sort((c1, c2) => (c1.tradeName || '').localeCompare(c2.tradeName || '')) }));
  }, [filteredDisplayList]);

  const handleUpdatePassword = async () => {
    if (!selectedClient || !newPassVal.trim()) return;
    try {
      const updated = { ...selectedClient, gstProfile: { ...selectedClient.gstProfile!, password: newPassVal } };
      await api.saveClient(updated);
      handleRefreshClients();
      setEditingPasswordId(null);
    } catch (err) { toast.error("Update failed."); }
  };

  const handleExportCSV = () => {
    const headers = ['S.No.', 'Trade Name', 'Legal Name', 'Mobile No.', 'GSTIN', 'GSTR-9', 'GSTR-9C', 'User ID', 'Password', 'Remark'];
    const rows = filteredDisplayList.map((c, index) => [
      (index + 1).toString().padStart(2, '0'),
      c.tradeName || '---',
      c.legalName || '---',
      c.mobile || '---',
      c.gstProfile?.gstin || '---',
      getStatus(c.id).gstr9 ? 'Filed' : 'Pending',
      !is9CApplicable(c.id) ? 'N/A' : getStatus(c.id).gstr9c ? 'Filed' : 'Pending',
      c.gstProfile?.username || (c.gstProfile as any)?.gstPortalUsername || '---',
      c.gstProfile?.password || (c.gstProfile as any)?.gstPortalPassword || '---',
      getStatus(c.id).remark || ''
    ]);
    exportToCSV(headers, rows, `GSTR9_9C_Audit_FY_${selectedYear}.csv`);
  };

  const handleExportPDF = () => {
    const headers = ['S.No.', 'Trade Name', 'Legal Name', 'Mobile No.', 'GSTIN', 'GSTR-9', 'GSTR-9C', 'User ID', 'Password', 'Remark'];
    const rows = filteredDisplayList.map((c, index) => [
      (index + 1).toString().padStart(2, '0'),
      c.tradeName || '---',
      c.legalName || '---',
      c.mobile || '---',
      c.gstProfile?.gstin || '---',
      getStatus(c.id).gstr9 ? 'Filed' : 'Pending',
      !is9CApplicable(c.id) ? 'N/A' : getStatus(c.id).gstr9c ? 'Filed' : 'Pending',
      c.gstProfile?.username || (c.gstProfile as any)?.gstPortalUsername || '---',
      c.gstProfile?.password || (c.gstProfile as any)?.gstPortalPassword || '---',
      getStatus(c.id).remark || ''
    ]);
    printList(`GSTR-9 & 9C Annual Returns - FY ${selectedYear}`, headers, rows);
  };

  const handleViewProfile = (client: Client) => {
    setDetailClient(client);
    setIsDetailModalOpen(true);
  };

  const handleShareClick = (text: string) => {
    setShareText(text);
    setSelectedNote('');
    setIsShareModalOpen(true);
  };

  const proceedShare = () => {
    let finalMessage = shareText;
    if (selectedNote && selectedNote.trim()) {
      finalMessage = `${selectedNote.trim()}\n\n${shareText}`;
    }
    const encodedText = encodeURIComponent(finalMessage);
    window.open(`whatsapp://send?text=${encodedText}`, '_blank');
    setIsShareModalOpen(false);
  };

  const openActionsMenu = (e: React.MouseEvent, client: Client) => {
    e.stopPropagation();
    setActiveActionsId(client.id);
    setSelectedClient(client);
  };

  if (isClientsLoading) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* Modern Unified Single-Line Toolbar */}
      <div className="relative z-50 flex items-center justify-between gap-1.5 sm:gap-2 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs shrink-0 w-full max-w-full min-w-0 flex-nowrap overflow-visible transition-colors">
        
        {/* Left Section: Search Input + Count Dropdown + Due Dates */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 flex-nowrap">
          {/* Search input with Ctrl+K shortcut - Expanded to full available space */}
          <div className="relative group flex-1 min-w-[180px] sm:min-w-[240px]">
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search trade name, legal name, GSTIN..." 
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

          {/* Compact Due Dates */}
          {gstr9DueDate && (
            <div className="h-9 px-2 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-700 dark:text-indigo-300 whitespace-nowrap shrink-0 hidden md:flex items-center gap-1 shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-indigo-500 dark:text-indigo-400">9 Due:</span>
              <span className="font-mono tabular-nums font-bold">{formatISOToDDMMYYYY(gstr9DueDate)}</span>
            </div>
          )}

          {gstr9cDueDate && (
            <div className="h-9 px-2 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-300 whitespace-nowrap shrink-0 hidden lg:flex items-center gap-1 shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-emerald-500 dark:text-emerald-400">9C Due:</span>
              <span className="font-mono tabular-nums font-bold">{formatISOToDDMMYYYY(gstr9cDueDate)}</span>
            </div>
          )}
        </div>

        {/* Right Section: View Control, Sector Filter, Export, + Add Client, FY */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto flex-nowrap overflow-visible">
          <ViewControl 
            viewMode={viewMode} 
            onViewChange={setViewMode} 
            className="h-9 rounded-lg shrink-0"
          />

          <SectorJurisdictionFilter
            clients={allClients}
            authority={authorityFilter}
            setAuthority={setAuthorityFilter}
            selectedSectors={selectedSectors}
            setSelectedSectors={setSelectedSectors}
            buttonClassName="h-9 px-2.5 sm:px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
            totalFilteredCount={filteredDisplayList.length}
          />

          <ExportMenu onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />

          {/* + Add Client Button */}
          <button 
            type="button"
            onClick={() => { setSelectedClient(null); setAddSearch(''); setIsAddModalOpen(true); }} 
            className="h-9 px-3 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-lg font-semibold text-xs shadow-2xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95"
            title="Add client to annual return watchlist"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="whitespace-nowrap">+ Add Client</span>
          </button>

          {/* FY Selector */}
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

      <div className="relative z-10 flex-1 min-h-0 w-full max-w-full min-w-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col transition-colors">
        {viewMode === 'grid' ? (
          <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredDisplayList.map((client, idx) => {
              const statusInfo = getStatus(client.id);
              const isApp9c = is9CApplicable(client.id);
              return (
                <div key={client.id} className="p-3.5 bg-slate-50 hover:bg-white border border-slate-200 rounded-2xl shadow-xs transition-all flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">#{idx + 1}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-black text-slate-700 font-mono">{client.gstProfile?.gstin || 'NO GSTIN'}</span>
                        {client.gstProfile?.gstin && (
                          <button onClick={() => { navigator.clipboard.writeText(client.gstProfile?.gstin || ''); toast.success('GSTIN Copied!'); window.open('https://services.gst.gov.in/services/searchtp', '_blank'); }} className="p-1 text-slate-400 hover:text-indigo-600 cursor-pointer" title="Search GSTIN">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <h4 className="text-xs font-black text-slate-900 truncate" title={client.tradeName}>{client.tradeName || client.legalName}</h4>
                    <p className="text-[10px] font-bold text-slate-500 truncate">{getClientDisplayId(client)}</p>

                    {/* Credentials Card Section */}
                    <div className="mt-2 p-2 bg-white rounded-xl border border-slate-200/80 space-y-1 text-[10px]">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>User: <strong className="text-slate-900">{client.gstProfile?.username || 'N/A'}</strong></span>
                        {client.gstProfile?.username && (
                          <button onClick={() => { navigator.clipboard.writeText(client.gstProfile?.username || ''); toast.success('Username copied'); }} className="text-indigo-600 font-bold hover:underline cursor-pointer">Copy</button>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Pass: <strong className="text-indigo-600">{client.gstProfile?.password || 'N/A'}</strong></span>
                        <div className="flex items-center gap-1.5">
                          {client.gstProfile?.password && (
                            <button onClick={() => { navigator.clipboard.writeText(client.gstProfile?.password || ''); toast.success('Password copied'); }} className="text-indigo-600 font-bold hover:underline cursor-pointer">Copy</button>
                          )}
                          {client.gstProfile?.username && (
                            <button onClick={() => { navigator.clipboard.writeText(client.gstProfile?.username || ''); window.open('https://services.gst.gov.in/services/login', '_blank'); }} className="p-1 text-emerald-600 hover:text-emerald-800 cursor-pointer" title="Login to Portal">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[10px]">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[10px] border ${
                      statusInfo.gstr9 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80' 
                        : 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.gstr9 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span>GSTR-9: {statusInfo.gstr9 ? 'Filed' : 'Pending'}</span>
                    </span>

                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[10px] border ${
                      !isApp9c 
                        ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500' 
                        : statusInfo.gstr9c 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80' 
                          : 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${!isApp9c ? 'bg-slate-400 dark:bg-slate-500' : statusInfo.gstr9c ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span>GSTR-9C: {!isApp9c ? 'N/A' : statusInfo.gstr9c ? 'Filed' : 'Pending'}</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                    <GSTViewIcon client={client} onDataChange={handleRefreshClients} />
                    <button onClick={(e) => openActionsMenu(e, client)} className="px-2.5 py-1 text-[10px] font-black uppercase bg-indigo-600 text-white rounded-lg shadow-xs hover:bg-slate-900 transition-colors cursor-pointer">
                      Actions
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
        <div className="overflow-auto no-scrollbar flex-1 w-full relative h-full">
          <table className="w-full text-left border-collapse table-fixed min-w-full gstr9-returns-table min-w-[1150px]">
            <thead className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 shadow-2xs">
              <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 select-none">
                <th className="px-3 py-2 w-[50px] text-center whitespace-nowrap">S.No.</th>
                <th className="px-3 py-2 w-[24%] min-w-[170px]">Trader Name</th>
                <th className="px-3 py-2 w-[15%] min-w-[145px] whitespace-nowrap">GSTIN</th>
                <th className="px-3 py-2 w-[11%] min-w-[110px] text-center whitespace-nowrap">
                   <div className="flex justify-center flex-col items-center">
                     <TableFilter label="GSTR-9" isActive={gstr9Filter !== 'All'}>
                       {['All', 'Filed', 'Pending'].map(f => <button key={f} onClick={() => setGstr9Filter(f as any)} className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer ${gstr9Filter === f ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>{f}</button>)}
                     </TableFilter>
                   </div>
                </th>
                <th className="px-3 py-2 w-[11%] min-w-[110px] text-center whitespace-nowrap">
                   <div className="flex justify-center flex-col items-center">
                     <TableFilter label="GSTR-9C" isActive={gstr9cFilter !== 'All'}>
                       {['All', 'Filed', 'Pending', 'N/A'].map(f => <button key={f} onClick={() => setGstr9cFilter(f as any)} className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer ${gstr9cFilter === f ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>{f}</button>)}
                     </TableFilter>
                   </div>
                </th>
                <th className="px-3 py-2 w-[12%] min-w-[110px] whitespace-nowrap">User ID</th>
                <th className="px-3 py-2 w-[12%] min-w-[110px] whitespace-nowrap">Password</th>
                <th className="px-3 py-2 w-[15%] min-w-[150px]">Remark</th>
                <th className="sticky top-0 right-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 border-b border-slate-200/90 dark:border-slate-700/90 text-right min-w-[115px] w-[115px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {groupedClients.map(({ sector, clients: sectorClients }) => (
                <React.Fragment key={sector}>
                  <tr>
                    <td colSpan={9} className="sticky top-[33px] z-20 bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-md font-bold text-slate-800 dark:text-slate-200 py-1 px-3 uppercase text-[10px] tracking-wider border-y border-slate-200 dark:border-slate-700/80 shadow-2xs">{sector} ({sectorClients.length})</td>
                  </tr>
                  {sectorClients.map((client, idx) => {
                const st = getStatus(client.id);
                const app9c = is9CApplicable(client.id);
                const isEditingPass = editingPasswordId === client.id;
                const theme = getClientColorTheme(client);
                return (
                  <tr key={client.id} className={`transition-all group border-b border-slate-100 dark:border-slate-800/60 hover:bg-indigo-50/30 dark:hover:bg-slate-800/40 animate-in fade-in slide-in-from-bottom-1 duration-150 ${theme.rowClass}`}>
                    <td className="px-3 py-1.5 font-black text-indigo-400 font-mono text-center whitespace-nowrap">{(idx + 1).toString().padStart(2, '0')}</td>
                    <td className={`px-3 py-1.5 truncate min-w-[170px] ${theme.tradeNameClass}`} title={client.tradeName}>
                      <div className="font-semibold truncate text-[var(--app-font-size)]">{client.tradeName || '---'}</div>
                      <p className="legal-subtitle truncate font-medium" title={client.legalName}>{client.legalName || '---'}</p>
                    </td>
   
                    <td className="px-3 py-1.5 whitespace-nowrap">
                       <div className="flex items-center gap-1.5 group/gstin">
                          <span className={`truncate font-semibold tracking-wider font-mono uppercase ${theme.gstinClass}`}>{client.gstProfile?.gstin || '---'}</span>
                          {client.gstProfile?.gstin && (
                            <button onClick={() => (navigator.clipboard.writeText(client.gstProfile?.gstin || '').then(() => { toast.success('GSTIN Copied!'); window.open('https://services.gst.gov.in/services/searchtp', '_blank'); }))} className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0 cursor-pointer" title="Search Taxpayer">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </button>
                          )}
                       </div>
                    </td>
                    <td className="px-3 py-1.5 text-center whitespace-nowrap">
                       <button 
                         type="button"
                         onClick={() => toggleStatus(client.id, 'gstr9')} 
                         className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-tight border transition-all cursor-pointer active:scale-95 shadow-2xs ${
                           st.gstr9 
                             ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80 hover:bg-emerald-100/80' 
                             : 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80 hover:bg-amber-100/80'
                         }`}
                         title="Click to toggle GSTR-9 (Pending / Filed)"
                       >
                         <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${st.gstr9 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                         <span>{st.gstr9 ? 'Filed' : 'Pending'}</span>
                       </button>
                    </td>
                    <td className="px-3 py-1.5 text-center whitespace-nowrap">
                       {app9c ? (
                         <button 
                           type="button"
                           onClick={() => toggleStatus(client.id, 'gstr9c')} 
                           className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-tight border transition-all cursor-pointer active:scale-95 shadow-2xs ${
                             st.gstr9c 
                               ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80 hover:bg-emerald-100/80' 
                               : 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80 hover:bg-amber-100/80'
                           }`}
                           title="Click to toggle GSTR-9C (Pending / Filed)"
                         >
                           <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${st.gstr9c ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                           <span>{st.gstr9c ? 'Filed' : 'Pending'}</span>
                         </button>
                       ) : (
                         <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-tight border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                           <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                           <span>N/A</span>
                         </span>
                       )}
                    </td>
                    <td className="px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-300 truncate">{client.gstProfile?.username || '---'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap relative group/pass">
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isEditingPass ? (
                          <input 
                            autoFocus 
                            value={newPassVal} 
                            onChange={e => setNewPassVal(e.target.value)} 
                            onBlur={handleUpdatePassword} 
                            onKeyDown={e => e.key === 'Enter' && handleUpdatePassword()} 
                            className="bg-white border border-indigo-200 rounded px-2 h-6 font-semibold text-xs w-20 outline-none shadow-2xs" 
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-semibold text-indigo-600 dark:text-indigo-400 font-mono truncate">{client.gstProfile?.password || '---'}</span>
                            <button 
                              onClick={() => { setSelectedClient(client); setEditingPasswordId(client.id); setNewPassVal(client.gstProfile?.password || ''); }} 
                              className="p-0.5 text-slate-300 hover:text-amber-500 opacity-0 group-hover/pass:opacity-100 transition-all shrink-0 cursor-pointer"
                              title="Edit Password"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                            {client.gstProfile?.username && (
                              <button 
                                onClick={() => { 
                                  navigator.clipboard.writeText(client.gstProfile?.username || ''); 
                                  window.open('https://services.gst.gov.in/services/login', '_blank'); 
                                }} 
                                className="p-0.5 text-slate-300 hover:text-indigo-600 opacity-0 group-hover/pass:opacity-100 transition-all shrink-0 cursor-pointer" 
                                title="Login to GST Portal"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 truncate" title={st.remark || 'Add remark...'}>
                       <EditableRemark value={st.remark || ''} onSave={val => updateRemark(client.id, val)} />
                    </td>
                    <td className="sticky right-0 bg-white/95 dark:bg-slate-900/95 group-hover:bg-indigo-50/40 dark:group-hover:bg-slate-850 backdrop-blur-md z-20 px-3 py-1.5 text-right min-w-[115px] w-[115px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                       <div className="flex items-center justify-end gap-1.5">
                          <GSTViewIcon client={client} onDataChange={handleRefreshClients} />
                          <button onClick={(e) => openActionsMenu(e, client)} className="h-8 w-8 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 flex items-center justify-center shadow-2xs transition-all cursor-pointer"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg></button>
                       </div>
                    </td>
                  </tr>
                  );
                })}
                </React.Fragment>
              ))}
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
                    {selectedClient.gstProfile?.gstin ? 'GST REG' : 'NO GST'}
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                  {selectedClient.tradeName || selectedClient.legalName}
                </h4>
                <p className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 truncate">
                  {selectedClient.gstProfile?.gstin || selectedClient.legalName || '---'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveActionsId(null)}
                className="h-7 w-7 rounded-xl bg-slate-200/60 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer text-xs shrink-0"
                title="Close (Esc)"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Action Buttons */}
            <div className="overflow-y-auto p-2 space-y-1 no-scrollbar flex-1">
              {/* View Complete Profile Dossier */}
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
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 block truncate">View Complete Profile</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Vault Dossier & Credentials</span>
                </div>
              </button>

              {/* Edit / Modify Client Form */}
              <button 
                type="button"
                onClick={() => { 
                  setIsEditModalOpen(true); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-base shrink-0">
                  ✏️
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">Edit Client Form</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Modify details & credentials</span>
                </div>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* View / Download Certificate Modal - REG-06 option */}
              <button 
                type="button"
                onClick={() => { 
                  setIsCertModalOpen(true); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-sm shrink-0">
                  📜
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">View REG-06 Certificate</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Official Government PDF & Print</span>
                </div>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* Portals Direct Login */}
              <div className="px-3 py-1 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Official Portals</span>
                <span className="text-[10px] text-slate-400">Login Assistant</span>
              </div>

              {/* 1. GST Portal */}
              <button 
                type="button"
                onClick={() => { setLoginToolClient(selectedClient); setLoginPortalType('gst'); setIsLoginBoxOpen(true); setActiveActionsId(null); }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs shrink-0">🔐</div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">GST Portal Direct Login</span>
                  <span className="text-[10px] text-slate-400 block truncate">{selectedClient?.gstProfile?.username || selectedClient?.gstProfile?.gstin || 'View ID & Password'}</span>
                </div>
              </button>

              {/* 2. E-Way Bill */}
              <button 
                type="button"
                onClick={() => { setLoginToolClient(selectedClient); setLoginPortalType('eway'); setIsLoginBoxOpen(true); setActiveActionsId(null); }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs shrink-0">🚚</div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">E-Way Bill Direct Login</span>
                  <span className="text-[10px] text-slate-400 block truncate">{selectedClient?.gstProfile?.ewayBillId || 'View ID & Password'}</span>
                </div>
              </button>

              {/* 3. GSTAT Portal */}
              <button 
                type="button"
                onClick={() => { setLoginToolClient(selectedClient); setLoginPortalType('gstat'); setIsLoginBoxOpen(true); setActiveActionsId(null); }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400 text-xs shrink-0">⚖️</div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">GSTAT Portal Direct Login</span>
                  <span className="text-[10px] text-slate-400 block truncate">{selectedClient?.gstProfile?.gstatId || 'View ID & Password'}</span>
                </div>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* Share Credentials & Profile */}
              <button 
                type="button"
                onClick={() => {
                  setIsCredentialShareModalOpen(true);
                  setActiveActionsId(null);
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs shrink-0">🔑</div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">Share Login Credentials</span>
              </button>

              <button 
                type="button"
                onClick={() => { 
                  const fullText = `*Client Details*\nTrade Name: ${selectedClient.tradeName || 'N/A'}\nLegal Name: ${selectedClient.legalName || 'N/A'}\nMobile: ${selectedClient.mobile || 'N/A'}\nEmail: ${selectedClient.email || 'N/A'}\n\n*GST Details*\nGSTIN: ${selectedClient.gstProfile?.gstin || 'N/A'}\nStatus: ${selectedClient.gstProfile?.gstStatus || 'N/A'}\nReg Type: ${selectedClient.gstProfile?.regType || 'N/A'}\nFiling: ${selectedClient.gstProfile?.filingFreq || 'N/A'}\nReg Date: ${formatDate(selectedClient.gstProfile?.regDate)}\nJurisdiction: ${selectedClient.gstProfile?.jurisdictionType || 'N/A'}\nSector/Range: ${selectedClient.gstProfile?.sector || selectedClient.gstProfile?.range || 'N/A'}\n9C Applies: ${is9CApplicable(selectedClient.id) ? 'YES' : 'NO'}\n\n*Credentials*\nGST User ID: ${selectedClient.gstProfile?.username || 'N/A'}\nGST Password: ${selectedClient.gstProfile?.password || 'N/A'}\n\n*IT Details*\nPAN: ${selectedClient.itProfile?.pan || 'N/A'}\nIT User ID: ${selectedClient.itProfile?.username || 'N/A'}\nIT Password: ${selectedClient.itProfile?.password || 'N/A'}`;
                  handleShareClick(fullText);
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-xs shrink-0">📋</div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">Full Profile Summary</span>
              </button>

              <button 
                type="button"
                onClick={() => { 
                  const text = `*Entity Profile*\nTrade Name: ${selectedClient.tradeName || 'N/A'}\nLegal Name: ${selectedClient.legalName || 'N/A'}\nMobile: ${selectedClient.mobile || 'N/A'}\nEmail: ${selectedClient.email || 'N/A'}\n\n*GST Details*\nGSTIN: ${selectedClient.gstProfile?.gstin || 'N/A'}\nStatus: ${selectedClient.gstProfile?.gstStatus || 'N/A'}\nReg Type: ${selectedClient.gstProfile?.regType || 'N/A'}\nFiling: ${selectedClient.gstProfile?.filingFreq || 'N/A'}\nReg Date: ${formatDate(selectedClient.gstProfile?.regDate)}\nJurisdiction: ${selectedClient.gstProfile?.jurisdictionType || 'N/A'}\nSector/Range: ${selectedClient.gstProfile?.sector || selectedClient.gstProfile?.range || 'N/A'}\n9C Applies: ${is9CApplicable(selectedClient.id) ? 'YES' : 'NO'}\n\n*Credentials*\nGST User ID: ${selectedClient.gstProfile?.username || 'N/A'}\nGST Password: ${selectedClient.gstProfile?.password || 'N/A'}`;
                  window.location.href = `whatsapp://send?text=${encodeURIComponent(text)}`;
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs shrink-0">💬</div>
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 truncate">Quick WhatsApp Share</span>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* 9C Specific: Edit Applicability */}
              <button 
                type="button"
                onClick={() => { 
                  setIsEditApplicabilityOpen(true); 
                  setIs9CApplicableState(is9CApplicable(selectedClient.id)); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs shrink-0">📊</div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 block truncate">Edit Audit Applicability</span>
                  <span className="text-[10px] text-slate-400 block truncate">GSTR-9C Requirement Status</span>
                </div>
              </button>

              {/* 9C Specific: Remove from List */}
              <button 
                type="button"
                onClick={() => { 
                  if (confirm(`Remove "${selectedClient.tradeName || selectedClient.legalName}" from audit list?`)) {
                    removeFromWatchlist(selectedClient.id); 
                  }
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center text-rose-500 dark:text-rose-400 text-xs shrink-0">🗑️</div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 block truncate">Delete from List</span>
                  <span className="text-[10px] text-slate-400 block truncate">Remove from Audit Watchlist</span>
                </div>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Share Modal with Note Templates */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2">Add a Note to Message</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">You can choose a quick template or type your custom message below.</p>
            <textarea
              className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-xs text-slate-900 dark:text-slate-100 outline-none h-28 mb-3 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
              placeholder="Select a note or type here..."
              value={selectedNote}
              onChange={(e) => setSelectedNote(e.target.value)}
            />
            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-5">
               {(() => {
                 try {
                   const saved = localStorage.getItem('clientify_custom_templates');
                   const templates = saved ? JSON.parse(saved) : [];
                   return (templates || []).map((t: any, i: number) => (
                     <button key={i} onClick={() => setSelectedNote(t.text)} className="shrink-0 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer">{t.label}</button>
                   ));
                 } catch (e) {
                   return null;
                 }
               })()}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setIsShareModalOpen(false)} className="flex-1 py-2.5 text-slate-600 dark:text-slate-400 font-semibold text-xs border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer">Cancel</button>
              <button onClick={proceedShare} className="flex-1 py-2.5 bg-emerald-600 text-white font-semibold text-xs rounded-xl shadow-md hover:bg-emerald-700 transition-colors cursor-pointer">Send on WhatsApp</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Form Modal */}
      {isEditModalOpen && selectedClient && (
        <GSTClientFormModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedClient(null);
          }}
          onSave={async (updatedClient) => {
            try {
              await api.saveClient(updatedClient);
              setIsEditModalOpen(false);
              setSelectedClient(null);
              handleRefreshClients();
              toast.success('Client updated successfully');
            } catch (err: any) {
              toast.error(err?.message || 'Failed to update client');
            }
          }}
          initialData={selectedClient}
        />
      )}

      {/* Login Tool Box Modal */}
      <GSTPortalLoginModal
        isOpen={isLoginBoxOpen}
        onClose={() => setIsLoginBoxOpen(false)}
        client={loginToolClient}
        onDataChange={handleRefreshClients}
        initialType={loginPortalType}
      />

      {/* GST Certificate Modal */}
      <GSTCertificateModal
        isOpen={isCertModalOpen}
        onClose={() => setIsCertModalOpen(false)}
        client={selectedClient}
        onUpdateCertificate={async (b64, name) => {
          if (!selectedClient) return;
          const updated: Partial<Client> = {
            ...selectedClient,
            gstProfile: {
              ...(selectedClient.gstProfile as any),
              gstCertificate: b64,
              gstCertificateName: name
            }
          };
          await api.saveClient(updated);
          handleRefreshClients();
          toast.success("GST Certificate updated!");
        }}
      />

      {/* Credential Share Modal */}
      <CredentialShareModal
        isOpen={isCredentialShareModalOpen}
        onClose={() => setIsCredentialShareModalOpen(false)}
        client={selectedClient}
        mode="gst"
      />

      {/* Full Detail Dossier Modal */}
      <GSTDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setDetailClient(null);
        }}
        client={detailClient}
        onEdit={(c) => {
          setIsDetailModalOpen(false);
          setSelectedClient(c);
          setIsEditModalOpen(true);
        }}
        onDataChange={handleRefreshClients}
      />

      {/* ADD CLIENT MODAL (FORMERLY TRACK ENTITY) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 sm:p-7 space-y-5 animate-in zoom-in-95 border border-slate-200 dark:border-slate-800">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">Add Client to Audit</h3>
                  <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold rounded-md font-mono">
                    FY {selectedYear}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Enroll client into GSTR-9 and 9C annual return filing list.
                </p>
              </div>
              <button 
                type="button"
                onClick={() => { setIsAddModalOpen(false); setSelectedClient(null); setTurnoverState(''); }} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Client Search / Selection */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                  Select Taxpayer
                </label>
                
                {selectedClient ? (
                  <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {selectedClient.tradeName || selectedClient.legalName}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {selectedClient.legalName}
                      </p>
                      <p className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                        {selectedClient.gstProfile?.gstin || 'NO GSTIN'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClient(null);
                        setAddSearch('');
                      }}
                      className="px-2 py-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative">
                      <input 
                        type="text" 
                        className="w-full h-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-8 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all uppercase"
                        placeholder="Search Trade Name or GSTIN..." 
                        value={addSearch} 
                        onChange={(e) => { 
                          setAddSearch(e.target.value);
                          setSelectedClient(null);
                        }} 
                      />
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      {addSearch && (
                        <button
                          type="button"
                          onClick={() => setAddSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {addSearch.length > 0 && !selectedClient && (
                      <div className="absolute top-full mt-1.5 z-50 left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-h-52 overflow-y-auto no-scrollbar p-1">
                        {(() => {
                          const results = allClients
                            .filter(c => !((watchlist[selectedYear] || []).includes(c.id)))
                            .filter(c => ((c.tradeName || c.legalName || '').toLowerCase().includes(addSearch.toLowerCase()) || (c.gstProfile?.gstin || '').toLowerCase().includes(addSearch.toLowerCase())))
                            .slice(0, 15);

                          if (results.length === 0) {
                            return (
                              <div className="py-4 text-center text-xs text-slate-400">
                                No clients found or already in audit list.
                              </div>
                            );
                          }

                          return results.map(c => (
                            <button 
                              key={c.id} 
                              type="button" 
                              onClick={() => {
                                setSelectedClient(c); 
                                setAddSearch('');
                                setIs9CApplicableState(true);
                                setTurnoverState('');
                              }} 
                              className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer group"
                            >
                              <p className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                                {c.tradeName || '---'}
                              </p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {c.legalName ? `Legal: ${c.legalName}` : '---'}
                              </p>
                              <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono font-bold mt-0.5">
                                {c.gstProfile?.gstin || 'NO GSTIN'}
                              </p>
                            </button>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selectedClient && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1.5 block tracking-wider">
                      Annual Aggregate Turnover (₹)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                      <input 
                        type="number" 
                        placeholder="e.g. 55000000" 
                        value={turnoverState} 
                        onChange={(e) => {
                          const val = e.target.value;
                          setTurnoverState(val);
                          const t = Number(val);
                          if (t > 50000000) setIs9CApplicableState(true);
                          else if (t && t <= 50000000) setIs9CApplicableState(false);
                        }} 
                        className="w-full h-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-7 pr-3 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono" 
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1">
                      <span className="text-amber-500">💡</span> Turnover &gt; ₹5 Cr requires mandatory GSTR-9C reconciliation.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100">GSTR-9C Reconciliation Audit</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">Include reconciliation statement & certification</p>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setIs9CApplicableState(!is9CApplicableState)} 
                      className={`h-6 w-11 rounded-full transition-all relative p-0.5 cursor-pointer shrink-0 ${
                        is9CApplicableState ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <div className={`h-5 w-5 bg-white rounded-full shadow-sm transition-all ${
                        is9CApplicableState ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button 
                type="button"
                onClick={() => { setIsAddModalOpen(false); setSelectedClient(null); setTurnoverState(''); }}
                className="flex-1 h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={!selectedClient} 
                onClick={() => { 
                  addToWatchlist(selectedClient.id, is9CApplicableState); 
                  setIsAddModalOpen(false); 
                  setSelectedClient(null); 
                  setTurnoverState(''); 
                  toast.success('Client added to annual audit list!');
                }} 
                className="flex-[2] h-9 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-xs shadow-xs transition-all cursor-pointer active:scale-95"
              >
                Add to Audit List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT APPLICABILITY MODAL */}
      {isEditApplicabilityOpen && selectedClient && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 space-y-5 animate-in zoom-in-95 border border-slate-200 dark:border-slate-800">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">Audit Applicability</h3>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5 truncate">{selectedClient.tradeName || selectedClient.legalName}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">GSTR-9C Requirement</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Reconciliation audit status for FY {selectedYear}</p>
              </div>
              <button 
                type="button"
                onClick={() => setIs9CApplicableState(!is9CApplicableState)} 
                className={`h-6 w-11 rounded-full transition-all relative p-0.5 cursor-pointer shrink-0 ${
                  is9CApplicableState ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <div className={`h-5 w-5 bg-white rounded-full shadow-sm transition-all ${
                  is9CApplicableState ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button 
                type="button"
                onClick={() => setIsEditApplicabilityOpen(false)} 
                className="flex-1 h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={() => { 
                  update9CApplicability(selectedClient.id, is9CApplicableState); 
                  setIsEditApplicabilityOpen(false); 
                  toast.success('GSTR-9C requirement updated');
                }} 
                className="flex-[2] h-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs shadow-xs transition-all cursor-pointer active:scale-95"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GSTR9_9C;
