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
import { useGSTR4Logic } from './GSTR4logic';
import { EditableRemark } from '../../../components/EditableRemark';
import { YEARS, isClientVisibleInFY } from '../GSTReturn/filinglogic/MonthlyFilingLogic';
import { toast } from 'sonner';
import { ExportMenu } from '../../../components/ExportMenu';
import { exportToCSV, printList, getSectorGroupLabel, getClientColorTheme } from '../../../exportUtils';
import { useGlobalDueDates } from '../../../hooks/useGlobalDueDates';
import { formatISOToDDMMYYYY } from '../../../dateUtils';
import { ViewControl } from '../../../components/ViewControl';
import { CustomSelect } from '../../../components/CustomSelect';

const GSTR4: React.FC = () => {
  const queryClient = useQueryClient();
  const getPreviousFY = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const startYear = currentMonth >= 3 ? currentYear - 1 : currentYear - 2;
    return `${startYear}-${(startYear + 1).toString().slice(-2)}`;
  };

  const { data: pageData, isLoading: isPageLoading } = useModuleData('gstr4_filing_page_data');

  const clients = useMemo(() => pageData?.clients || [], [pageData]);
  const allClientsBase = clients;

  const [search, setSearch] = useState('');
  const [selectedYear, setSelectedYear] = useState(getPreviousFY());
  
  const { getGlobalDueDate } = useGlobalDueDates(selectedYear);
  const gstr4DueDate = getGlobalDueDate('annual_gstr4', 'Annual');

  const [quickFilter, setQuickFilter] = useState<'All' | 'Filed' | 'Pending'>('All');
  const [authorityFilter, setAuthorityFilter] = useState<'All' | 'State' | 'Center'>('All');
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Modals & Tools
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [editingPasswordId, setEditingPasswordId] = useState<string | null>(null);
  const [newPassVal, setNewPassVal] = useState('');
  
  // Actions Menu State
  const [activeActionsId, setActiveActionsId] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  // Modals
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

  const { getStatus, toggleStatus, updateRemark } = useGSTR4Logic(
    selectedYear,
    pageData?.filingData,
    pageData?.dueDates
  );

  const cmp08Data = useMemo<Record<string, Record<string, { cmp08: boolean }>>>(() => pageData?.cmp08Data || {}, [pageData]);

  const isClientsLoading = isPageLoading && !pageData;

  const handleRefreshClients = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['gstr4_filing_page_data'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  }, [queryClient]);

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
    const sameGroup = allClientsBase.filter(c => 
      c.gstProfile?.jurisdictionType === client.gstProfile?.jurisdictionType &&
      (isState ? c.gstProfile?.sector === val : c.gstProfile?.range === val)
    ).sort((a, b) => (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime()));
    const rank = sameGroup.findIndex(c => c.id === client.id) + 1;
    return `${prefix}/${val || '?'}/${rank}`;
  }, [allClientsBase]);

  const stats = useMemo(() => {
    let total = 0, filed = 0, pending = 0;
    const baseClients = clients.filter(c => isClientVisibleInFY(c, selectedYear));
    total = baseClients.length;
    baseClients.forEach(c => {
      if (getStatus(c.id).filed) filed++;
      else pending++;
    });
    return { total, filed, pending };
  }, [clients, selectedYear, getStatus]);

  const filterOptions = useMemo(() => [
    { label: 'Total Clients', shortLabel: 'Total', value: 'All' as const, count: stats.total, dot: 'bg-indigo-500' },
    { label: 'GSTR-4 Filed', shortLabel: 'Filed', value: 'Filed' as const, count: stats.filed, dot: 'bg-emerald-500' },
    { label: 'Pending Filing', shortLabel: 'Pending', value: 'Pending' as const, count: stats.pending, dot: 'bg-rose-500' },
  ], [stats]);

  const currentFilterOption = filterOptions.find(opt => opt.value === quickFilter) || filterOptions[0];

  useEffect(() => {
    const syncHandler = () => handleRefreshClients();
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, [handleRefreshClients]);

  const filteredClients = useMemo(() => {
    let list = clients.filter(c => 
      isClientVisibleInFY(c, selectedYear) &&
      ((c.legalName || '').toLowerCase().includes(search.toLowerCase()) || 
       (c.tradeName || '').toLowerCase().includes(search.toLowerCase()) || 
       (c.gstProfile?.gstin || '').toLowerCase().includes(search.toLowerCase()))
    );
    if (quickFilter !== 'All') list = list.filter(c => quickFilter === 'Filed' ? getStatus(c.id).filed : !getStatus(c.id).filed);
    list = filterClientsBySectorJurisdiction(list, authorityFilter, selectedSectors);
    return list;
  }, [clients, search, quickFilter, authorityFilter, selectedSectors, getStatus, selectedYear]);

  const handleUpdatePassword = async () => {
    if (!selectedClient || !newPassVal.trim()) return;
    try {
      const updated = { ...selectedClient, gstProfile: { ...selectedClient.gstProfile!, password: newPassVal } };
      await api.saveClient(updated);
      handleRefreshClients();
      setEditingPasswordId(null);
    } catch (err) { toast.error("Update failed."); }
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

  const groupedClients = useMemo(() => {
    const groups: Record<string, typeof filteredClients> = {};
    filteredClients.forEach(c => {
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
  }, [filteredClients]);

  const handleExportCSV = () => {
    const headers = ['S.No.', 'Trade Name', 'Legal Name', 'Mobile No.', 'GSTIN', 'CMP-08 Status (Q1-Q4)', 'GSTR-4 Status', 'User ID', 'Password', 'Remark'];
    const rows = filteredClients.map((c, index) => {
      const qStatuses = ['Q1', 'Q2', 'Q3', 'Q4'].map((qLabel, i) => {
        const fullQ = ['April-June (Q1)', 'July-September (Q2)', 'October-December (Q3)', 'January-March (Q4)'][i];
        const isFiled = cmp08Data[`${selectedYear}_${fullQ}`]?.[c.id]?.cmp08;
        return `${qLabel}:${isFiled ? 'F' : 'P'}`;
      }).join(' ');
      return [
        (index + 1).toString().padStart(2, '0'),
        c.tradeName || '---',
        c.legalName || '---',
        c.mobile || '---',
        c.gstProfile?.gstin || '---',
        qStatuses,
        getStatus(c.id).filed ? 'Filed' : 'Pending',
        c.gstProfile?.username || c.gstProfile?.gstPortalUsername || '---',
        c.gstProfile?.password || c.gstProfile?.gstPortalPassword || '---',
        getStatus(c.id).remark || ''
      ];
    });
    exportToCSV(headers, rows, `GSTR4_Composition_Annual_${selectedYear}.csv`);
  };

  const handleExportPDF = () => {
    const headers = ['S.No.', 'Trade Name', 'Legal Name', 'Mobile No.', 'GSTIN', 'CMP-08 (Q1-Q4)', 'GSTR-4 Status', 'User ID', 'Password', 'Remark'];
    const rows = filteredClients.map((c, index) => {
      const qStatuses = ['Q1', 'Q2', 'Q3', 'Q4'].map((qLabel, i) => {
        const fullQ = ['April-June (Q1)', 'July-September (Q2)', 'October-December (Q3)', 'January-March (Q4)'][i];
        const isFiled = cmp08Data[`${selectedYear}_${fullQ}`]?.[c.id]?.cmp08;
        return `${qLabel}:${isFiled ? 'F' : 'P'}`;
      }).join(' ');
      return [
        (index + 1).toString().padStart(2, '0'),
        c.tradeName || '---',
        c.legalName || '---',
        c.mobile || '---',
        c.gstProfile?.gstin || '---',
        qStatuses,
        getStatus(c.id).filed ? 'Filed' : 'Pending',
        c.gstProfile?.username || c.gstProfile?.gstPortalUsername || '---',
        c.gstProfile?.password || c.gstProfile?.gstPortalPassword || '---',
        getStatus(c.id).remark || ''
      ];
    });
    printList(`GSTR-4 Composition Annual Filing - FY ${selectedYear}`, headers, rows);
  };

  if (isClientsLoading) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* Modern Unified Single-Line Toolbar */}
      <div className="relative z-50 flex items-center justify-between gap-1.5 sm:gap-2 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs shrink-0 w-full max-w-full min-w-0 flex-nowrap overflow-visible transition-colors">
        
        {/* Left Section: Search Input + Count Dropdown + Due Date */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 flex-nowrap">
          {/* Search Bar - Expanded to full available space */}
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
              <div className="absolute left-0 mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-[100] p-1.5 animate-in zoom-in-95 origin-top-left">
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
          {gstr4DueDate && (
            <div className="h-9 px-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-700 dark:text-indigo-300 whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-indigo-500 dark:text-indigo-400">GSTR-4 Due:</span>
              <span className="font-mono tabular-nums font-bold">{formatISOToDDMMYYYY(gstr4DueDate)}</span>
            </div>
          )}
        </div>

        {/* Right Section: View Control, Sector Filter, Export, FY */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto flex-nowrap overflow-visible">
          <ViewControl 
            viewMode={viewMode} 
            onViewChange={setViewMode} 
            className="h-9 rounded-lg shrink-0"
          />

          <SectorJurisdictionFilter
            clients={clients}
            authority={authorityFilter}
            setAuthority={setAuthorityFilter}
            selectedSectors={selectedSectors}
            setSelectedSectors={setSelectedSectors}
            buttonClassName="h-9 px-2.5 sm:px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
            totalFilteredCount={filteredClients.length}
          />

          <ExportMenu onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />

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
            {filteredClients.map((client, idx) => {
              const status = getStatus(client.id);
              const theme = getClientColorTheme(client);
              return (
                <div key={client.id} className="p-3.5 bg-slate-50 hover:bg-white border border-slate-200 rounded-2xl shadow-xs transition-all flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">#{idx + 1}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-slate-700 font-mono">{client.gstProfile?.gstin || 'NO GSTIN'}</span>
                        {client.gstProfile?.gstin && (
                          <button onClick={() => { navigator.clipboard.writeText(client.gstProfile?.gstin || ''); toast.success('GSTIN Copied!'); window.open('https://services.gst.gov.in/services/searchtp', '_blank'); }} className="p-0.5 text-slate-400 hover:text-indigo-600 transition-colors inline-flex" title="Search GSTIN">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <h4 className="text-xs font-black text-slate-900 truncate" title={client.tradeName}>{client.tradeName || client.legalName}</h4>
                    <p className="text-[10px] font-bold text-slate-500 truncate mb-2">{client.legalName}</p>
                    
                    {/* Credentials Section with Edit/Login Buttons */}
                    <div className="mt-2 p-2.5 bg-white rounded-xl border border-slate-200/80 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="font-bold text-[9px] text-slate-400 uppercase">ID:</span>
                        <span className="font-mono font-bold text-slate-800">{client.gstProfile?.username || '---'}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="font-bold text-[9px] text-slate-400 uppercase">PWD:</span>
                        <div className="flex items-center gap-1">
                          {editingPasswordId === client.id ? (
                            <input 
                              autoFocus 
                              value={newPassVal} 
                              onChange={e => setNewPassVal(e.target.value)} 
                              onBlur={handleUpdatePassword} 
                              onKeyDown={e => e.key === 'Enter' && handleUpdatePassword()} 
                              className="bg-white border border-indigo-200 rounded px-1.5 py-0.5 text-[10px] font-bold w-20 outline-none h-5" 
                            />
                          ) : (
                            <>
                              <span className="font-mono font-bold text-indigo-600">{client.gstProfile?.password || '---'}</span>
                              <button 
                                onClick={() => { setSelectedClient(client); setEditingPasswordId(client.id); setNewPassVal(client.gstProfile?.password || ''); }} 
                                className="p-0.5 text-slate-300 hover:text-amber-500 transition-all"
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
                                  className="p-0.5 text-slate-300 hover:text-indigo-600 transition-all" 
                                  title="Login to Portal"
                                >
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[11px]">
                    <span className="font-semibold text-slate-500 dark:text-slate-400">GSTR-4 Status:</span>
                    <button 
                      type="button"
                      onClick={() => toggleStatus(client.id)} 
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-tight border transition-all cursor-pointer active:scale-95 shadow-2xs ${
                        status.filed 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80 hover:bg-emerald-100/80' 
                          : 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80 hover:bg-amber-100/80'
                      }`}
                      title="Click to toggle GSTR-4 Status (Pending / Filed)"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${status.filed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span>{status.filed ? 'Filed' : 'Pending'}</span>
                    </button>
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
        <div className="w-full overflow-x-auto overflow-y-auto no-scrollbar flex-1 relative h-full">
          <table className="w-full text-left border-collapse table-auto min-w-[1100px] gst-portfolio-table">
            <thead className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 shadow-2xs">
              <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 select-none">
                <th className="px-3 py-2 w-12 text-center whitespace-nowrap">S.No.</th>
                <th className="px-3 py-2 min-w-[180px] w-[22%] whitespace-nowrap">Trader Name</th>
                <th className="px-3 py-2 min-w-[160px] w-[15%] whitespace-nowrap">GSTIN</th>
                <th className="px-3 py-2 min-w-[180px] w-[15%] text-center whitespace-nowrap">CMP-08 Status</th>
                <th className="px-3 py-2 min-w-[125px] w-[12%] text-center whitespace-nowrap">
                  <div className="flex justify-center flex-col items-center">
                    <TableFilter label="GSTR-4" isActive={quickFilter !== 'All'}>
                      {['All', 'Filed', 'Pending'].map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setQuickFilter(f as any)}
                          className="w-full text-left px-3 py-2 text-xs font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          {f}
                        </button>
                      ))}
                    </TableFilter>
                  </div>
                </th>
                <th className="px-3 py-2 min-w-[110px] w-[11%] whitespace-nowrap">User ID</th>
                <th className="px-3 py-2 min-w-[120px] w-[11%] whitespace-nowrap">Password</th>
                <th className="px-3 py-2 min-w-[130px] w-[11%] whitespace-nowrap">Remark</th>
                <th className="sticky top-0 right-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 border-b border-slate-200/90 dark:border-slate-700/90 text-right min-w-[115px] w-[115px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[var(--app-font-size)]">
              {groupedClients.map(({ sector, clients: sectorClients }) => (
                <React.Fragment key={sector}>
                  <tr>
                    <td colSpan={9} className="sticky top-[33px] z-20 bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-md font-bold text-slate-800 dark:text-slate-200 py-1 px-3 uppercase text-[10px] tracking-wider border-y border-slate-200 dark:border-slate-700/80 shadow-2xs whitespace-nowrap">
                      {sector} ({sectorClients.length})
                    </td>
                  </tr>
                  {sectorClients.map((client, idx) => {
                    const status = getStatus(client.id);
                    const isEditingPass = editingPasswordId === client.id;
                    const theme = getClientColorTheme(client);
                    return (
                      <tr key={client.id} className={`transition-all group border-b border-slate-100 dark:border-slate-800/60 hover:bg-indigo-50/30 dark:hover:bg-slate-800/40 animate-in fade-in slide-in-from-bottom-1 duration-150 ${theme.rowClass}`}>
                        <td className="px-3 py-2 font-bold text-indigo-500 font-mono text-center w-12 whitespace-nowrap">{(idx + 1).toString().padStart(2, '0')}</td>
                        <td className={`px-3 py-2 min-w-[180px] ${theme.tradeNameClass}`} title={client.tradeName}>
                          <div className="font-bold leading-normal truncate text-[var(--app-font-size)]">{client.tradeName || '---'}</div>
                          <p className="legal-subtitle truncate font-medium text-[11px] text-slate-400 mt-0.5" title={client.legalName}>{client.legalName || '---'}</p>
                        </td>
       
                        <td className="px-3 py-2 min-w-[160px] whitespace-nowrap">
                          <div className="flex items-center gap-1.5 group/gstin">
                            <span className={`font-semibold tracking-wider font-mono uppercase ${theme.gstinClass}`}>{client.gstProfile?.gstin || '---'}</span>
                            {client.gstProfile?.gstin && (
                              <button onClick={() => (navigator.clipboard.writeText(client.gstProfile?.gstin || '').then(() => { toast.success('GSTIN Copied!'); window.open('https://services.gst.gov.in/services/searchtp', '_blank'); }))} className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0" title="Search Taxpayer">
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center min-w-[180px] whitespace-nowrap">
                          <div className="flex justify-center items-center gap-1 flex-nowrap">
                            {[
                              { label: 'Q1', q: 'April-June (Q1)' },
                              { label: 'Q2', q: 'July-September (Q2)' },
                              { label: 'Q3', q: 'October-December (Q3)' },
                              { label: 'Q4', q: 'January-March (Q4)' }
                            ].map(qInfo => {
                               const isFiled = cmp08Data[`${selectedYear}_${qInfo.q}`]?.[client.id]?.cmp08;
                               return (
                                 <span 
                                   key={qInfo.label} 
                                   title={`${qInfo.q}: ${isFiled ? 'Filed' : 'Pending'}`} 
                                   className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border shrink-0 transition-all ${
                                     isFiled 
                                       ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60' 
                                       : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                                   }`}
                                 >
                                   {qInfo.label}
                                 </span>
                               );
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center min-w-[125px] whitespace-nowrap">
                          <button 
                            type="button"
                            onClick={() => toggleStatus(client.id)} 
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-tight border transition-all cursor-pointer active:scale-95 shadow-2xs ${
                              status.filed 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80 hover:bg-emerald-100/80' 
                                : 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80 hover:bg-amber-100/80'
                            }`} 
                            title="Click to toggle GSTR-4 Status (Pending / Filed)"
                          >
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                              status.filed ? 'bg-emerald-500' : 'bg-amber-500'
                            }`} />
                            <span>{status.filed ? 'Filed' : 'Pending'}</span>
                          </button>
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 truncate min-w-[110px]">{client.gstProfile?.username || '---'}</td>
                        <td className="px-3 py-2 min-w-[120px] whitespace-nowrap relative group/pass">
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
                        <td className="px-3 py-2 min-w-[130px] max-w-[180px] truncate" title={status?.remark || getStatus?.(client.id)?.remark || 'Add remark...'}>
                           <EditableRemark value={status?.remark || getStatus?.(client.id)?.remark || ''} onSave={val => updateRemark(client.id, val)} />
                        </td>
                        <td className="sticky right-0 bg-white/95 dark:bg-slate-900/95 group-hover:bg-indigo-50/40 dark:group-hover:bg-slate-850 backdrop-blur-md z-20 px-3 py-2 text-right min-w-[115px] w-[115px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
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
                  const fullText = `*Client Details*\nTrade Name: ${selectedClient.tradeName || 'N/A'}\nLegal Name: ${selectedClient.legalName || 'N/A'}\nMobile: ${selectedClient.mobile || 'N/A'}\nEmail: ${selectedClient.email || 'N/A'}\n\n*GST Details*\nGSTIN: ${selectedClient.gstProfile?.gstin || 'N/A'}\nStatus: ${selectedClient.gstProfile?.gstStatus || 'N/A'}\nReg Type: ${selectedClient.gstProfile?.regType || 'N/A'}\nFiling: ${selectedClient.gstProfile?.filingFreq || 'N/A'}\nReg Date: ${formatDate(selectedClient.gstProfile?.regDate)}\nJurisdiction: ${selectedClient.gstProfile?.jurisdictionType || 'N/A'}\nSector/Range: ${selectedClient.gstProfile?.sector || selectedClient.gstProfile?.range || 'N/A'}\n\n*Credentials*\nGST User ID: ${selectedClient.gstProfile?.username || 'N/A'}\nGST Password: ${selectedClient.gstProfile?.password || 'N/A'}\n\n*IT Details*\nPAN: ${selectedClient.itProfile?.pan || 'N/A'}\nIT User ID: ${selectedClient.itProfile?.username || 'N/A'}\nIT Password: ${selectedClient.itProfile?.password || 'N/A'}`;
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
                  const text = `*Entity Profile*\nTrade Name: ${selectedClient.tradeName || 'N/A'}\nLegal Name: ${selectedClient.legalName || 'N/A'}\nMobile: ${selectedClient.mobile || 'N/A'}\nEmail: ${selectedClient.email || 'N/A'}\n\n*GST Details*\nGSTIN: ${selectedClient.gstProfile?.gstin || 'N/A'}\nStatus: ${selectedClient.gstProfile?.gstStatus || 'N/A'}\nReg Type: ${selectedClient.gstProfile?.regType || 'N/A'}\nFiling: ${selectedClient.gstProfile?.filingFreq || 'N/A'}\nReg Date: ${formatDate(selectedClient.gstProfile?.regDate)}\nJurisdiction: ${selectedClient.gstProfile?.jurisdictionType || 'N/A'}\nSector/Range: ${selectedClient.gstProfile?.sector || selectedClient.gstProfile?.range || 'N/A'}\n\n*Credentials*\nGST User ID: ${selectedClient.gstProfile?.username || 'N/A'}\nGST Password: ${selectedClient.gstProfile?.password || 'N/A'}`;
                  window.location.href = `whatsapp://send?text=${encodeURIComponent(text)}`;
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs shrink-0">💬</div>
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 truncate">Quick WhatsApp Share</span>
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
    </div>
  );
};

export default GSTR4;
