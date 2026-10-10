import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Client } from '../types';

export interface SectorFilterState {
  authority: 'All' | 'State' | 'Center';
  selectedSectors: string[];
}

export const filterClientsBySectorJurisdiction = (
  clients: Client[],
  authority: 'All' | 'State' | 'Center',
  selectedSectors: string[]
): Client[] => {
  if (!clients) return [];
  return clients.filter(c => {
    if (!c || !c.gstProfile) return false;

    // 1. Authority check
    const clientAuth: 'State' | 'Center' = c.gstProfile.jurisdictionType || (c.gstProfile.range && !c.gstProfile.sector ? 'Center' : 'State');
    if (authority !== 'All' && clientAuth !== authority) {
      return false;
    }

    // 2. Sector / Range check
    if (!selectedSectors || selectedSectors.length === 0) {
      return true;
    }

    const clientSector = (c.gstProfile.sector || c.gstProfile.range || '').trim();
    if (!clientSector) return false;

    const clientLower = clientSector.toLowerCase();
    const clientNum = clientLower.replace(/[^0-9]/g, '');

    return selectedSectors.some(sel => {
      const selLower = sel.trim().toLowerCase();
      if (!selLower) return true;
      if (clientLower === selLower) return true;

      const selNum = selLower.replace(/[^0-9]/g, '');
      if (clientNum && selNum && clientNum === selNum) {
        return true;
      }
      return clientLower.includes(selLower) || selLower.includes(clientLower);
    });
  });
};

interface SectorJurisdictionFilterProps {
  clients: Client[];
  authority: 'All' | 'State' | 'Center';
  setAuthority: (auth: 'All' | 'State' | 'Center') => void;
  selectedSectors: string[];
  setSelectedSectors: (sectors: string[] | ((prev: string[]) => string[])) => void;
  buttonClassName?: string;
  totalFilteredCount?: number;
}

export const SectorJurisdictionFilter: React.FC<SectorJurisdictionFilterProps> = ({
  clients,
  authority,
  setAuthority,
  selectedSectors,
  setSelectedSectors,
  buttonClassName,
  totalFilteredCount
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [sectorSearch, setSectorSearch] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Extract unique sectors with client counts
  const sectorList = useMemo(() => {
    const counts: Record<string, number> = {};
    (clients || []).forEach(c => {
      if (!c || !c.gstProfile) return;
      const sec = (c.gstProfile.sector || c.gstProfile.range || '').trim();
      if (sec) {
        counts[sec] = (counts[sec] || 0) + 1;
      }
    });

    const uniqueKeys = Object.keys(counts).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );

    return uniqueKeys.map(key => ({
      name: key,
      count: counts[key]
    }));
  }, [clients]);

  const filteredSectorList = useMemo(() => {
    if (!sectorSearch.trim()) return sectorList;
    const s = sectorSearch.toLowerCase();
    return sectorList.filter(item => item.name.toLowerCase().includes(s));
  }, [sectorList, sectorSearch]);

  const hasActiveFilter = authority !== 'All' || selectedSectors.length > 0;

  const handleTogglePopover = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(prev => !prev);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const toggleSector = (secName: string) => {
    if (selectedSectors.includes(secName)) {
      setSelectedSectors(selectedSectors.filter(s => s !== secName));
    } else {
      setSelectedSectors([...selectedSectors, secName]);
    }
  };

  const handleSelectAllSectors = () => {
    setSelectedSectors(sectorList.map(s => s.name));
  };

  const handleClearSectors = () => {
    setSelectedSectors([]);
  };

  const handleResetAll = () => {
    setAuthority('All');
    setSelectedSectors([]);
    setSectorSearch('');
  };

  return (
    <div className="relative inline-block">
      {/* Filter Icon Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleTogglePopover}
        className={
          buttonClassName ||
          `h-9 px-3 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer ${
            hasActiveFilter
              ? 'bg-amber-500 text-white border-amber-600 shadow-amber-200 dark:shadow-none ring-2 ring-amber-300 dark:ring-amber-500/30'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-600'
          }`
        }
        title="Filter by Sector / Ward & Jurisdiction (State / Central)"
      >
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
          />
        </svg>
        <span className="hidden sm:inline">Jurisdiction & Sector</span>
        <span className="inline sm:hidden">Sector</span>
        {hasActiveFilter && (
          <span className="ml-0.5 bg-white dark:bg-slate-900 text-amber-900 dark:text-amber-300 font-bold text-[10px] px-1.5 py-0.5 rounded-full shadow-xs">
            {selectedSectors.length > 0 ? `${selectedSectors.length}` : authority}
          </span>
        )}
      </button>

      {/* Filter Popover Modal */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-[1000] w-[320px] sm:w-[360px] p-4 text-left animate-in zoom-in-95 origin-top-right flex flex-col gap-3.5 font-sans"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </span>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Jurisdiction & Sector Filter</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Filter by State/Central authority & local ward</p>
              </div>
            </div>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={handleResetAll}
                className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 bg-rose-50 dark:bg-rose-950 hover:bg-rose-100 dark:hover:bg-rose-900 px-2 py-1 rounded-lg transition-colors cursor-pointer"
              >
                Reset All
              </button>
            )}
          </div>

          {/* Sections Container */}
          <div className="space-y-3.5">
            {/* Section 1: Authority Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Tax Office Jurisdiction
              </label>
              <div className="grid grid-cols-3 gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                {[
                  { key: 'All', label: 'All Offices' },
                  { key: 'State', label: 'State Authority' },
                  { key: 'Center', label: 'Central Authority' }
                ].map(item => {
                  const isActive = authority === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setAuthority(item.key as 'All' | 'State' | 'Center')}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center truncate cursor-pointer ${
                        isActive
                          ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Sector / Range Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Sectors & Wards {selectedSectors.length ? `(${selectedSectors.length} selected)` : '(All)'}
                </label>
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={handleSelectAllSectors}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300 dark:text-slate-600">•</span>
                  <button
                    type="button"
                    onClick={handleClearSectors}
                    className="text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Sector Search Box */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search sector or ward name..."
                  value={sectorSearch}
                  onChange={e => setSectorSearch(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-1.5 pl-8 pr-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
                />
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* Sector Multi-Select Checkboxes Grid */}
              <div className="max-h-48 overflow-y-auto pr-1 space-y-1 no-scrollbar border border-slate-200 dark:border-slate-800 rounded-xl p-1 bg-slate-50 dark:bg-slate-850">
                {filteredSectorList.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4 italic">No sectors or wards found</p>
                ) : (
                  filteredSectorList.map(s => {
                    const isChecked = selectedSectors.includes(s.name);
                    return (
                      <label
                        key={s.name}
                        className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 font-semibold'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-200 dark:hover:border-indigo-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSector(s.name)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                          />
                          <span className="truncate text-xs">{s.name}</span>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0">
                          {s.count} {s.count === 1 ? 'client' : 'clients'}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Footer Bar */}
          <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-slate-800 mt-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {typeof totalFilteredCount === 'number'
                ? `Clients: ${totalFilteredCount}`
                : `${selectedSectors.length} Wards Selected`}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs px-4 py-2 rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              Apply Filter
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export default SectorJurisdictionFilter;
