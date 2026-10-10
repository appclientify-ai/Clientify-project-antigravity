import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useModuleData } from '../../hooks/useModuleData';
import { formatDate } from '../../exportUtils';
import GstMasterPortfolio from './GstMasterPortfolio.tsx';
import GSTClientFormModal from '../Clientform/GSTClientFormModal.tsx';
import { api } from '../../services/api.ts';
import { Client, GstRegType, GstFilingFreq, ConstitutionType, ClientStatus } from '../../types.ts';
import ErrorBoundary from '../../components/ErrorBoundary';
import { toast } from 'sonner';

import { SectorJurisdictionFilter } from '../../components/SectorJurisdictionFilter';
import { ViewControl } from '../../components/ViewControl';

const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

const GSTPortfolioContent: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<string>('All');
  const [authorityFilter, setAuthorityFilter] = useState<'All' | 'State' | 'Center'>('All');
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'table');
  const [isUtilityOpen, setIsUtilityOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importExportMenuRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

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

  const { data: clientsData } = useModuleData('gst_clients');

  const clients = useMemo(() => {
    return clientsData || [];
  }, [clientsData]);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['gst_clients'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  }, [queryClient]);

  // Close Import/Export dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (importExportMenuRef.current && !importExportMenuRef.current.contains(e.target as Node)) {
        setIsUtilityOpen(false);
      }
    };
    if (isUtilityOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isUtilityOpen]);

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

  useEffect(() => {
    let debounceTimer: any = null;
    const syncHandler = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['gst_clients'] });
        queryClient.invalidateQueries({ queryKey: ['clients'] });
      }, 150);
    };
    window.addEventListener('clientify_db_change', syncHandler);
    return () => {
      window.removeEventListener('clientify_db_change', syncHandler);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [queryClient]);

  const stats = useMemo(() => {
    const total = (clients || []).length;
    const active = (clients || []).filter(c => c?.status === 'Active' || c?.status === 'Active Filing').length;
    const regular = (clients || []).filter(c => c?.gstProfile?.regType === 'Regular').length;
    const composition = (clients || []).filter(c => c?.gstProfile?.regType === 'Composition').length;
    const monthly = (clients || []).filter(c => !c?.gstProfile?.filingFreq || c?.gstProfile?.filingFreq === 'Monthly').length;
    const quarterly = (clients || []).filter(c => c?.gstProfile?.filingFreq === 'Quarterly').length;
    const litigation = (clients || []).filter(c => c?.status === 'Litigation').length;
    const inactive = (clients || []).filter(c => c?.status === 'Inactive' || c?.status === 'Suspended').length;

    return { total, active, regular, composition, monthly, quarterly, litigation, inactive };
  }, [clients]);

  const handleExportCSV = () => {
    const headers = [
      "Trade Name", "Legal Name", "Mobile", "Email", "Address", "GSTIN", "PAN", 
      "Portal User ID", "Portal Password", "Constitution", "Registration Date", 
      "Category", "Filing Frequency", "Status"
    ].join(",");

    const rows = (clients || []).filter(Boolean).map(c => [
      c?.tradeName, c?.legalName, c?.mobile, c?.email, c?.address,
      c?.gstProfile?.gstin, c?.gstProfile?.pan, c?.gstProfile?.username, c?.gstProfile?.password,
      c?.gstProfile?.constitution, formatDate(c?.gstProfile?.regDate), c?.gstProfile?.regType,
      c?.gstProfile?.filingFreq, c?.status
    ].map(v => `"${v || ''}"`).join(",")).join("\n");

    const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Clientify_GST_Portfolio_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsUtilityOpen(false);
    toast.success(`Exported ${clients.length} clients to CSV`);
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "Trade Name", "Legal Name", "Mobile", "Email", "GSTIN", "Portal User ID", "Portal Password", 
      "Constitution (Proprietorship/Partnership/Company/HUF/Trust/Society/Other)", 
      "Registration Date (YYYY-MM-DD)", "Category (Regular/Composition)", 
      "Filing Frequency (Monthly/Quarterly)", "Status (Active/Inactive)"
    ].join(",");
    
    const csvContent = "data:text/csv;charset=utf-8," + headers;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Clientify_GST_Import_Template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsUtilityOpen(false);
    toast.info('Downloaded CSV Import Template');
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
        toast.error('The selected CSV file has no client data rows.');
        return;
      }

      const rows = lines.slice(1);
      setIsImporting(true);
      const clientsToImport: Partial<Client>[] = [];
      let errorCount = 0;

      for (const row of rows) {
        if (!row.trim()) continue;
        const values = parseCSVLine(row);
        
        try {
          const clientData: Partial<Client> = {
            tradeName: values[0] || 'Unknown Client',
            legalName: values[1] || values[0] || 'Unknown Entity',
            mobile: values[2] || '',
            email: values[3] || '',
            status: (values[11] as ClientStatus) || 'Active',
            gstProfile: {
              gstin: values[4] || '',
              pan: values[4]?.substring(2, 12) || '',
              username: values[5] || values[4] || '',
              password: values[6] || '',
              constitution: (values[7] as ConstitutionType) || 'Proprietorship',
              regDate: values[8] || '',
              regType: (values[9] as GstRegType) || 'Regular',
              filingFreq: (values[10] as GstFilingFreq) || 'Monthly',
              gstStatus: 'Active',
              stakeholders: []
            }
          };

          if (clientData.gstProfile?.gstin) {
            clientsToImport.push(clientData);
          }
        } catch (err) {
          console.error("Import row parsing failed:", row, err);
          errorCount++;
        }
      }

      let successCount = 0;
      if (clientsToImport.length > 0) {
        try {
          const res = await api.bulkCreateClients(clientsToImport);
          successCount = res.insertedCount || clientsToImport.length;
        } catch (err) {
          console.error("Bulk import failed:", err);
          errorCount += clientsToImport.length;
        }
      }

      setIsImporting(false);
      toast.success(`Import finished! Successfully added ${successCount} clients.${errorCount > 0 ? ` (Errors: ${errorCount})` : ''}`);
      handleRefresh();
      if (fileInputRef.current) fileInputRef.current.value = '';
      setIsUtilityOpen(false);
    };
    reader.readAsText(file);
  };

  const filterOptions = [
    { label: 'Total Clients', shortLabel: 'Total', value: 'All', count: stats.total, dot: 'bg-indigo-500' },
    { label: 'Active Clients', shortLabel: 'Active', value: 'Active', count: stats.active, dot: 'bg-emerald-500' },
    { label: 'Regular Scheme', shortLabel: 'Regular', value: 'Regular', count: stats.regular, dot: 'bg-blue-500' },
    { label: 'Composition Scheme', shortLabel: 'Composition', value: 'Composition', count: stats.composition, dot: 'bg-purple-500' },
    { label: 'Monthly Filing', shortLabel: 'Monthly', value: 'Monthly', count: stats.monthly, dot: 'bg-cyan-500' },
    { label: 'Quarterly (QRMP)', shortLabel: 'Quarterly', value: 'Quarterly', count: stats.quarterly, dot: 'bg-teal-500' },
    { label: 'In Litigation', shortLabel: 'Litigation', value: 'Litigation', count: stats.litigation, dot: 'bg-amber-500' },
    { label: 'Inactive Clients', shortLabel: 'Inactive', value: 'Inactive', count: stats.inactive, dot: 'bg-slate-400' },
  ];
  const currentFilterOption = filterOptions.find(opt => opt.value === quickFilter) || filterOptions[0];

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* Search and Action Toolbar - Enterprise Linear/Stripe Style (h-9, rounded-lg) */}
      <div className="relative z-50 flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs shrink-0 w-full max-w-full min-w-0 transition-colors">
        
        {/* Search input with Ctrl+K shortcut */}
        <div className="relative flex-1 min-w-[170px] sm:min-w-[220px] max-w-sm sm:max-w-md group">
          <input 
            ref={searchInputRef}
            type="text" 
            placeholder="Search by Trade Name, Legal Name, GSTIN or PAN..." 
            value={search} 
            onChange={e => setSearch(e.target.value)}
            className="h-9 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-14 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 focus:border-slate-400 transition-all outline-none" 
          />
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-600 dark:group-focus-within:text-slate-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {search ? (
            <button 
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          ) : (
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] font-mono font-medium text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded shadow-2xs hidden sm:inline-block">
              Ctrl K
            </kbd>
          )}
        </div>

        {/* Combined Single Count Badge with Dropdown */}
        <div className="relative shrink-0 flex-shrink-0" ref={filterDropdownRef}>
          <button
            type="button"
            onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
            className={`h-9 px-3 rounded-lg border text-xs font-semibold tracking-wide transition-all flex items-center gap-2 cursor-pointer shadow-2xs active:scale-95 ${
              isFilterDropdownOpen
                ? 'bg-slate-900 text-white dark:bg-indigo-600 border-slate-900 dark:border-indigo-600 ring-2 ring-slate-400/20'
                : quickFilter !== 'All'
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
            }`}
            title="Click to view all category counts and filters"
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
              className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${isFilterDropdownOpen ? 'rotate-180 text-white' : ''}`} 
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
                <span>Filter by Category</span>
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
                        setQuickFilter(option.value);
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

        {/* Controls: View Control, Sector Filter, Import, Export, Test Database, Add Client */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
          
          {/* Standardized View Control */}
          <ViewControl 
            viewMode={viewMode} 
            onViewChange={setViewMode} 
            className="h-9 rounded-lg"
          />

          {/* Sector / Jurisdiction Filter Icon */}
          <SectorJurisdictionFilter
            clients={clients}
            authority={authorityFilter}
            setAuthority={setAuthorityFilter}
            selectedSectors={selectedSectors}
            setSelectedSectors={setSelectedSectors}
            buttonClassName="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
          />

          {/* Unified Import & Export under ONE Icon */}
          <div className="relative" ref={importExportMenuRef}>
            <button 
              type="button"
              onClick={() => setIsUtilityOpen(!isUtilityOpen)}
              className={`h-9 px-3 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 ${
                isUtilityOpen 
                  ? 'bg-slate-900 text-white dark:bg-indigo-600 border-slate-900 dark:border-indigo-600 shadow-sm' 
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
              title="Import & Export Portfolio Data"
            >
              {isImporting ? (
                <div className="h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="h-4 w-4 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              )}
              <span className="hidden sm:inline">Import / Export</span>
              <svg className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${isUtilityOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {isUtilityOpen && (
              <div className="absolute right-0 mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-[100] p-1.5 animate-in zoom-in-95 origin-top-right">
                {/* 1. Import CSV */}
                <button 
                  type="button"
                  onClick={() => {
                    setIsUtilityOpen(false);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                      fileInputRef.current.click();
                    }
                  }} 
                  disabled={isImporting}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all text-left group cursor-pointer"
                >
                  <div className="h-7 w-7 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Import Clients</span>
                    <span className="text-[10px] text-slate-400">Upload clients from CSV</span>
                  </div>
                </button>

                {/* 2. Export CSV */}
                <button 
                  type="button"
                  onClick={() => {
                    setIsUtilityOpen(false);
                    handleExportCSV();
                  }} 
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all text-left group cursor-pointer"
                >
                  <div className="h-7 w-7 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Export Portfolio</span>
                    <span className="text-[10px] text-slate-400">Download CSV list</span>
                  </div>
                </button>

                {/* 3. Download CSV Template */}
                <button 
                  type="button"
                  onClick={() => {
                    setIsUtilityOpen(false);
                    handleDownloadTemplate();
                  }} 
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all text-left group cursor-pointer border-t border-slate-100 dark:border-slate-800 mt-1 pt-1.5"
                >
                  <div className="h-7 w-7 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Download Template</span>
                    <span className="text-[10px] text-slate-400">Sample import format</span>
                  </div>
                </button>
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleImportCSV} className="hidden" accept=".csv" />
          </div>

          {/* Primary CTA - Add GST Client Button (Dark enterprise / Midnight Slate) */}
          <button 
            type="button"
            onClick={() => setIsModalOpen(true)} 
            className="bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold px-3.5 h-9 rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            <span>Add GST Client</span>
          </button>
        </div>
      </div>

      {/* Main Table / Grid Container */}
      <div className="relative z-10 flex-1 min-h-0 w-full max-w-full min-w-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col transition-colors">
        <GstMasterPortfolio 
          clients={clients}
          externalSearch={search}
          quickFilter={quickFilter}
          viewMode={viewMode}
          authorityFilter={authorityFilter}
          selectedSectors={selectedSectors}
          onDataChange={handleRefresh}
        />
      </div>

      <GSTClientFormModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={() => handleRefresh()} 
      />
    </div>
  );
};

const GSTPortfolio: React.FC = () => {
  return (
    <ErrorBoundary fallbackTitle="GST Portfolio Module Error">
      <GSTPortfolioContent />
    </ErrorBoundary>
  );
};

export default GSTPortfolio;
