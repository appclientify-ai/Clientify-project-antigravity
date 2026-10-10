import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Trash2, Calendar, AlertCircle, Sparkles, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import { formatDate } from '../dateUtils';
import { api } from '../services/api';
import { calculateDefaultDueDate } from '../pages/Administration/DueDateSetting';
import { YEARS, FY_MONTHS, FY_QUARTERS } from '../pages/Compliance/GSTReturn/filinglogic/MonthlyFilingLogic';

// Storage Keys
const NOTIFICATION_STORAGE_KEY = 'clientify_notifications_list_v1';
const DEADLINE_STORAGE_KEY = 'clientify_global_compliance_dates_v1';
const NOTIFICATION_LOG_KEY = 'clientify_notified_dates_log_v1';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  type: 'urgent' | 'info' | 'success';
  route?: string;
  category?: 'due_date' | 'system' | 'general';
}

const moduleRoutes: Record<string, string> = {
  'monthly_r1': '/compliance-monthly',
  'monthly_r3b': '/compliance-monthly',
  'quarterly_iff': '/compliance-quarterly',
  'quarterly_r3b': '/compliance-quarterly',
  'composition_cmp08': '/compliance-composition',
  'audit_bs': '/compliance-taxaudit',
  'audit_tax': '/compliance-taxaudit',
  'itr_return': '/compliance-itr',
  'annual_gstr4': '/compliance-gstr4',
  'annual_gstr9': '/compliance-gstr9',
  'annual_gstr9c': '/compliance-gstr9',
};

const moduleNames: Record<string, string> = {
  'monthly_r1': 'GSTR-1 (Monthly)',
  'monthly_r3b': 'GSTR-3B (Monthly)',
  'quarterly_iff': 'GSTR-1 / IFF (Quarterly)',
  'quarterly_r3b': 'GSTR-3B (Quarterly)',
  'composition_cmp08': 'CMP-08',
  'audit_bs': 'Balance Sheet Prep',
  'audit_tax': 'Tax Audit (3CA/3CD)',
  'itr_return': 'ITR Return',
  'annual_gstr4': 'GSTR-4 Annual',
  'annual_gstr9': 'GSTR-9 Annual',
  'annual_gstr9c': 'GSTR-9C Reconciliation',
};

// Custom dispatch helper to show in-app notification banner
export const triggerInAppNotification = (
  title: string, 
  body: string, 
  type: 'urgent' | 'info' | 'success' = 'info',
  route?: string,
  category: 'due_date' | 'system' | 'general' = 'general'
) => {
  const event = new CustomEvent('clientify_show_toast_banner', {
    detail: { title, body, type, route, category }
  });
  window.dispatchEvent(event);
};

