import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useModuleData } from '../../hooks/useModuleData.ts';
import { MiscWorkRecord, MiscWorkStatus } from '../../types';
import { api } from '../../services/api.ts';
import WorkForm from '../Clientform/workForm';
import Loader from '../../components/Loader';
import { TableFilter } from '../../components/TableFilter';
import { toast } from 'sonner';
import { formatDate as formatDateUtil } from '../../dateUtils.ts';
import { ViewControl } from '../../components/ViewControl';

interface InlineDescriptionCellProps {
  id: string;
  value: string;
  onSave: (id: string, newDesc: string) => void;
  className?: string;
}

const InlineDescriptionCell: React.FC<InlineDescriptionCellProps> = ({ id, value, onSave, className = '' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(value || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(value || '');
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleCommit = () => {
    setIsEditing(false);
    const trimmed = text.trim();
    if (trimmed !== (value || '').trim()) {
      onSave(id, trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommit();
    } else if (e.key === 'Escape') {
      setText(value || '');
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className={`flex items-center gap-1 w-full ${className}`} onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
          className="w-full bg-white dark:bg-slate-800 border border-indigo-500 rounded-md px-2 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none shadow-xs ring-2 ring-indigo-500/20"
          placeholder="Type task description..."
        />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommit();
          }}
          className="h-6 w-6 shrink-0 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center text-xs font-bold cursor-pointer shadow-xs active:scale-95"
          title="Save Description (Enter)"
        >
          ✓
        </button>
      </div>
    );
  }

  return (
    <div 
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      className={`group/desc flex items-center justify-between gap-1 w-full cursor-pointer rounded-md px-1.5 py-0.5 -mx-1.5 hover:bg-indigo-50/70 dark:hover:bg-slate-800/80 transition-colors border border-transparent hover:border-indigo-200/70 dark:hover:border-slate-700 ${className}`}
      title="Click to edit task description"
    >
      <p className="font-medium text-slate-800 dark:text-slate-200 uppercase leading-snug truncate text-xs flex-1" title={value}>
        {value ? (
          value
        ) : (
          <span className="text-slate-400 italic font-normal text-[11px] lowercase">Click to add description...</span>
        )}
      </p>
      <span className="opacity-0 group-hover/desc:opacity-100 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-opacity shrink-0 p-0.5" title="Edit">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </span>
    </div>
  );
};

const Miscellaneouswork: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<MiscWorkRecord | null>(null);
  const [activeStatusRowId, setActiveStatusRowId] = useState<string | null>(null);
  const [activeActionsRecord, setActiveActionsRecord] = useState<MiscWorkRecord | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [compactMode, setCompactMode] = useState(false);

  const { data: records = [], isLoading } = useModuleData<MiscWorkRecord[]>('misc_work');

  const saveMutation = useMutation({
    mutationFn: (data: Partial<MiscWorkRecord>) => api.saveMiscWork(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['misc_work'] });
    },
    onError: () => {
      toast.error("Operation failed.");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteMiscWork(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['misc_work'] });
      toast.success("Work record deleted.");
    },
    onError: () => {
      toast.error("Deletion failed.");
    }
  });

  useEffect(() => {
    const syncHandler = () => {
      queryClient.invalidateQueries({ queryKey: ['misc_work'] });
    };
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, [queryClient]);

  // Handle outside clicks for filter dropdown & active status dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
      setActiveStatusRowId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInlineUpdate = async (id: string, field: keyof MiscWorkRecord, value: any) => {
    const updatedRecord = records.find(r => r.id === id);
    if (!updatedRecord) return;
    
    try {
      const newRecord = { ...updatedRecord, [field]: value };
      if (field === 'status' && value === 'Completed' && !newRecord.completionDate) {
        newRecord.completionDate = new Date().toISOString().split('T')[0];
      }
      await saveMutation.mutateAsync(newRecord);
      if (field === 'description') {
        toast.success('Task description updated!');
      } else if (field === 'status') {
        toast.success(`Status updated to ${value}!`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to update task');
    }
    setActiveStatusRowId(null);
  };

  const filteredRecords = useMemo(() => {
    let list = records;
    if (statusFilter !== 'All') {
      list = list.filter(r => r.status === statusFilter);
    }
    const s = search.toLowerCase();
    return list.filter(r => 
      (r.clientName || '').toLowerCase().includes(s) || 
      (r.mobile && String(r.mobile).includes(s)) ||
      (String(r.description || '')).toLowerCase().includes(s) ||
      (String(r.assignedTo || '')).toLowerCase().includes(s)
    ).sort((a, b) => (new Date(b.startDate || 0).getTime() || 0) - (new Date(a.startDate || 0).getTime() || 0));
  }, [records, search, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: records.length,
      pending: records.filter(r => r.status === 'Pending').length,
      inProgress: records.filter(r => r.status === 'In Progress').length,
      completed: records.filter(r => r.status === 'Completed').length,
      onHold: records.filter(r => r.status === 'On Hold').length,
    };
  }, [records]);

  const filterOptions = useMemo(() => [
    { value: 'All', label: 'Total Tasks', shortLabel: 'Queue', count: stats.total, dot: 'bg-indigo-500' },
    { value: 'Pending', label: 'Pending', shortLabel: 'Pending', count: stats.pending, dot: 'bg-amber-500' },
    { value: 'In Progress', label: 'In Progress', shortLabel: 'In Progress', count: stats.inProgress, dot: 'bg-indigo-500' },
    { value: 'Completed', label: 'Completed', shortLabel: 'Completed', count: stats.completed, dot: 'bg-emerald-500' },
    { value: 'On Hold', label: 'On Hold', shortLabel: 'On Hold', count: stats.onHold, dot: 'bg-rose-500' },
  ], [stats]);

  const currentFilterOption = useMemo(() => {
    return filterOptions.find(f => f.value === statusFilter) || filterOptions[0];
  }, [filterOptions, statusFilter]);

  const handleDelete = async (id: string) => {
    if (confirm('Delete this work item from the vault permanently?')) {
      deleteMutation.mutate(id);
    }
  };

  const getStatusColor = (st: MiscWorkStatus) => {
    switch (st) {
      case 'Completed': 
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80 hover:bg-emerald-100/80';
      case 'On Hold': 
        return 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/80 hover:bg-rose-100/80';
      case 'In Progress': 
        return 'bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/80 hover:bg-indigo-100/80';
      case 'Pending': 
      default: 
        return 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80 hover:bg-amber-100/80';
    }
  };

  const getStatusDot = (st: MiscWorkStatus) => {
    switch (st) {
      case 'Completed': return 'bg-emerald-500';
      case 'On Hold': return 'bg-rose-500';
      case 'In Progress': return 'bg-indigo-500';
      case 'Pending': 
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
              placeholder="Search Client, Task Description or Staff..." 
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
                  Filter Work Items
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
            <span className="hidden sm:inline">Add Task</span>
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
                No miscellaneous tasks archived
              </div>
            ) : (
              filteredRecords.map((rec, idx) => (
                <div key={rec.id} className="p-3.5 bg-slate-50/70 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-3 relative">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                        #{(idx + 1).toString().padStart(2, '0')}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase font-mono">
                        <span>Logged: {formatDate(rec.startDate)}</span>
                        {rec.completionDate && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                            • Done: {formatDate(rec.completionDate)}
                          </span>
                        )}
                      </div>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate uppercase" title={rec.clientName}>
                      {rec.clientName || '---'}
                    </h4>
                    <p className="text-[9px] font-mono text-slate-400 dark:text-slate-500 mb-0.5">
                      Mob: {rec.mobile || 'No Contact'}
                    </p>
                  </div>

                  <div className="p-2.5 bg-white dark:bg-slate-900/80 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-2 text-xs">
                    <div className="flex flex-col space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Task Description:</span>
                        <span className="text-[9px] text-indigo-500/80 font-medium">Click to edit</span>
                      </div>
                      <InlineDescriptionCell 
                        id={rec.id}
                        value={rec.description || ''}
                        onSave={(id, desc) => handleInlineUpdate(id, 'description', desc)}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Staff Assigned:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300 uppercase truncate max-w-[140px]">
                        {rec.assignedTo || 'Unassigned'}
                      </span>
                    </div>

                    {rec.completionDate && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span className="font-bold text-[10px] text-emerald-600 dark:text-emerald-400 uppercase">Completed On:</span>
                        <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          {formatDate(rec.completionDate)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Status Pill + Edit & 3-Dots Buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60 relative overflow-visible">
                    <div className="relative">
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveStatusRowId(activeStatusRowId === rec.id ? null : rec.id);
                        }}
                        className={`inline-flex items-center justify-between gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-semibold tracking-tight border transition-all cursor-pointer active:scale-95 shadow-2xs ${getStatusColor(rec.status)}`}
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
                          className="absolute bottom-full mb-1 left-0 z-50 w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-1.5 text-left animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5 ring-1 ring-black/5 dark:ring-white/10"
                        >
                          <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 mb-0.5">
                            Update Status
                          </div>
                          {(['Pending', 'In Progress', 'Completed', 'On Hold'] as MiscWorkStatus[]).map(st => (
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
                              <div className="flex items-center gap-1.5">
                                <span className={`h-1.5 w-1.5 rounded-full ${getStatusDot(st)}`} />
                                <span>{st}</span>
                              </div>
                              {rec.status === st && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />}
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
                        className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-750 transition-all flex items-center justify-center cursor-pointer shadow-2xs active:scale-95" 
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
              ))
            )}
          </div>
        ) : (
          <div className="w-full overflow-x-auto overflow-y-auto no-scrollbar flex-1 relative h-full">
            <table className={`w-full min-w-[890px] text-left border-collapse table-fixed ${compactMode ? 'compact-mode' : ''}`}>
              <thead className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 shadow-2xs">
                <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 select-none">
                  <th className="px-1.5 py-2 text-center whitespace-nowrap w-[4%] min-w-[36px] text-slate-500 dark:text-slate-400">#</th>
                  <th className="px-2 py-2 text-left w-[17%] min-w-[140px]">Client / Entity</th>
                  <th className="px-2 py-2 text-left w-[21%] min-w-[170px]" title="Click any description in the table to edit inline">
                    <div className="flex items-center gap-1">
                      <span>Task Description</span>
                      <svg className="h-3 w-3 text-slate-400 dark:text-slate-500 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </div>
                  </th>
                  <th className="px-2 py-2 text-center w-[13%] min-w-[115px] whitespace-nowrap">
                    <div className="flex justify-center flex-col items-center">
                      <TableFilter label="Status" isActive={statusFilter !== 'All'} onClear={() => setStatusFilter('All')}>
                         {['All', 'Pending', 'In Progress', 'Completed', 'On Hold'].map(st => (
                           <button 
                             key={st} 
                             type="button"
                             onClick={() => setStatusFilter(st)} 
                             className={`w-full text-left px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                               statusFilter === st 
                                 ? 'bg-indigo-600 text-white font-bold' 
                                 : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                             }`}
                           >
                             <div className="flex items-center gap-1.5">
                               {st !== 'All' && (
                                 <span className={`h-1.5 w-1.5 rounded-full ${getStatusDot(st as MiscWorkStatus)}`} />
                               )}
                               <span>{st}</span>
                             </div>
                             {statusFilter === st && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                           </button>
                         ))}
                      </TableFilter>
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left w-[12%] min-w-[105px] whitespace-nowrap">Staff Assigned</th>
                  <th className="px-2 py-2 text-center w-[11%] min-w-[105px] whitespace-nowrap">Logged Date</th>
                  <th className="px-2 py-2 text-center w-[12.5%] min-w-[120px] whitespace-nowrap text-emerald-600 dark:text-emerald-400">Complete Date</th>
                  <th className="px-2 py-2 text-right w-[9.5%] min-w-[95px] whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider text-xs">
                      No miscellaneous tasks archived
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec, idx) => (
                    <tr key={rec.id} className="transition-all group border-b border-slate-100 dark:border-slate-800/60 hover:bg-indigo-50/30 dark:hover:bg-slate-800/40 animate-in fade-in slide-in-from-bottom-1 duration-150 text-xs font-semibold">
                      <td className="px-1.5 py-2 text-slate-400 dark:text-slate-500 font-bold whitespace-nowrap text-center text-xs">
                        {(idx + 1).toString().padStart(2, '0')}
                      </td>
                      <td className="px-2 py-2 overflow-hidden text-left">
                         <p className="font-bold text-slate-900 dark:text-white uppercase leading-snug truncate text-sm" title={rec.clientName}>
                           {rec.clientName || '---'}
                         </p>
                         <div className="flex items-center gap-1 text-[9px] text-slate-400 dark:text-slate-500 font-mono tracking-tight mt-0.5">
                           <span>Mob: {rec.mobile || 'No Contact'}</span>
                           {rec.mobile && (
                             <button
                               type="button"
                               onClick={() => {
                                 navigator.clipboard.writeText(rec.mobile);
                                 toast.success('Mobile copied!');
                               }}
                               className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                               title="Copy Mobile"
                             >
                               <svg className="h-2 w-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 012-2v-8a2 2 0 01-2-2h-8a2 2 0 01-2 2v8a2 2 0 012 2z" />
                               </svg>
                             </button>
                           )}
                         </div>
                      </td>
                      <td className="px-2 py-2 overflow-hidden text-left">
                         <InlineDescriptionCell 
                           id={rec.id}
                           value={rec.description || ''}
                           onSave={(id, desc) => handleInlineUpdate(id, 'description', desc)}
                         />
                      </td>
                      <td className="px-2 py-2 text-center relative overflow-visible whitespace-nowrap">
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveStatusRowId(activeStatusRowId === rec.id ? null : rec.id);
                            }}
                            className={`inline-flex items-center justify-between gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-semibold tracking-tight border transition-all cursor-pointer active:scale-95 shadow-2xs ${getStatusColor(rec.status)}`}
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
                              className="absolute top-full mt-1.5 z-50 left-1/2 -translate-x-1/2 w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-100 text-left flex flex-col gap-0.5 ring-1 ring-black/5 dark:ring-white/10"
                            >
                               <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 mb-0.5">
                                 Update Status
                               </div>
                               {(['Pending', 'In Progress', 'Completed', 'On Hold'] as MiscWorkStatus[]).map(st => (
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
                                   <div className="flex items-center gap-1.5">
                                     <span className={`h-1.5 w-1.5 rounded-full ${getStatusDot(st)}`} />
                                     <span>{st}</span>
                                   </div>
                                   {rec.status === st && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />}
                                 </button>
                               ))}
                            </div>
                          )}
                      </td>
                      <td className="px-2 py-2 overflow-hidden whitespace-nowrap text-left">
                         <span className="font-bold text-slate-700 dark:text-slate-300 uppercase truncate text-xs block">
                           {rec.assignedTo || 'Unassigned'}
                         </span>
                      </td>
                      <td className="px-2 py-2 font-medium text-slate-700 dark:text-slate-300 uppercase whitespace-nowrap text-xs font-mono text-center">
                        {formatDate(rec.startDate)}
                      </td>
                      <td className="px-2 py-2 font-medium uppercase whitespace-nowrap text-xs font-mono text-center">
                        {rec.completionDate ? (
                          <span className="inline-flex items-center justify-center font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200/80 dark:border-emerald-800/60 font-mono text-[11px] shadow-2xs">
                            {formatDate(rec.completionDate)}
                          </span>
                        ) : rec.status === 'Completed' ? (
                          <span className="inline-flex items-center justify-center font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200/80 dark:border-emerald-800/60 text-[10px] uppercase shadow-2xs">
                            Completed
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">---</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap w-[9.5%] min-w-[95px]">
                        <div className="flex items-center justify-end gap-1.5">
                           <button 
                             type="button"
                             onClick={() => { setSelectedRecord(rec); setIsFormOpen(true); }} 
                             className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 transition-all flex items-center justify-center cursor-pointer shadow-2xs active:scale-95" 
                             title="Edit Task"
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
                             className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 transition-all flex items-center justify-center cursor-pointer shadow-2xs active:scale-95" 
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3-Dot Actions Drawer - Portaled to Body */}
      {activeActionsRecord && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999998] flex items-center justify-end p-3 sm:p-6 pointer-events-none">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-950/25 backdrop-blur-[2px] pointer-events-auto animate-in fade-in duration-150"
            onClick={() => setActiveActionsRecord(null)}
          />

          {/* Drawer Panel */}
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative pointer-events-auto w-84 max-w-[calc(100vw-24px)] max-h-[calc(100vh-32px)] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl z-10 text-left animate-in fade-in slide-in-from-right-4 duration-200 overflow-hidden ring-1 ring-black/5 dark:ring-white/10"
          >
            {/* Header */}
            <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Work Task</span>
                  <span className={`px-1.5 py-0.2 rounded-md font-mono text-[9px] font-bold ${getStatusColor(activeActionsRecord.status)}`}>
                    {activeActionsRecord.status}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5 uppercase">
                  {activeActionsRecord.clientName || 'Untitled Client'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Assigned: {activeActionsRecord.assignedTo || 'Unassigned'}
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

            {/* Scrollable Action Options */}
            <div className="overflow-y-auto p-2 space-y-1 no-scrollbar flex-1">
              {/* 1. Edit / Modify Task */}
              <button 
                type="button"
                onClick={() => { 
                  setSelectedRecord(activeActionsRecord);
                  setIsFormOpen(true); 
                  setActiveActionsRecord(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-base shrink-0">
                  ✏️
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 block truncate">Edit / Modify Task</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Update description, staff & dates</span>
                </div>
              </button>

              {/* 2. Quick Mark Completed */}
              {activeActionsRecord.status !== 'Completed' && (
                <button 
                  type="button"
                  onClick={async () => {
                    const today = new Date().toISOString().split('T')[0];
                    await saveMutation.mutateAsync({
                      ...activeActionsRecord,
                      status: 'Completed',
                      completionDate: today
                    });
                    toast.success('Task marked as completed!');
                    setActiveActionsRecord(null);
                  }} 
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30 rounded-xl transition-colors text-left group cursor-pointer"
                >
                  <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-base shrink-0">
                    ✅
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 block truncate">Mark Task Completed</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Timestamp completion date to today</span>
                  </div>
                </button>
              )}

              {/* 3. Copy Task Description */}
              {activeActionsRecord.description && (
                <button 
                  type="button"
                  onClick={() => { 
                    navigator.clipboard.writeText(activeActionsRecord.description || '');
                    toast.success('Task description copied!');
                    setActiveActionsRecord(null); 
                  }} 
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-left group cursor-pointer"
                >
                  <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-sm shrink-0">
                    📋
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 block truncate">Copy Task Description</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">{activeActionsRecord.description}</span>
                  </div>
                </button>
              )}

              {/* 4. Copy Contact Mobile */}
              {activeActionsRecord.mobile && (
                <button 
                  type="button"
                  onClick={() => { 
                    navigator.clipboard.writeText(activeActionsRecord.mobile || '');
                    toast.success('Mobile number copied!');
                    setActiveActionsRecord(null); 
                  }} 
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-left group cursor-pointer"
                >
                  <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-sm shrink-0">
                    📞
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 block truncate">Copy Contact Mobile</span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block truncate">{activeActionsRecord.mobile}</span>
                  </div>
                </button>
              )}

              {/* 5. Delete Work Record (safely inside 3-dot menu, per user request) */}
              <button 
                type="button"
                onClick={() => { 
                  const idToDelete = activeActionsRecord.id;
                  setActiveActionsRecord(null);
                  handleDelete(idToDelete);
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400 text-sm shrink-0">
                  🗑️
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 block truncate">Delete Task Record</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Permanently remove task from archive</span>
                </div>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <WorkForm  
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

export default Miscellaneouswork;
