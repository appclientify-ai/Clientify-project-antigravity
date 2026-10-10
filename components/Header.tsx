import React, { useState, useRef, useEffect } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { 
  Menu, Download, Scale, Settings, LogOut, ChevronDown
} from 'lucide-react';
import { User, ActiveView } from '../types';
import { useAuth } from '../auth/AuthContext';
import { usePWA } from '../hooks/usePWA';
import { useTheme } from '../hooks/useTheme';
import { THEME_COLORS } from '../services/theme';
import { NotificationCenter } from './NotificationCenter';

interface HeaderProps {
  isConnected: boolean;
  currentUser: User | null;
  onMenuClick: () => void;
  activeViewLabel: string;
  activeViewDescription: string;
  onViewChange: (view: ActiveView) => void;
  activeView: ActiveView;
  onOpenGuidelines: (cat: string) => void;
}

// Color mapping for every page name matching the sidebar module colors
const VIEW_COLORS: Record<string, string> = {
  // Primary
  'dashboard': 'text-indigo-600 dark:text-indigo-400',
  'gst-portfolio': 'text-blue-600 dark:text-blue-400',
  'it-portfolio': 'text-emerald-600 dark:text-emerald-400',

  // Compliance
  'compliance-monthly': 'text-violet-600 dark:text-violet-400',
  'compliance-quarterly': 'text-violet-600 dark:text-violet-400',
  'compliance-composition': 'text-violet-600 dark:text-violet-400',
  'compliance-gstr4': 'text-amber-600 dark:text-amber-400',
  'compliance-gstr9': 'text-amber-600 dark:text-amber-400',
  'compliance-itr': 'text-teal-600 dark:text-teal-400',
  'compliance-taxaudit': 'text-teal-600 dark:text-teal-400',

  // Litigation & Appeals
  'lit-notice-pending': 'text-rose-600 dark:text-rose-400',
  'lit-notice-filed': 'text-rose-600 dark:text-rose-400',
  'lit-notice-drop': 'text-rose-600 dark:text-rose-400',
  'lit-notice-demand': 'text-rose-600 dark:text-rose-400',
  'lit-appeal-pending': 'text-pink-600 dark:text-pink-400',
  'lit-appeal-filed': 'text-pink-600 dark:text-pink-400',
  'lit-appeal-drop': 'text-pink-600 dark:text-pink-400',
  'lit-appeal-demand': 'text-pink-600 dark:text-pink-400',
  'lit-tribunal-pending': 'text-purple-600 dark:text-purple-400',
  'lit-tribunal-filed': 'text-purple-600 dark:text-purple-400',
  'lit-tribunal-drop': 'text-purple-600 dark:text-purple-400',
  'lit-tribunal-demand': 'text-purple-600 dark:text-purple-400',
  'lit-hc-pending': 'text-red-600 dark:text-red-400',
  'lit-hc-filed': 'text-red-600 dark:text-red-400',
  'lit-hc-drop': 'text-red-600 dark:text-red-400',
  'lit-hc-demand': 'text-red-600 dark:text-red-400',

  // Services & Practice
  'misc-gst-reg': 'text-sky-600 dark:text-sky-400',
  'misc-food-lic': 'text-orange-600 dark:text-orange-400',
  'misc-msme': 'text-lime-600 dark:text-lime-400',
  'misc-work': 'text-cyan-600 dark:text-cyan-400',

  // Administration
  'messenger': 'text-blue-600 dark:text-blue-400',
  'reminders': 'text-amber-600 dark:text-amber-400',
  'admin-invoices': 'text-emerald-600 dark:text-emerald-400',
  'admin-add-invoice': 'text-emerald-600 dark:text-emerald-400',
  'admin-invoicesetting': 'text-emerald-600 dark:text-emerald-400',
  'admin-payments': 'text-teal-600 dark:text-teal-400',
  'admin-client-ledger': 'text-indigo-600 dark:text-indigo-400',
  'admin-duedates': 'text-fuchsia-600 dark:text-fuchsia-400',
  'settings': 'text-violet-600 dark:text-violet-400',
  'trash': 'text-rose-600 dark:text-rose-400',
};

