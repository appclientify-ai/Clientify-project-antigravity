import React from 'react';
import { LayoutDashboard, Building2, Users, Scale, Menu } from 'lucide-react';
import { ActiveView } from '../types';
import { useNavCounts } from '../hooks/useNavCounts';

interface MobileBottomNavProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  onToggleSidebar: () => void;
}

const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeView,
  onViewChange,
  onToggleSidebar
}) => {
  const { data: navCounts = {} } = useNavCounts();
  const totalCount = Object.values(navCounts).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);

  const isDashboard = activeView === 'dashboard';
  const isGst = activeView.startsWith('gst') || activeView.startsWith('compliance-m') || activeView.startsWith('compliance-q') || activeView.startsWith('compliance-c') || activeView.startsWith('compliance-gstr') || activeView === 'misc-gst-reg';
  const isIt = activeView.startsWith('it') || activeView.startsWith('compliance-itr') || activeView.startsWith('compliance-tax');
  const isLitigation = activeView.startsWith('lit-');

  // Litigation pending count
  const litigationCount = (navCounts['lit-notice-pending'] || 0) + (navCounts['lit-appeal-pending'] || 0) + (navCounts['lit-tribunal-pending'] || 0) + (navCounts['lit-hc-pending'] || 0);

  return (
    <nav 
      aria-label="Mobile Navigation" 
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border-t border-slate-200/80 dark:border-slate-800/80 px-2 pt-1.5 pb-2 flex items-center justify-around shadow-[0_-4px_25px_rgba(15,23,42,0.08)] safe-area-pb transition-colors select-none"
    >
      {/* 1. Dashboard */}
      <button
        onClick={() => onViewChange('dashboard')}
        className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer min-w-[56px] active:scale-90 ${
          isDashboard 
            ? 'text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50/80 dark:bg-indigo-950/60 shadow-2xs' 
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <LayoutDashboard className="w-5 h-5 transition-transform" />
        <span className="text-[10px] font-semibold tracking-tight mt-0.5 leading-none">Home</span>
        {isDashboard && <span className="h-1 w-1 rounded-full bg-indigo-600 dark:bg-indigo-400 mt-0.5" />}
      </button>

      {/* 2. GST */}
      <button
        onClick={() => onViewChange('gst-portfolio')}
        className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer min-w-[56px] active:scale-90 ${
          isGst 
            ? 'text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50/80 dark:bg-indigo-950/60 shadow-2xs' 
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <Building2 className="w-5 h-5 transition-transform" />
        <span className="text-[10px] font-semibold tracking-tight mt-0.5 leading-none">GST</span>
        {isGst && <span className="h-1 w-1 rounded-full bg-indigo-600 dark:bg-indigo-400 mt-0.5" />}
      </button>

      {/* 3. Income Tax */}
      <button
        onClick={() => onViewChange('it-portfolio')}
        className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer min-w-[56px] active:scale-90 ${
          isIt 
            ? 'text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50/80 dark:bg-indigo-950/60 shadow-2xs' 
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <Users className="w-5 h-5 transition-transform" />
        <span className="text-[10px] font-semibold tracking-tight mt-0.5 leading-none">IT Tax</span>
        {isIt && <span className="h-1 w-1 rounded-full bg-indigo-600 dark:bg-indigo-400 mt-0.5" />}
      </button>

      {/* 4. Litigation */}
      <button
        onClick={() => onViewChange('lit-notice-pending')}
        className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer min-w-[56px] relative active:scale-90 ${
          isLitigation 
            ? 'text-rose-600 dark:text-rose-400 font-bold bg-rose-50/80 dark:bg-rose-950/60 shadow-2xs' 
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <div className="relative">
          <Scale className="w-5 h-5 transition-transform" />
          {litigationCount > 0 && !isLitigation && (
            <span className="absolute -top-1 -right-2 flex h-3.5 min-w-3.5 px-0.5 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white shadow-2xs">
              {litigationCount}
            </span>
          )}
        </div>
        <span className="text-[10px] font-semibold tracking-tight mt-0.5 leading-none">Litigation</span>
        {isLitigation && <span className="h-1 w-1 rounded-full bg-rose-600 dark:bg-rose-400 mt-0.5" />}
      </button>

      {/* 5. Menu Drawer Trigger */}
      <button
        onClick={onToggleSidebar}
        className="flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all relative cursor-pointer min-w-[56px] active:scale-90"
        aria-label="Toggle All Modules Navigation"
      >
        <div className="relative">
          <Menu className="w-5 h-5 transition-transform" />
          {totalCount > 0 && (
            <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white ring-2 ring-white dark:ring-slate-900 shadow-xs animate-pulse">
              {totalCount > 99 ? '99+' : totalCount}
            </span>
          )}
        </div>
        <span className="text-[10px] font-semibold tracking-tight mt-0.5 leading-none">Menu</span>
      </button>
    </nav>
  );
};

export default MobileBottomNav;
