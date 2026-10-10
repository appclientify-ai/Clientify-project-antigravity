import React from 'react';

export interface ViewControlProps {
  viewMode: 'table' | 'grid';
  onViewChange?: (mode: 'table' | 'grid') => void;
  onViewModeChange?: (mode: 'table' | 'grid') => void;
  compactMode?: boolean;
  onCompactToggle?: () => void;
  onCompactModeChange?: (compact: boolean) => void;
  extraActions?: React.ReactNode;
  className?: string;
}

export const ViewControl: React.FC<ViewControlProps> = ({
  viewMode,
  onViewChange,
  onViewModeChange,
  extraActions,
  className = ''
}) => {
  const handleChange = (mode: 'table' | 'grid') => {
    if (onViewChange) onViewChange(mode);
    if (onViewModeChange) onViewModeChange(mode);
  };

  return (
    <div className={`flex items-center gap-1 bg-slate-100/90 dark:bg-slate-800/90 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shrink-0 h-9 shadow-2xs ${className}`}>
      {/* Table View Button */}
      <button
        type="button"
        onClick={() => handleChange('table')}
        className={`px-2.5 h-7 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
          viewMode === 'table'
            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200/80 dark:border-slate-700 font-black'
            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
        }`}
        title="Switch to Table View (PC Optimized)"
        aria-label="Table View"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        <span className="hidden sm:inline">Table</span>
      </button>

      {/* Grid View Button */}
      <button
        type="button"
        onClick={() => handleChange('grid')}
        className={`px-2.5 h-7 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
          viewMode === 'grid'
            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200/80 dark:border-slate-700 font-black'
            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
        }`}
        title="Switch to Card Grid View (Mobile Friendly)"
        aria-label="Grid View"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
        <span className="hidden sm:inline">Cards</span>
      </button>

      {extraActions}
    </div>
  );
};

export default ViewControl;