const Header: React.FC<HeaderProps> = ({ 
  isConnected, 
  currentUser, 
  onMenuClick, 
  activeViewLabel, 
  activeViewDescription, 
  onViewChange, 
  activeView, 
  onOpenGuidelines 
}) => {
  const { logout } = useAuth();
  const { canInstall, triggerInstall } = usePWA();
  const { settings } = useTheme();
  const isFetching = useIsFetching();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const currentTheme = THEME_COLORS.find(c => c.id === settings.themeColor) || THEME_COLORS[0];

  const pageColorClass = VIEW_COLORS[activeView] || '';
  const pageColorStyle = !VIEW_COLORS[activeView] ? { color: currentTheme.primary } : undefined;

  const closeAllPopovers = () => {
    setIsProfileOpen(false);
    setIsNotificationOpen(false);
  };

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    if (isProfileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileOpen]);

  return (
    <header className="flex h-16 md:h-18 w-full items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 px-4 md:px-6 backdrop-blur-xl sticky top-0 z-[100] transition-colors">
      
      {/* Click outside backdrop for popovers */}
      {(isProfileOpen || isNotificationOpen) && (
        <div 
          className="fixed inset-0 z-[980] bg-slate-950/10 dark:bg-slate-950/30 backdrop-blur-[0.5px]" 
          onClick={closeAllPopovers} 
        />
      )}

      {/* Left: Menu & View Title */}
      <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0 pr-2">
        <button 
          onClick={onMenuClick} 
          className="flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 transition-colors border border-slate-200/70 dark:border-slate-700/70 shadow-xs cursor-pointer"
          aria-label="Toggle Navigation Sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
        
        <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block shrink-0" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
            <h1 
              className={`text-lg sm:text-xl font-bold tracking-tight truncate leading-tight ${pageColorClass}`}
              style={pageColorStyle}
            >
              {activeViewLabel}
            </h1>
            <span className="text-base text-slate-300 dark:text-slate-700 shrink-0 hidden sm:inline">•</span>
            <span className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white shrink-0 hidden sm:inline leading-tight">
              Client<span style={{ color: currentTheme.primary }}>ify</span>
            </span>
          </div>
          <p className="text-xs font-medium text-slate-400 dark:text-slate-400 truncate mt-0.5 hidden sm:block" title={activeViewDescription}>
            {activeViewDescription}
          </p>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        
        {/* Install PWA Button */}
        {canInstall && (
          <button 
            onClick={triggerInstall} 
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 sm:px-3 py-1.5 rounded-xl font-medium text-xs transition-colors shadow-xs shrink-0"
            title="Install Application"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Install App</span>
          </button>
        )}

        {/* Database Sync Spinner */}
        {isFetching > 0 && (
          <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 text-xs shrink-0" title="Syncing Clientify Data with Database...">
            <span className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-ping" />
            <span className="text-[10px] font-semibold hidden md:inline">Syncing...</span>
          </div>
        )}

        {/* Real-time Status Beacon - Minimal Live Ping Badge */}
        <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          </span>
          <span className="text-[11px] font-medium tracking-tight">
            {isConnected ? 'Database: Live' : 'Offline'}
          </span>
        </div>

        {/* Statutory Guide - Ghost / Outlined Secondary Button */}
        <button
          onClick={() => {
            const getCategoryForView = (view: string): string => {
              if (view === 'dashboard' || view.startsWith('lit-')) return 'Notice';
              if (view === 'gst-portfolio' || 
                  view.startsWith('compliance-monthly') || 
                  view.startsWith('compliance-quarterly') || 
                  view.startsWith('compliance-composition') || 
                  view.startsWith('compliance-gstr4') || 
                  view.startsWith('compliance-gstr9')) return 'GstRules';
              if (view === 'misc-gst-reg') return 'GstReg';
              if (view === 'it-portfolio' || view === 'compliance-itr' || view === 'compliance-taxaudit') return 'ItRules';
              if (view === 'misc-food-lic') return 'FoodLicense';
              if (view === 'misc-msme') return 'Msme';
              if (view === 'misc-work') return 'WorkLog';
              return 'Notice';
            };
            onOpenGuidelines(getCategoryForView(activeView));
            closeAllPopovers();
          }}
          className="flex h-9 items-center gap-1.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-2 sm:px-3 rounded-lg font-medium text-xs transition-all shadow-xs active:scale-95 shrink-0 cursor-pointer"
          title="Open Compliance & Statutory Reference Manual"
        >
          <Scale className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
          <span className="hidden sm:inline text-xs">Statutory Guide</span>
        </button>

        {/* Upgraded Notification Center */}
        <NotificationCenter 
          placement="header" 
          isOpen={isNotificationOpen}
          onOpenChange={(open) => {
            closeAllPopovers();
            setIsNotificationOpen(open);
          }}
        />

        {/* Professional Profile Menu - Compact SaaS Trigger */}
        <div className="relative" ref={profileRef}>
          <button 
            onClick={() => {
              const nextState = !isProfileOpen;
              closeAllPopovers();
              setIsProfileOpen(nextState);
            }}
            className={`flex items-center gap-1.5 sm:gap-2 h-9 px-1.5 sm:px-2 py-1 rounded-lg transition-all border cursor-pointer ${
              isProfileOpen 
                ? 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shadow-2xs' 
                : 'border-transparent hover:border-slate-200 dark:hover:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
            aria-expanded={isProfileOpen}
            title="User Account & Settings"
          >
            {currentUser?.avatar ? (
              <div className="relative shrink-0">
                <img 
                  src={currentUser.avatar} 
                  alt={currentUser.username || 'User'} 
                  className="h-7 w-7 rounded-md object-cover border border-slate-200 dark:border-slate-700" 
                />
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
              </div>
            ) : (
              <div className="relative shrink-0">
                <div 
                  className="h-7 w-7 rounded-md flex items-center justify-center text-[11px] font-semibold text-white shadow-xs"
                  style={{ backgroundColor: currentTheme.primary }}
                >
                  {currentUser?.username?.substring(0, 2).toUpperCase() || 'CP'}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
              </div>
            )}

            <div className="text-left hidden md:block max-w-[130px] lg:max-w-[170px] leading-tight">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                {currentUser?.username || 'Practitioner'}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {currentUser?.firm_name || 'Consultant'}
              </p>
            </div>

            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1.5rem)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-2xl p-2 animate-in fade-in zoom-in-95 duration-150 origin-top-right z-[1000]">
              
              {/* Profile Card Header */}
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 mb-1">
                <div className="flex items-center gap-2.5">
                  <div 
                    className="h-9 w-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-xs"
                    style={{ backgroundColor: currentTheme.primary }}
                  >
                    {currentUser?.username?.substring(0, 2).toUpperCase() || 'CP'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {currentUser?.username || 'Consultant'}
                    </p>
                    <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate mt-0.5">
                      User ID: {currentUser?.user_id || 'Active Session'}
                    </p>
                  </div>
                </div>
                {currentUser?.firm_name && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block truncate">
                      🏢 {currentUser.firm_name}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Links */}
              <button 
                onClick={() => { onViewChange('settings'); closeAllPopovers(); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-medium text-xs cursor-pointer"
              >
                <Settings className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                Firm & Practice Settings
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              <button 
                onClick={logout}
                className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all font-medium text-xs cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  );
};

export default Header;
