import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useModuleData } from '../../hooks/useModuleData.ts';
import { api } from '../../services/api.ts';
import Loader from '../../components/Loader';
import { formatDate } from '../../dateUtils.ts';
import ViewControl from '../../components/ViewControl';
import { ExportMenu } from '../../components/ExportMenu';
import { GoogleCalendarModal } from '../../components/GoogleCalendarModal';
import { syncDeadlineToGoogleCalendar } from '../../services/googleCalendar';
import { exportToCSV, printList } from '../../exportUtils';
import { toast } from 'sonner';
import { Calendar } from 'lucide-react';

interface UnifiedDeadline {
  id: string;
  title: string;
  client: string;
  date: string;
  category: string;
  priority: 'High' | 'Medium' | 'Low';
  status: string;
  origin: 'litigation' | 'work' | 'food_license' | 'statutory';
  expiryDate?: string;
}

export const Reminders: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'All' | 'Statutory' | 'Litigation' | 'Misc Work' | 'Food License'>('All');
  const [dueFilter, setDueFilter] = useState<'All' | 'overdue' | 'due15' | 'safe'>('All');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [activeSnoozeId, setActiveSnoozeId] = useState<string | null>(null);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const snoozeMenuRef = useRef<HTMLDivElement>(null);

  // Separate React Query for each filter/tab, leveraging separate database datasets
  const { data: reminderData = [], isLoading } = useModuleData<UnifiedDeadline[]>('reminders_data', filter);

  // Query all for stats calculation
  const { data: allReminderData = [] } = useModuleData<UnifiedDeadline[]>('reminders_data', 'All');

  useEffect(() => {
    const syncHandler = () => {
      queryClient.invalidateQueries({ queryKey: ['reminders_data'] });
    };
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, [queryClient]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (snoozeMenuRef.current && !snoozeMenuRef.current.contains(e.target as Node)) {
        setActiveSnoozeId(null);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const deadlines = reminderData || [];
  const totalDeadlines = allReminderData || deadlines;

  const getDaysLeft = (dueDate: string) => {
    if (!dueDate) return 999;
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = due.getTime() - now.getTime();
    return Math.round(diff / (1000 * 60 * 60 * 24));
  };

  const getThreshold = (d: UnifiedDeadline) => {
    return d.origin === 'food_license' ? 60 : 15;
  };

  const stats = useMemo(() => {
    const total = totalDeadlines.length;
    let overdue = 0;
    let dueIn15Days = 0;
    let safe = 0;

    totalDeadlines.forEach(d => {
      const dl = getDaysLeft(d.date);
      const threshold = getThreshold(d);
      if (dl < 0) overdue++;
      else if (dl >= 0 && dl <= threshold) dueIn15Days++;
      else safe++;
    });

    return {
      total,
      overdue,
      dueIn15Days,
      safe,
      statutory: totalDeadlines.filter(d => d.origin === 'statutory').length,
      litigation: totalDeadlines.filter(d => d.origin === 'litigation').length,
      misc: totalDeadlines.filter(d => d.origin === 'work').length,
      foodLicense: totalDeadlines.filter(d => d.origin === 'food_license').length
    };
  }, [totalDeadlines]);

  const REMINDER_FILTER_OPTIONS = [
    { id: 'all', label: 'All Deadlines', shortLabel: 'All Deadlines', group: 'Urgency', dot: 'bg-indigo-500' },
    { id: 'overdue', label: 'Overdue Deadlines', shortLabel: 'Overdue', group: 'Urgency', dot: 'bg-rose-500' },
    { id: 'due15', label: 'Due in ≤15 Days', shortLabel: 'Due ≤15d', group: 'Urgency', dot: 'bg-amber-500' },
    { id: 'safe', label: 'Safe (>15 Days)', shortLabel: 'Safe (>15d)', group: 'Urgency', dot: 'bg-emerald-500' },
    { id: 'Statutory', label: 'Statutory Deadlines', shortLabel: 'Statutory', group: 'Module', dot: 'bg-purple-500' },
    { id: 'Litigation', label: 'Litigation Suite', shortLabel: 'Litigation', group: 'Module', dot: 'bg-blue-500' },
    { id: 'Misc Work', label: 'Misc Work Orders', shortLabel: 'Misc Work', group: 'Module', dot: 'bg-teal-500' },
    { id: 'Food License', label: 'FSSAI License Renewals', shortLabel: 'Food Licenses', group: 'Module', dot: 'bg-emerald-600' },
  ];

  const currentOption = useMemo(() => {
    if (dueFilter !== 'All') {
      return REMINDER_FILTER_OPTIONS.find(o => o.id === dueFilter) || REMINDER_FILTER_OPTIONS[0];
    }
    if (filter !== 'All') {
      return REMINDER_FILTER_OPTIONS.find(o => o.id === filter) || REMINDER_FILTER_OPTIONS[0];
    }
    return REMINDER_FILTER_OPTIONS[0];
  }, [dueFilter, filter]);

  const currentCount = useMemo(() => {
    switch (currentOption.id) {
      case 'all': return stats.total;
      case 'overdue': return stats.overdue;
      case 'due15': return stats.dueIn15Days;
      case 'safe': return stats.safe;
      case 'Statutory': return stats.statutory;
      case 'Litigation': return stats.litigation;
      case 'Misc Work': return stats.misc;
      case 'Food License': return stats.foodLicense;
      default: return stats.total;
    }
  }, [currentOption, stats]);

  const handleSelectFilter = (id: string) => {
    if (id === 'all') {
      setFilter('All');
      setDueFilter('All');
    } else if (id === 'overdue' || id === 'due15' || id === 'safe') {
      setFilter('All');
      setDueFilter(id as any);
    } else {
      setFilter(id as any);
      setDueFilter('All');
    }
    setIsFilterDropdownOpen(false);
  };

  const filteredRecords = useMemo(() => {
    const s = search.toLowerCase();
    let list = deadlines.filter(d => 
      (d.client || '').toLowerCase().includes(s) || 
      (d.title || '').toLowerCase().includes(s) || 
      (d.category || '').toLowerCase().includes(s)
    );

    if (dueFilter === 'overdue') {
      list = list.filter(d => getDaysLeft(d.date) < 0);
    } else if (dueFilter === 'due15') {
      list = list.filter(d => {
        const dl = getDaysLeft(d.date);
        return dl >= 0 && dl <= getThreshold(d);
      });
    } else if (dueFilter === 'safe') {
      list = list.filter(d => getDaysLeft(d.date) > getThreshold(d));
    }

    return list;
  }, [deadlines, search, dueFilter]);

  const deadlinesForCalendarSync = useMemo(() => {
    return filteredRecords.map(item => ({
      id: item.id,
      title: item.title,
      client: item.client,
      category: item.category,
      date: item.date
    }));
  }, [filteredRecords]);

  const handleMarkCompleted = async (item: UnifiedDeadline) => {
    try {
      if (item.origin === 'work') {
        await api.saveMiscWork({ id: item.id, status: 'Completed' });
        toast.success(`Task for "${item.client}" marked as completed`);
      } else if (item.origin === 'litigation') {
        await api.saveLitigationRecord({ 
          id: item.id, 
          status: 'Filed', 
          filedDate: new Date().toISOString().split('T')[0] 
        });
        toast.success(`Notice response for "${item.client}" marked as filed`);
      } else if (item.origin === 'food_license') {
        await api.saveFoodLicense({ id: item.id, status: 'Completed' });
        toast.success(`Food License for "${item.client}" marked as completed`);
      } else if (item.origin === 'statutory') {
        toast.info(`Statutory deadline "${item.title}" noted.`);
      }
      queryClient.invalidateQueries({ queryKey: ['reminders_data'] });
      window.dispatchEvent(new CustomEvent('clientify_db_change'));
    } catch (err) {
      toast.error('Failed to update task status');
    }
  };

  const handleSingleItemCalendarSync = async (item: UnifiedDeadline) => {
    const body = `Compliance Item: ${item.title}\nClient/Portfolio: ${item.client}\nCategory: ${item.category}\nDue Date: ${formatDate(item.date)}`;
    await syncDeadlineToGoogleCalendar(item.title, body, item.date, item.id);
  };

  const handleSnooze = async (item: UnifiedDeadline, days: number) => {
    try {
      const targetBase = item.date ? new Date(item.date) : new Date();
      const newDateObj = new Date(targetBase.getTime() + days * 24 * 60 * 60 * 1000);
      const newDateStr = newDateObj.toISOString().split('T')[0];

      if (item.origin === 'work') {
        await api.saveMiscWork({ id: item.id, startDate: newDateStr });
      } else if (item.origin === 'litigation') {
        await api.saveLitigationRecord({ id: item.id, dueDate: newDateStr });
      } else if (item.origin === 'food_license') {
        await api.saveFoodLicense({ id: item.id, dueDate: newDateStr });
      }

      toast.success(`Snoozed deadline by +${days} days (${formatDate(newDateStr)})`);
      setActiveSnoozeId(null);
      queryClient.invalidateQueries({ queryKey: ['reminders_data'] });
      window.dispatchEvent(new CustomEvent('clientify_db_change'));
    } catch (err) {
      toast.error('Failed to snooze deadline');
    }
  };

  const handleExportCSV = () => {
    const headers = ['S.No.', 'Entity Identity', 'Module', 'Task Reference', 'Target Date', 'Remaining Days', 'Status'];
    const rows = filteredRecords.map((item, idx) => {
      const dl = getDaysLeft(item.date);
      const remainingStr = dl < 0 ? `${Math.abs(dl)} days overdue` : `${dl} days left`;
      return [
        (idx + 1).toString().padStart(2, '0'),
        item.client,
        item.category,
        item.title,
        item.date ? formatDate(item.date) : '---',
        remainingStr,
        item.status || 'Pending'
      ];
    });
    exportToCSV(headers, rows, 'Vault_Reminders_List.csv');
  };

  const handleExportPDF = () => {
    const headers = ['Entity Identity', 'Module', 'Task Reference', 'Target Date', 'Remaining'];
    const rows = filteredRecords.map(item => {
      const dl = getDaysLeft(item.date);
      const remainingStr = dl < 0 ? `${Math.abs(dl)}d overdue` : `${dl}d left`;
      return [
        item.client,
        item.category,
        item.title,
        item.date ? formatDate(item.date) : '---',
        remainingStr
      ];
    });
    printList('Vault Upcoming Deadlines & Reminders', headers, rows);
  };

  if (isLoading && !reminderData) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* Modern Unified Single-Line Toolbar: Search First, Count Badge Second */}
      <div className="relative z-50 flex items-center justify-between gap-1.5 sm:gap-2 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs shrink-0 w-full max-w-full min-w-0 flex-nowrap overflow-visible transition-colors">
        
        {/* Left Section: Search Input (First) + Combined Single Count Dropdown Badge (Second) */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 flex-nowrap">
          
          {/* First: Search Bar */}
          <div className="relative flex-1 min-w-[180px] sm:min-w-[240px] w-full group">
            <input 
              type="text" 
              placeholder="Search deadlines by client, case reference, or task..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 rounded-xl py-2 pl-9 pr-24 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none shadow-2xs" 
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
              <span className="font-mono tabular-nums">{filteredRecords.length} found</span>
              {search && (
                <button onClick={() => setSearch('')} className="p-0.5 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Combined Single Count Badge with Dropdown - Second (Shifted after search bar) */}
          <div className="relative shrink-0" ref={filterDropdownRef}>
            <button
              type="button"
              onClick={() => setIsFilterDropdownOpen(prev => !prev)}
              className={`h-9 px-2.5 rounded-lg border text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap ${
                isFilterDropdownOpen
                  ? 'bg-slate-900 text-white dark:bg-indigo-600 border-slate-900 dark:border-indigo-600'
                  : currentOption.id !== 'all'
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                    : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
              title="Filter reminders by deadline urgency or module portfolio"
            >
              <span className={`h-2 w-2 rounded-full ${currentOption.dot} shrink-0`} />
              <span className="font-bold">{currentOption.shortLabel}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                isFilterDropdownOpen 
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
              }`}>
                {currentCount}
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

            {/* Dropdown Menu listing Urgency Deadlines and Module Portfolios */}
            {isFilterDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-64 max-h-96 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-1.5 z-[100] animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 mb-1 flex items-center justify-between">
                  <span>Urgency Deadlines</span>
                  <span className="font-mono text-[9px] text-slate-400 font-bold">{stats.total} Total</span>
                </div>
                {REMINDER_FILTER_OPTIONS.filter(o => o.group === 'Urgency').map(opt => {
                  const isSelected = (opt.id === 'all' && filter === 'All' && dueFilter === 'All') || (dueFilter === opt.id);
                  const count = opt.id === 'all' ? stats.total : opt.id === 'overdue' ? stats.overdue : opt.id === 'due15' ? stats.dueIn15Days : stats.safe;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectFilter(opt.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${opt.dot}`} />
                        <span className="truncate">{opt.label}</span>
                      </div>
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0 ml-2">
                        {count}
                      </span>
                    </button>
                  );
                })}

                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 my-1 pt-1.5 flex items-center justify-between">
                  <span>Module Portfolios</span>
                  <span className="font-mono text-[9px] text-slate-400 font-bold">4 Portfolios</span>
                </div>
                {REMINDER_FILTER_OPTIONS.filter(o => o.group === 'Module').map(opt => {
                  const isSelected = filter === opt.id && dueFilter === 'All';
                  const count = opt.id === 'Statutory' ? stats.statutory : opt.id === 'Litigation' ? stats.litigation : opt.id === 'Misc Work' ? stats.misc : stats.foodLicense;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectFilter(opt.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${opt.dot}`} />
                        <span className="truncate">{opt.label}</span>
                      </div>
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0 ml-2">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Section: Google Calendar Sync + ViewControl + ExportMenu + Refresh */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsCalendarModalOpen(true)}
            className="h-9 px-2.5 sm:px-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-xs shadow-2xs hover:shadow-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 uppercase tracking-wider"
            title="Google Calendar Synchronization & Settings"
          >
            <Calendar className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="hidden sm:inline">Calendar Sync</span>
            <span className="sm:hidden">Sync</span>
          </button>

          <ViewControl 
            viewMode={viewMode} 
            onViewChange={setViewMode} 
          />

          <ExportMenu 
            onExportCSV={handleExportCSV} 
            onExportPDF={handleExportPDF} 
          />

          <button 
            type="button"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['reminders_data'] });
              toast.success('Reminders refreshed');
            }} 
            className="h-9 w-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 flex items-center justify-center transition-all shadow-2xs cursor-pointer shrink-0 active:scale-95"
            title="Refresh Deadlines"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content Area: Table / Grid */}
      <div className="relative z-10 flex-1 min-h-0 w-full max-w-full min-w-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden flex flex-col transition-colors">
        {viewMode === 'grid' ? (
          <div className="overflow-y-auto no-scrollbar flex-1 p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredRecords.length === 0 ? (
              <div className="col-span-full py-24 text-center text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                No Deadlines Matching Selected Filter
              </div>
            ) : (
              filteredRecords.map((item, idx) => {
                const dl = getDaysLeft(item.date);
                const isOverdue = dl < 0;
                const isUrgent = dl >= 0 && dl <= getThreshold(item);

                return (
                  <div 
                    key={item.id}
                    className={`rounded-2xl p-3.5 border transition-all flex flex-col justify-between gap-3 relative ${
                      isOverdue 
                        ? 'bg-rose-50/20 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 hover:border-rose-300' 
                        : isUrgent 
                        ? 'bg-amber-50/20 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 hover:border-amber-300' 
                        : 'bg-white/80 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/80 hover:border-indigo-300 dark:hover:border-indigo-700/70'
                    }`}
                  >
                    {/* Header: S.No., Module badge & Urgency tag */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-500 dark:text-indigo-400">
                          #{(idx + 1).toString().padStart(2, '0')}
                        </span>
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide border ${
                          item.origin === 'statutory'
                            ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400 border-purple-200/60 dark:border-purple-800/60'
                            : item.origin === 'litigation' 
                            ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60' 
                            : item.origin === 'food_license'
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/60'
                            : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border-blue-200/60 dark:border-blue-800/60'
                        }`}>
                          {item.category}
                        </span>
                      </div>

                      {/* Urgency Badge */}
                      {isOverdue ? (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 inline-flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-ping" />
                          {Math.abs(dl)}d overdue
                        </span>
                      ) : isUrgent ? (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 inline-flex items-center gap-1.5 animate-pulse">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-ping" />
                          {dl}d left
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60 inline-flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {dl}d left
                        </span>
                      )}
                    </div>

                    {/* Entity & Task Reference */}
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate" title={item.client}>
                        {item.client}
                      </h4>
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed" title={item.title}>
                        {item.title}
                      </p>
                    </div>

                    {/* Target Date Box */}
                    <div className="bg-slate-50/80 dark:bg-slate-800/80 p-2 rounded-xl border border-slate-200/70 dark:border-slate-700/70 space-y-1 text-xs">
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span className="font-semibold text-slate-400 dark:text-slate-500 uppercase text-[10px]">Target Date:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{formatDate(item.date)}</span>
                      </div>
                      {item.expiryDate && (
                        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-slate-400 dark:text-slate-500 uppercase text-[10px]">Expiry:</span>
                          <span className="font-medium text-slate-600 dark:text-slate-300">{formatDate(item.expiryDate)}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/60 gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <button 
                          type="button"
                          onClick={() => handleMarkCompleted(item)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                          <span>Done</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSingleItemCalendarSync(item)}
                          className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/70 dark:border-indigo-800/70 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 transition-all cursor-pointer shadow-2xs"
                          title="Sync to Google Calendar"
                        >
                          <Calendar className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Snooze Options */}
                      <div className="relative">
                        <button 
                          type="button"
                          onClick={() => setActiveSnoozeId(activeSnoozeId === item.id ? null : item.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          <span>Snooze</span>
                        </button>

                        {activeSnoozeId === item.id && (
                          <div 
                            ref={snoozeMenuRef}
                            className="absolute right-0 bottom-full mb-1.5 w-36 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-1.5 z-40 animate-in zoom-in-95 space-y-0.5"
                          >
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 py-1">Snooze By</p>
                            <button onClick={() => handleSnooze(item, 3)} className="w-full text-left px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors cursor-pointer">
                              +3 Days
                            </button>
                            <button onClick={() => handleSnooze(item, 7)} className="w-full text-left px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors cursor-pointer">
                              +7 Days
                            </button>
                            <button onClick={() => handleSnooze(item, 15)} className="w-full text-left px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors cursor-pointer">
                              +15 Days
                            </button>
                          </div>
                        )}
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
                <tr className="font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 text-[11px]">
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[55px] text-center whitespace-nowrap">S.No.</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[24%] min-w-[180px]">Entity Identity</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[14%] min-w-[120px] whitespace-nowrap">Module</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[26%] min-w-[200px]">Task Reference</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[12%] min-w-[110px] whitespace-nowrap">Target Date</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 w-[12%] min-w-[110px] whitespace-nowrap">Remaining</th>
                  <th className="sticky top-0 right-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2 border-b border-slate-200/90 dark:border-slate-700/90 text-right w-[140px] min-w-[140px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-24 text-center text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                      No Deadlines Matching Selected Filter
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((item, idx) => {
                    const dl = getDaysLeft(item.date);
                    const isOverdue = dl < 0;
                    const isUrgent = dl >= 0 && dl <= getThreshold(item);

                    return (
                      <tr 
                        key={item.id} 
                        className={`group hover:bg-indigo-50/40 dark:hover:bg-slate-800/60 transition-colors ${
                          isOverdue ? 'bg-rose-50/15 dark:bg-rose-950/15' : isUrgent ? 'bg-amber-50/15 dark:bg-amber-950/15' : ''
                        }`}
                      >
                        <td className="px-3 py-2 font-bold text-indigo-500 dark:text-indigo-400 font-mono text-center whitespace-nowrap">
                          {(idx + 1).toString().padStart(2, '0')}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100 truncate min-w-[180px]" title={item.client}>
                          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {item.client}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide border ${
                            item.origin === 'statutory'
                              ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400 border-purple-200/60 dark:border-purple-800/60'
                              : item.origin === 'litigation' 
                              ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60' 
                              : item.origin === 'food_license'
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/60'
                              : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border-blue-200/60 dark:border-blue-800/60'
                          }`}>
                            {item.category}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300 truncate" title={item.title}>
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {item.title}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {formatDate(item.date)}
                          </div>
                          {item.expiryDate && (
                            <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500">Exp: {formatDate(item.expiryDate)}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {isOverdue ? (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 inline-flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-ping" />
                              {item.origin === 'food_license' ? `Expired (${Math.abs(dl)}d)` : `${Math.abs(dl)}d overdue`}
                            </span>
                          ) : isUrgent ? (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 inline-flex items-center gap-1.5 animate-pulse">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-ping" />
                              {dl}d left {item.origin === 'food_license' ? '(Renewal)' : ''}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60 inline-flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              {dl}d left
                            </span>
                          )}
                        </td>
                        <td className="sticky right-0 z-20 bg-white/95 dark:bg-slate-900/95 group-hover:bg-indigo-50/40 dark:group-hover:bg-slate-850 backdrop-blur-md px-3 py-1.5 text-right w-[140px] min-w-[140px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Calendar Sync Button */}
                            <button
                              type="button"
                              onClick={() => handleSingleItemCalendarSync(item)}
                              className="h-6 w-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/70 dark:border-indigo-800/70 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                              title="Sync to Google Calendar"
                            >
                              <Calendar className="h-3 w-3" />
                            </button>

                            {/* Complete Button */}
                            <button 
                              type="button"
                              onClick={() => handleMarkCompleted(item)}
                              className="h-6 px-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/70 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 transition-all text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-2xs cursor-pointer"
                              title="Mark as Completed"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                              <span>Done</span>
                            </button>

                            {/* Snooze Button */}
                            <div className="relative">
                              <button 
                                type="button"
                                onClick={() => setActiveSnoozeId(activeSnoozeId === item.id ? null : item.id)}
                                className="h-6 w-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/70 dark:border-indigo-800/70 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                                title="Snooze Reminder"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              </button>

                              {activeSnoozeId === item.id && (
                                <div 
                                  ref={snoozeMenuRef}
                                  className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-1.5 z-40 animate-in zoom-in-95 space-y-0.5 text-left"
                                >
                                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 py-1">Snooze By</p>
                                  <button onClick={() => handleSnooze(item, 3)} className="w-full text-left px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors cursor-pointer">
                                    +3 Days
                                  </button>
                                  <button onClick={() => handleSnooze(item, 7)} className="w-full text-left px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors cursor-pointer">
                                    +7 Days
                                  </button>
                                  <button onClick={() => handleSnooze(item, 15)} className="w-full text-left px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors cursor-pointer">
                                    +15 Days
                                  </button>
                                </div>
                              )}
                            </div>
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

      {/* Google Calendar Settings & Batch Sync Modal */}
      <GoogleCalendarModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        deadlinesToSync={deadlinesForCalendarSync}
      />
    </div>
  );
};

export default Reminders;

