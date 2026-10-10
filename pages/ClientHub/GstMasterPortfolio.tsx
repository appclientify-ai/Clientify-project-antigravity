import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate, getSectorGroupLabel, getClientColorTheme } from '../../exportUtils';
import { Client } from '../../types.ts';
import { api } from '../../services/api.ts';
import GSTClientFormModal from '../Clientform/GSTClientFormModal.tsx';
import GSTPortalLoginModal from '../../components/GSTPortalLoginModal';
import { GSTCertificateModal } from '../../components/GSTCertificateModal';
import { CredentialShareModal } from '../../components/CredentialShareModal';
import GSTDetailModal from '../../components/GSTDetailModal';
import GSTViewIcon from '../../components/GSTViewIcon';
import Loader from '../../components/Loader';
import ErrorBoundary from '../../components/ErrorBoundary';
import { toast } from 'sonner';

import { filterClientsBySectorJurisdiction } from '../../components/SectorJurisdictionFilter';

interface GstMasterPortfolioProps {
  clients?: Client[];
  externalSearch?: string;
  quickFilter?: string;
  viewMode?: 'table' | 'grid';
  authorityFilter?: 'All' | 'State' | 'Center';
  selectedSectors?: string[];
  onDataChange?: () => void;
}

const GstMasterPortfolioContent: React.FC<GstMasterPortfolioProps> = ({ 
  clients: propClients,
  externalSearch = '', 
  quickFilter = 'All',
  viewMode = 'table',
  authorityFilter = 'All',
  selectedSectors = [],
  onDataChange
}) => {
  const queryClient = useQueryClient();
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailClient, setDetailClient] = useState<Client | null>(null);
  const [shareText, setShareText] = useState('');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [isCredentialShareModalOpen, setIsCredentialShareModalOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState('');

  const handleViewProfile = (client: Client) => {
    setDetailClient(client);
    setIsDetailModalOpen(true);
  };

  // Multi-select & Bulk operations state
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [isBulkStatusMenuOpen, setIsBulkStatusMenuOpen] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState<'tradeName' | 'legalName' | 'gstin' | 'status' | 'regType' | 'jurisdiction'>('tradeName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const { data: clientsData, isLoading: isClientsLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.getClients(),
    staleTime: 1000 * 60 * 5,
    enabled: !propClients || propClients.length === 0,
  });

  const clients = useMemo(() => {
    if (propClients && propClients.length > 0) {
      return propClients.filter(c => c && c.gstProfile);
    }
    return (clientsData || []).filter(c => c && c.gstProfile);
  }, [propClients, clientsData]);

  const isLoading = !propClients && isClientsLoading && !clientsData;

  // Filters - Single-instance anchored strictly behind filter icon
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [relFilter, setRelFilter] = useState<string>('All');
  const [activeFilterMenu, setActiveFilterMenu] = useState<'status' | 'rel' | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const statusFilterBtnRef = useRef<HTMLButtonElement>(null);
  const relFilterBtnRef = useRef<HTMLButtonElement>(null);

  // Login Tool Box State
  const [isLoginBoxOpen, setIsLoginBoxOpen] = useState(false);
  const [loginToolClient, setLoginToolClient] = useState<Client | null>(null);
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [isEditingLoginPass, setIsEditingLoginPass] = useState(false);
  const [tempPass, setTempPass] = useState('');
  const [loginPortalType, setLoginPortalType] = useState<'gst' | 'eway' | 'gstat'>('gst');

  // Actions Menu State (Fixed Positioning)
  const [activeActionsId, setActiveActionsId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const actionsRef = useRef<HTMLDivElement>(null);

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
        if (
          (statusFilterBtnRef.current && statusFilterBtnRef.current.contains(target)) ||
          (relFilterBtnRef.current && relFilterBtnRef.current.contains(target))
        ) {
          return;
        }
        setActiveFilterMenu(null);
      }
    };
    const handleScroll = (event: any) => {
      // Don't close if user is scrolling inside the actions panel itself!
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
    queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    if (onDataChange) onDataChange();
  };

  // Filtered clients hook MUST be declared before groupedClients hook
  const filteredClients = useMemo(() => {
    const s = (externalSearch || '').toLowerCase();
    let list = (clients || []).filter(c => {
      if (!c) return false;
      const safeString = (val: any) => typeof val === 'string' ? val.toLowerCase() : String(val || '').toLowerCase();
      
      return safeString(c.legalName).includes(s) || 
             safeString(c.tradeName).includes(s) ||
             safeString(c.gstProfile?.gstin).includes(s) ||
             safeString(c.mobile).includes(s);
    });

    // Handle Quick Filter Pill
    if (quickFilter && quickFilter !== 'All') {
      if (quickFilter === 'Active') {
        list = list.filter(c => c.status === 'Active' || c.status === 'Active Filing');
      } else if (quickFilter === 'Active Filing') {
        list = list.filter(c => c.status === 'Active Filing');
      } else if (quickFilter === 'Regular') {
        list = list.filter(c => c.gstProfile?.regType === 'Regular');
      } else if (quickFilter === 'Composition') {
        list = list.filter(c => c.gstProfile?.regType === 'Composition');
      } else if (quickFilter === 'Monthly') {
        list = list.filter(c => !c.gstProfile?.filingFreq || c.gstProfile?.filingFreq === 'Monthly');
      } else if (quickFilter === 'Quarterly') {
        list = list.filter(c => c.gstProfile?.filingFreq === 'Quarterly');
      } else if (quickFilter === 'Litigation') {
        list = list.filter(c => c.status === 'Litigation');
      } else if (quickFilter === 'Inactive') {
        list = list.filter(c => c.status === 'Inactive' || c.status === 'Suspended');
      }
    }

    if (statusFilter !== 'All') {
      list = list.filter(c => c && (c.gstProfile?.gstStatus || 'Active') === statusFilter);
    }
    if (relFilter !== 'All') {
      list = list.filter(c => {
        if (!c) return false;
        if (relFilter === 'Active') return c.status === 'Active' || c.status === 'Active Filing';
        return c.status === relFilter;
      });
    }

    // Apply Sector & Jurisdiction Filter
    list = filterClientsBySectorJurisdiction(list, authorityFilter, selectedSectors);

    return list;
  }, [clients, externalSearch, quickFilter, statusFilter, relFilter, authorityFilter, selectedSectors]);

  // Handle Sort Toggle
  const handleSort = (field: 'tradeName' | 'legalName' | 'gstin' | 'status' | 'regType' | 'jurisdiction') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Grouped clients hook using filteredClients with sorting support
  const groupedClients = useMemo(() => {
    const groups: Record<string, Client[]> = {};
    (filteredClients || []).forEach(c => {
      if (!c) return;
      const sector = getSectorGroupLabel(c);
      if (!groups[sector]) groups[sector] = [];
      groups[sector].push(c);
    });
    const sortedKeys = Object.keys(groups).sort((a, b) => {
       if (a.startsWith('Uncategorized')) return 1;
       if (b.startsWith('Uncategorized')) return -1;
       return (a || '').localeCompare(b || '', undefined, { numeric: true, sensitivity: 'base' });
    });

    return sortedKeys.map(k => {
      const sortedGroup = [...(groups[k] || [])].sort((c1, c2) => {
        let val1 = '';
        let val2 = '';
        if (sortField === 'tradeName') {
          val1 = c1.tradeName || c1.legalName || '';
          val2 = c2.tradeName || c2.legalName || '';
        } else if (sortField === 'legalName') {
          val1 = c1.legalName || '';
          val2 = c2.legalName || '';
        } else if (sortField === 'gstin') {
          val1 = c1.gstProfile?.gstin || '';
          val2 = c2.gstProfile?.gstin || '';
        } else if (sortField === 'status') {
          val1 = c1.status || '';
          val2 = c2.status || '';
        } else if (sortField === 'regType') {
          val1 = c1.gstProfile?.regType || '';
          val2 = c2.gstProfile?.regType || '';
        } else if (sortField === 'jurisdiction') {
          val1 = c1.gstProfile?.jurisdictionType || '';
          val2 = c2.gstProfile?.jurisdictionType || '';
        }

        const cmp = val1.localeCompare(val2, undefined, { numeric: true, sensitivity: 'base' });
        return sortOrder === 'asc' ? cmp : -cmp;
      });

      return {
        sector: k,
        clients: sortedGroup
      };
    });
  }, [filteredClients, sortField, sortOrder]);

  // Toggle selection
  const toggleSelectAll = () => {
    if (selectedClientIds.size === filteredClients.length && filteredClients.length > 0) {
      setSelectedClientIds(new Set());
    } else {
      const allIds = new Set(filteredClients.map(c => c.id));
      setSelectedClientIds(allIds);
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
      `Entity: ${c.tradeName || c.legalName}\nGSTIN: ${c.gstProfile?.gstin || 'N/A'}\nUser ID: ${c.gstProfile?.username || 'N/A'}\nPassword: ${c.gstProfile?.password || 'N/A'}`
    ).join('\n---------------------\n');

    if (navigator.clipboard) {
      navigator.clipboard.writeText(credsText);
      toast.success(`Copied credentials for ${selectedClientsList.length} clients!`);
    }
  };

  const handleBulkExportCSV = () => {
    if (selectedClientsList.length === 0) return;
    const headers = [
      "Trade Name", "Legal Name", "Mobile", "Email", "Address", "GSTIN", "PAN", 
      "Portal User ID", "Portal Password", "Constitution", "Registration Date", 
      "Category", "Filing Frequency", "Status"
    ].join(",");

    const rows = selectedClientsList.map(c => [
      c?.tradeName, c?.legalName, c?.mobile, c?.email, c?.address,
      c?.gstProfile?.gstin, c?.gstProfile?.pan, c?.gstProfile?.username, c?.gstProfile?.password,
      c?.gstProfile?.constitution, formatDate(c?.gstProfile?.regDate), c?.gstProfile?.regType,
      c?.gstProfile?.filingFreq, c?.status
    ].map(v => `"${v || ''}"`).join(",")).join("\n");

    const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `GST_Selected_Clients_${new Date().toISOString().split('T')[0]}.csv`);
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

  const handleShareGstCertificate = (client: Client) => {
    setSelectedClient(client);
    const cert = client.gstProfile?.gstCertificate;
    if (cert) {
      // Download the uploaded PDF directly to device
      const link = document.createElement('a');
      link.href = cert;
      link.download = client.gstProfile?.gstCertificateName || `GST_Certificate_${client.gstProfile?.gstin || client.legalName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Try native file share if supported
      if (navigator.share && typeof navigator.canShare === 'function') {
        fetch(cert)
          .then(res => res.blob())
          .then(blob => {
            const fileName = client.gstProfile?.gstCertificateName || `GST_Certificate_${client.gstProfile?.gstin || client.legalName}.pdf`;
            const file = new File([blob], fileName, { type: blob.type || 'application/pdf' });
            if (navigator.canShare({ files: [file] })) {
              navigator.share({
                title: `GST Certificate - ${client.tradeName || client.legalName}`,
                text: `Form GST REG-06 Certificate for ${client.tradeName || client.legalName} (GSTIN: ${client.gstProfile?.gstin || ''})`,
                files: [file]
              }).catch(() => {});
            }
          })
          .catch(() => {});
      }

      // Open WhatsApp chat ready to attach the downloaded PDF
      const cleanPhone = (client.mobile || '').replace(/\D/g, '');
      const phoneParam = cleanPhone.length >= 10 ? (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone) : '';
      const whatsappMsg = `*FORM GST REG-06 REGISTRATION CERTIFICATE*\nEntity: ${client.tradeName || client.legalName}\nGSTIN: ${client.gstProfile?.gstin || 'N/A'}\n\n[Official GST Certificate PDF has been downloaded to device - please attach to this chat]`;
      const whatsappUrl = phoneParam 
        ? `https://api.whatsapp.com/send?phone=${phoneParam}&text=${encodeURIComponent(whatsappMsg)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappMsg)}`;
      
      window.open(whatsappUrl, '_blank');
      toast.success(`GST Certificate PDF downloaded & WhatsApp opened for ${client.tradeName || client.legalName}`);
    } else {
      toast.info(`No GST Certificate uploaded yet for "${client.tradeName || client.legalName}". Please upload the PDF.`);
      setIsCertModalOpen(true);
    }
  };

  const handleArchiveToggle = async (client: Client) => {
    const newStatus: any = client.status === 'Inactive' ? 'Active' : 'Inactive';
    try {
      await api.saveClient({ ...client, status: newStatus });
      toast.success(`Client marked as ${newStatus}`);
      handleDataChange();
    } catch (e) {
      toast.error('Failed to update status');
    }
  };

  const openActionsMenu = (e: React.MouseEvent, client: Client) => {
    e.stopPropagation();
    setActiveActionsId(client.id);
    setSelectedClient(client);
  };

  const handleEdit = (client: Client) => {
    setSelectedClient(client);
    setIsEditModalOpen(true);
  };

  if (isLoading) return <Loader />;

  return (
    <div className="w-full h-full flex flex-col min-h-0 relative">
      {viewMode === 'grid' ? (
        <div className="overflow-auto no-scrollbar flex-1 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {filteredClients.length === 0 ? (
            <div className="col-span-full py-16 text-center text-slate-400 dark:text-slate-500 font-semibold text-sm">
              No matching clients found in portfolio
            </div>
          ) : (
            filteredClients.map((client) => {
              const theme = getClientColorTheme(client);
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
                        {client.gstProfile?.constitution || 'Proprietorship'}
                      </span>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium tracking-tight border ${theme.clientStatusBadgeClass}`}>
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        client.status === 'Litigation' ? 'bg-purple-500' :
                        client.status === 'Suspended' ? 'bg-amber-500' :
                        client.status === 'Inactive' ? 'bg-slate-400' :
                        'bg-emerald-500'
                      }`} />
                      <span>{client.status}</span>
                    </span>
                  </div>

                  <div className="mb-3">
                    <h4 className="font-semibold text-slate-900 dark:text-white text-sm truncate" title={client.tradeName || client.legalName}>
                      {client.tradeName || client.legalName}
                    </h4>
                    {client.tradeName && client.legalName && client.tradeName !== client.legalName && (
                      <p className="text-xs font-normal text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        Legal: {client.legalName}
                      </p>
                    )}
                  </div>

                  <div className="bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-3 mb-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">GSTIN</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold font-mono tabular-nums text-indigo-600 dark:text-indigo-400 text-xs tracking-wider uppercase">
                          {client.gstProfile?.gstin || '---'}
                        </span>
                        {client.gstProfile?.gstin && (
                          <button 
                            type="button"
                            onClick={() => {
                              if (navigator.clipboard) {
                                navigator.clipboard.writeText(client.gstProfile?.gstin || '');
                                toast.success('GSTIN Copied!');
                              }
                            }}
                            className="p-1 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded transition-colors cursor-pointer"
                            title="Copy GSTIN"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 5H6a2 2 0 00-2-2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2" /></svg>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Scheme</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-750 px-2 py-0.5 rounded border border-slate-200/70 dark:border-slate-700/70 text-[11px]">
                        {client.gstProfile?.regType || 'Regular'} ({client.gstProfile?.filingFreq || 'Monthly'})
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
                      onClick={() => {
                        setLoginToolClient(client);
                        setLoginPortalType('gst');
                        setIsLoginBoxOpen(true);
                      }}
                      className="flex-1 h-8 px-2 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/40 hover:bg-indigo-600 hover:text-white text-indigo-700 dark:text-indigo-300 font-medium text-xs transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 border border-indigo-100 dark:border-indigo-900/50"
                    >
                      <span>🔐 GST Portal</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleViewProfile(client)}
                      className="h-8 px-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center justify-center gap-1 text-xs font-medium shadow-2xs cursor-pointer active:scale-95"
                      title="View Complete Profile & Vault Dossier"
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
          <table className="w-full text-left border-collapse table-auto min-w-[1000px] gst-portfolio-table font-sans">
            <thead className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 shadow-2xs">
              <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 select-none">
                <th className="px-3 py-3 w-12 text-center whitespace-nowrap">#</th>
                
                <th 
                  onClick={() => handleSort('tradeName')}
                  className="px-3 py-3 cursor-pointer hover:bg-slate-100/80 dark:hover:bg-slate-700/80 transition-colors min-w-[170px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Trade Name</span>
                    <span className="text-indigo-600 dark:text-indigo-400 text-xs">{sortField === 'tradeName' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </div>
                </th>

                <th 
                  onClick={() => handleSort('legalName')}
                  className="px-3 py-3 cursor-pointer hover:bg-slate-100/80 dark:hover:bg-slate-700/80 transition-colors min-w-[160px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Legal Name</span>
                    <span className="text-indigo-600 dark:text-indigo-400 text-xs">{sortField === 'legalName' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </div>
                </th>

                <th 
                  onClick={() => handleSort('gstin')}
                  className="px-3 py-3 cursor-pointer hover:bg-slate-100/80 dark:hover:bg-slate-700/80 transition-colors whitespace-nowrap min-w-[160px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>GSTIN</span>
                    <span className="text-indigo-600 dark:text-indigo-400 text-xs">{sortField === 'gstin' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </div>
                </th>

                <th className="px-3 py-3 whitespace-nowrap min-w-[110px]">Mobile No.</th>

                <th className="px-3 py-3 whitespace-nowrap min-w-[110px] relative">
                  <div className="flex items-center gap-1.5">
                    <span>GST Status</span>
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
                        title={`Filter by GST Status (Current: ${statusFilter})`}
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
                            Filter GST Status
                          </div>
                          {['All', 'Active', 'Suspended', 'Closed'].map(f => (
                            <button 
                              key={f} 
                              type="button"
                              onClick={() => { setStatusFilter(f); setActiveFilterMenu(null); }} 
                              className={`w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                                statusFilter === f ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              <span>{f === 'All' ? 'All Status' : f === 'Closed' ? 'Cancelled' : f}</span>
                              {statusFilter === f && <span>✓</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </th>

                <th className="px-3 py-3 whitespace-nowrap min-w-[110px] relative">
                  <div className="flex items-center gap-1.5">
                    <span>Relationship</span>
                    <div className="relative inline-block">
                      <button 
                        ref={relFilterBtnRef}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveFilterMenu(prev => prev === 'rel' ? null : 'rel');
                        }} 
                        className={`h-5 w-5 rounded-md border flex items-center justify-center transition-all cursor-pointer relative ${
                          relFilter !== 'All' 
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' 
                            : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 hover:text-indigo-600 hover:border-indigo-400'
                        }`}
                        title={`Filter by Relationship (Current: ${relFilter})`}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        {relFilter !== 'All' && (
                          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-400 border border-white dark:border-slate-900" />
                        )}
                      </button>

                      {activeFilterMenu === 'rel' && (
                        <div 
                          ref={filterMenuRef}
                          onClick={e => e.stopPropagation()}
                          className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-[100] p-1.5 animate-in zoom-in-95 origin-top-right text-left backdrop-blur-xl normal-case font-normal"
                        >
                          <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 mb-1">
                            Filter Relationship
                          </div>
                          {['All', 'Active', 'Litigation', 'Suspended', 'Inactive'].map(f => (
                            <button 
                              key={f} 
                              type="button"
                              onClick={() => { setRelFilter(f); setActiveFilterMenu(null); }} 
                              className={`w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                                relFilter === f ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              <span>{f === 'All' ? 'All Relationship' : f}</span>
                              {relFilter === f && <span>✓</span>}
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
                  <td colSpan={8} className="py-16 text-center text-slate-400 dark:text-slate-500 font-medium text-sm">
                    No matching clients found in GST Portfolio
                  </td>
                </tr>
              ) : (
                (groupedClients || []).map(({ sector, clients: sectorClients }) => (
                  <React.Fragment key={sector}>
                    <tr>
                      <td colSpan={7} className="sticky top-[41px] z-20 bg-slate-100 dark:bg-slate-800 font-semibold text-xs text-slate-700 dark:text-slate-300 py-2 px-3 tracking-wider border-y border-slate-200 dark:border-slate-750 shadow-2xs">
                        <div className="flex items-center gap-2 sticky left-3 max-w-fit">
                          <svg className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          <span className="uppercase text-[11px] font-bold text-slate-700 dark:text-slate-200">{sector}</span>
                        </div>
                      </td>
                      <td className="sticky top-[41px] right-0 z-20 bg-slate-100 dark:bg-slate-800 py-2 px-3 text-right whitespace-nowrap min-w-[120px] border-y border-slate-200 dark:border-slate-750 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.04)]">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold font-mono tabular-nums">
                          {sectorClients.length} {sectorClients.length === 1 ? 'client' : 'clients'}
                        </span>
                      </td>
                    </tr>
                    {(sectorClients || []).map((client, idx) => {
                      const theme = getClientColorTheme(client);
                      const isSelected = selectedClientIds.has(client.id);

                      return (
                        <tr 
                          key={client.id} 
                          className={`transition-colors duration-150 group border-b border-slate-100 dark:border-slate-800/60 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-800/50 ${
                            isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/30' : theme.rowClass
                          }`}
                        >
                          {/* S.No. */}
                          <td className="px-3 py-2.5 font-mono tabular-nums text-xs font-medium text-slate-400 dark:text-slate-500 w-12 text-center whitespace-nowrap">
                            {(idx + 1).toString().padStart(2, '0')}
                          </td>

                          {/* Trade Name */}
                          <td className="px-3 py-2.5 min-w-[170px]">
                            <p className="text-xs sm:text-sm font-semibold leading-normal truncate text-slate-900 dark:text-white" title={client.tradeName}>
                              {client.tradeName || client.legalName || '---'}
                            </p>
                            <span className="text-[10px] text-slate-400 font-medium">{client.gstProfile?.constitution || 'Proprietorship'}</span>
                          </td>

                          {/* Legal Name */}
                          <td className="px-3 py-2.5 min-w-[160px]">
                            <p className="text-xs font-normal leading-normal truncate text-slate-600 dark:text-slate-400" title={client.legalName}>
                              {client.legalName || '---'}
                            </p>
                          </td>

                          {/* GSTIN */}
                          <td className="px-3 py-2.5 whitespace-nowrap min-w-[160px]">
                            <div className="flex items-center gap-1.5 group/gstin">
                              <span className="tracking-wider uppercase text-xs font-semibold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                                {client.gstProfile?.gstin}
                              </span>
                              <button 
                                type="button"
                                onClick={() => { 
                                  if (navigator.clipboard) {
                                    navigator.clipboard.writeText(client.gstProfile?.gstin || '').then(() => { 
                                      toast.success('GSTIN Copied!'); 
                                      window.open('https://services.gst.gov.in/services/searchtp', '_blank'); 
                                    });
                                  }
                                }}
                                className="h-5 w-5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-500 transition-all flex items-center justify-center opacity-0 group-hover/gstin:opacity-100 shadow-xs border border-indigo-100 dark:border-indigo-900 cursor-pointer"
                                title="Copy & Verify on GST Portal"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                              </button>
                            </div>
                          </td>

                          {/* Mobile No. */}
                          <td className="px-3 py-2.5 whitespace-nowrap min-w-[110px]">
                            <p className="font-mono tabular-nums text-xs font-medium text-slate-700 dark:text-slate-300">{client.mobile || '---'}</p>
                          </td>

                          {/* GST Status */}
                          <td className="px-3 py-2.5 whitespace-nowrap min-w-[125px]">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium tracking-tight border ${theme.gstStatusBadgeClass}`}>
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                (client.gstProfile?.gstStatus === 'Closed' || client.gstProfile?.gstStatus === 'Cancelled') ? 'bg-rose-500' :
                                client.gstProfile?.gstStatus === 'Suspended' ? 'bg-amber-500' :
                                'bg-emerald-500'
                              }`} />
                              <span>{(client.gstProfile?.gstStatus === 'Closed' || client.gstProfile?.gstStatus === 'Cancelled') ? 'Cancelled' : (client.gstProfile?.gstStatus || 'Active')}</span>
                            </span>
                          </td>

                          {/* Relationship */}
                          <td className="px-3 py-2.5 whitespace-nowrap min-w-[130px]">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium tracking-tight border ${theme.clientStatusBadgeClass}`}>
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                client.status === 'Litigation' ? 'bg-purple-500' :
                                client.status === 'Suspended' ? 'bg-amber-500' :
                                client.status === 'Inactive' ? 'bg-slate-400' :
                                'bg-emerald-500'
                              }`} />
                              <span>{client.status}</span>
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-2 text-right overflow-visible whitespace-nowrap min-w-[120px] sticky right-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-850 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.04)]">
                            <div className="flex items-center justify-end gap-1.5">
                              <button 
                                type="button"
                                onClick={() => handleViewProfile(client)}
                                className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-1 shadow-2xs cursor-pointer text-xs font-medium active:scale-95"
                                title="View Complete Profile & Vault Dossier"
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
                    })}
                  </React.Fragment>
                )))}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating Bulk Operations Toolbar */}
      {selectedClientIds.size > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl px-4 py-2.5 flex items-center gap-3 border border-slate-700 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2 border-r border-slate-700 pr-3">
            <span className="h-6 w-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
              {selectedClientIds.size}
            </span>
            <span className="text-[calc(var(--app-font-size)-1.5px)] font-bold uppercase tracking-wider text-slate-300">Selected</span>
          </div>

          <button 
            type="button"
            onClick={handleBulkCopyCreds}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-indigo-600 text-white text-[var(--app-font-size)] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Copy Credentials for all selected clients"
          >
            <span>📋 Copy Credentials</span>
          </button>

          <button 
            type="button"
            onClick={handleBulkExportCSV}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-600 text-white text-[var(--app-font-size)] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Export selected clients to CSV"
          >
            <span>📥 Export CSV</span>
          </button>

          <div className="relative">
            <button 
              type="button"
              onClick={() => setIsBulkStatusMenuOpen(!isBulkStatusMenuOpen)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-amber-600 text-white text-[var(--app-font-size)] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>⚡ Change Status ▾</span>
            </button>

            {isBulkStatusMenuOpen && (
              <div className="absolute bottom-full mb-2 left-0 w-44 bg-white text-slate-800 rounded-xl shadow-2xl p-1 border border-slate-200 z-50 animate-in zoom-in-95">
                {['Active', 'Litigation', 'Suspended', 'Inactive'].map((status) => (
                  <button
                    type="button"
                    key={status}
                    onClick={() => handleBulkStatusChange(status)}
                    className="w-full text-left px-3 py-1.5 text-[var(--app-font-size)] font-bold uppercase rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer"
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
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Client Actions</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 font-mono text-[9px] font-bold">
                    {selectedClient.gstProfile?.gstin ? 'GST REG' : 'NO GST'}
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                  {selectedClient.tradeName || selectedClient.legalName}
                </h4>
                <p className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 truncate">
                  {selectedClient.gstProfile?.gstin || selectedClient.legalName || '---'}
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
              {/* View Complete Profile Dossier */}
              <button 
                type="button"
                onClick={() => { 
                  handleViewProfile(selectedClient!); 
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:bg-white dark:group-hover:bg-slate-800 shadow-xs text-base font-bold shrink-0">
                  👁️
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 block truncate">View Complete Profile</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Vault Dossier & Credentials</span>
                </div>
              </button>

              {/* Edit / Modify Client Form */}
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

              {/* View / Download Certificate Modal - ONLY REG-06 option */}
              <button 
                type="button"
                onClick={() => {
                  setIsCertModalOpen(true);
                  setActiveActionsId(null);
                }} 
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-sm shrink-0">
                  📜
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">View REG-06 Certificate</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">Official Government PDF & Print</span>
                </div>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* Portals Direct Login */}
              <div className="px-3 py-1 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Official Portals</span>
                <span className="text-[10px] text-slate-400">Login Assistant</span>
              </div>

              {/* 1. GST Portal */}
              <button 
                type="button"
                onClick={() => { setLoginToolClient(selectedClient!); setLoginPortalType('gst'); setIsLoginBoxOpen(true); setActiveActionsId(null); }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs shrink-0">🔐</div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">GST Portal Direct Login</span>
                  <span className="text-[10px] text-slate-400 block truncate">{selectedClient?.gstProfile?.username || selectedClient?.gstProfile?.gstin || 'View ID & Password'}</span>
                </div>
              </button>

              {/* 2. E-Way Bill */}
              <button 
                type="button"
                onClick={() => { setLoginToolClient(selectedClient!); setLoginPortalType('eway'); setIsLoginBoxOpen(true); setActiveActionsId(null); }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs shrink-0">🚚</div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">E-Way Bill Direct Login</span>
                  <span className="text-[10px] text-slate-400 block truncate">{selectedClient?.gstProfile?.ewayBillId || 'View ID & Password'}</span>
                </div>
              </button>

              {/* 3. GSTAT Portal */}
              <button 
                type="button"
                onClick={() => { setLoginToolClient(selectedClient!); setLoginPortalType('gstat'); setIsLoginBoxOpen(true); setActiveActionsId(null); }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400 text-xs shrink-0">⚖️</div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">GSTAT Portal Direct Login</span>
                  <span className="text-[10px] text-slate-400 block truncate">{selectedClient?.gstProfile?.gstatId || 'View ID & Password'}</span>
                </div>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* Share Credentials & Profile */}
              <button 
                type="button"
                onClick={() => {
                  setIsCredentialShareModalOpen(true);
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
                  const fullText = `*Client Details*\nTrade Name: ${selectedClient!.tradeName || 'N/A'}\nLegal Name: ${selectedClient!.legalName || 'N/A'}\nMobile: ${selectedClient!.mobile || 'N/A'}\nEmail: ${selectedClient!.email || 'N/A'}\n\n*GST Details*\nGSTIN: ${selectedClient!.gstProfile?.gstin || 'N/A'}\nStatus: ${selectedClient!.gstProfile?.gstStatus || 'N/A'}\nReg Type: ${selectedClient!.gstProfile?.regType || 'N/A'}\nFiling: ${selectedClient!.gstProfile?.filingFreq || 'N/A'}\nReg Date: ${formatDate(selectedClient!.gstProfile?.regDate)}\nJurisdiction: ${selectedClient!.gstProfile?.jurisdictionType || 'N/A'}\nSector/Range: ${selectedClient!.gstProfile?.sector || selectedClient!.gstProfile?.range || 'N/A'}\n\n*Credentials*\nGST User ID: ${selectedClient!.gstProfile?.username || 'N/A'}\nGST Password: ${selectedClient!.gstProfile?.password || 'N/A'}\n\n*IT Details*\nPAN: ${selectedClient!.itProfile?.pan || 'N/A'}\nIT User ID: ${selectedClient!.itProfile?.username || 'N/A'}\nIT Password: ${selectedClient!.itProfile?.password || 'N/A'}`;
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
                  handleArchiveToggle(selectedClient!); 
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
                  if (confirm(`Permanently delete "${selectedClient!.tradeName || selectedClient!.legalName}" from vault?`)) {
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
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2">Add a Note to Message</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">You can choose a quick template or type your custom message below.</p>
            <textarea
              className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-xs text-slate-900 dark:text-slate-100 outline-none h-28 mb-3 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
              placeholder="Select a note or type here..."
              value={selectedNote}
              onChange={(e) => setSelectedNote(e.target.value)}
            />
            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-5">
               {(() => {
                 try {
                   const saved = localStorage.getItem('clientify_custom_templates');
                   const templates = saved ? JSON.parse(saved) : [];
                   return (templates || []).map((t: any, i: number) => (
                     <button key={i} onClick={() => setSelectedNote(t.text)} className="shrink-0 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">{t.label}</button>
                   ));
                 } catch (e) {
                   return null;
                 }
               })()}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setIsShareModalOpen(false)} className="flex-1 py-2.5 text-slate-600 dark:text-slate-400 font-semibold text-xs border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer">Cancel</button>
              <button onClick={proceedShare} className="flex-1 py-2.5 bg-emerald-600 text-white font-semibold text-xs rounded-xl shadow-md hover:bg-emerald-700 transition-colors cursor-pointer">Send on WhatsApp</button>
            </div>
          </div>
        </div>
      )}

      <GSTClientFormModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} onSave={handleDataChange} initialData={selectedClient} />

      {/* Login Tool Box Modal */}
      <GSTPortalLoginModal
        isOpen={isLoginBoxOpen}
        onClose={() => setIsLoginBoxOpen(false)}
        client={loginToolClient}
        onDataChange={onDataChange}
        initialType={loginPortalType}
      />

      <GSTCertificateModal
        isOpen={isCertModalOpen}
        onClose={() => setIsCertModalOpen(false)}
        client={selectedClient}
        onUpdateCertificate={async (b64, name) => {
          if (!selectedClient) return;
          const updated: Partial<Client> = {
            ...selectedClient,
            gstProfile: {
              ...(selectedClient.gstProfile as any),
              gstCertificate: b64,
              gstCertificateName: name
            }
          };
          await api.saveClient(updated);
          handleDataChange();
          toast.success("GST Certificate updated!");
        }}
      />

      <CredentialShareModal
        isOpen={isCredentialShareModalOpen}
        onClose={() => setIsCredentialShareModalOpen(false)}
        client={selectedClient}
        mode="gst"
      />

      <GSTDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        client={detailClient}
        onEdit={handleEdit}
        onDataChange={handleDataChange}
      />

    </div>
  );
};

const GstMasterPortfolio: React.FC<GstMasterPortfolioProps> = (props) => {
  return (
    <ErrorBoundary fallbackTitle="GST Master Portfolio Error">
      <GstMasterPortfolioContent {...props} />
    </ErrorBoundary>
  );
};

export default GstMasterPortfolio;
