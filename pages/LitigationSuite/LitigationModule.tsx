
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LitigationRecord, Client, LitigationStatus, LitigationCategory } from '../../types';
import { api } from '../../services/api.ts';
import Loader from '../../components/Loader';
import NoticeForm from '../Clientform/NoticeForm';
import LitigationGuidelinesModal from '../../components/LitigationGuidelinesModal';
import LitigationDetailModal from '../../components/LitigationDetailModal';
import { toast } from 'sonner';
import { formatISOToDDMMYYYY } from '../../dateUtils';
import { ViewControl } from '../../components/ViewControl';

interface LitigationModuleProps {
  category: LitigationCategory;
  status: LitigationStatus;
}

const LitigationModule: React.FC<LitigationModuleProps> = ({ category, status }) => {
  const queryClient = useQueryClient();

  const { data: pageData, isLoading: isPageLoading } = useQuery({
    queryKey: ['litigation_filing_page_data'],
    queryFn: () => api.getLitigationFilingData(),
    staleTime: 1000 * 60 * 5,
  });

  const allRecords = useMemo(() => pageData?.litigation || [], [pageData]);
  const clients = useMemo(() => pageData?.clients || [], [pageData]);
  const records = useMemo(() => allRecords.filter(r => r.category === category && (r.status === status || (status === 'Drop' && (r.status as string) === 'Dropped') || ((status as string) === 'Dropped' && r.status === 'Drop'))), [allRecords, category, status]);
  const isLoading = isPageLoading && !pageData;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGuidelinesOpen, setIsGuidelinesOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'table');
  const [compactMode, setCompactMode] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<Partial<LitigationRecord> | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingRecord, setViewingRecord] = useState<LitigationRecord | null>(null);

  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['litigation_filing_page_data'] });
    queryClient.invalidateQueries({ queryKey: ['litigationRecords'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  }, [queryClient]);

  useEffect(() => {
    const syncHandler = () => { refreshData(); };
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, [refreshData]);

  
  const handleDelete = async (id: string) => {
    try {
      await api.deleteLitigationRecord(id);
      toast.success('Record deleted successfully');
      setIsModalOpen(false);
      refreshData();
    } catch (error) {
      toast.error('Failed to delete record');
    }
  };

  const handleSave = async (data: Partial<LitigationRecord>) => {
    await api.saveLitigationRecord({ ...data, category });
    setIsModalOpen(false);
    setIsViewModalOpen(false);
    refreshData();
  };

  const updateRecordStatus = async (id: string, newStatus: LitigationStatus) => {
    const rec = records.find(r => r.id === id);
    if (rec) {
      await api.saveLitigationRecord({ ...rec, status: newStatus });
      refreshData();
    }
  };

  const filteredRecords = useMemo(() => {
    const s = search.toLowerCase();
    return records.filter(r => 
      (r.clientName || '').toLowerCase().includes(s) || 
      (r.referenceNo || '').toLowerCase().includes(s)
    );
  }, [records, search]);

  if (isLoading) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* Mobile & Tablet Compact Stats Strip */}
      <div className="flex flex-wrap items-center justify-between w-full lg:hidden gap-1.5 px-3 py-2 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 rounded-xl shadow-xs text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
        <span className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2.5 py-0.5 rounded-md text-[10px] uppercase tracking-tight">
          Category: <strong className="font-bold text-slate-900 dark:text-white">{category} ({status})</strong>
        </span>
        <span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-2.5 py-0.5 rounded-md text-[10px] uppercase tracking-tight">
          Cases: <strong className="font-bold text-indigo-900 dark:text-indigo-200">{filteredRecords.length}</strong>
        </span>
      </div>

      {/* Toolbar */}
      <div className="relative z-30 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl p-2 sm:p-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs shrink-0 w-full max-w-full min-w-0 transition-colors">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] w-full sm:w-auto">
          <div className="hidden lg:flex items-center gap-3 px-3 py-1 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 rounded-xl shrink-0">
            <div className="text-left">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{category}</p>
              <p className="text-sm font-black text-slate-900 dark:text-white leading-none">
                {filteredRecords.length} <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase">{status}</span>
              </p>
            </div>
          </div>

          <div className="relative flex-1 min-w-[150px] sm:min-w-[220px]">
            <input 
              type="text" 
              placeholder={`Search ${category}...`} 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl pl-9 pr-3 font-semibold text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" 
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto flex-nowrap overflow-visible">
          <ViewControl 
            viewMode={viewMode} 
            onViewChange={setViewMode} 
            compactMode={compactMode} 
            onCompactToggle={() => setCompactMode(!compactMode)} 
          />
          <button 
            onClick={() => setIsGuidelinesOpen(true)}
            className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 font-bold uppercase tracking-wider px-2.5 sm:px-3 py-1.5 rounded-xl transition-all text-xs flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs h-9 active:scale-95"
            title="View Statutory Guidelines"
          >
            <span>⚖️</span>
            <span className="hidden sm:inline">Guidelines</span>
          </button>

          {status === 'Pending' && (
            <button 
              onClick={() => { setSelectedRecord(null); setIsModalOpen(true); }} 
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold uppercase tracking-wider px-3 sm:px-4 py-1.5 rounded-xl shadow-xs transition-all text-xs flex items-center gap-1.5 shrink-0 cursor-pointer h-9 active:scale-95"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Case</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Table Container */}
      <div className="relative z-10 flex-1 min-h-0 w-full max-w-full min-w-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden flex flex-col transition-colors">
        {viewMode === 'grid' ? (
          <div className="p-4 overflow-y-auto no-scrollbar grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredRecords.length === 0 ? (
              <div className="col-span-full py-24 text-center text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-xs">
                No litigation cases found
              </div>
            ) : (
              filteredRecords.map((rec, idx) => (
                <div key={rec.id} className="p-4 bg-slate-50/70 dark:bg-slate-850/60 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                        #{(idx + 1).toString().padStart(2, '0')}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase">
                        {formatISOToDDMMYYYY(rec.issuedDate || '')}
                      </span>
                    </div>
                    {(() => {
                      const client = clients.find(c => c.id === rec.clientId);
                      return (
                        <>
                          <h4 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate leading-snug" title={client?.tradeName || rec.clientName}>
                            {client?.tradeName || rec.clientName || '---'}
                          </h4>
                          {client?.gstProfile?.gstin && (
                            <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5 tracking-wider">
                              {client.gstProfile.gstin}
                            </p>
                          )}
                        </>
                      );
                    })()}
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      Ref No: {rec.referenceNo || '---'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-0.5 rounded-md border border-indigo-200/40 dark:border-indigo-800/40">
                      {rec.status}
                    </span>

                    <button 
                      type="button"
                      onClick={() => { setViewingRecord(rec); setIsViewModalOpen(true); }} 
                      className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-1 shadow-2xs cursor-pointer text-xs font-medium active:scale-95"
                    >
                      <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 12z" />
                      </svg>
                      <span>View</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="w-full overflow-x-auto overflow-y-auto no-scrollbar flex-1 relative h-full">
            <table className={`w-full text-left border-collapse table-auto min-w-[700px] compact-table ${compactMode ? 'compact-mode' : ''}`}>
              <thead className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 shadow-2xs">
                <tr className="text-slate-700 dark:text-slate-300 text-[11px] font-bold uppercase tracking-wider">
                  <th className="px-3 py-2 w-14 text-center whitespace-nowrap">S.No.</th>
                  <th className="px-3 py-2 min-w-[200px]">Entity</th>
                  <th className="px-3 py-2 min-w-[150px]">Ref No</th>
                  <th className="px-3 py-2 min-w-[140px] whitespace-nowrap">Due / Hearing Date</th>
                  <th className="sticky top-0 right-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2 text-right w-[110px] min-w-[110px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] border-b border-slate-200/90 dark:border-slate-700/90">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-24 text-center text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                      No litigation cases found
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec, idx) => (
                    <tr key={rec.id} className="group hover:bg-indigo-50/30 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-3 py-2 text-slate-400 dark:text-slate-500 font-mono text-center font-bold">
                        {(idx + 1).toString().padStart(2, '0')}
                      </td>
                      <td className="px-3 py-2 truncate min-w-[180px]">
                        {(() => {
                          const client = clients.find(c => c.id === rec.clientId);
                          return (
                            <>
                              <div className="font-bold text-slate-900 dark:text-slate-100 truncate text-base sm:text-lg tracking-tight leading-snug" title={client?.tradeName || rec.clientName}>
                                {client?.tradeName || rec.clientName || '---'}
                              </div>
                              {client?.gstProfile?.gstin && (
                                <div className="flex items-center gap-1 text-xs font-mono text-slate-500 dark:text-slate-400 tracking-wider">
                                  <span>{client.gstProfile.gstin}</span>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-600 dark:text-slate-300 uppercase truncate">
                        {rec.referenceNo}
                      </td>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap">
                        {rec.hearingDate ? (
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold">H: {formatISOToDDMMYYYY(rec.hearingDate)}</span>
                        ) : rec.dueDate ? (
                          <span className="text-amber-600 dark:text-amber-400 font-bold">D: {formatISOToDDMMYYYY(rec.dueDate)}</span>
                        ) : (
                          <span className="text-slate-400 font-normal">{formatISOToDDMMYYYY(rec.issuedDate || '')}</span>
                        )}
                      </td>
                      <td className="sticky right-0 z-20 bg-white/95 dark:bg-slate-900/95 group-hover:bg-indigo-50/40 dark:group-hover:bg-slate-850 backdrop-blur-md px-3 py-1.5 text-right w-[110px] min-w-[110px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                        <button 
                          type="button"
                          onClick={() => { setViewingRecord(rec as any); setIsViewModalOpen(true); }} 
                          className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-1 shadow-2xs cursor-pointer text-xs font-medium active:scale-95 ml-auto"
                          title="View Details"
                        >
                          <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 12z" />
                          </svg>
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NoticeForm isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} onDelete={handleDelete} clients={clients} category={category} initialData={selectedRecord} />
      <LitigationGuidelinesModal isOpen={isGuidelinesOpen} onClose={() => setIsGuidelinesOpen(false)} initialCategory={category} />
      <LitigationDetailModal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        record={viewingRecord}
        clients={clients}
        onEdit={(rec) => {
          setSelectedRecord(rec);
          setIsModalOpen(true);
        }}
        onDataChange={refreshData}
      />
    </div>
  );
};

export default LitigationModule;
