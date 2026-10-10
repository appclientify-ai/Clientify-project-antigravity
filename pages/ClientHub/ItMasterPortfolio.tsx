import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '../../exportUtils';
import { Client, ClientStatus } from '../../types.ts';
import { api } from '../../services/api.ts';
import ITClientFormModal from '../Clientform/ITClientFormModal.tsx';
import CredentialShareModal from '../../components/CredentialShareModal.tsx';
import ITPortalLoginModal from '../../components/ITPortalLoginModal.tsx';
import ITDetailModal from '../../components/ITDetailModal.tsx';
import Loader from '../../components/Loader.tsx';
import { toast } from 'sonner';

interface ItMasterPortfolioProps {
  clients?: Client[];
  externalSearch?: string;
  quickFilter?: string;
  viewMode?: 'table' | 'grid';
  onDataChange?: () => void;
}

const ItMasterPortfolio: React.FC<ItMasterPortfolioProps> = ({ 
  clients: propClients,
  externalSearch = '', 
  quickFilter = 'All',
  viewMode = 'table',
  onDataChange
}) => {
  const queryClient = useQueryClient();
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [shareText, setShareText] = useState('');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareModalClient, setShareModalClient] = useState<Client | null>(null);
  const [selectedNote, setSelectedNote] = useState('');
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Multi-Select & Bulk State
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [isBulkStatusMenuOpen, setIsBulkStatusMenuOpen] = useState(false);

  // Sorting State
  const [sortField, setSortField] = useState<'legalName' | 'tradeName' | 'pan' | 'itr' | 'status'>('legalName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const { data: clientsData, isLoading: isClientsLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.getClients(),
    staleTime: 1000 * 60 * 5,
    enabled: !propClients || propClients.length === 0,
  });

  const clients = useMemo(() => {
    if (propClients && propClients.length > 0) {
      return propClients.filter(c => c && c.itProfile);
    }
    return (clientsData || []).filter(c => c && c.itProfile);
  }, [propClients, clientsData]);

  const isLoading = !propClients && isClientsLoading && !clientsData;

  // Filters - Single-instance anchored strictly behind filter icon
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [activeFilterMenu, setActiveFilterMenu] = useState<'status' | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const statusFilterBtnRef = useRef<HTMLButtonElement>(null);

  // Login Tool Box State
  const [isLoginBoxOpen, setIsLoginBoxOpen] = useState(false);
  const [loginToolClient, setLoginToolClient] = useState<Client | null>(null);
  const [loginPortalType, setLoginPortalType] = useState<'it' | 'traces'>('it');

  // Actions Menu State (Portaled Drawer)
  const [activeActionsId, setActiveActionsId] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const handleViewProfile = (client: Client) => {
    setSelectedClient(client);
    setIsDetailModalOpen(true);
  };

  useEffect(() => {
    const syncHandler = () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    };
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, [queryClient]);

  // Handle closing menu on click outside or scroll
  useEffect(() => {
    const handleClose = (event: any) => {
      const target = event.target as Node;
      if (actionsRef.current && !actionsRef.current.contains(target)) {
        setActiveActionsId(null);
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(target)) {
        if (statusFilterBtnRef.current && statusFilterBtnRef.current.contains(target)) {
          return;
        }
        setActiveFilterMenu(null);
      }
    };
    const handleScroll = (event: any) => {
      if (actionsRef.current && actionsRef.current.contains(event.target as Node)) {
        return;
      }
      setActiveFilterMenu(null);
    };

    if (activeActionsId || activeFilterMenu) {
      document.addEventListener('mousedown', handleClose);
      window.addEventListener('scroll', handleScroll, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClose);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [activeActionsId, activeFilterMenu]);

  // Handle ESC key to dismiss actions menu
  useEffect(() => {
    if (!activeActionsId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveActionsId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeActionsId]);

  const handleDataChange = () => {
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    queryClient.invalidateQueries({ queryKey: ['it_clients'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    if (onDataChange) onDataChange();
  };

  const handleEdit = (client: Client) => {
    setSelectedClient(client);
    setIsEditModalOpen(true);
  };

  const handleSort = (field: 'legalName' | 'tradeName' | 'pan' | 'itr' | 'status') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredClients = useMemo(() => {
    const s = (externalSearch || '').toLowerCase().trim();

    let list = (clients || []).filter(c => {
      if (!c) return false;
      const safe = (val: any) => typeof val === 'string' ? val.toLowerCase() : String(val || '').toLowerCase();
      return safe(c.legalName).includes(s) ||
             safe(c.tradeName).includes(s) ||
             safe(c.itProfile?.pan).includes(s) ||
             safe(c.itProfile?.fatherName).includes(s) ||
             safe(c.mobile).includes(s) ||
             safe(c.address).includes(s);
    });

    // Quick filter chips
    if (quickFilter && quickFilter !== 'All') {
      if (quickFilter === 'Active') {
        list = list.filter(c => c.status === 'Active' || c.status === 'Active Filing');
      } else if (quickFilter === 'Litigation') {
        list = list.filter(c => c.status === 'Litigation');
      } else if (quickFilter === 'Inactive') {
        list = list.filter(c => c.status === 'Inactive' || c.status === 'Suspended');
      }
    }

    // Status filter menu
    if (statusFilter !== 'All') {
      list = list.filter(c => {
        if (statusFilter === 'Active') return c.status === 'Active' || c.status === 'Active Filing';
        return c.status === statusFilter;
      });
    }

    // Apply Sorting
    return [...list].sort((a, b) => {
      let valA = '';
      let valB = '';

      if (sortField === 'legalName') {
        valA = a.legalName || a.tradeName || '';
        valB = b.legalName || b.tradeName || '';
      } else if (sortField === 'tradeName') {
        valA = a.tradeName || a.legalName || '';
        valB = b.tradeName || b.legalName || '';
      } else if (sortField === 'pan') {
        valA = a.itProfile?.pan || '';
        valB = b.itProfile?.pan || '';
      } else if (sortField === 'itr') {
        valA = a.itProfile?.itrFiled || '';
        valB = b.itProfile?.itrFiled || '';
      } else if (sortField === 'status') {
        valA = a.status || '';
        valB = b.status || '';
      }

      const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [clients, externalSearch, quickFilter, statusFilter, sortField, sortOrder]);

  // Multi-select handlers
  const toggleSelectAll = () => {
    if (selectedClientIds.size === filteredClients.length && filteredClients.length > 0) {
      setSelectedClientIds(new Set());
    } else {
      setSelectedClientIds(new Set(filteredClients.map(c => c.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedClientIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Bulk Operations
  const selectedClientsList = useMemo(() => {
    return (clients || []).filter(c => selectedClientIds.has(c.id));
  }, [clients, selectedClientIds]);

  const handleBulkCopyCreds = () => {
    if (selectedClientsList.length === 0) return;
    const credsText = selectedClientsList.map(c => 
      `Entity: ${c.legalName || c.tradeName}\nPAN: ${c.itProfile?.pan || 'N/A'}\nUser ID: ${c.itProfile?.pan || 'N/A'}\nPassword: ${c.itProfile?.password || 'N/A'}`
    ).join('\n---------------------\n');

    if (navigator.clipboard) {
      navigator.clipboard.writeText(credsText);
      toast.success(`Copied IT credentials for ${selectedClientsList.length} clients!`);
    }
  };

  const handleBulkExportCSV = () => {
    if (selectedClientsList.length === 0) return;
    const headers = [
      "Legal Name", "Trade Name", "PAN", "Father Name", "DOB", "Mobile", "Email", "Address",
      "ITR Form", "Portal Password", "Status"
    ].join(",");

    const rows = selectedClientsList.map(c => [
      c?.legalName, c?.tradeName, c?.itProfile?.pan, c?.itProfile?.fatherName, 
      formatDate(c?.itProfile?.dob || c?.dob), c?.mobile, c?.email, c?.address || (c?.itProfile as any)?.address,
      c?.itProfile?.itrFiled, c?.itProfile?.password, c?.status
    ].map(v => `"${v || ''}"`).join(",")).join("\n");

    const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `IT_Selected_Clients_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${selectedClientsList.length} clients!`);
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedClientsList.length === 0) return;
    try {
      toast.loading(`Updating status for ${selectedClientsList.length} clients...`);
      for (const client of selectedClientsList) {
        const updated = { ...client, status: newStatus as any };
        await api.saveClient(updated);
      }
      handleDataChange();
      setSelectedClientIds(new Set());
      setIsBulkStatusMenuOpen(false);
      toast.dismiss();
      toast.success(`Updated status for ${selectedClientsList.length} clients to ${newStatus}`);
    } catch (err) {
      toast.dismiss();
      toast.error("Failed to update status for selected clients.");
    }
  };

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard!');
    }
  };

  const handleShareClick = (text: string) => {
    setShareText(text);
    setIsShareModalOpen(true);
  };
  
  const proceedShare = () => {
    const final = shareText + (selectedNote ? '\n\n*Note:*\n' + selectedNote : '');
    window.location.href = `whatsapp://send?text=${encodeURIComponent(final)}`;
    setIsShareModalOpen(false);
  };

  const openActionsMenu = (e: React.MouseEvent, client: Client) => {
    e.stopPropagation();
    setSelectedClient(client);
    setActiveActionsId(client.id);
  };

  const getStatusBadgeClass = (status?: string) => {
    switch (status) {
      case 'Active':
      case 'Active Filing':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60';
      case 'Litigation':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400 border border-purple-200/60 dark:border-purple-800/60';
      case 'Suspended':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60';
      case 'Inactive':
        return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700';
      default:
        return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700';
    }
  };

  const getStatusDotClass = (status?: string) => {
    switch (status) {
      case 'Active':
      case 'Active Filing':
        return 'bg-emerald-500';
      case 'Litigation':
        return 'bg-purple-500';
      case 'Suspended':
        return 'bg-amber-500';
      case 'Inactive':
      default:
        return 'bg-slate-400';
    }
  };

  if (isLoading) return <Loader />;

  return (
    <div className="w-full h-full flex flex-col min-h-0 relative">
      {viewMode === 'grid' ? (
        <div className="overflow-auto no-scrollbar flex-1 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {filteredClients.length === 0 ? (
            <div className="col-span-full py-16 text-center text-slate-400 dark:text-slate-500 font-semibold text-sm">
              No matching clients found in IT Portfolio
            </div>
          ) : (
            filteredClients.map((client) => {
              const isSelected = selectedClientIds.has(client.id);

              return (
                <div 
                  key={client.id}
                  className={`bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border rounded-2xl p-4 flex flex-col justify-between transition-all relative hover:shadow-md animate-in fade-in duration-200 ${
                    isSelected 
                      ? 'border-indigo-600 bg-indigo-50/20 dark:bg-indigo-950/20 ring-2 ring-indigo-500/20' 
                      : 'border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-300 dark:hover:border-indigo-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => toggleSelectRow(client.id)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-semibold uppercase tracking-wider">
                        {client.itProfile?.category || 'Individual'}
                      </span>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium tracking-tight border ${getStatusBadgeClass(client.status)}`}>
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${getStatusDotClass(client.status)}`} />
                      <span>{client.status}</span>
                    </span>
                  </div>

                  <div className="mb-3">
                    <h4 className="font-semibold text-slate-900 dark:text-white text-sm truncate" title={client.legalName || client.tradeName}>
                      {client.legalName || client.tradeName}
                    </h4>
                    {client.tradeName && client.legalName && client.tradeName !== client.legalName && (
                      <p className="text-xs font-normal text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        Trade: {client.tradeName}
                      </p>
                    )}
                  </div>

                  <div className="bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-3 mb-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">PAN No.</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold font-mono tabular-nums text-indigo-600 dark:text-indigo-400 text-xs tracking-wider uppercase">
                          {client.itProfile?.pan || '---'}
                        </span>
                        {client.itProfile?.pan && (
                          <button 
                            type="button"
                            onClick={() => copyToClipboard(client.itProfile?.pan || '')}
                            className="p-1 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded transition-colors cursor-pointer"
                            title="Copy PAN"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 5H6a2 2 0 00-2-2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2" /></svg>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">ITR / Work</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-750 px-2 py-0.5 rounded border border-slate-200/70 dark:border-slate-700/70 text-[11px]">
                        {client.itProfile?.itrFiled || 'ITR'} ({client.itProfile?.natureOfWork || 'Salaried'})
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">DOB</span>
                      <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 text-[11px]">
                        {formatDate(client.itProfile?.dob || client.dob) || '---'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Mobile</span>
                      <span className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">{client.mobile || '---'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 gap-1.5">
                    <button 
                      type="button"
                      onClick={() => handleViewProfile(client)}
                      className="h-8 flex-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 text-xs font-medium"
                      title="View Complete Profile & Dossier"
                    >
                      <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 12z" />
                      </svg>
                      <span>View</span>
                    </button>

                    <button 
                      type="button"
                      onClick={(e) => openActionsMenu(e, client)}
                      className={`h-8 w-8 rounded-lg border transition-all flex items-center justify-center shadow-2xs cursor-pointer active:scale-95 ${
                        activeActionsId === client.id 
                          ? 'bg-slate-900 text-white dark:bg-indigo-600 border-slate-900 dark:border-indigo-600' 
                          : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                      title="More Options"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h.01M12 12h.01M19 12h.01" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="w-full overflow-x-auto overflow-y-auto no-scrollbar flex-1 relative h-full">
          <table className="w-full text-left border-collapse table-auto min-w-full sm:min-w-[850px] it-portfolio-table font-sans">
            <thead className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 shadow-2xs">
              <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 select-none">
                <th className="px-3 py-3 w-12 text-center whitespace-nowrap">#</th>
                
                <th 
                  onClick={() => handleSort('legalName')}
                  className="px-3 py-3 cursor-pointer hover:bg-slate-100/80 dark:hover:bg-slate-700/80 transition-colors min-w-[200px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Name</span>
                    <span className="text-indigo-600 dark:text-indigo-400 text-xs">{sortField === 'legalName' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </div>
                </th>

                <th 
                  onClick={() => handleSort('pan')}
                  className="px-3 py-3 cursor-pointer hover:bg-slate-100/80 dark:hover:bg-slate-700/80 transition-colors whitespace-nowrap min-w-[140px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>PAN No.</span>
                    <span className="text-indigo-600 dark:text-indigo-400 text-xs">{sortField === 'pan' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </div>
                </th>

                <th className="px-3 py-3 whitespace-nowrap min-w-[130px]">Father Name</th>

                <th className="px-3 py-3 whitespace-nowrap min-w-[100px]">DOB</th>

                <th className="px-3 py-3 whitespace-nowrap min-w-[110px]">Mobile No.</th>

                <th 
                  onClick={() => handleSort('itr')}
                  className="px-3 py-3 cursor-pointer hover:bg-slate-100/80 dark:hover:bg-slate-700/80 transition-colors whitespace-nowrap min-w-[100px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>ITR Form</span>
                    <span className="text-indigo-600 dark:text-indigo-400 text-xs">{sortField === 'itr' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </div>
                </th>

                <th className="px-3 py-3 whitespace-nowrap min-w-[110px] relative">
                  <div className="flex items-center gap-1.5">
                    <span>Status</span>
                    <div className="relative inline-block">
                      <button 
                        ref={statusFilterBtnRef}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveFilterMenu(prev => prev === 'status' ? null : 'status');
                        }} 
                        className={`h-5 w-5 rounded-md border flex items-center justify-center transition-all cursor-pointer relative ${
                          statusFilter !== 'All' 
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' 
                            : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 hover:text-indigo-600 hover:border-indigo-400'
                        }`}
                        title={`Filter by Status (Current: ${statusFilter})`}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        {statusFilter !== 'All' && (
                          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-400 border border-white dark:border-slate-900" />
                        )}
                      </button>

                      {activeFilterMenu === 'status' && (
                        <div 
                          ref={filterMenuRef}
                          onClick={e => e.stopPropagation()}
                          className="absolute right-0 top-full mt-1.5 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-[100] p-1.5 animate-in zoom-in-95 origin-top-right text-left backdrop-blur-xl normal-case font-normal"
                        >
                          <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 mb-1">
                            Filter Status
                          </div>
                          {['All', 'Active', 'Litigation', 'Suspended', 'Inactive'].map(f => (
                            <button 
                              key={f} 
                              type="button"
                              onClick={() => { setStatusFilter(f); setActiveFilterMenu(null); }} 
                              className={`w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                                statusFilter === f ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              <span>{f === 'All' ? 'All Status' : f}</span>
                              {statusFilter === f && <span>✓</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </th>

                <th className="px-3 py-3 text-right whitespace-nowrap min-w-[120px] sticky right-0 bg-slate-50 dark:bg-slate-800 z-40 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs font-sans">
              {(!filteredClients || filteredClients.length === 0) ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400 dark:text-slate-500 font-medium text-sm">
                    No matching clients found in IT Portfolio
                  </td>
                </tr>
              ) : (
                filteredClients.map((client, idx) => {
                  const isSelected = selectedClientIds.has(client.id);

                  return (
                    <tr 
                      key={client.id} 
                      className={`transition-colors duration-150 group border-b border-slate-100 dark:border-slate-800/60 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-800/50 ${
                        isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/30' : ''
                      }`}
                    >
                      {/* S.No. */}
                      <td className="px-3 py-2.5 font-mono tabular-nums text-xs font-medium text-slate-400 dark:text-slate-500 w-12 text-center whitespace-nowrap">
                        {(idx + 1).toString().padStart(2, '0')}
                      </td>

                      {/* Name (Legal Name & Trade Name unified) */}
                      <td className="px-3 py-2.5 min-w-[200px]">
                        <p className="text-xs sm:text-sm font-semibold leading-normal truncate text-slate-900 dark:text-white" title={client.legalName || client.tradeName}>
                          {client.legalName || client.tradeName || '---'}
                        </p>
                        {client.tradeName && client.tradeName !== client.legalName && (
                          <p className="text-[11px] font-normal leading-tight truncate text-slate-500 dark:text-slate-400 mt-0.5" title={client.tradeName}>
                            <span className="text-slate-400 dark:text-slate-500 font-medium">Trade: </span>
                            {client.tradeName}
                          </p>
                        )}
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium block mt-0.5">{client.itProfile?.category || 'Individual'}</span>
                      </td>

                      {/* PAN No. */}
                      <td className="px-3 py-2.5 whitespace-nowrap min-w-[140px]">
                        <div className="flex items-center gap-1.5 group/pan">
                          <span className="tracking-wider uppercase text-xs font-semibold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                            {client.itProfile?.pan || '---'}
                          </span>
                          {client.itProfile?.pan && (
                            <button 
                              type="button"
                              onClick={() => copyToClipboard(client.itProfile?.pan || '')}
                              className="h-5 w-5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-500 transition-all flex items-center justify-center opacity-0 group-hover/pan:opacity-100 shadow-xs border border-indigo-100 dark:border-indigo-900 cursor-pointer"
                              title="Copy PAN"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 5H6a2 2 0 00-2-2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2" /></svg>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Father Name */}
                      <td className="px-3 py-2.5 whitespace-nowrap min-w-[130px]">
                        <p className="text-xs font-normal text-slate-600 dark:text-slate-400 truncate" title={client.itProfile?.fatherName}>
                          {client.itProfile?.fatherName || '---'}
                        </p>
                      </td>

                      {/* DOB */}
                      <td className="px-3 py-2.5 whitespace-nowrap min-w-[100px]">
                        <p className="font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-400">
                          {formatDate(client.itProfile?.dob || client.dob) || '---'}
                        </p>
                      </td>

                      {/* Mobile No. */}
                      <td className="px-3 py-2.5 whitespace-nowrap min-w-[110px]">
                        <p className="font-mono tabular-nums text-xs font-medium text-slate-700 dark:text-slate-300">{client.mobile || '---'}</p>
                      </td>

                      {/* ITR Form */}
                      <td className="px-3 py-2.5 whitespace-nowrap min-w-[100px]">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-medium tracking-tight bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {client.itProfile?.itrFiled || 'ITR'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2.5 whitespace-nowrap min-w-[110px]">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium tracking-tight border ${getStatusBadgeClass(client.status)}`}>
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${getStatusDotClass(client.status)}`} />
                          <span>{client.status}</span>
                        </span>
                      </td>

                      {/* Actions - Clean split action with ghost View + 3-dot MoreHorizontal button */}
                      <td className="px-3 py-2 text-right overflow-visible whitespace-nowrap min-w-[120px] sticky right-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-850 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.04)]">
                        <div className="flex items-center justify-end gap-1.5">
                          <button 
                            type="button"
                            onClick={() => handleViewProfile(client)}
                            className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-1 shadow-2xs cursor-pointer text-xs font-medium active:scale-95"
                            title="View Complete IT Profile & Dossier"
                          >
                            <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 12z" />
                            </svg>
                            <span>View</span>
                          </button>
                          
                          <button 
                            type="button"
                            onClick={(e) => openActionsMenu(e, client)}
                            className={`h-7 w-7 rounded-lg border transition-all flex items-center justify-center shadow-2xs cursor-pointer active:scale-95 ${
                              activeActionsId === client.id 
                                ? 'bg-slate-900 text-white dark:bg-indigo-600 border-slate-900 dark:border-indigo-600' 
                                : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                            }`}
                            title="More Actions"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h.01M12 12h.01M19 12h.01" />
                            </svg>
                          </button>
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

      {/* Floating Bulk Operations Toolbar */}
      {selectedClientIds.size > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 dark:bg-slate-850/95 backdrop-blur-md text-white rounded-2xl shadow-2xl px-4 py-2.5 flex items-center gap-3 border border-slate-700 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2 border-r border-slate-700 pr-3">
            <span className="h-6 w-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
              {selectedClientIds.size}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Selected</span>
          </div>

          <button 
            type="button"
            onClick={handleBulkCopyCreds}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-indigo-600 text-white text-xs font-semibold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Copy IT Credentials for selected clients"
          >
            <span>📋 Copy Credentials</span>
          </button>

          <button 
            type="button"
            onClick={handleBulkExportCSV}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-600 text-white text-xs font-semibold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Export selected clients to CSV"
          >
            <span>📥 Export CSV</span>
          </button>

          <div className="relative">
            <button 
              type="button"
              onClick={() => setIsBulkStatusMenuOpen(!isBulkStatusMenuOpen)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-amber-600 text-white text-xs font-semibold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>⚡ Change Status ▾</span>
            </button>

            {isBulkStatusMenuOpen && (
              <div className="absolute bottom-full mb-2 left-0 w-44 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-xl shadow-2xl p-1.5 border border-slate-200 dark:border-slate-800 z-50 animate-in zoom-in-95">
                {['Active', 'Litigation', 'Suspended', 'Inactive'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => handleBulkStatusChange(status)}
                    className="w-full text-left px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                  >
                    Set {status}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button 
            type="button"
            onClick={() => setSelectedClientIds(new Set())}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Deselect All"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Global Actions Menu - Opened in Right Side Center & Portaled to body to never hide */}
      {activeActionsId && selectedClient && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999998] flex items-center justify-end p-3 sm:p-6 pointer-events-none">
          {/* Dismiss Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-950/20 backdrop-blur-[2px] pointer-events-auto animate-in fade-in duration-150"
            onClick={(e) => {
              e.stopPropagation();
              setActiveActionsId(null);
            }} 
          />

          {/* Action Options Panel in Right Side Center */}
          <div 
            ref={actionsRef}
            onClick={(e) => e.stopPropagation()}
            className="relative pointer-events-auto w-80 max-w-[calc(100vw-24px)] max-h-[calc(100vh-32px)] flex flex-col bg-white/98 dark:bg-slate-900/98 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl z-[999999] text-left backdrop-blur-2xl animate-in fade-in slide-in-from-right-4 duration-200 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden"
          >
            {/* Header */}
            <div className="p-3.5 sm:p-4 bg-slate-50/90 dark:bg-slate-850/90 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">IT Operations</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 font-mono text-[9px] font-bold">
                    {selectedClient.itProfile?.category || 'Individual'}
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                  {selectedClient.legalName || selectedClient.tradeName}
                </h4>
                <p className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 truncate">
                  PAN: {selectedClient.itProfile?.pan || '---'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveActionsId(null)}
                className="h-7 w-7 rounded-xl bg-slate-200/60 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer text-xs shrink-0"
                title="Close (Esc)"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Action Buttons */}
            <div className="overflow-y-auto p-2 space-y-1 no-scrollbar flex-1">
              {/* 1. View Complete Profile Dossier */}
              <button 
                type="button"
                onClick={() => { 
                  setIsDetailModalOpen(true); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:bg-white dark:group-hover:bg-slate-800 shadow-xs text-base font-bold shrink-0">
                  👁️
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 block truncate">View Complete Profile</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">IT Dossier, PAN & Credentials</span>
                </div>
              </button>

              {/* 2. Edit Client Form */}
              <button 
                type="button"
                onClick={() => { 
                  setIsEditModalOpen(true); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-base shrink-0">
                  ✏️
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">Edit Client Form</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Modify details & credentials</span>
                </div>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* Portals Direct Login Section */}
              <div className="px-3 py-1 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Official Portals</span>
                <span className="text-[10px] text-slate-400">Login Assistant</span>
              </div>

              {/* IT e-Filing Portal */}
              <button 
                type="button"
                onClick={() => { 
                  setLoginToolClient(selectedClient); 
                  setLoginPortalType('it'); 
                  setIsLoginBoxOpen(true); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs shrink-0">🏛️</div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">IT Portal Direct Login</span>
                  <span className="text-[10px] text-slate-400 block truncate">{selectedClient?.itProfile?.pan || 'View ID & Password'}</span>
                </div>
              </button>

              {/* TRACES Portal */}
              <button 
                type="button"
                onClick={() => { 
                  setLoginToolClient(selectedClient); 
                  setLoginPortalType('traces'); 
                  setIsLoginBoxOpen(true); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs shrink-0">📄</div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">TRACES Direct Login</span>
                  <span className="text-[10px] text-slate-400 block truncate">TDS Portal Login Assistant</span>
                </div>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* Share Login Credentials */}
              <button 
                type="button"
                onClick={() => { 
                  setShareModalClient(selectedClient); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs shrink-0">🔑</div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">Share Login Credentials</span>
              </button>

              <button 
                type="button"
                onClick={() => { 
                  const it = selectedClient!.itProfile;
                  const fullText = `*Client Details*\nLegal Name: ${selectedClient!.legalName || 'N/A'}\nTrade Name: ${selectedClient!.tradeName || 'N/A'}\nMobile: ${selectedClient!.mobile || 'N/A'}\nEmail: ${selectedClient!.email || 'N/A'}\nAddress: ${selectedClient!.address || 'N/A'}\n\n*Income Tax Details*\nPAN: ${it?.pan || 'N/A'}\nCategory: ${it?.category || 'Individual'}\nFather Name: ${it?.fatherName || 'N/A'}\nDOB: ${formatDate(it?.dob || selectedClient!.dob)}\nNature of Work: ${it?.natureOfWork || 'N/A'}\nITR Form: ${it?.itrFiled || 'N/A'}\n\n*Credentials*\nIT User ID: ${it?.username || it?.pan || 'N/A'}\nIT Password: ${it?.password || 'N/A'}`;
                  handleShareClick(fullText);
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-xs shrink-0">📋</div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">Full Profile Summary</span>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* Archive / Status Toggle */}
              <button 
                type="button"
                onClick={() => { 
                  const nextStatus: ClientStatus = selectedClient.status === 'Inactive' ? 'Active' : 'Inactive';
                  api.saveClient({ ...selectedClient, status: nextStatus }).then(() => {
                    handleDataChange();
                    toast.success(`Client marked as ${nextStatus}`);
                  });
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400 text-xs shrink-0">🗄️</div>
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300 truncate">
                  {selectedClient.status === 'Inactive' ? 'Unarchive Client' : 'Archive to Inactive'}
                </span>
              </button>

              {/* Delete Client */}
              <button 
                type="button"
                onClick={() => { 
                  if (confirm(`Permanently delete "${selectedClient!.legalName || selectedClient!.tradeName}" from vault?`)) {
                    api.deleteClient(selectedClient!.id).then(handleDataChange); 
                  }
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center text-rose-500 dark:text-rose-400 text-xs shrink-0">🗑️</div>
                <span className="text-xs font-medium text-rose-600 dark:text-rose-400 truncate">Delete Client</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Share Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 uppercase mb-4">Append Note</h3>
            <textarea
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 font-medium outline-none h-32 mb-4 focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-slate-100 text-xs"
              placeholder="Select a note or type here..."
              value={selectedNote}
              onChange={(e) => setSelectedNote(e.target.value)}
            />
            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4">
               {(() => {
                 const saved = typeof window !== 'undefined' ? localStorage.getItem('clientify_custom_templates') : null;
                 const templates = saved ? JSON.parse(saved) : [];
                 return templates.map((t: any, i: number) => (
                   <button key={i} onClick={() => setSelectedNote(t.text)} className="shrink-0 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">{t.label}</button>
                 ));
               })()}
            </div>
            <div className="flex gap-4">
              <button onClick={() => setIsShareModalOpen(false)} className="flex-1 py-3 text-slate-500 font-bold uppercase tracking-wider text-[11px] border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer">Cancel</button>
              <button onClick={proceedShare} className="flex-1 py-3 bg-emerald-600 text-white font-bold uppercase tracking-wider text-[11px] rounded-xl shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-colors cursor-pointer">Share Now</button>
            </div>
          </div>
        </div>
      )}

      {/* Modern IT Portal Login Modal matching GST */}
      <ITPortalLoginModal
        isOpen={isLoginBoxOpen}
        onClose={() => setIsLoginBoxOpen(false)}
        client={loginToolClient}
        onDataChange={handleDataChange}
        initialType={loginPortalType}
      />

      {/* IT Client Edit Modal */}
      <ITClientFormModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} onSave={handleDataChange} initialData={selectedClient} />

      {/* IT Detail Dossier Modal */}
      <ITDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        client={selectedClient}
        onEdit={handleEdit}
        onDataChange={handleDataChange}
      />

      {shareModalClient && (
        <CredentialShareModal
          isOpen={!!shareModalClient}
          onClose={() => setShareModalClient(null)}
          client={shareModalClient}
          mode="it"
        />
      )}
    </div>
  );
};

export default ItMasterPortfolio;
