import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface TableFilterProps {
  label: ReactNode;
  isActive?: boolean;
  onOpen?: () => void;
  onClear?: () => void;
  children?: ReactNode;
  options?: any[];
  selected?: string;
  onSelect?: (val: any) => void;
}

export const TableFilter: React.FC<TableFilterProps> = ({ 
  label, 
  isActive, 
  onOpen, 
  onClear,
  children,
  options,
  selected,
  onSelect
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const active = isActive !== undefined ? isActive : (selected !== undefined && selected !== 'All');

  const updatePosition = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuWidth = 160;
      let left = rect.left;
      if (left + menuWidth > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - menuWidth - 12);
      }
      setCoords({ top: rect.bottom + 6, left: Math.max(8, left) });
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpen) onOpen();
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen(prev => !prev);
  };

  useEffect(() => {
    const handleClose = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClose);
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClose);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  return (
    <>
      <div className="flex items-center gap-1 select-none">
        {label}
        <button 
          ref={btnRef} 
          type="button"
          onClick={handleToggle} 
          className={`p-1 rounded-md transition-all cursor-pointer active:scale-95 ${
            active 
              ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold shadow-2xs' 
              : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700'
          }`}
          title="Filter Column"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </button>
        {active && (onClear || onSelect) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onClear) onClear();
              else if (onSelect) onSelect('All');
            }}
            className="p-0.5 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
            title="Clear filter"
          >
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div 
          ref={menuRef}
          style={{ top: coords.top, left: coords.left }} 
          className="fixed bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-[999999] p-1.5 animate-in zoom-in-95 origin-top text-left min-w-[140px] flex flex-col gap-1 ring-1 ring-black/5 dark:ring-white/10"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setIsOpen(false)}
        >
          {children ? (
            children
          ) : options && onSelect ? (
            <div className="p-1 space-y-0.5">
              <button
                type="button"
                onClick={() => onSelect('All')}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-between ${
                  (!selected || selected === 'All')
                    ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>All</span>
                {(!selected || selected === 'All') && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600"></span>}
              </button>
              {options.map((opt) => {
                const val = typeof opt === 'string' ? opt : (opt?.value ?? String(opt));
                const optLabel = typeof opt === 'string' 
                  ? (val.startsWith('U/s') ? val : `U/s ${val}`) 
                  : (opt?.label ?? String(val));
                const isSelected = selected === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => onSelect(val)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{optLabel}</span>
                    {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600"></span>}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>,
        document.body
      )}
    </>
  );
};