export const NotificationCenter: React.FC<{ 
  placement?: 'header' | 'navbar';
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}> = ({ placement = 'header', isOpen: controlledIsOpen, onOpenChange }) => {
  const navigate = useNavigate();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = useCallback((open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open);
    } else {
      setInternalIsOpen(open);
    }
  }, [onOpenChange]);

  const [activeTab, setActiveTab] = useState<'all' | 'due_dates' | 'system'>('all');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [activeBanner, setActiveBanner] = useState<{ title: string; body: string; type: string; route?: string } | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);

  // Scan statutory and database deadlines
  const scanDeadlines = useCallback(async () => {
    try {
      let data: Record<string, string> = {};
      
      // 1. Try to read from Database
      try {
        const dbDates = await api.getAppData(DEADLINE_STORAGE_KEY);
        if (dbDates && typeof dbDates === 'object') {
          data = { ...dbDates };
        }
      } catch (err) {
        console.warn('Could not fetch due dates from db:', err);
      }

      // 2. Fallback to localStorage if db was empty
      if (Object.keys(data).length === 0) {
        const saved = localStorage.getItem(DEADLINE_STORAGE_KEY);
        if (saved) {
          try {
            data = JSON.parse(saved);
          } catch (e) {
            console.error(e);
          }
        }
      }

      // 3. Auto-populate statutory default deadlines if missing
      const currentYear = YEARS[0] || '2025-26';
      const defaultModules = ['monthly_r1', 'monthly_r3b', 'composition_cmp08', 'quarterly_iff', 'quarterly_r3b', 'itr_return', 'audit_tax'];
      
      FY_MONTHS.forEach(m => {
        ['monthly_r1', 'monthly_r3b'].forEach(mod => {
          const k = `${mod}_${currentYear}_${m}`;
          if (!data[k]) {
            data[k] = calculateDefaultDueDate(mod, currentYear, m);
          }
        });
      });
      FY_QUARTERS.forEach(q => {
        ['quarterly_iff', 'quarterly_r3b', 'composition_cmp08'].forEach(mod => {
          const k = `${mod}_${currentYear}_${q}`;
          if (!data[k]) {
            data[k] = calculateDefaultDueDate(mod, currentYear, q);
          }
        });
      });
      ['itr_return', 'audit_tax', 'annual_gstr4', 'annual_gstr9'].forEach(mod => {
        const k = `${mod}_${currentYear}_Annual`;
        if (!data[k]) {
          data[k] = calculateDefaultDueDate(mod, currentYear, 'Annual');
        }
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const parsed = Object.keys(data).map(key => {
        const parts = key.split('_');
        const period = parts.pop() || '';
        const year = parts.pop() || '';
        const moduleId = parts.join('_');
        const dateStr = data[key];
        const date = new Date(dateStr);
        return { key, moduleId, year, period, date, dateString: dateStr };
      }).filter(d => !isNaN(d.date.getTime()));

      const loggedNotifications = JSON.parse(localStorage.getItem(NOTIFICATION_LOG_KEY) || '{}');
      const todayStr = today.toISOString().split('T')[0];

      const newAlerts: NotificationItem[] = [];

      parsed.forEach(d => {
        const diffTime = d.date.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Alert if deadline is within 7 days, 3 days, 1 day, or TODAY
        if (diffDays >= 0 && diffDays <= 7) {
          const notificationLogId = `${d.key}_d_${diffDays}`;
          
          if (loggedNotifications[notificationLogId] !== todayStr) {
            const moduleLabel = moduleNames[d.moduleId] || d.moduleId;
            let title = '';
            let body = '';
            let type: 'urgent' | 'info' = 'info';

            if (diffDays === 0) {
              title = `🚨 Last Date Today: ${moduleLabel}`;
              body = `Today is the final statutory deadline for ${d.period} (${d.year}). File now to prevent late fees.`;
              type = 'urgent';
            } else if (diffDays <= 3) {
              title = `⚠️ Due in ${diffDays} Day${diffDays > 1 ? 's' : ''}: ${moduleLabel}`;
              body = `The last date for ${d.period} (${d.year}) is ${formatDate(d.date)}. Please complete pending returns.`;
              type = 'urgent';
            } else {
              title = `📅 Upcoming Filing: ${moduleLabel}`;
              body = `${moduleLabel} for ${d.period} is due on ${formatDate(d.date)} (${diffDays} days left).`;
              type = 'info';
            }

            const alertItem: NotificationItem = {
              id: `${d.key}_${todayStr}_${diffDays}`,
              title,
              body,
              timestamp: new Date().toISOString(),
              read: false,
              type,
              route: moduleRoutes[d.moduleId] || '/compliance-monthly',
              category: 'due_date'
            };

            newAlerts.push(alertItem);

            // Trigger system browser push if permitted
            if ('Notification' in window && Notification.permission === 'granted' && (diffDays === 0 || diffDays === 1)) {
              try {
                new Notification(title, {
                  body,
                  icon: '/icon.png',
                  tag: notificationLogId,
                });
              } catch (e) {
                console.error('Push notification error:', e);
              }
            }

            loggedNotifications[notificationLogId] = todayStr;
          }
        }
      });

      if (newAlerts.length > 0) {
        setNotifications(prev => {
          // Avoid duplicates by title + body
          const existingKeys = new Set(prev.map(p => `${p.title}_${p.body}`));
          const filtered = newAlerts.filter(n => !existingKeys.has(`${n.title}_${n.body}`));
          const updated = [...filtered, ...prev].slice(0, 50);
          localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });

        // Show banner for the most urgent one
        const urgent = newAlerts.find(a => a.type === 'urgent') || newAlerts[0];
        if (urgent) {
          setActiveBanner({
            title: urgent.title,
            body: urgent.body,
            type: urgent.type,
            route: urgent.route
          });
          setBannerVisible(true);
        }

        localStorage.setItem(NOTIFICATION_LOG_KEY, JSON.stringify(loggedNotifications));
      }
    } catch (e) {
      console.error('Failed to scan compliance deadlines:', e);
    }
  }, []);

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    // Load saved notifications
    const saved = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (saved) {
      try {
        setNotifications(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }

    // Setup listener for custom toast alerts
    const handleShowToast = (e: Event) => {
      const customEv = e as CustomEvent;
      if (customEv.detail) {
        setActiveBanner(customEv.detail);
        setBannerVisible(true);
        
        const newItem: NotificationItem = {
          id: Math.random().toString(36).substring(2, 11),
          title: customEv.detail.title,
          body: customEv.detail.body,
          timestamp: new Date().toISOString(),
          read: false,
          type: customEv.detail.type || 'info',
          route: customEv.detail.route,
          category: customEv.detail.category || 'general'
        };
        
        setNotifications(prev => {
          const updated = [newItem, ...prev].slice(0, 50);
          localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });

        const timer = setTimeout(() => {
          setBannerVisible(false);
        }, 6000);
        return () => clearTimeout(timer);
      }
    };

    window.addEventListener('clientify_show_toast_banner', handleShowToast);
    window.addEventListener('clientify_show_whatsapp_banner', handleShowToast);
    
    // Initial scan and setup periodic scan
    scanDeadlines();
    const interval = setInterval(scanDeadlines, 1000 * 60 * 15); // every 15 mins

    const handleDbChange = () => {
      scanDeadlines();
    };
    window.addEventListener('clientify_db_change', handleDbChange);

    return () => {
      window.removeEventListener('clientify_show_toast_banner', handleShowToast);
      window.removeEventListener('clientify_show_whatsapp_banner', handleShowToast);
      window.removeEventListener('clientify_db_change', handleDbChange);
      clearInterval(interval);
    };
  }, [scanDeadlines]);

  const handleRequestPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then(p => {
        setPermission(p);
        if (p === 'granted') {
          triggerInAppNotification(
            '🔔 Desktop Notifications Enabled',
            'You will receive instant desktop alerts for upcoming return due dates and client filings.',
            'success',
            undefined,
            'system'
          );
        }
      });
    }
  };

  const handleTestNotification = () => {
    const testCases = [
      {
        title: '⚠️ Last Date Alert: GSTR-3B',
        body: 'GSTR-3B return for current month is due in 3 days. Complete client filings to avoid late fees.',
        type: 'urgent' as const,
        route: '/compliance-monthly',
        category: 'due_date' as const
      },
      {
        title: '⚡ Real-Time Sync Completed',
        body: 'All client profiles, portal passwords, and compliance logs are safely synced with the database.',
        type: 'success' as const,
        category: 'system' as const
      },
      {
        title: '📅 CMP-08 Quarterly Window Open',
        body: 'Composition quarterly statement window is active. Review composition clients.',
        type: 'info' as const,
        route: '/compliance-composition',
        category: 'due_date' as const
      }
    ];

    const pick = testCases[Math.floor(Math.random() * testCases.length)];
    triggerInAppNotification(pick.title, pick.body, pick.type, pick.route, pick.category);
  };

  const handleMarkAllRead = () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    setNotifications(updated);
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(updated));
  };

  const handleClearAll = () => {
    setNotifications([]);
    localStorage.removeItem(NOTIFICATION_STORAGE_KEY);
  };

  const handleToggleRead = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = notifications.map(n => n.id === id ? { ...n, read: !n.read } : n);
    setNotifications(updated);
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(updated));
  };

  const handleItemClick = (item: NotificationItem) => {
    if (!item.read) {
      const updated = notifications.map(n => n.id === item.id ? { ...n, read: true } : n);
      setNotifications(updated);
      localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(updated));
    }
    if (item.route) {
      navigate(item.route);
      setIsOpen(false);
    }
  };

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);
  const urgentCount = useMemo(() => notifications.filter(n => !n.read && n.type === 'urgent').length, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'due_dates') return notifications.filter(n => n.category === 'due_date');
    if (activeTab === 'system') return notifications.filter(n => n.category === 'system');
    return notifications;
  }, [notifications, activeTab]);

  return (
    <>
      {/* Toast Notification Alert Overlay */}
      {activeBanner && bannerVisible && (
        <div className="fixed top-5 right-4 sm:right-6 max-w-sm sm:max-w-md w-full z-[10000] animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-[0_20px_50px_rgba(15,23,42,0.15)] flex items-start gap-3.5 relative overflow-hidden">
            <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${
              activeBanner.type === 'urgent' ? 'bg-rose-500' : activeBanner.type === 'success' ? 'bg-emerald-500' : 'bg-indigo-500'
            }`} />

            <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-lg ${
              activeBanner.type === 'urgent' 
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600' 
                : activeBanner.type === 'success' 
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600' 
                : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600'
            }`}>
              {activeBanner.type === 'urgent' ? <AlertCircle className="h-5 w-5" /> : activeBanner.type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
            </div>

            <div className="flex-1 min-w-0 pr-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Practice Alert</span>
                <span className="text-[9px] font-medium text-slate-400">just now</span>
              </div>
              <p className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5 line-clamp-1">{activeBanner.title}</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2 leading-relaxed">{activeBanner.body}</p>
              
              <div className="flex items-center gap-2 mt-2.5">
                {activeBanner.route && (
                  <button 
                    onClick={() => { setBannerVisible(false); navigate(activeBanner.route!); }}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-medium transition-all flex items-center gap-1"
                  >
                    View Return <ArrowRight className="h-3 w-3" />
                  </button>
                )}
                <button 
                  onClick={() => { setBannerVisible(false); setIsOpen(true); }}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-[10px] font-medium transition-all"
                >
                  History
                </button>
              </div>
            </div>

            <button 
              onClick={() => setBannerVisible(false)} 
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Bell Trigger Button inside Header */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-xl bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200/90 dark:hover:bg-slate-700/90 border border-slate-200/80 dark:border-slate-700/80 hover:border-amber-300 dark:hover:border-amber-700/60 transition-all cursor-pointer shadow-xs relative group"
          title="Compliance & Deadline Notifications"
          id={`bell-trigger-${placement}`}
          aria-expanded={isOpen}
        >
          {/* Colorful Notification Bell Icon */}
          <Bell className={`h-5 w-5 transition-transform duration-300 group-hover:rotate-12 ${
            urgentCount > 0 
              ? 'text-rose-600 dark:text-rose-400 animate-bounce' 
              : 'text-amber-500 dark:text-amber-400'
          }`} />
          {unreadCount > 0 && (
            <span className={`absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full text-[9px] font-bold text-white border-2 border-white dark:border-slate-900 shadow-sm ${
              urgentCount > 0 ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'
            }`}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown Panel */}
        {isOpen && (
          <>
            <div className="fixed inset-0 z-[990]" onClick={() => setIsOpen(false)} />
            <div 
              className="absolute right-0 mt-2.5 w-[calc(100vw-1.5rem)] max-w-sm sm:w-96 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-2xl z-[995] animate-in fade-in zoom-in-95 duration-150"
              id={`bell-dropdown-${placement}`}
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
                      <Bell className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-white leading-none">Notifications</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Statutory due dates & sync alerts</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {permission !== 'granted' && (
                      <button 
                        onClick={handleRequestPermission}
                        className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 rounded-lg text-[9px] font-semibold transition-all"
                      >
                        Enable Push
                      </button>
                    )}
                    <button 
                      onClick={handleTestNotification}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-[9px] font-medium transition-all"
                      title="Test Alert"
                    >
                      Test
                    </button>
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800/60 rounded-xl">
                  <button
                    onClick={() => setActiveTab('all')}
                    className={`flex-1 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                      activeTab === 'all' 
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' 
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    All ({notifications.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('due_dates')}
                    className={`flex-1 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                      activeTab === 'due_dates' 
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' 
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Due Dates
                  </button>
                  <button
                    onClick={() => setActiveTab('system')}
                    className={`flex-1 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                      activeTab === 'system' 
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' 
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    System
                  </button>
                </div>

                {/* Notifications List */}
                <div className="max-h-72 overflow-y-auto no-scrollbar space-y-2">
                  {filteredNotifications.length === 0 ? (
                    <div className="py-8 flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 space-y-2">
                      <Clock className="h-7 w-7 text-slate-400" strokeWidth={1.5} />
                      <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">All filings up to date</p>
                      <p className="text-[10px] text-center max-w-[220px] text-slate-400">Upcoming return dates and deadlines will automatically display here.</p>
                    </div>
                  ) : (
                    filteredNotifications.map((n) => (
                      <div 
                        key={n.id} 
                        onClick={() => handleItemClick(n)}
                        className={`p-3 rounded-xl border transition-all text-left relative cursor-pointer group ${
                          n.read 
                            ? 'bg-slate-50/60 dark:bg-slate-800/20 border-slate-100 dark:border-slate-800/50 opacity-75' 
                            : 'bg-indigo-50/30 dark:bg-slate-800/60 border-indigo-100/60 dark:border-indigo-900/40 hover:border-indigo-300'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 text-xs ${
                            n.type === 'urgent' 
                              ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400' 
                              : n.type === 'success' 
                              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400' 
                              : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400'
                          }`}>
                            {n.type === 'urgent' ? '⚠️' : n.type === 'success' ? '✓' : 'ℹ️'}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-semibold text-slate-900 dark:text-white truncate">{n.title}</p>
                              <span className="text-[9px] text-slate-400 shrink-0 ml-2">
                                {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>
                            
                            {n.route && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-indigo-600 dark:text-indigo-400 mt-1.5 hover:underline">
                                Open Filing Module <ArrowRight className="h-2.5 w-2.5" />
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Mark read/unread button */}
                        <button 
                          onClick={(e) => handleToggleRead(n.id, e)}
                          className="absolute right-2 bottom-2 p-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-indigo-600"
                          title={n.read ? "Mark Unread" : "Mark Read"}
                        >
                          <Check className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer Controls */}
                {notifications.length > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px]">
                    <button 
                      onClick={handleMarkAllRead}
                      className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors"
                    >
                      Mark all read
                    </button>
                    <button 
                      onClick={handleClearAll}
                      className="font-medium text-rose-500 hover:text-rose-700 transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" /> Clear history
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default NotificationCenter;
