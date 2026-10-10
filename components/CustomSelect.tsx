import React, { useState, useRef, useEffect } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  dot?: string;
  badge?: string;
}

export interface CustomSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: (string | SelectOption)[];
  labelPrefix?: string;
  placeholder?: string;
  icon?: React.ReactNode;
  className?: string;
  buttonClassName?: string;
  menuWidth?: string;
  align?: 'left' | 'right';
  title?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  labelPrefix = '',
  placeholder = 'Select...',
  icon,
  className = '',
  buttonClassName = '',
  menuWidth = 'min-w-[130px] w-max max-w-[240px]',
  align = 'right',
  title = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize options
  const normalizedOptions: SelectOption[] = options.map((opt) => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return opt;
  });

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);
  const displayLabel = selectedOption ? `${labelPrefix}${selectedOption.label}` : placeholder;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div className={`relative shrink-0 ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={
          buttonClassName ||
          `h-9 px-2.5 rounded-lg border text-xs font-semibold tracking-tight transition-all flex items-center justify-between gap-1.5 shadow-2xs cursor-pointer active:scale-95 whitespace-nowrap ${
            isOpen
              ? 'bg-slate-900 text-white dark:bg-indigo-600 border-slate-900 dark:border-indigo-600 shadow-sm'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750'
          }`
        }
        title={title || displayLabel}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {icon}
          {selectedOption?.dot && (
            <span className={`h-2 w-2 rounded-full ${selectedOption.dot} shrink-0`} />
          )}
          <span className="truncate">{displayLabel}</span>
        </div>
        <svg
          className={`h-3 w-3 shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-white' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`absolute ${
            align === 'left' ? 'left-0 origin-top-left' : 'right-0 origin-top-right'
          } mt-1.5 ${menuWidth} max-h-64 overflow-y-auto no-scrollbar bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-[1000] p-1 animate-in zoom-in-95`}
        >
          {normalizedOptions.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all text-left cursor-pointer group ${
                  isSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {option.dot && (
                    <span className={`h-2 w-2 rounded-full ${option.dot} shrink-0`} />
                  )}
                  <span className="truncate">{labelPrefix ? `${labelPrefix}${option.label}` : option.label}</span>
                </div>
                {isSelected ? (
                  <svg className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : option.badge ? (
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 shrink-0">
                    {option.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;
