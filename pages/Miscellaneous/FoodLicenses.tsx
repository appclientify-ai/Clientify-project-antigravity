import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useModuleData } from '../../hooks/useModuleData.ts';
import { FoodLicenseRecord, FoodLicenseStatus } from '../../types';
import { api } from '../../services/api.ts';
import FoodLicensesForm from '../Clientform/FoodLicensesForm';
import FoodPortalLoginModal from '../../components/FoodPortalLoginModal';
import Loader from '../../components/Loader';
import { TableFilter } from '../../components/TableFilter';
import { toast } from 'sonner';
import { formatDate as formatDateUtil, calculateRenewalDueDate } from '../../dateUtils.ts';
import { ViewControl } from '../../components/ViewControl';

const FoodLicenses: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<FoodLicenseRecord | null>(null);
  const [activeStatusRowId, setActiveStatusRowId] = useState<string | null>(null);
  const [activeActionsRecord, setActiveActionsRecord] = useState<FoodLicenseRecord | null>(null);
  const [loginModalRecord, setLoginModalRecord] = useState<FoodLicenseRecord | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [compactMode, setCompactMode] = useState(false);

  const { data: records = [], isLoading } = useModuleData<FoodLicenseRecord[]>('food_licenses');

  const saveMutation = useMutation({
    mutationFn: (data: Partial<FoodLicenseRecord>) => api.saveFoodLicense(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food_licenses'] });
    },
    onError: () => {
      toast.error("Operation failed.");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteFoodLicense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food_licenses'] });
      toast.success("Record deleted.");
    },
    onError: () => {
      toast.error("Deletion failed.");
    }
  });

  useEffect(() => {
    const syncHandler = () => {
      queryClient.invalidateQueries({ queryKey: ['food_licenses'] });
    };
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, [queryClient]);

  // Handle outside clicks for filter dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle outside clicks for row status dropdown
  useEffect(() => {
    const handleCloseStatusMenu = () => {
      setActiveStatusRowId(null);
    };
    if (activeStatusRowId) {
      document.addEventListener('click', handleCloseStatusMenu);
      return () => document.removeEventListener('click', handleCloseStatusMenu);
    }
  }, [activeStatusRowId]);

  const handleInlineUpdate = async (id: string, field: keyof FoodLicenseRecord, value: any) => {
    const updatedRecord = records.find(r => r.id === id);
    if (!updatedRecord) return;
    
    try {
      const newRecord = { ...updatedRecord, [field]: value };
      await saveMutation.mutateAsync(newRecord);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredRecords = useMemo(() => {
    let list = records;
    const todayStr = new Date().toISOString().split('T')[0];
    if (statusFilter === 'Renewal Due') {
      list = list.filter(r => {
        const due = r.dueDate || calculateRenewalDueDate(r.expiryDate);
        return due && due <= todayStr && r.status !== 'Rejected';
      });
    } else if (statusFilter === 'Applied' || statusFilter === 'In Progress' || statusFilter === 'Pending') {
      list = list.filter(r => r.status !== 'Completed' && r.status !== 'Rejected');
    } else if (statusFilter === 'Completed' || statusFilter === 'Active') {
      list = list.filter(r => r.status === 'Completed');
    } else if (statusFilter !== 'All') {
      list = list.filter(r => r.status === statusFilter);
    }
    const s = search.toLowerCase();
    return list.filter(r => 
      (r.tradeName || '').toLowerCase().includes(s) || 
      (r.legalName || '').toLowerCase().includes(s) || 
      (r.clientName || '').toLowerCase().includes(s) || 
      (r.mobile && String(r.mobile).includes(s)) || 
      (r.licenseNo && String(r.licenseNo).toLowerCase().includes(s))
    ).sort((a, b) => (new Date(b.appDate || 0).getTime() || 0) - (new Date(a.appDate || 0).getTime() || 0));
  }, [records, search, statusFilter]);

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return {
      total: records.length,
      active: records.filter(r => r.status === 'Completed').length,
      pending: records.filter(r => r.status !== 'Completed' && r.status !== 'Rejected').length,
      renewalDue: records.filter(r => {
        const due = r.dueDate || calculateRenewalDueDate(r.expiryDate);
        return due && due <= todayStr && r.status !== 'Rejected';
      }).length,
      rejected: records.filter(r => r.status === 'Rejected').length
    };
  }, [records]);

  const filterOptions = useMemo(() => [
    { value: 'All', label: 'Total Licenses', shortLabel: 'Total', count: stats.total, dot: 'bg-slate-500' },
    { value: 'Completed', label: 'Active / Issued', shortLabel: 'Active', count: stats.active, dot: 'bg-emerald-500' },
    { value: 'Applied', label: 'Applied / In Progress', shortLabel: 'Applied', count: stats.pending, dot: 'bg-amber-500' },
    { value: 'Renewal Due', label: 'Renewal Due (2 Mo)', shortLabel: 'Renewal', count: stats.renewalDue, dot: 'bg-rose-500' },
    { value: 'Rejected', label: 'Rejected', shortLabel: 'Rejected', count: stats.rejected, dot: 'bg-red-500' },
  ], [stats]);

  const currentFilterOption = useMemo(() => {
    return filterOptions.find(f => f.value === statusFilter) || filterOptions[0];
  }, [filterOptions, statusFilter]);

  const handleDelete = async (id: string) => {
    if (confirm('Permanently remove this FSSAI record from the vault?')) {
      deleteMutation.mutate(id);
    }
  };

  const getStatusStyle = (st: FoodLicenseStatus) => {
    switch (st) {
      case 'Completed': 
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80 hover:bg-emerald-100/80';
      case 'Rejected': 
        return 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/80 hover:bg-rose-100/80';
      case 'Applied': 
        return 'bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/80 hover:bg-indigo-100/80';
      default: 
        return 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80 hover:bg-amber-100/80';
    }
  };

  const getStatusDot = (st: FoodLicenseStatus) => {
    switch (st) {
      case 'Completed': return 'bg-emerald-500';
      case 'Rejected': return 'bg-rose-500';
      case 'Applied': return 'bg-indigo-500';
      default: return 'bg-amber-500';
    }
  };

  const formatDate = (dateStr?: string) => {
    return formatDateUtil(dateStr);
  };

  if (isLoading) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* Modern Unified Single-Line Toolbar: Search First, Count Badge Second */}
      <div className="relative z-50 flex items-center justify-between gap-1.5 sm:gap-2 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs shrink-0 w-full max-w-full min-w-0 flex-nowrap overflow-visible transition-colors">
        
        {/* Left Section: Search Input (First) + Count Dropdown Badge (Second) */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 flex-nowrap">
          {/* Search Bar - First */}
          <div className="relative group flex-1 min-w-[140px] sm:min-w-[220px]">
            <input 
              type="text" 
              placeholder="Search Client, Mobile or FSSAI License Number..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-7 sm:pr-8 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none" 
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-emerald-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  ? 'bg-slate-900 text-white dark:bg-emerald-600 border-slate-900 dark:border-emerald-600'
                  : statusFilter !== 'All'
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
              title="Filter by status"
            >
              <span className={`h-2 w-2 rounded-full ${currentFilterOption.dot}`} />
              <span className="font-bold">{currentFilterOption.shortLabel}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                isFilterDropdownOpen 
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
              }`}>
                {currentFilterOption.count}
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

            {/* Dropdown Menu */}
            {isFilterDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-1.5 z-[100] animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 mb-1">
                  Filter Food Licenses
                </div>
                {filterOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(opt.value);
                      setIsFilterDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      statusFilter === opt.value
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${opt.dot}`} />
                      <span className="truncate">{opt.label}</span>
                    </div>
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0 ml-2">
                      {opt.count}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Section: ViewControl + Add Record */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <ViewControl 
            viewMode={viewMode} 
            onViewChange={setViewMode} 
            compactMode={compactMode} 
            onCompactToggle={() => setCompactMode(!compactMode)} 
          />
          <button 
            type="button"
            onClick={() => { setSelectedRecord(null); setIsFormOpen(true); }}
            className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-xs hover:shadow transition-all flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 uppercase tracking-wider"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Add Record</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="relative z-10 flex-1 min-h-0 w-full max-w-full min-w-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col transition-colors">
        {viewMode === 'grid' ? (
          <div className="p-3 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredRecords.length === 0 ? (
              <div className="col-span-full py-16 text-center text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider text-xs">
                No food license records archived
              </div>
            ) : (
              filteredRecords.map((rec, idx) => {
                const renewalDueDate = rec.dueDate || calculateRenewalDueDate(rec.expiryDate);
                const todayStr = new Date().toISOString().split('T')[0];
                const isRenewalDueNow = Boolean(renewalDueDate && renewalDueDate <= todayStr && rec.status !== 'Rejected');
                const isExpired = Boolean(rec.expiryDate && new Date(rec.expiryDate).getTime() < new Date().setHours(0,0,0,0) && rec.status !== 'Rejected');

                return (
                  <div key={rec.id} className="p-3.5 bg-slate-50/70 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-3 relative">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/50">
                          #{(idx + 1).toString().padStart(2, '0')}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase truncate">
                          {rec.licenseType || 'FSSAI'}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate" title={rec.tradeName || rec.clientName}>
                        {rec.tradeName || rec.clientName || '---'}
                      </h4>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        Legal: {rec.legalName || rec.clientName || '---'}
                      </p>
                      <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-0.5 font-mono">
                        Mob: {rec.mobile || '---'}
                      </p>
                    </div>

                    <div className="p-2.5 bg-white dark:bg-slate-900/80 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">FSSAI No:</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{rec.licenseNo || 'Awaiting Issue...'}</span>
                          {rec.licenseNo && (
                            <button 
                              type="button"
                              onClick={() => { navigator.clipboard.writeText(rec.licenseNo || ''); toast.success('FSSAI No Copied!'); }} 
                              className="p-0.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors inline-flex cursor-pointer" 
                              title="Copy FSSAI No"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1" /></svg>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">App Date:</span>
                        <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                          {formatDate(rec.appDate)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Renewal Date:</span>
                        <span className={`font-mono font-bold ${isRenewalDueNow ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>
                          {formatDate(renewalDueDate)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Expiry Date:</span>
                        <span className={`font-mono font-bold ${isExpired ? 'text-rose-600 dark:text-rose-400 animate-pulse' : 'text-slate-700 dark:text-slate-300'}`}>
                          {formatDate(rec.expiryDate)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveStatusRowId(activeStatusRowId === rec.id ? null : rec.id);
                          }}
                          className={`inline-flex items-center justify-between gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-tight border transition-all cursor-pointer active:scale-95 shadow-2xs ${getStatusStyle(rec.status)}`}
                          title="Click to update status"
                        >
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${getStatusDot(rec.status)}`} />
                          <span className="truncate">{rec.status || 'Pending'}</span>
                          <svg className="h-2.5 w-2.5 opacity-60 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {activeStatusRowId === rec.id && (
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            className="absolute bottom-full mb-1 left-0 w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-1.5 z-50 animate-in zoom-in-95 text-left flex flex-col gap-0.5 ring-1 ring-black/5 dark:ring-white/10"
                          >
                            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 mb-0.5">
                              Update Status
                            </div>
                            {(['Pending', 'Applied', 'Completed', 'Rejected'] as FoodLicenseStatus[]).map(st => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => {
                                  handleInlineUpdate(rec.id, 'status', st);
                                  setActiveStatusRowId(null);
                                }}
                                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                                  rec.status === st
                                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold'
                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className={`h-1.5 w-1.5 rounded-full ${getStatusDot(st)}`} />
                                  <span>{st}</span>
                                </div>
                                {rec.status === st && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button 
                          type="button"
                          onClick={() => { setSelectedRecord(rec); setIsFormOpen(true); }} 
                          className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-750 transition-all flex items-center justify-center cursor-pointer shadow-2xs active:scale-95" 
                          title="Edit Entry"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveActionsRecord(rec);
                          }} 
                          className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-white dark:hover:bg-slate-750 transition-all flex items-center justify-center cursor-pointer shadow-2xs active:scale-95" 
                          title="More Actions (3-Dots)"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="5" cy="12" r="1.5" />
                            <circle cx="12" cy="12" r="1.5" />
                            <circle cx="19" cy="12" r="1.5" />
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
            <table className={`w-full text-left border-collapse table-fixed ${compactMode ? 'compact-mode' : ''}`}>
              <thead className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 shadow-2xs">
                <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 select-none">
                  <th className="px-1 py-1.5 text-center whitespace-nowrap w-[3.5%] min-w-[32px] text-slate-500 dark:text-slate-400">#</th>
                  <th className="px-1.5 py-1.5 text-left w-[26%] min-w-[170px]">Trade Name</th>
                  <th className="px-1.5 py-1.5 text-left w-[15.5%] min-w-[120px] whitespace-nowrap">License No.</th>
                  <th className="px-1.5 py-1.5 text-left w-[8.5%] min-w-[65px] whitespace-nowrap">Type</th>
                  <th className="px-1.5 py-1.5 w-[11%] min-w-[90px] text-center whitespace-nowrap">
                    <div className="flex justify-center flex-col items-center">
                      <TableFilter label="Status" isActive={statusFilter !== 'All'} onClear={() => setStatusFilter('All')}>
                         {['All', 'Pending', 'Applied', 'Completed', 'Renewal Due', 'Rejected'].map(st => (
                           <button 
                             key={st} 
                             type="button"
                             onClick={() => setStatusFilter(st)} 
                             className={`w-full text-left px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                               statusFilter === st 
                                 ? 'bg-emerald-600 text-white font-bold' 
                                 : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                             }`}
                           >
                             <div className="flex items-center gap-1.5">
                               {st !== 'All' && st !== 'Renewal Due' && (
                                 <span className={`h-1.5 w-1.5 rounded-full ${getStatusDot(st as FoodLicenseStatus)}`} />
                               )}
                               {st === 'Renewal Due' && (
                                 <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                               )}
                               <span>{st}</span>
                             </div>
                             {statusFilter === st && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                           </button>
                         ))}
                      </TableFilter>
                    </div>
                  </th>
                  <th className="px-1.5 py-1.5 text-left w-[9%] min-w-[70px] whitespace-nowrap">Applied</th>
                  <th className="px-1.5 py-1.5 text-left w-[9.5%] min-w-[75px] whitespace-nowrap text-amber-600 dark:text-amber-400">Renewal</th>
                  <th className="px-1.5 py-1.5 text-left w-[9.5%] min-w-[75px] whitespace-nowrap">Expiry</th>
                  <th className="px-1.5 py-1.5 text-right w-[7.5%] min-w-[72px] whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider text-xs">
                      No food license records archived
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec, idx) => {
                    const renewalDueDate = rec.dueDate || calculateRenewalDueDate(rec.expiryDate);
                    const todayStr = new Date().toISOString().split('T')[0];
                    const isRenewalDueNow = Boolean(renewalDueDate && renewalDueDate <= todayStr && rec.status !== 'Rejected');
                    const isExpired = Boolean(rec.expiryDate && new Date(rec.expiryDate).getTime() < new Date().setHours(0,0,0,0) && rec.status !== 'Rejected');

                    return (
                      <tr key={rec.id} className="transition-all group border-b border-slate-100 dark:border-slate-800/60 hover:bg-emerald-50/30 dark:hover:bg-slate-800/40 animate-in fade-in slide-in-from-bottom-1 duration-150 text-xs font-semibold">
                        <td className="px-1 py-1.5 text-slate-400 dark:text-slate-500 font-bold whitespace-nowrap text-center text-xs">
                          {(idx + 1).toString().padStart(2, '0')}
                        </td>
                        <td className="px-1.5 py-1.5 overflow-hidden">
                           <p className="font-bold text-slate-900 dark:text-white uppercase leading-tight truncate text-xs" title={rec.tradeName || rec.clientName}>
                             {rec.tradeName || rec.clientName || '---'}
                           </p>
                           <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-medium truncate mt-0.5" title={rec.legalName || rec.clientName}>
                             {rec.legalName || rec.clientName || '---'}
                           </p>
                           <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-medium truncate">
                             Mob: {rec.mobile || 'No Contact'}
                           </p>
                        </td>
                        <td className="px-1.5 py-1.5 overflow-hidden whitespace-nowrap">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className={`font-mono font-bold text-[11px] tracking-wide uppercase truncate ${rec.licenseNo ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60' : 'text-slate-400 italic font-normal text-[11px]'}`} title={rec.licenseNo}>
                              {rec.licenseNo || 'Awaiting Issue'}
                            </span>
                            {rec.licenseNo && (
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(rec.licenseNo || '');
                                  toast.success('License No copied!');
                                }}
                                className="text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 p-0.5 rounded hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                                title="Copy License Number"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 012-2v-8a2 2 0 01-2-2h-8a2 2 0 01-2 2v8a2 2 0 012 2z" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-1.5 py-1.5 font-medium text-slate-700 dark:text-slate-300 uppercase truncate whitespace-nowrap text-xs overflow-hidden" title={rec.licenseType}>
                          {rec.licenseType || 'FSSAI'}
                        </td>
                        <td className="px-1.5 py-1.5 text-center relative overflow-visible whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveStatusRowId(activeStatusRowId === rec.id ? null : rec.id);
                            }}
                            className={`inline-flex items-center justify-between gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-tight border transition-all cursor-pointer active:scale-95 shadow-2xs ${getStatusStyle(rec.status)}`}
                            title="Click to update status"
                          >
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${getStatusDot(rec.status)}`} />
                            <span className="truncate">{rec.status || 'Pending'}</span>
                            <svg className="h-2 w-2 opacity-60 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {activeStatusRowId === rec.id && (
                            <div 
                              onClick={(e) => e.stopPropagation()}
                              className="absolute top-full mt-1 z-50 left-1/2 -translate-x-1/2 w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-1 animate-in fade-in zoom-in-95 duration-100 text-left flex flex-col gap-0.5 ring-1 ring-black/5 dark:ring-white/10"
                            >
                              <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 mb-0.5">
                                Update Status
                              </div>
                              {(['Pending', 'Applied', 'Completed', 'Rejected'] as FoodLicenseStatus[]).map(st => (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() => {
                                    handleInlineUpdate(rec.id, 'status', st);
                                    setActiveStatusRowId(null);
                                  }}
                                  className={`w-full flex items-center justify-between px-2 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                                    rec.status === st
                                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold'
                                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className={`h-1.5 w-1.5 rounded-full ${getStatusDot(st)}`} />
                                    <span>{st}</span>
                                  </div>
                                  {rec.status === st && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-1.5 py-1.5 font-medium text-slate-700 dark:text-slate-300 uppercase text-xs whitespace-nowrap font-mono">
                          {formatDate(rec.appDate)}
                        </td>
                        <td className="px-1.5 py-1.5 font-medium uppercase text-xs whitespace-nowrap font-mono">
                          <span className={isRenewalDueNow ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-700 dark:text-slate-300'}>
                            {formatDate(renewalDueDate)}
                          </span>
                        </td>
                        <td className="px-1.5 py-1.5 font-medium uppercase text-xs whitespace-nowrap font-mono">
                          <span className={rec.expiryDate && new Date(rec.expiryDate).getTime() < new Date().setHours(0,0,0,0) ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-700 dark:text-slate-300'}>
                            {formatDate(rec.expiryDate)}
                          </span>
                          {Boolean(rec.expiryDate && new Date(rec.expiryDate).getTime() < new Date().setHours(0,0,0,0) && rec.status !== 'Rejected') && (
                            <span className="block text-[8px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 rounded px-1 py-0 w-fit uppercase">
                              Expired
                            </span>
                          )}
                        </td>
                        <td className="px-1.5 py-1.5 text-right whitespace-nowrap w-[7.5%] min-w-[72px]">
                          <div className="flex items-center justify-end gap-1">
                            <button 
                              type="button"
                              onClick={() => { setSelectedRecord(rec); setIsFormOpen(true); }} 
                              className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 transition-all flex items-center justify-center cursor-pointer shadow-2xs active:scale-95" 
                              title="Edit Entry"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveActionsRecord(rec);
                              }} 
                              className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-300 transition-all flex items-center justify-center cursor-pointer shadow-2xs active:scale-95" 
                              title="More Actions (3-Dots)"
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="5" cy="12" r="1.5" />
                                <circle cx="12" cy="12" r="1.5" />
                                <circle cx="19" cy="12" r="1.5" />
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

      {/* Global Actions Drawer / Menu - Portaled to body so it never clips */}
      {activeActionsRecord && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999998] flex items-center justify-end p-3 sm:p-6 pointer-events-none">
          {/* Dismiss Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-950/20 backdrop-blur-[2px] pointer-events-auto animate-in fade-in duration-150"
            onClick={(e) => {
              e.stopPropagation();
              setActiveActionsRecord(null);
            }} 
          />

          {/* Action Options Panel in Right Side */}
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative pointer-events-auto w-80 max-w-[calc(100vw-24px)] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl z-[999999] text-left animate-in fade-in slide-in-from-right-4 duration-200 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden"
          >
            {/* Header */}
            <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">License Actions</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-300 font-mono text-[9px] font-bold">
                    {activeActionsRecord.licenseType || 'FSSAI'}
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                  {activeActionsRecord.tradeName || activeActionsRecord.clientName}
                </h4>
                <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 truncate">
                  {activeActionsRecord.licenseNo || 'Awaiting License No'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveActionsRecord(null)}
                className="h-7 w-7 rounded-xl bg-slate-200/60 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer text-xs shrink-0"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Action Buttons */}
            <div className="overflow-y-auto p-2 space-y-1 no-scrollbar flex-1">
              {/* Login to FoSCoS Portal (Opens Login Page showing ID & Password) */}
              <button 
                type="button"
                onClick={() => { 
                  setLoginModalRecord(activeActionsRecord);
                  setActiveActionsRecord(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:bg-white dark:group-hover:bg-slate-800 shadow-xs text-base shrink-0">
                  🔐
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 block truncate">Portal Login Credentials</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">View ID, password & open FoSCoS</span>
                </div>
              </button>

              {/* Modify / Edit Form */}
              <button 
                type="button"
                onClick={() => { 
                  setSelectedRecord(activeActionsRecord);
                  setIsFormOpen(true); 
                  setActiveActionsRecord(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-base shrink-0">
                  ✏️
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 block truncate">Edit / Modify License</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Update registration details & dates</span>
                </div>
              </button>

              {/* Copy License No */}
              {activeActionsRecord.licenseNo && (
                <button 
                  type="button"
                  onClick={() => { 
                    navigator.clipboard.writeText(activeActionsRecord.licenseNo || '');
                    toast.success('FSSAI License No copied!');
                    setActiveActionsRecord(null); 
                  }} 
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-left group cursor-pointer"
                >
                  <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-sm shrink-0">
                    📋
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 block truncate">Copy License Number</span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block truncate">{activeActionsRecord.licenseNo}</span>
                  </div>
                </button>
              )}

              {/* Copy Portal Password */}
              {activeActionsRecord.password && (
                <button 
                  type="button"
                  onClick={() => { 
                    navigator.clipboard.writeText(activeActionsRecord.password || '');
                    toast.success('FoSCoS Password copied!');
                    setActiveActionsRecord(null); 
                  }} 
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-left group cursor-pointer"
                >
                  <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-sm shrink-0">
                    🔑
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 block truncate">Copy Portal Password</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Password saved in vault</span>
                  </div>
                </button>
              )}

              {/* Delete Record */}
              <button 
                type="button"
                onClick={() => { 
                  const id = activeActionsRecord.id;
                  setActiveActionsRecord(null); 
                  handleDelete(id);
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400 text-base shrink-0">
                  🗑️
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 block truncate">Delete Record</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Permanently remove from vault</span>
                </div>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* FoSCoS Portal Login Modal (Like GST login modal showing ID and Password) */}
      <FoodPortalLoginModal
        isOpen={Boolean(loginModalRecord)}
        onClose={() => setLoginModalRecord(null)}
        record={loginModalRecord}
        onDataChange={() => queryClient.invalidateQueries({ queryKey: ['food_licenses'] })}
      />

      <FoodLicensesForm  
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        onSave={async (data) => {
          await saveMutation.mutateAsync(data);
          setIsFormOpen(false);
        }} 
        initialData={selectedRecord} 
      />
    </div>
  );
};

export default FoodLicenses;
