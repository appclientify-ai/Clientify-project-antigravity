import React, { useState, useRef, useEffect } from 'react';

interface ExportImportMenuProps {
  onExportCSV: () => void;
  onExportPDF: () => void;
  onImportCSV: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadTemplate?: () => void;
  isImporting?: boolean;
  className?: string;
  buttonClassName?: string;
  title?: string;
}

export const ExportImportMenu: React.FC<ExportImportMenuProps> = ({
  onExportCSV,
  onExportPDF,
  onImportCSV,
  onDownloadTemplate,
  isImporting = false,
  className = '',
  buttonClassName = '',
  title = 'Export / Import notices'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className={`relative shrink-0 ${className}`} ref={menuRef}>
      {/* Hidden file input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={(e) => {
          onImportCSV(e);
          setIsOpen(false);
        }} 
        className="hidden" 
        accept=".csv" 
      />

      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)} 
        className={buttonClassName || `h-9 px-2.5 sm:px-3 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 whitespace-nowrap ${
          isOpen 
            ? 'bg-slate-900 text-white dark:bg-indigo-600 border-slate-900 dark:border-indigo-600 shadow-sm' 
            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750'
        }`}
        title={title}
      >
        <svg className={`h-3.5 w-3.5 ${isOpen ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
        </svg>
        <span className="hidden sm:inline">Export / Import</span>
        <span className="sm:hidden">Data</span>
        <svg className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-white' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-[1000] p-1.5 animate-in zoom-in-95 origin-top-right">
          <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 mb-1 flex items-center justify-between">
            <span>Data Operations</span>
            <span className="text-[9px] font-mono lowercase opacity-75">csv / pdf</span>
          </div>

          {/* 1. Import CSV */}
          <button 
            type="button"
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
                fileInputRef.current.click();
              }
            }} 
            disabled={isImporting}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all text-left group cursor-pointer"
          >
            <div className="h-7 w-7 rounded-md bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">Import from CSV</span>
              <span className="text-[10px] text-slate-400 truncate">Bulk upload records</span>
            </div>
          </button>

          {/* 2. Export CSV */}
          <button 
            type="button"
            onClick={() => {
              setIsOpen(false);
              onExportCSV();
            }} 
            className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all text-left group cursor-pointer"
          >
            <div className="h-7 w-7 rounded-md bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">Export to CSV</span>
              <span className="text-[10px] text-slate-400 truncate">Download table spreadsheet</span>
            </div>
          </button>

          {/* 3. Export PDF / Print */}
          <button 
            type="button"
            onClick={() => {
              setIsOpen(false);
              onExportPDF();
            }} 
            className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all text-left group cursor-pointer"
          >
            <div className="h-7 w-7 rounded-md bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">Print / Save PDF</span>
              <span className="text-[10px] text-slate-400 truncate">Formatted print report</span>
            </div>
          </button>

          {/* 4. Download Template */}
          {onDownloadTemplate && (
            <button 
              type="button"
              onClick={() => {
                setIsOpen(false);
                onDownloadTemplate();
              }} 
              className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all text-left group cursor-pointer border-t border-slate-100 dark:border-slate-800 mt-1 pt-1.5"
            >
              <div className="h-7 w-7 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">Download Template</span>
                <span className="text-[10px] text-slate-400 truncate">Sample CSV format</span>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ExportImportMenu;
