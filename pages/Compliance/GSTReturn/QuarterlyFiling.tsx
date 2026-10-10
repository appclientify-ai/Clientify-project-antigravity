import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useModuleData } from '../../../hooks/useModuleData.ts';
import { formatDate } from '../../../exportUtils';
import { Client } from '../../../types';
import { api } from '../../../services/api.ts';
import Loader from '../../../components/Loader';
import GSTViewIcon from '../../../components/GSTViewIcon';
import GSTClientFormModal from '../../Clientform/GSTClientFormModal.tsx';
import GSTPortalLoginModal from '../../../components/GSTPortalLoginModal';
import { GSTCertificateModal } from '../../../components/GSTCertificateModal';
import { CredentialShareModal } from '../../../components/CredentialShareModal';
import GSTDetailModal from '../../../components/GSTDetailModal';
import { exportToCSV, printList, getSectorGroupLabel, getClientColorTheme } from '../../../exportUtils';
import { TableFilter } from '../../../components/TableFilter';
import { SectorJurisdictionFilter, filterClientsBySectorJurisdiction } from '../../../components/SectorJurisdictionFilter';
import { useMonthlyFilingLogic, MONTHS, YEARS, getDefaultPeriod, isClientVisibleInPeriod, isClientVisibleInFY, periodToDate, getStatusLabel } from './filinglogic/MonthlyFilingLogic';
import { ViewControl } from '../../../components/ViewControl';
import { ExportMenu } from '../../../components/ExportMenu';
import { CustomSelect } from '../../../components/CustomSelect';

const QUARTERLY_PERIOD_OPTIONS = [
  'All Quarters',
  'April-June (Q1)',
  'July-September (Q2)',
  'October-December (Q3)',
  'January-March (Q4)'
];

const QUARTER_CONFIGS = [
  {
    key: 'Q1',
    label: 'Q1 (Apr-Jun)',
    months: [
      { name: 'April', short: 'Apr', type: 'IFF' },
      { name: 'May', short: 'May', type: 'IFF' },
      { name: 'June', short: 'Jun', type: 'GSTR-1' },
    ],
    r3bMonth: 'June',
  },
  {
    key: 'Q2',
    label: 'Q2 (Jul-Sep)',
    months: [
      { name: 'July', short: 'Jul', type: 'IFF' },
      { name: 'August', short: 'Aug', type: 'IFF' },
      { name: 'September', short: 'Sep', type: 'GSTR-1' },
    ],
    r3bMonth: 'September',
  },
  {
    key: 'Q3',
    label: 'Q3 (Oct-Dec)',
    months: [
      { name: 'October', short: 'Oct', type: 'IFF' },
      { name: 'November', short: 'Nov', type: 'IFF' },
      { name: 'December', short: 'Dec', type: 'GSTR-1' },
    ],
    r3bMonth: 'December',
  },
  {
    key: 'Q4',
    label: 'Q4 (Jan-Mar)',
    months: [
      { name: 'January', short: 'Jan', type: 'IFF' },
      { name: 'February', short: 'Feb', type: 'IFF' },
      { name: 'March', short: 'Mar', type: 'GSTR-1' },
    ],
    r3bMonth: 'March',
  },
];
import { EditableRemark } from '../../../components/EditableRemark';
import { toast } from 'sonner';
import { useGlobalDueDates } from '../../../hooks/useGlobalDueDates';
import { formatISOToDDMMYYYY } from '../../../dateUtils';

const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

