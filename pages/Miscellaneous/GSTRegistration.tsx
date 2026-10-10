import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useModuleData } from '../../hooks/useModuleData.ts';
import { GSTRegistrationRecord, GSTRegistrationStatus, GSTRegistrationType } from '../../types';
import { api } from '../../services/api.ts';
import GSTRegistrationForm from '../Clientform/GSTRegistrationForm';
import Loader from '../../components/Loader';
import { TableFilter } from '../../components/TableFilter';
import { toast } from 'sonner';
import { formatDate } from '../../dateUtils.ts';
import { ViewControl } from '../../components/ViewControl';

const GSTRegistration: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<GSTRegistrationRecord | null>(null);
  const [activeStatusRowId, setActiveStatusRowId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [compactMode, setCompactMode] = useState(false);

  const { data: registrations = [], isLoading } = useModuleData<GSTRegistrationRecord[]>('gst_registrations');

  const saveMutation = useMutation({
    mutationFn: (data: Partial<GSTRegistrationRecord>) => api.saveGSTRegistration(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gst_registrations'] });
    },
    onError: () => {
      toast.error("Operation failed.");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteGSTRegistration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gst_registrations'] });
      toast.success("Application deleted.");
    },
    onError: () => {
      toast.error("Deletion failed.");
    }
  });

  useEffect(() => {
    const syncHandler = () => {
      queryClient.invalidateQueries({ queryKey: ['gst_registrations'] });
    };
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, [queryClient]);

  // Click outside to close filter dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Click outside to close row status dropdown
  useEffect(() => {
    const handleCloseStatusMenu = () => {
      setActiveStatusRowId(null);
    };
    if (activeStatusRowId) {
      document.addEventListener('click', handleCloseStatusMenu);
      return () => document.removeEventListener('click', handleCloseStatusMenu);
    }
  }, [activeStatusRowId]);

  const handleInlineUpdate = async (id: string, field: keyof GSTRegistrationRecord, value: any) => {
    const updatedRecord = registrations.find(r => r.id === id);
    if (!updatedRecord) return;
    
    try {
      const newRecord = { ...updatedRecord, [field]: value };
      await saveMutation.mutateAsync(newRecord);
    } catch (err) {
      console.error(err);
    }
    setActiveStatusRowId(null);
  };

  const stats = useMemo(() => {
    return {
      total: registrations.length,
      pending: registrations.filter(r => r.status === 'Pending').length,
      dataRequested: registrations.filter(r => r.status === 'Data Requested').length,
      inProgress: registrations.filter(r => r.status === 'In Progress').length,
      arnGenerated: registrations.filter(r => r.status === 'ARN Generated').length,
      completed: registrations.filter(r => r.status === 'Completed').length,
      rejected: registrations.filter(r => r.status === 'Rejected').length
    };
  }, [registrations]);

  const filterOptions = [
    { value: 'All', label: 'All Applications', shortLabel: 'Total', count: stats.total, dot: 'bg-indigo-500' },
    { value: 'Pending', label: 'Pending', shortLabel: 'Pending', count: stats.pending, dot: 'bg-slate-400' },
    { value: 'Data Requested', label: 'Data Requested', shortLabel: 'Data Req', count: stats.dataRequested, dot: 'bg-blue-500' },
    { value: 'In Progress', label: 'In Progress', shortLabel: 'In Progress', count: stats.inProgress, dot: 'bg-amber-500' },
    { value: 'ARN Generated', label: 'ARN Generated', shortLabel: 'ARN Gen', count: stats.arnGenerated, dot: 'bg-indigo-500' },
    { value: 'Completed', label: 'Completed', shortLabel: 'Completed', count: stats.completed, dot: 'bg-emerald-500' },
    { value: 'Rejected', label: 'Rejected', shortLabel: 'Rejected', count: stats.rejected, dot: 'bg-rose-500' }
  ];

  const currentFilterOption = filterOptions.find(o => o.value === statusFilter) || filterOptions[0];

  const filteredRegistrations = useMemo(() => {
    let list = registrations;
    if (statusFilter !== 'All') {
      list = list.filter(r => r.status === statusFilter);
    }

    const s = search.toLowerCase().trim();
    if (!s) return list.slice().sort((a, b) => (new Date(b.appDate || 0).getTime() || 0) - (new Date(a.appDate || 0).getTime() || 0));

    return list.filter(r => 
      (r.clientName || '').toLowerCase().includes(s) || 
      (r.mobile && String(r.mobile).includes(s)) || 
      (r.arn && String(r.arn).toLowerCase().includes(s))
    ).sort((a, b) => (new Date(b.appDate || 0).getTime() || 0) - (new Date(a.appDate || 0).getTime() || 0));
  }, [registrations, search, statusFilter]);

  const handleDelete = async (id: string) => {
    if (confirm('Permanently delete this GST application record?')) {
      deleteMutation.mutate(id);
    }
  };

  const getStatusColor = (st: GSTRegistrationStatus) => {
    switch (st) {
      case 'Completed': 
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80 hover:bg-emerald-100/80';
      case 'Rejected': 
        return 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/80 hover:bg-rose-100/80';
      case 'In Progress': 
        return 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80 hover:bg-amber-100/80';
      case 'ARN Generated': 
        return 'bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/80 hover:bg-indigo-100/80';
      case 'Data Requested': 
        return 'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/80 hover:bg-blue-100/80';
      default: 
        return 'bg-slate-50 text-slate-700 border-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700/80 hover:bg-slate-100';
    }
  };

  const getStatusDot = (st: GSTRegistrationStatus) => {
    switch (st) {
      case 'Completed': return 'bg-emerald-500';
      case 'Rejected': return 'bg-rose-500';
      case 'In Progress': return 'bg-amber-500';
      case 'ARN Generated': return 'bg-indigo-500';
      case 'Data Requested': return 'bg-blue-500';
      default: return 'bg-slate-400';
    }
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
              placeholder="Search entity name, mobile or ARN..." 
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
                  : statusFilter !== 'All'
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
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
                  Filter Applications
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
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold'
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
            className="h-9 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shadow-xs hover:shadow transition-all flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 uppercase tracking-wider"
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
            {filteredRegistrations.length === 0 ? (
              <div className="col-span-full py-16 text-center text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider text-xs">
                No GST applications found
              </div>
            ) : (
              filteredRegistrations.map((rec, idx) => (
                <div key={rec.id} className="p-3.5 bg-slate-50/70 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-3 relative">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                        #{(idx + 1).toString().padStart(2, '0')}
                      </span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                        {rec.appType}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate" title={rec.clientName}>{rec.clientName}</h4>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">Mob: {rec.mobile || '---'}</p>
                    <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase">App Date: {formatDate(rec.appDate)}</p>
                  </div>

                  <div className="p-2.5 bg-white dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-slate-700/70 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Status:</span>
                      <div className="relative shrink-0">
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveStatusRowId(activeStatusRowId === rec.id ? null : rec.id);
                          }}
                          className={`inline-flex items-center justify-between gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-tight border transition-all cursor-pointer active:scale-95 shadow-2xs ${getStatusColor(rec.status)}`}
                          title="Click to update status"
                        >
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${getStatusDot(rec.status)}`} />
                          <span className="truncate">{rec.status}</span>
                          <svg className="h-2.5 w-2.5 opacity-60 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {activeStatusRowId === rec.id && (
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            className="absolute bottom-full mb-1 right-0 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-1.5 z-50 animate-in zoom-in-95 text-left flex flex-col gap-0.5 ring-1 ring-black/5 dark:ring-white/10"
                          >
                            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 mb-0.5">
                              Update Status
                            </div>
                            {(['Pending', 'Data Requested', 'In Progress', 'ARN Generated', 'Completed', 'Rejected'] as GSTRegistrationStatus[]).map(st => (
                              <button 
                                key={st} 
                                type="button"
                                onClick={() => handleInlineUpdate(rec.id, 'status', st)} 
                                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                                  rec.status === st
                                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold'
                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className={`h-1.5 w-1.5 rounded-full ${getStatusDot(st)}`} />
                                  <span>{st}</span>
                                </div>
                                {rec.status === st && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">ARN:</span>
                      <div className="flex items-center gap-1">
                        <input 
                          type="text" 
                          value={rec.arn || ''} 
                          onChange={e => handleInlineUpdate(rec.id, 'arn', e.target.value)}
                          className="bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 focus:bg-white dark:focus:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-xs font-bold font-mono tracking-wider w-28 outline-none h-6 text-slate-900 dark:text-white"
                          placeholder="ARN..."
                        />
                        {rec.arn && (
                          <button onClick={() => { navigator.clipboard.writeText(rec.arn || ''); toast.success('ARN Copied!'); window.open('https://services.gst.gov.in/services/searchtp', '_blank'); }} className="p-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors inline-flex cursor-pointer" title="Search ARN on GST Portal">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase">{rec.arn ? 'Tracking Active' : 'Application Stage'}</span>
                    <div className="flex items-center gap-1.5">
                      <button 
                        onClick={() => { setSelectedRecord(rec); setIsFormOpen(true); }} 
                        className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-750 transition-all flex items-center justify-center cursor-pointer shadow-2xs" 
                        title="Edit Record"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button 
                        onClick={() => handleDelete(rec.id)} 
                        className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-white dark:hover:bg-slate-750 transition-all flex items-center justify-center cursor-pointer shadow-2xs" 
                        title="Delete Record"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="w-full overflow-x-auto overflow-y-auto no-scrollbar flex-1 relative h-full">
            <table className={`w-full text-left border-collapse table-auto min-w-[950px] ${compactMode ? 'compact-mode' : ''}`}>
              <thead className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 shadow-2xs">
                <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 select-none">
                  <th className="px-3 py-2 text-center whitespace-nowrap w-12 text-slate-400 dark:text-slate-500">S.No.</th>
                  <th className="px-3 py-2 min-w-[190px]">Entity Identity</th>
                  <th className="px-3 py-2 min-w-[120px] whitespace-nowrap">Mobile</th>
                  <th className="px-3 py-2 min-w-[140px] whitespace-nowrap">Application Type</th>
                  <th className="px-3 py-2 text-center min-w-[160px] whitespace-nowrap">
                    <div className="flex justify-center flex-col items-center">
                      <TableFilter label="Status" isActive={statusFilter !== 'All'} onClear={() => setStatusFilter('All')}>
                        {['All', 'Pending', 'Data Requested', 'In Progress', 'ARN Generated', 'Completed', 'Rejected'].map(st => (
                          <button 
                            key={st} 
                            type="button"
                            onClick={() => setStatusFilter(st)} 
                            className={`w-full text-left px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                              statusFilter === st 
                                ? 'bg-indigo-600 text-white font-bold' 
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {st !== 'All' && (
                                <span className={`h-1.5 w-1.5 rounded-full ${getStatusDot(st as GSTRegistrationStatus)}`} />
                              )}
                              <span>{st}</span>
                            </div>
                            {statusFilter === st && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                          </button>
                        ))}
                      </TableFilter>
                    </div>
                  </th>
                  <th className="px-3 py-2 min-w-[110px] whitespace-nowrap">App Date</th>
                  <th className="px-3 py-2 min-w-[160px] whitespace-nowrap">ARN Identity</th>
                  <th className="sticky top-0 right-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2 text-right w-[95px] min-w-[95px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredRegistrations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider text-xs">
                      No GST applications found
                    </td>
                  </tr>
                ) : (
                  filteredRegistrations.map((rec, idx) => (
                    <tr key={rec.id} className="transition-all group border-b border-slate-100 dark:border-slate-800/60 hover:bg-indigo-50/30 dark:hover:bg-slate-800/40 text-xs font-semibold">
                      <td className="px-3 py-2 text-slate-400 dark:text-slate-500 font-bold whitespace-nowrap text-center">
                        {(idx + 1).toString().padStart(2, '0')}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-bold text-slate-900 dark:text-white uppercase leading-snug truncate max-w-[240px]" title={rec.clientName}>
                          {rec.clientName}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase mt-0.5 font-medium">
                          {rec.arn ? 'Tracking Active' : 'Application Stage'}
                        </p>
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap font-mono">
                        {rec.mobile || '---'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                          {rec.appType}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center relative overflow-visible whitespace-nowrap">
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveStatusRowId(activeStatusRowId === rec.id ? null : rec.id);
                          }}
                          className={`inline-flex items-center justify-between gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-tight border transition-all cursor-pointer active:scale-95 shadow-2xs ${getStatusColor(rec.status)}`}
                          title="Click to update status"
                        >
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${getStatusDot(rec.status)}`} />
                          <span className="truncate">{rec.status}</span>
                          <svg className="h-2.5 w-2.5 opacity-60 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {activeStatusRowId === rec.id && (
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-full mt-1.5 z-50 left-1/2 -translate-x-1/2 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-100 text-left flex flex-col gap-0.5 ring-1 ring-black/5 dark:ring-white/10"
                          >
                            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 mb-0.5">
                              Update Status
                            </div>
                            {(['Pending', 'Data Requested', 'In Progress', 'ARN Generated', 'Completed', 'Rejected'] as GSTRegistrationStatus[]).map(st => (
                              <button 
                                key={st} 
                                type="button"
                                onClick={() => handleInlineUpdate(rec.id, 'status', st)} 
                                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                                  rec.status === st 
                                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold' 
                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className={`h-1.5 w-1.5 rounded-full ${getStatusDot(st)}`} />
                                  <span>{st}</span>
                                </div>
                                {rec.status === st && (
                                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300 uppercase whitespace-nowrap font-mono">
                        {formatDate(rec.appDate)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <input 
                          type="text" 
                          value={rec.arn || ''} 
                          onChange={e => handleInlineUpdate(rec.id, 'arn', e.target.value)}
                          className="w-full bg-transparent border-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 rounded-lg px-2 py-1 font-bold text-indigo-600 dark:text-indigo-400 font-mono tracking-wider uppercase transition-all text-xs"
                          placeholder="AA0000..."
                        />
                      </td>
                      <td className="sticky right-0 bg-white/95 dark:bg-slate-900/95 group-hover:bg-indigo-50/40 dark:group-hover:bg-slate-850 backdrop-blur-md z-20 px-3 py-1.5 text-right w-[95px] min-w-[95px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                        <div className="flex items-center justify-end gap-1.5">
                          <button 
                            onClick={() => { setSelectedRecord(rec); setIsFormOpen(true); }} 
                            className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 transition-all flex items-center justify-center cursor-pointer shadow-2xs active:scale-95" 
                            title="Edit Record"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button 
                            onClick={() => handleDelete(rec.id)} 
                            className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 transition-all flex items-center justify-center cursor-pointer shadow-2xs active:scale-95" 
                            title="Delete Record"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <GSTRegistrationForm 
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

export default GSTRegistration;