const QuarterlyFiling: React.FC = () => {
  const defaultPeriod = getDefaultPeriod();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [r1Filter, setR1Filter] = useState<'All' | 'Filed' | 'Pending' | 'M1_Filed' | 'M1_Pending' | 'M2_Filed' | 'M2_Pending' | 'M3_Filed' | 'M3_Pending'>('All');
  const [r3bFilter, setR3bFilter] = useState<'All' | 'Filed' | 'Challan' | 'Pending'>('All');
  const [quickFilter, setQuickFilter] = useState<'All' | 'R1Filed' | '3BFiled' | '3BChallan' | 'Pending'>('All');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [authorityFilter, setAuthorityFilter] = useState<'All' | 'State' | 'Center'>('All');
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [quarterFilters, setQuarterFilters] = useState<Record<string, string>>({});
  const [isR1FilterOpen, setIsR1FilterOpen] = useState(false);
  const [isR3bFilterOpen, setIsR3bFilterOpen] = useState(false);
  const getDefaultQuarterOption = () => {
    const m = defaultPeriod.month;
    if (['April', 'May', 'June'].includes(m)) return 'April-June (Q1)';
    if (['July', 'August', 'September'].includes(m)) return 'July-September (Q2)';
    if (['October', 'November', 'December'].includes(m)) return 'October-December (Q3)';
    return 'January-March (Q4)';
  };

  const [selectedYear, setSelectedYear] = useState(defaultPeriod.year);
  const [selectedMonth, setSelectedMonth] = useState(getDefaultQuarterOption());
  
  const currentQuarter = useMemo(() => {
    if (selectedMonth === 'All Quarters') return 'April-June (Q1)';
    return selectedMonth;
  }, [selectedMonth]);

  const { getGlobalDueDate } = useGlobalDueDates(selectedYear);
  const iffDueDate = getGlobalDueDate('quarterly_iff', currentQuarter);
  const q3bDueDate = getGlobalDueDate('quarterly_r3b', currentQuarter);

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [detailClient, setDetailClient] = useState<Client | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [isCredentialShareModalOpen, setIsCredentialShareModalOpen] = useState(false);
  const [isLoginBoxOpen, setIsLoginBoxOpen] = useState(false);
  const [loginToolClient, setLoginToolClient] = useState<Client | null>(null);
  const [loginPortalType, setLoginPortalType] = useState<'gst' | 'eway' | 'gstat'>('gst');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareText, setShareText] = useState('');
  const [selectedNote, setSelectedNote] = useState('');
  const [editingPasswordId, setEditingPasswordId] = useState<string | null>(null);
  const [newPassVal, setNewPassVal] = useState('');

  const [activeActionsId, setActiveActionsId] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    if (isFilterDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterDropdownOpen]);

  // Global Ctrl+K shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const { data: pageData, isLoading: isPageLoading } = useModuleData('quarterly_filing_page_data');

  const clients = useMemo(() => pageData?.clients || [], [pageData]);
  const allClientsBase = clients;

  const { getStatus, toggleStatus, updateRemark } = useMonthlyFilingLogic(
    selectedYear, 
    selectedMonth, 
    'clientify_quarterly_filing_v3', 
    pageData?.filingData || {}, 
    pageData?.dueDates || {}
  );

  const isLoading = isPageLoading && !pageData;

  useEffect(() => {
    if (!activeActionsId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveActionsId(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeActionsId]);

  const isAllQuartersMode = selectedMonth === 'All Quarters';

  const activeQuarterConfig = useMemo(() => {
    return QUARTER_CONFIGS.find(q => q.label === selectedMonth || selectedMonth.includes(q.key)) || QUARTER_CONFIGS[0];
  }, [selectedMonth]);

  const isQuarterEnd = true;

  const checkQrmpVisibility = useCallback((c: Client) => {
    if (!c || !c.gstProfile) return false;
    if (isAllQuartersMode) {
      return isClientVisibleInFY(c, selectedYear);
    }
    const targetMonth = activeQuarterConfig ? activeQuarterConfig.r3bMonth : 'June';
    return isClientVisibleInPeriod(c, selectedYear, targetMonth);
  }, [isAllQuartersMode, selectedYear, activeQuarterConfig]);

  const baseClients = useMemo(() => {
    const s = search.toLowerCase();
    let list = clients.filter(c => 
      checkQrmpVisibility(c) &&
      ((c.legalName || '').toLowerCase().includes(s) || 
       (c.tradeName || '').toLowerCase().includes(s) ||
       (c.gstProfile?.gstin || '').toLowerCase().includes(s))
    );

    if (isAllQuartersMode) {
      if (r1Filter === 'Filed') {
        list = list.filter(c => QUARTER_CONFIGS.every(q => q.months.every(m => getStatus(c.id, `${selectedYear}_${m.name}`).r1)));
      } else if (r1Filter === 'Pending') {
        list = list.filter(c => QUARTER_CONFIGS.some(q => q.months.some(m => !getStatus(c.id, `${selectedYear}_${m.name}`).r1)));
      } else if (r1Filter === 'M1_Filed') {
        list = list.filter(c => QUARTER_CONFIGS.every(q => getStatus(c.id, `${selectedYear}_${q.months[0].name}`).r1));
      } else if (r1Filter === 'M1_Pending') {
        list = list.filter(c => QUARTER_CONFIGS.some(q => !getStatus(c.id, `${selectedYear}_${q.months[0].name}`).r1));
      } else if (r1Filter === 'M2_Filed') {
        list = list.filter(c => QUARTER_CONFIGS.every(q => getStatus(c.id, `${selectedYear}_${q.months[1].name}`).r1));
      } else if (r1Filter === 'M2_Pending') {
        list = list.filter(c => QUARTER_CONFIGS.some(q => !getStatus(c.id, `${selectedYear}_${q.months[1].name}`).r1));
      } else if (r1Filter === 'M3_Filed') {
        list = list.filter(c => QUARTER_CONFIGS.every(q => getStatus(c.id, `${selectedYear}_${q.months[2].name}`).r1));
      } else if (r1Filter === 'M3_Pending') {
        list = list.filter(c => QUARTER_CONFIGS.some(q => !getStatus(c.id, `${selectedYear}_${q.months[2].name}`).r1));
      }

      if (r3bFilter === 'Filed') {
        list = list.filter(c => QUARTER_CONFIGS.every(q => getStatusLabel(getStatus(c.id, `${selectedYear}_${q.r3bMonth}`).r3b) === 'Filed'));
      } else if (r3bFilter === 'Challan') {
        list = list.filter(c => QUARTER_CONFIGS.some(q => getStatusLabel(getStatus(c.id, `${selectedYear}_${q.r3bMonth}`).r3b) === 'Challan'));
      } else if (r3bFilter === 'Pending') {
        list = list.filter(c => QUARTER_CONFIGS.some(q => getStatusLabel(getStatus(c.id, `${selectedYear}_${q.r3bMonth}`).r3b) === 'Pending'));
      }

      QUARTER_CONFIGS.forEach(qConfig => {
        const filter = quarterFilters[qConfig.key];
        if (!filter || filter === 'All') return;
        if (filter === '3B Filed') {
          list = list.filter(c => getStatusLabel(getStatus(c.id, `${selectedYear}_${qConfig.r3bMonth}`).r3b) === 'Filed');
        } else if (filter === '3B Challan') {
          list = list.filter(c => getStatusLabel(getStatus(c.id, `${selectedYear}_${qConfig.r3bMonth}`).r3b) === 'Challan');
        } else if (filter === '3B Pending') {
          list = list.filter(c => getStatusLabel(getStatus(c.id, `${selectedYear}_${qConfig.r3bMonth}`).r3b) === 'Pending');
        } else if (filter === 'R1 Filed') {
          list = list.filter(c => qConfig.months.every(m => getStatus(c.id, `${selectedYear}_${m.name}`).r1));
        } else if (filter === 'R1 Pending') {
          list = list.filter(c => qConfig.months.some(m => !getStatus(c.id, `${selectedYear}_${m.name}`).r1));
        }
      });
    } else {
      if (r1Filter === 'Filed') {
        list = list.filter(c => activeQuarterConfig.months.every(m => getStatus(c.id, `${selectedYear}_${m.name}`).r1));
      } else if (r1Filter === 'Pending') {
        list = list.filter(c => activeQuarterConfig.months.some(m => !getStatus(c.id, `${selectedYear}_${m.name}`).r1));
      } else if (r1Filter === 'M1_Filed') {
        list = list.filter(c => getStatus(c.id, `${selectedYear}_${activeQuarterConfig.months[0].name}`).r1);
      } else if (r1Filter === 'M1_Pending') {
        list = list.filter(c => !getStatus(c.id, `${selectedYear}_${activeQuarterConfig.months[0].name}`).r1);
      } else if (r1Filter === 'M2_Filed') {
        list = list.filter(c => getStatus(c.id, `${selectedYear}_${activeQuarterConfig.months[1].name}`).r1);
      } else if (r1Filter === 'M2_Pending') {
        list = list.filter(c => !getStatus(c.id, `${selectedYear}_${activeQuarterConfig.months[1].name}`).r1);
      } else if (r1Filter === 'M3_Filed') {
        list = list.filter(c => getStatus(c.id, `${selectedYear}_${activeQuarterConfig.months[2].name}`).r1);
      } else if (r1Filter === 'M3_Pending') {
        list = list.filter(c => !getStatus(c.id, `${selectedYear}_${activeQuarterConfig.months[2].name}`).r1);
      }

      if (r3bFilter === 'Filed') {
        list = list.filter(c => getStatusLabel(getStatus(c.id, `${selectedYear}_${activeQuarterConfig.r3bMonth}`).r3b) === 'Filed');
      } else if (r3bFilter === 'Challan') {
        list = list.filter(c => getStatusLabel(getStatus(c.id, `${selectedYear}_${activeQuarterConfig.r3bMonth}`).r3b) === 'Challan');
      } else if (r3bFilter === 'Pending') {
        list = list.filter(c => getStatusLabel(getStatus(c.id, `${selectedYear}_${activeQuarterConfig.r3bMonth}`).r3b) === 'Pending');
      }
    }

    list = filterClientsBySectorJurisdiction(list, authorityFilter, selectedSectors);
    return list;
  }, [clients, search, selectedYear, selectedMonth, r1Filter, r3bFilter, authorityFilter, selectedSectors, quarterFilters, getStatus, checkQrmpVisibility, isAllQuartersMode, activeQuarterConfig]);

  const stats = useMemo(() => {
    const total = baseClients.length;
    if (isAllQuartersMode) return { total, r1: 0, r3b: 0, r3bChallan: 0, pending: 0 };
    const r1 = baseClients.filter(c => getStatus(c.id).r1).length;
    const r3bFiled = baseClients.filter(c => getStatusLabel(getStatus(c.id).r3b) === 'Filed').length;
    const r3bChallan = baseClients.filter(c => getStatusLabel(getStatus(c.id).r3b) === 'Challan').length;
    const pending = baseClients.filter(c => !getStatus(c.id).r1 || getStatusLabel(getStatus(c.id).r3b) === 'Pending').length;
    return { total, r1, r3b: r3bFiled, r3bChallan, pending };
  }, [baseClients, getStatus, isAllQuartersMode]);

  const filteredClients = useMemo(() => {
    if (quickFilter === 'All') return baseClients;
    if (quickFilter === 'R1Filed') return baseClients.filter(c => getStatus(c.id).r1);
    if (quickFilter === '3BFiled') return baseClients.filter(c => getStatusLabel(getStatus(c.id).r3b) === 'Filed');
    if (quickFilter === '3BChallan') return baseClients.filter(c => getStatusLabel(getStatus(c.id).r3b) === 'Challan');
    if (quickFilter === 'Pending') return baseClients.filter(c => !getStatus(c.id).r1 || getStatusLabel(getStatus(c.id).r3b) === 'Pending');
    return baseClients;
  }, [baseClients, quickFilter, getStatus]);

  const filterOptions = useMemo(() => {
    if (isAllQuartersMode) {
      return [
        { value: 'All', label: 'Total Clients', shortLabel: 'Total', count: stats.total, dot: 'bg-slate-400' }
      ];
    }
    return [
      { value: 'All', label: 'Total Clients', shortLabel: 'Total', count: stats.total, dot: 'bg-slate-400' },
      { value: 'R1Filed', label: 'IFF/R1 Filed', shortLabel: 'IFF/R1 Filed', count: stats.r1, dot: 'bg-emerald-500' },
      { value: '3BChallan', label: '3B Challan', shortLabel: '3B Challan', count: stats.r3bChallan, dot: 'bg-purple-500' },
      { value: '3BFiled', label: '3B Filed', shortLabel: '3B Filed', count: stats.r3b, dot: 'bg-emerald-500' },
      { value: 'Pending', label: 'Pending Filing', shortLabel: 'Pending', count: stats.pending, dot: 'bg-amber-500' },
    ];
  }, [stats, isAllQuartersMode]);

  const currentFilterOption = useMemo(() => {
    return filterOptions.find(o => o.value === quickFilter) || filterOptions[0];
  }, [filterOptions, quickFilter]);

  const handleRefreshClients = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    queryClient.invalidateQueries({ queryKey: ['quarterly_filing_page_data'] });
    queryClient.invalidateQueries({ queryKey: ['gst_clients'] });
  }, [queryClient]);



  const handleUpdatePassword = async () => {
    if (!selectedClient || !newPassVal.trim()) return;
    try {
      const updated = { ...selectedClient, gstProfile: { ...selectedClient.gstProfile!, password: newPassVal } };
      await api.saveClient(updated);
      handleRefreshClients();
      setEditingPasswordId(null);
    } catch (err) { toast.error("Update failed."); }
  };

  const handleViewProfile = (client: Client) => {
    setDetailClient(client);
    setIsDetailModalOpen(true);
  };

  const handleShareClick = (text: string) => {
    setShareText(text);
    setSelectedNote('');
    setIsShareModalOpen(true);
  };

  const proceedShare = () => {
    let finalMessage = shareText;
    if (selectedNote && selectedNote.trim()) {
      finalMessage = `${selectedNote.trim()}\n\n${shareText}`;
    }
    const encodedText = encodeURIComponent(finalMessage);
    window.open(`whatsapp://send?text=${encodedText}`, '_blank');
    setIsShareModalOpen(false);
  };

  const openActionsMenu = (e: React.MouseEvent, client: Client) => {
    e.stopPropagation();
    setActiveActionsId(client.id);
    setSelectedClient(client);
  };

    const groupedClients = useMemo(() => {
    const groups: Record<string, typeof filteredClients> = {};
    filteredClients.forEach(c => {
      const sector = getSectorGroupLabel(c);
      if (!groups[sector]) groups[sector] = [];
      groups[sector].push(c);
    });
    const sortedKeys = Object.keys(groups).sort((a, b) => {
       if (a.startsWith('Uncategorized')) return 1;
       if (b.startsWith('Uncategorized')) return -1;
       return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    return sortedKeys.map(k => ({ sector: k, clients: groups[k].sort((c1, c2) => (c1.tradeName || '').localeCompare(c2.tradeName || '')) }));
  }, [filteredClients]);

  const handleExportCSV = () => {
    if (isAllQuartersMode) {
      const headers = ['S.No.', 'Trade Name', 'Legal Name', 'Mobile No.', 'GSTIN', ...QUARTER_CONFIGS.map(q => `${q.key} Status`), 'User ID', 'Password'];
      const rows = filteredClients.map((client, index) => [
        (index + 1).toString().padStart(2, '0'),
        client.tradeName || '---',
        client.legalName || '---',
        client.mobile || '---',
        client.gstProfile?.gstin || '---',
        ...QUARTER_CONFIGS.map(q => {
          const m1 = getStatus(client.id, `${selectedYear}_${q.months[0].name}`).r1 ? 'F' : 'P';
          const m2 = getStatus(client.id, `${selectedYear}_${q.months[1].name}`).r1 ? 'F' : 'P';
          const m3 = getStatus(client.id, `${selectedYear}_${q.months[2].name}`).r1 ? 'F' : 'P';
          const b3 = getStatusLabel(getStatus(client.id, `${selectedYear}_${q.r3bMonth}`).r3b);
          return `IFF1:${m1}, IFF2:${m2}, R1:${m3}, 3B:${b3}`;
        }),
        client.gstProfile?.username || '---',
        client.gstProfile?.password || '---'
      ]);
      exportToCSV(headers, rows, `Quarterly_Filing_AllQuarters_${selectedYear}.csv`);
    } else {
      const headers = ['S.No.', 'Trade Name', 'Legal Name', 'Mobile No.', 'GSTIN', 'IFF/R1 Status', 'GSTR-3B Status', 'User ID', 'Password', 'Remark'];
      const rows = filteredClients.map((client, index) => [
        (index + 1).toString().padStart(2, '0'),
        client.tradeName || '---',
        client.legalName || '---',
        client.mobile || '---',
        client.gstProfile?.gstin || '---',
        getStatus(client.id).r1 ? 'Filed' : 'Pending',
        isQuarterEnd ? getStatusLabel(getStatus(client.id).r3b) : 'N/A',
        client.gstProfile?.username || '---',
        client.gstProfile?.password || '---',
        getStatus(client.id).remark || ''
      ]);
      exportToCSV(headers, rows, `Quarterly_Filing_${selectedMonth}_${selectedYear}.csv`);
    }
  };

  const handlePrint = () => {
    if (isAllQuartersMode) {
      const headers = ['S.No.', 'Trade Name', 'Legal Name', 'Mobile No.', 'GSTIN', ...QUARTER_CONFIGS.map(q => q.key), 'User ID'];
      const rows = filteredClients.map((client, index) => [
        (index + 1).toString().padStart(2, '0'),
        client.tradeName || '---',
        client.legalName || '---',
        client.mobile || '---',
        client.gstProfile?.gstin || '---',
        ...QUARTER_CONFIGS.map(q => {
          const m1 = getStatus(client.id, `${selectedYear}_${q.months[0].name}`).r1 ? 'F' : 'P';
          const m2 = getStatus(client.id, `${selectedYear}_${q.months[1].name}`).r1 ? 'F' : 'P';
          const m3 = getStatus(client.id, `${selectedYear}_${q.months[2].name}`).r1 ? 'F' : 'P';
          return `I1:${m1} I2:${m2} R1:${m3}`;
        }),
        client.gstProfile?.username || '---'
      ]);
      printList(`Quarterly Filing All Quarters - ${selectedYear}`, headers, rows);
    } else {
      const headers = ['S.No.', 'Trade Name', 'Legal Name', 'Mobile No.', 'GSTIN', 'IFF/R1 Status', 'GSTR-3B Status', 'User ID', 'Password', 'Remark'];
      const rows = filteredClients.map((client, index) => [
        (index + 1).toString().padStart(2, '0'),
        client.tradeName || '---',
        client.legalName || '---',
        client.mobile || '---',
        client.gstProfile?.gstin || '---',
        getStatus(client.id).r1 ? 'Filed' : 'Pending',
        isQuarterEnd ? getStatusLabel(getStatus(client.id).r3b) : 'N/A',
        client.gstProfile?.username || '---',
        client.gstProfile?.password || '---',
        getStatus(client.id).remark || ''
      ]);
      printList(`Quarterly Filing - ${selectedMonth} ${selectedYear}`, headers, rows);
    }
  };

  if (isLoading) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* Modern Unified Single-Line Toolbar */}
      <div className="relative z-50 flex items-center justify-between gap-1.5 sm:gap-2 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs shrink-0 w-full max-w-full min-w-0 flex-nowrap overflow-visible transition-colors">
        
        {/* Left Section: Search Bar + Count Dropdown + Due Dates */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 flex-nowrap">
          {/* Search Bar - Expanded to full available space */}
          <div className="relative group flex-1 min-w-[180px] sm:min-w-[240px]">
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search trade name, legal name, GSTIN..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-7 sm:pr-14 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none" 
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-slate-600 dark:group-focus-within:text-slate-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {search ? (
              <button 
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            ) : (
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[9px] font-mono font-medium text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-700 px-1 py-0.5 rounded shadow-2xs hidden lg:inline-block">
                Ctrl K
              </kbd>
            )}
          </div>

          {/* Combined Single Count Badge with Dropdown */}
          <div className="relative shrink-0" ref={filterDropdownRef}>
            <button
              type="button"
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
              className={`h-9 px-2.5 rounded-lg border text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap ${
                isFilterDropdownOpen
                  ? 'bg-slate-900 text-white dark:bg-indigo-600 border-slate-900 dark:border-indigo-600'
                  : quickFilter !== 'All'
                    ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
              title="Click to view all status counts and filters"
            >
              <span className={`h-2 w-2 rounded-full ${currentFilterOption.dot} shrink-0`} />
              <span>{currentFilterOption.shortLabel}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${
                isFilterDropdownOpen
                  ? 'bg-slate-800 dark:bg-indigo-700 text-white'
                  : quickFilter !== 'All'
                    ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
              }`}>
                {currentFilterOption.count}
              </span>
              <svg 
                className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${isFilterDropdownOpen ? 'rotate-180 text-white' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu showing all options with counts */}
            {isFilterDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-[1000] p-1.5 animate-in zoom-in-95 origin-top-left">
                <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-1 flex items-center justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <span>Filter by Status</span>
                  <span>Count</span>
                </div>
                <div className="space-y-0.5">
                  {filterOptions.map((option) => {
                    const isSelected = quickFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setQuickFilter(option.value as any);
                          setIsFilterDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${option.dot} shrink-0`} />
                          <span>{option.label}</span>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          isSelected
                            ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}>
                          {option.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Due Dates */}
          {!isAllQuartersMode && (
            <div className="flex items-center gap-1.5 shrink-0 flex-nowrap">
              {iffDueDate && (
                <div className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-700 dark:text-indigo-300 whitespace-nowrap shrink-0 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">IFF/R1:</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-100">{formatISOToDDMMYYYY(iffDueDate)}</span>
                </div>
              )}

              {isQuarterEnd && q3bDueDate && (
                <div className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-300 whitespace-nowrap shrink-0 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">3B:</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-100">{formatISOToDDMMYYYY(q3bDueDate)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Section: ViewControl + SectorFilter + Print + Import/Export + Year/Quarter */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto flex-nowrap">
          {/* View Control */}
          <ViewControl 
            viewMode={viewMode} 
            onViewChange={setViewMode} 
            className="h-9 rounded-lg shrink-0"
          />

          {/* Sector / Jurisdiction Filter */}
          <SectorJurisdictionFilter
            clients={clients}
            authority={authorityFilter}
            setAuthority={setAuthorityFilter}
            selectedSectors={selectedSectors}
            setSelectedSectors={setSelectedSectors}
            buttonClassName="h-9 px-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xs text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center justify-center shrink-0 cursor-pointer active:scale-95"
            totalFilteredCount={filteredClients.length}
          />

          {/* Export Menu (Excel / CSV & PDF) */}
          <ExportMenu onExportCSV={handleExportCSV} onExportPDF={handlePrint} />

          {/* Year Selector */}
          <CustomSelect 
            value={selectedYear} 
            onChange={setSelectedYear} 
            options={YEARS} 
            labelPrefix="FY "
            title="Select Financial Year"
            align="right"
          />

          {/* Quarter / Period Selector */}
          <CustomSelect 
            value={selectedMonth} 
            onChange={setSelectedMonth} 
            options={QUARTERLY_PERIOD_OPTIONS} 
            title="Select Filing Period"
            align="right"
            menuWidth="min-w-[170px]"
          />
        </div>
      </div>

      <div className="relative z-10 flex-1 min-h-0 w-full max-w-full min-w-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col transition-colors">
        {viewMode === 'grid' ? (
          <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredClients.map((client, idx) => {
              const statusInfo = getStatus(client.id);
              const r1Done = statusInfo.r1;
              const r3bLabel = getStatusLabel(statusInfo.r3b);
              return (
                <div key={client.id} className="p-3.5 bg-slate-50 hover:bg-white dark:bg-slate-800/40 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xs transition-all flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono">#{idx + 1}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 font-mono tabular-nums">{client.gstProfile?.gstin || 'NO GSTIN'}</span>
                        {client.gstProfile?.gstin && (
                          <button onClick={() => { navigator.clipboard.writeText(client.gstProfile?.gstin || ''); toast.success('GSTIN Copied!'); window.open('https://services.gst.gov.in/services/searchtp', '_blank'); }} className="p-0.5 text-slate-400 hover:text-indigo-600 transition-colors inline-flex cursor-pointer" title="Search GSTIN">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white truncate" title={client.tradeName}>{client.tradeName || client.legalName}</h4>
                    <p className="text-[10px] text-slate-400 truncate mb-2">{client.legalName}</p>
                    
                    {/* Credentials Section */}
                    <div className="mt-2 p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-[10px] text-slate-400 uppercase">ID:</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">{client.gstProfile?.username || '---'}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-[10px] text-slate-400 uppercase">PWD:</span>
                        <div className="flex items-center gap-1">
                          {editingPasswordId === client.id ? (
                            <input 
                              autoFocus 
                              value={newPassVal} 
                              onChange={e => setNewPassVal(e.target.value)} 
                              onBlur={handleUpdatePassword} 
                              onKeyDown={e => e.key === 'Enter' && handleUpdatePassword()} 
                              className="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded px-1.5 py-0.5 text-xs font-mono w-20 outline-none h-6" 
                            />
                          ) : (
                            <>
                              <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">{client.gstProfile?.password || '---'}</span>
                              <button 
                                onClick={() => { setSelectedClient(client); setEditingPasswordId(client.id); setNewPassVal(client.gstProfile?.password || ''); }} 
                                className="p-0.5 text-slate-400 hover:text-amber-500 transition-all inline-flex cursor-pointer"
                                title="Edit Password"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              {client.gstProfile?.username && (
                                <button 
                                  onClick={() => { 
                                    navigator.clipboard.writeText(client.gstProfile?.username || ''); 
                                    window.open('https://services.gst.gov.in/services/login', '_blank'); 
                                  }} 
                                  className="p-0.5 text-slate-400 hover:text-indigo-600 transition-all inline-flex cursor-pointer" 
                                  title="Login to Portal"
                                >
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px]">
                    <span className={`px-2 py-0.5 rounded-md font-medium ${r1Done ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>
                      IFF: {r1Done ? 'Filed' : 'Pending'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md font-medium ${
                      r3bLabel === 'Filed' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : r3bLabel === 'Challan' ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                    }`}>
                      3B: {r3bLabel}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] font-bold uppercase text-slate-400">{client.gstProfile?.regType || 'QRMP'}</span>
                    <button onClick={(e) => openActionsMenu(e, client)} className="px-2.5 py-1 text-xs font-semibold bg-indigo-600 text-white rounded-lg shadow-2xs hover:bg-slate-900 transition-colors cursor-pointer">
                      Actions
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
        <div className="w-full overflow-x-auto overflow-y-auto no-scrollbar flex-1 relative h-full">
          <table className={`w-full text-left border-collapse min-w-[1000px] quarterly-returns-table ${isAllQuartersMode ? 'min-w-[1450px]' : ''}`}>
            <thead className="sticky top-0 z-30 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-semibold tracking-wider uppercase select-none">
              <tr>
                <th className="px-3 py-3 w-12 text-center whitespace-nowrap">S.No.</th>
                <th className={`px-3 py-3 ${isAllQuartersMode ? 'w-[180px]' : 'min-w-[180px]'} whitespace-nowrap`}>Trade Name</th>
                <th className={`px-3 py-3 ${isAllQuartersMode ? 'w-[120px]' : 'min-w-[120px]'} whitespace-nowrap`}>Mobile No.</th>
                <th className={`px-3 py-3 ${isAllQuartersMode ? 'w-[145px]' : 'min-w-[145px]'} whitespace-nowrap`}>GSTIN</th>

                {isAllQuartersMode ? (
                  QUARTER_CONFIGS.map(q => (
                    <th key={q.key} className="px-1 py-1 text-center w-[135px] min-w-[135px] whitespace-nowrap">
                      <div className="flex items-center justify-center gap-0.5">
                        <TableFilter 
                          label={q.label} 
                          isActive={!!quarterFilters[q.key] && quarterFilters[q.key] !== 'All'}
                        >
                          {['All', '3B Filed', '3B Challan', '3B Pending', 'R1 Filed', 'R1 Pending'].map(f => (
                            <button 
                              key={f} 
                              onClick={() => setQuarterFilters(prev => ({ ...prev, [q.key]: f }))} 
                              className="w-full text-left px-2.5 py-1.5 text-xs font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              {f === 'R1 Filed' ? 'All IFF/R1 Filed' : f === 'R1 Pending' ? 'Any IFF/R1 Pend' : f}
                            </button>
                          ))}
                        </TableFilter>
                      </div>
                    </th>
                  ))
                ) : (
                  <>
                    <th className="px-3 py-3 text-center min-w-[210px] whitespace-nowrap">
                       <div className="flex justify-center flex-col items-center">
                          <TableFilter label="IFF/R1 (Months)" isActive={r1Filter !== 'All'}>
                            {[
                              { id: 'All', label: 'All' },
                              { id: 'Filed', label: 'All 3 Months Filed' },
                              { id: 'Pending', label: 'Any Month Pending' },
                              { id: 'M1_Filed', label: '1st Month IFF Filed' },
                              { id: 'M1_Pending', label: '1st Month IFF Pending' },
                              { id: 'M2_Filed', label: '2nd Month IFF Filed' },
                              { id: 'M2_Pending', label: '2nd Month IFF Pending' },
                              { id: 'M3_Filed', label: '3rd Month (GSTR-1) Filed' },
                              { id: 'M3_Pending', label: '3rd Month (GSTR-1) Pending' },
                            ].map(f => (
                              <button 
                                key={f.id} 
                                onClick={() => setR1Filter(f.id as any)} 
                                className={`w-full text-left px-3 py-1.5 text-[11px] font-semibold uppercase rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/40 hover:text-indigo-600 dark:hover:text-indigo-300 whitespace-nowrap cursor-pointer ${
                                  r1Filter === f.id ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 font-bold' : 'text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {f.label}
                              </button>
                            ))}
                          </TableFilter>
                       </div>
                    </th>
                    <th className="px-3 py-3 text-center min-w-[110px] whitespace-nowrap">
                       <div className="flex justify-center flex-col items-center">
                          <TableFilter label="GSTR-3B" isActive={r3bFilter !== 'All'}>
                            {['All', 'Filed', 'Challan', 'Pending'].map(f => <button key={f} onClick={() => setR3bFilter(f as any)} className="w-full text-left px-3 py-2 text-xs font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer">{f}</button>)}
                          </TableFilter>
                       </div>
                    </th>
                    <th className="px-3 py-3 min-w-[110px] whitespace-nowrap">User ID</th>
                    <th className="px-3 py-3 min-w-[110px] whitespace-nowrap">Password</th>
                    <th className="px-3 py-3 min-w-[130px]">Remark</th>
                  </>
                )}

                <th className="px-3 py-3 text-right sticky top-0 right-0 bg-slate-50 dark:bg-slate-800 z-40 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] min-w-[120px] whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs font-sans">
              {groupedClients.map(({ sector, clients: sectorClients }) => (
                <React.Fragment key={sector}>
                <tr>
                  <td colSpan={isAllQuartersMode ? 8 : 9} className="sticky top-[41px] z-20 bg-slate-100 dark:bg-slate-800 font-semibold text-xs text-slate-700 dark:text-slate-300 py-2 px-3 tracking-wider border-y border-slate-200 dark:border-slate-750 shadow-2xs">
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
                {sectorClients.map((client, idx) => {
              const st = getStatus(client.id);
              const r3bStatus = getStatusLabel(st.r3b);
              const isEditingPass = editingPasswordId === client.id;
              const theme = getClientColorTheme(client);
              return (
                <tr key={client.id} className={`transition-colors duration-150 group border-b border-slate-100 dark:border-slate-800/60 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-800/50 ${theme.rowClass}`}>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-xs font-medium text-slate-400 dark:text-slate-500 w-12 text-center whitespace-nowrap">{(idx + 1).toString().padStart(2, '0')}</td>
                  <td className={`px-3 py-2.5 ${isAllQuartersMode ? 'w-[180px]' : 'min-w-[180px]'}`} title={client.tradeName}>
                    <p className="text-xs sm:text-sm font-semibold leading-normal truncate text-slate-900 dark:text-white" title={client.tradeName}>
                      {client.tradeName || client.legalName || '---'}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium truncate" title={client.legalName}>
                      {client.legalName || '---'}
                    </p>
                  </td>
  
                  <td className={`px-3 py-2.5 font-mono tabular-nums text-xs font-medium text-slate-700 dark:text-slate-300 truncate whitespace-nowrap ${isAllQuartersMode ? 'w-[120px]' : 'min-w-[120px]'}`}>{client.mobile || '---'}</td>
                    <td className={`px-3 py-2.5 whitespace-nowrap ${isAllQuartersMode ? 'w-[145px]' : 'min-w-[145px]'}`}>
                      <div className="flex items-center gap-1.5 group/gstin whitespace-nowrap">
                        <span className="tracking-wider uppercase text-xs font-semibold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">{client.gstProfile?.gstin}</span>
                        {client.gstProfile?.gstin && (
                          <button 
                            type="button"
                            onClick={() => (navigator.clipboard.writeText(client.gstProfile?.gstin || '').then(() => { toast.success('GSTIN Copied!'); window.open('https://services.gst.gov.in/services/searchtp', '_blank'); }))} 
                            className="p-1 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded transition-colors cursor-pointer opacity-0 group-hover/gstin:opacity-100 shrink-0" 
                            title="Search Taxpayer"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                          </button>
                        )}
                      </div>
                    </td>

                    {isAllQuartersMode ? (
                      QUARTER_CONFIGS.map(qConfig => (
                        <td key={qConfig.key} className="px-1 py-1.5 text-center border-x border-slate-100/80 dark:border-slate-800/60 align-middle w-[135px] min-w-[135px]">
                          <div className="flex flex-col gap-1 text-[10px]">
                            <div className="grid grid-cols-3 gap-0.5">
                              {qConfig.months.map(m => {
                                const mPeriod = `${selectedYear}_${m.name}`;
                                const mSt = getStatus(client.id, mPeriod);
                                return (
                                  <button
                                    key={m.name}
                                    type="button"
                                    onClick={() => toggleStatus(client.id, 'r1', mPeriod)}
                                    className={`px-1 py-0.5 rounded text-[9px] font-semibold tracking-tight uppercase border text-center transition-all cursor-pointer shadow-2xs ${
                                      mSt.r1
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80 hover:bg-emerald-100/80'
                                        : 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80 hover:bg-amber-100/80'
                                    }`}
                                    title={`${m.name}: ${mSt.r1 ? 'Filed' : 'Pending'}`}
                                  >
                                    {m.short}
                                  </button>
                                );
                              })}
                            </div>
                            {(() => {
                              const r3bPeriod = `${selectedYear}_${qConfig.r3bMonth}`;
                              const st3B = getStatus(client.id, r3bPeriod);
                              const label3B = getStatusLabel(st3B.r3b);
                              return (
                                <button
                                  type="button"
                                  onClick={() => toggleStatus(client.id, 'r3b', r3bPeriod)}
                                  className={`w-full px-1.5 py-0.5 rounded text-[9px] font-medium tracking-tight border flex items-center justify-between gap-0.5 transition-all cursor-pointer shadow-2xs ${
                                    label3B === 'Filed'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80 hover:bg-emerald-100/80'
                                      : label3B === 'Challan'
                                        ? 'bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/80 hover:bg-purple-100/80'
                                        : 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80 hover:bg-amber-100/80'
                                  }`}
                                  title={`Toggle ${qConfig.key} GSTR-3B`}
                                >
                                  <span className="text-[9px] font-semibold opacity-70">3B</span>
                                  <span className="truncate">{label3B === 'Filed' ? 'Filed' : label3B === 'Challan' ? 'Chal' : 'Pend'}</span>
                                </button>
                              );
                            })()}
                          </div>
                        </td>
                      ))
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-center min-w-[210px] whitespace-nowrap">
                          {activeQuarterConfig ? (
                            <div className="flex items-center gap-1.5 justify-center flex-nowrap shrink-0 whitespace-nowrap">
                              {activeQuarterConfig.months.map(m => {
                                const mPeriod = `${selectedYear}_${m.name}`;
                                const mSt = getStatus(client.id, mPeriod);
                                const isGstr1 = m.type === 'GSTR-1';
                                return (
                                  <button
                                    key={m.name}
                                    type="button"
                                    onClick={() => toggleStatus(client.id, 'r1', mPeriod)}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium tracking-tight border transition-all cursor-pointer active:scale-95 shadow-2xs shrink-0 whitespace-nowrap ${
                                      mSt.r1 
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80 hover:bg-emerald-100/80' 
                                        : 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80 hover:bg-amber-100/80'
                                    }`}
                                    title={`${m.name} (${m.type}): Click to toggle (${mSt.r1 ? 'Filed' : 'Pending'})`}
                                  >
                                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${mSt.r1 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                    <span>{m.short} {isGstr1 ? 'R1' : 'IFF'}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <button 
                              type="button"
                              onClick={() => toggleStatus(client.id, 'r1')} 
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-tight border transition-all cursor-pointer active:scale-95 shadow-2xs ${
                                st.r1 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80 hover:bg-emerald-100/80' 
                                  : 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80 hover:bg-amber-100/80'
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${st.r1 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                              <span>{st.r1 ? 'Filed' : 'Pending'}</span>
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center min-w-[110px] whitespace-nowrap">
                           {activeQuarterConfig ? (
                             (() => {
                               const r3bPeriod = `${selectedYear}_${activeQuarterConfig.r3bMonth}`;
                               const st3B = getStatus(client.id, r3bPeriod);
                               const label3B = getStatusLabel(st3B.r3b);
                               return (
                                 <button 
                                   type="button"
                                   onClick={() => toggleStatus(client.id, 'r3b', r3bPeriod)} 
                                   className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-tight border transition-all cursor-pointer active:scale-95 shadow-2xs ${
                                     label3B === 'Filed' 
                                       ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80 hover:bg-emerald-100/80' 
                                       : label3B === 'Challan' 
                                         ? 'bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/80 hover:bg-purple-100/80' 
                                         : 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80 hover:bg-amber-100/80'
                                   }`} 
                                   title={`Click to cycle ${activeQuarterConfig.key} 3B (Pending → Challan → Filed)`}
                                 >
                                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                      label3B === 'Filed' ? 'bg-emerald-500' : label3B === 'Challan' ? 'bg-purple-500' : 'bg-amber-500'
                                    }`} />
                                    <span>{label3B}</span>
                                 </button>
                               );
                             })()
                           ) : isQuarterEnd ? (
                             <button 
                               type="button"
                               onClick={() => toggleStatus(client.id, 'r3b')} 
                               className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-tight border transition-all cursor-pointer active:scale-95 shadow-2xs ${
                                  r3bStatus === 'Filed' 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80 hover:bg-emerald-100/80' 
                                    : r3bStatus === 'Challan' 
                                      ? 'bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/80 hover:bg-purple-100/80' 
                                      : 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80 hover:bg-amber-100/80'
                               }`} 
                               title="Click to cycle: Pending → Challan → Filed"
                             >
                                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                  r3bStatus === 'Filed' ? 'bg-emerald-500' : r3bStatus === 'Challan' ? 'bg-purple-500' : 'bg-amber-500'
                                }`} />
                                <span>{r3bStatus}</span>
                             </button>
                           ) : <span className="font-semibold text-slate-300">N/A</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono tabular-nums text-xs font-medium text-slate-700 dark:text-slate-300 truncate min-w-[110px] whitespace-nowrap">{client.gstProfile?.username || '---'}</td>
                        <td className="px-3 py-2.5 min-w-[115px] whitespace-nowrap">
                           <div className="flex items-center gap-1.5 group/pass whitespace-nowrap">
                              {isEditingPass ? (
                                <input 
                                  autoFocus 
                                  value={newPassVal} 
                                  onChange={e => setNewPassVal(e.target.value)} 
                                  onBlur={handleUpdatePassword} 
                                  onKeyDown={e => e.key === 'Enter' && handleUpdatePassword()} 
                                  className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2 h-7 text-xs font-mono w-24 outline-none text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500" 
                                />
                              ) : (
                                <>
                                   <span className="font-mono text-xs font-medium text-indigo-600 dark:text-indigo-400 truncate">{client.gstProfile?.password || '---'}</span>
                                   <button 
                                     type="button"
                                     onClick={() => { setSelectedClient(client); setEditingPasswordId(client.id); setNewPassVal(client.gstProfile?.password || ''); }} 
                                     className="p-1 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 opacity-0 group-hover/pass:opacity-100 transition-all shrink-0 cursor-pointer"
                                     title="Edit Password"
                                   >
                                     <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                   </button>
                                   {client.gstProfile?.username && (
                                     <button 
                                       type="button"
                                       onClick={() => { 
                                         navigator.clipboard.writeText(client.gstProfile?.username || ''); 
                                         window.open('https://services.gst.gov.in/services/login', '_blank'); 
                                       }} 
                                       className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 opacity-0 group-hover/pass:opacity-100 transition-all shrink-0 cursor-pointer" 
                                       title="Copy ID & Open GST Portal"
                                     >
                                       <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                     </button>
                                   )}
                                </>
                              )}
                           </div>
                        </td>
                        <td className="px-3 py-2.5 truncate max-w-[160px] min-w-[130px]">
                           <EditableRemark value={st?.remark || getStatus?.(client.id)?.remark || ''} onSave={val => updateRemark(client.id, val)} />
                         </td>
                      </>
                    )}
                     <td className="px-3 py-2 text-right overflow-visible whitespace-nowrap min-w-[120px] sticky right-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-850 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.04)]">
                       <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          <GSTViewIcon client={client} showLabel onDataChange={handleRefreshClients} />
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
                             <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                          </button>
                       </div>
                    </td>
                  </tr>
                  );
                })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

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
            className="relative pointer-events-auto w-80 max-w-[calc(100vw-24px)] max-h-[calc(100vh-32px)] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl z-[999999] text-left animate-in fade-in slide-in-from-right-4 duration-200 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden"
          >
            {/* Header */}
            <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
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

              {/* View / Download Certificate Modal - REG-06 option */}
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

              <button 
                type="button"
                onClick={() => { 
                  const text = `*Entity Profile*\nTrade Name: ${selectedClient!.tradeName || 'N/A'}\nLegal Name: ${selectedClient!.legalName || 'N/A'}\nMobile: ${selectedClient!.mobile || 'N/A'}\nEmail: ${selectedClient!.email || 'N/A'}\n\n*GST Details*\nGSTIN: ${selectedClient!.gstProfile?.gstin || 'N/A'}\nStatus: ${selectedClient!.gstProfile?.gstStatus || 'N/A'}\nReg Type: ${selectedClient!.gstProfile?.regType || 'N/A'}\nFiling: ${selectedClient!.gstProfile?.filingFreq || 'N/A'}\nReg Date: ${formatDate(selectedClient!.gstProfile?.regDate)}\nJurisdiction: ${selectedClient!.gstProfile?.jurisdictionType || 'N/A'}\nSector/Range: ${selectedClient!.gstProfile?.sector || selectedClient!.gstProfile?.range || 'N/A'}\n\n*Credentials*\nGST User ID: ${selectedClient!.gstProfile?.username || 'N/A'}\nGST Password: ${selectedClient!.gstProfile?.password || 'N/A'}`;
                  window.location.href = `whatsapp://send?text=${encodeURIComponent(text)}`;
                  setActiveActionsId(null); 
                }} 
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs shrink-0">💬</div>
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 truncate">Quick WhatsApp Share</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Share Modal with Note Templates */}
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

      {/* Edit Client Form Modal */}
      {isEditModalOpen && selectedClient && (
        <GSTClientFormModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedClient(null);
          }}
          onSave={async (updatedClient) => {
            try {
              await api.saveClient(updatedClient);
              setIsEditModalOpen(false);
              setSelectedClient(null);
              handleRefreshClients();
              toast.success('Client updated successfully');
            } catch (err: any) {
              toast.error(err?.message || 'Failed to update client');
            }
          }}
          initialData={selectedClient}
        />
      )}

      {/* Login Tool Box Modal */}
      <GSTPortalLoginModal
        isOpen={isLoginBoxOpen}
        onClose={() => setIsLoginBoxOpen(false)}
        client={loginToolClient}
        onDataChange={handleRefreshClients}
        initialType={loginPortalType}
      />

      {/* GST Certificate Modal */}
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
          handleRefreshClients();
          toast.success("GST Certificate updated!");
        }}
      />

      {/* Credential Share Modal */}
      <CredentialShareModal
        isOpen={isCredentialShareModalOpen}
        onClose={() => setIsCredentialShareModalOpen(false)}
        client={selectedClient}
        mode="gst"
      />

      {/* Full Detail Dossier Modal */}
      <GSTDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setDetailClient(null);
        }}
        client={detailClient}
        onEdit={(c) => {
          setIsDetailModalOpen(false);
          setSelectedClient(c);
          setIsEditModalOpen(true);
        }}
        onDataChange={handleRefreshClients}
      />
    </div>
  );
};

export default QuarterlyFiling;
