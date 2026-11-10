import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { 
  Cake, Gift, MessageSquare, Send, Calendar, Search, 
  Sparkles, CheckCircle2, AlertCircle, Copy, Edit2, 
  Plus, Download, RefreshCw, X, User, Phone, Mail, 
  ExternalLink, ChevronRight, Check, Eye, HelpCircle,
  Building2, ArrowUpDown, Filter, PartyPopper, Users, Briefcase
} from 'lucide-react';
import { toast } from 'sonner';
import { Client, Stakeholder } from '../../types';
import { api } from '../../services/api';
import { useModuleData } from '../../hooks/useModuleData';
import { formatDate } from '../../dateUtils';
import { exportToCSV, printList } from '../../exportUtils';
import { CustomSelect } from '../../components/CustomSelect';
import { ViewControl } from '../../components/ViewControl';
import { ExportMenu } from '../../components/ExportMenu';
import { 
  getBirthdayMetrics, 
  getClientDob, 
  getBirthdaySettings, 
  saveBirthdaySettings, 
  generateBirthdayWish, 
  openWhatsAppWish,
  formatWhatsAppPhone,
  BirthdaySettings, 
  BirthdayMetrics,
  DEFAULT_BIRTHDAY_TEMPLATE, 
  PRESET_BIRTHDAY_TEMPLATES 
} from '../../services/birthdayService';

const MONTH_NAMES = [
  'All Months',
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export interface BirthdayRecipient {
  id: string;
  clientId: string;
  client: Client;
  recipientName: string;
  entityName: string;
  designation: string;
  mobile: string;
  email?: string;
  pan?: string;
  dob?: string;
  hasDob: boolean;
  metrics: BirthdayMetrics | null;
  isGST: boolean;
  isIT: boolean;
  isBoth: boolean;
  isStakeholder: boolean;
  stakeholderId?: string;
  stakeholderIndex?: number;
  sourcePortfolio: 'GST' | 'IT' | 'Both' | 'General';
}

export const BirthdayWishes: React.FC = () => {
  const queryClient = useQueryClient();

  // Load clients data
  const { data: pageClients, isLoading } = useModuleData<Client[]>('clients');
  const [clients, setClients] = useState<Client[]>([]);

  // Update clients state when data loads or changes
  useEffect(() => {
    if (pageClients && Array.isArray(pageClients)) {
      setClients(pageClients);
    } else {
      api.getClients().then(res => {
        if (Array.isArray(res)) setClients(res);
      }).catch(err => console.error('Error fetching clients for birthdays:', err));
    }
  }, [pageClients]);

  // Settings State
  const [settings, setSettings] = useState<BirthdaySettings>({
    template: DEFAULT_BIRTHDAY_TEMPLATE,
    firmName: 'Chartered Accountants & Tax Consultants'
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [templateDraft, setTemplateDraft] = useState('');
  const [firmNameDraft, setFirmNameDraft] = useState('');
  const [testMobile, setTestMobile] = useState('');

  // Edit / Add DOB Modal State
  const [isDobModalOpen, setIsDobModalOpen] = useState(false);
  const [selectedClientForDob, setSelectedClientForDob] = useState<Client | null>(null);
  const [selectedRecipientTarget, setSelectedRecipientTarget] = useState<'entity' | string>('entity');
  const [dobInputVal, setDobInputVal] = useState('');
  const [clientSearchInModal, setClientSearchInModal] = useState('');
  const [isSavingDob, setIsSavingDob] = useState(false);

  // Preview Message Modal State
  const [previewRecipient, setPreviewRecipient] = useState<BirthdayRecipient | null>(null);
  const [customMsgText, setCustomMsgText] = useState('');

  // Filters & Search State
  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all_dob' | 'today' | 'upcoming_7' | 'this_month' | 'by_month' | 'missing_dob' | 'all_clients'>('all_dob');
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(new Date().getMonth() + 1); // 1-12
  const [selectedMonthVal, setSelectedMonthVal] = useState<string>('all');
  const [portfolioFilter, setPortfolioFilter] = useState<'all' | 'gst' | 'it' | 'both'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

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

  // Load Saved Birthday Settings
  useEffect(() => {
    getBirthdaySettings().then(s => {
      setSettings(s);
      setTemplateDraft(s.template);
      setFirmNameDraft(s.firmName || '');
    });
  }, []);

  // Listen for database changes across app
  useEffect(() => {
    const handleDbChange = () => {
      api.getClients().then(res => {
        if (Array.isArray(res)) setClients(res);
      }).catch(() => {});
    };
    window.addEventListener('clientify_db_change', handleDbChange);
    return () => window.removeEventListener('clientify_db_change', handleDbChange);
  }, []);

  // Compute metrics for all recipients (Individual Clients + Partners / Directors / Members)
  const clientBirthdayList = useMemo<BirthdayRecipient[]>(() => {
    const now = new Date();
    const list: BirthdayRecipient[] = [];

    clients.forEach(client => {
      const isGST = !!(client.gstProfile && (client.gstProfile.gstin || client.gstProfile.regType));
      const isIT = !!(client.itProfile && (client.itProfile.pan || client.itProfile.category));
      const isBoth = isGST && isIT;
      const sourcePortfolio: 'GST' | 'IT' | 'Both' | 'General' = isBoth ? 'Both' : isGST ? 'GST' : isIT ? 'IT' : 'General';

      // 1. Collect stakeholders from GST and IT profiles
      const gstStakeholders = Array.isArray(client.gstProfile?.stakeholders) ? client.gstProfile!.stakeholders : [];
      const itStakeholders = Array.isArray(client.itProfile?.stakeholders) ? client.itProfile!.stakeholders : [];

      // Deduplicate stakeholders across GST and IT for this client
      const seenStakeholders = new Set<string>();
      const combinedStakeholders: Array<{
        sh: Stakeholder;
        origin: 'gst' | 'it' | 'both';
        idx: number;
      }> = [];

      gstStakeholders.forEach((sh, idx) => {
        if (!sh || (!sh.name && !sh.pan && !sh.dob)) return;
        const key = (sh.pan ? sh.pan.trim().toUpperCase() : '') || `${(sh.name || '').trim().toLowerCase()}_${(sh.mobile || '').trim()}`;
        if (key) seenStakeholders.add(key);
        combinedStakeholders.push({ sh: { ...sh }, origin: 'gst', idx });
      });

      itStakeholders.forEach((sh, idx) => {
        if (!sh || (!sh.name && !sh.pan && !sh.dob)) return;
        const key = (sh.pan ? sh.pan.trim().toUpperCase() : '') || `${(sh.name || '').trim().toLowerCase()}_${(sh.mobile || '').trim()}`;
        if (key && seenStakeholders.has(key)) {
          const existing = combinedStakeholders.find(item => {
            const k = (item.sh.pan ? item.sh.pan.trim().toUpperCase() : '') || `${(item.sh.name || '').trim().toLowerCase()}_${(item.sh.mobile || '').trim()}`;
            return k === key;
          });
          if (existing) {
            existing.origin = 'both';
            if (!existing.sh.dob && sh.dob) existing.sh.dob = sh.dob;
            if (!existing.sh.mobile && sh.mobile) existing.sh.mobile = sh.mobile;
            if (!existing.sh.designation && sh.designation) existing.sh.designation = sh.designation;
          }
        } else {
          if (key) seenStakeholders.add(key);
          combinedStakeholders.push({ sh: { ...sh }, origin: 'it', idx });
        }
      });

      const isNonIndividual = 
        ['Partnership', 'Company', 'HUF', 'Trust', 'Society'].includes(client.gstProfile?.constitution || '') ||
        ['Firm', 'Company', 'HUF', 'Trust', 'AOP/BOI'].includes(client.itProfile?.category || '');

      // Add individual stakeholders (Partners, Directors, Members, Karta)
      combinedStakeholders.forEach((item, idx) => {
        const sh = item.sh;
        const shDob = sh.dob || '';
        const shMetrics = getBirthdayMetrics(shDob, now);

        list.push({
          id: `${client.id}-sh-${sh.id || idx}`,
          clientId: client.id,
          client,
          recipientName: sh.name || 'Partner / Member',
          entityName: client.tradeName || client.legalName || 'Firm',
          designation: sh.designation || (client.gstProfile?.constitution === 'Partnership' ? 'Partner' : client.gstProfile?.constitution === 'Company' ? 'Director' : client.gstProfile?.constitution === 'HUF' ? 'Member' : 'Partner / Member'),
          mobile: sh.mobile || client.mobile || '',
          email: sh.email || client.email || '',
          pan: sh.pan || '',
          dob: shDob,
          hasDob: !!shDob,
          metrics: shMetrics,
          isGST,
          isIT,
          isBoth,
          isStakeholder: true,
          stakeholderId: sh.id,
          stakeholderIndex: item.idx,
          sourcePortfolio
        });
      });

      // 2. Add primary client / entity record
      const clientDob = getClientDob(client);
      const hasDistinctEntityDob = clientDob && !combinedStakeholders.some(s => s.sh.dob === clientDob);

      if (!isNonIndividual || combinedStakeholders.length === 0 || hasDistinctEntityDob) {
        const primaryMetrics = getBirthdayMetrics(clientDob, now);
        list.push({
          id: `${client.id}-primary`,
          clientId: client.id,
          client,
          recipientName: client.legalName || client.tradeName || 'Valued Client',
          entityName: client.tradeName || client.legalName || '',
          designation: isNonIndividual ? (client.gstProfile?.constitution || client.itProfile?.category || 'Entity') : 'Individual Client',
          mobile: client.mobile || '',
          email: client.email || '',
          pan: client.pan || client.itProfile?.pan || '',
          dob: clientDob,
          hasDob: !!clientDob,
          metrics: primaryMetrics,
          isGST,
          isIT,
          isBoth,
          isStakeholder: false,
          sourcePortfolio
        });
      }
    });

    return list;
  }, [clients]);

  // Overall Statistics
  const stats = useMemo(() => {
    let todayCount = 0;
    let upcoming7Count = 0;
    let thisMonthCount = 0;
    let withDobCount = 0;
    let missingDobCount = 0;

    clientBirthdayList.forEach(item => {
      if (item.hasDob && item.metrics) {
        withDobCount++;
        if (item.metrics.isToday) todayCount++;
        if (item.metrics.isUpcoming7Days) upcoming7Count++;
        if (item.metrics.isThisMonth) thisMonthCount++;
      } else {
        missingDobCount++;
      }
    });

    return {
      today: todayCount,
      upcoming7: upcoming7Count,
      thisMonth: thisMonthCount,
      withDob: withDobCount,
      missingDob: missingDobCount,
      total: clientBirthdayList.length
    };
  }, [clientBirthdayList]);

  // Counts for each birth month (1 - 12)
  const monthCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) counts[m] = 0;
    clientBirthdayList.forEach(item => {
      if (item.hasDob && item.metrics) {
        counts[item.metrics.parsed.month] = (counts[item.metrics.parsed.month] || 0) + 1;
      }
    });
    return counts;
  }, [clientBirthdayList]);

  // Month selector options with counts as badges
  const monthOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Months' },
      ...MONTH_NAMES.slice(1).map((m, idx) => ({
        value: (idx + 1).toString(),
        label: m,
        badge: monthCounts[idx + 1] > 0 ? `${monthCounts[idx + 1]}` : undefined
      }))
    ];
  }, [monthCounts]);

  // Portfolio counts
  const portfolioCounts = useMemo(() => {
    let gstCount = 0;
    let itCount = 0;
    let bothCount = 0;
    clientBirthdayList.forEach(item => {
      if (item.isGST) gstCount++;
      if (item.isIT) itCount++;
      if (item.isBoth) bothCount++;
    });
    return {
      all: clientBirthdayList.length,
      both: bothCount,
      gst: gstCount,
      it: itCount
    };
  }, [clientBirthdayList]);

  // Portfolio options
  const portfolioOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Portfolios', badge: `${portfolioCounts.all}` },
      { value: 'both', label: 'Both (GST & IT)', badge: `${portfolioCounts.both}` },
      { value: 'gst', label: 'GST Portfolio', badge: `${portfolioCounts.gst}` },
      { value: 'it', label: 'Income Tax', badge: `${portfolioCounts.it}` },
    ];
  }, [portfolioCounts]);

  // Filter dropdown options (matching other Clientify pages with status dot & count)
  const filterOptions = useMemo(() => {
    return [
      { 
        value: 'all_dob', 
        label: 'All with DOB', 
        shortLabel: 'With DOB', 
        count: stats.withDob, 
        dot: 'bg-emerald-500' 
      },
      { 
        value: 'today', 
        label: 'Today 🎂', 
        shortLabel: 'Today', 
        count: stats.today, 
        dot: 'bg-rose-500' 
      },
      { 
        value: 'upcoming_7', 
        label: 'Next 7 Days 🎉', 
        shortLabel: 'Next 7d', 
        count: stats.upcoming7, 
        dot: 'bg-amber-500' 
      },
      { 
        value: 'this_month', 
        label: `This Month (${MONTH_NAMES[new Date().getMonth() + 1]})`, 
        shortLabel: 'This Month', 
        count: stats.thisMonth, 
        dot: 'bg-indigo-500' 
      },
      { 
        value: 'missing_dob', 
        label: 'Missing DOB', 
        shortLabel: 'No DOB', 
        count: stats.missingDob, 
        dot: 'bg-slate-400' 
      },
      { 
        value: 'all_clients', 
        label: 'All Records Total', 
        shortLabel: 'All', 
        count: stats.total, 
        dot: 'bg-blue-500' 
      },
    ];
  }, [stats]);

  const currentFilterOption = useMemo(() => {
    if (timeFilter === 'by_month') {
      const monthName = MONTH_NAMES[selectedMonthIndex] || 'Month';
      const count = monthCounts[selectedMonthIndex] || 0;
      return {
        value: 'by_month',
        label: `${monthName} (${count})`,
        shortLabel: monthName,
        count: count,
        dot: 'bg-purple-500'
      };
    }
    return filterOptions.find(o => o.value === timeFilter) || filterOptions[0];
  }, [filterOptions, timeFilter, selectedMonthIndex, monthCounts]);

  const handleMonthChange = (val: string) => {
    setSelectedMonthVal(val);
    if (val === 'all') {
      if (timeFilter === 'by_month') {
        setTimeFilter('all_dob');
      }
    } else {
      setSelectedMonthIndex(parseInt(val, 10));
      setTimeFilter('by_month');
    }
  };

  // Filtered Client / Partner List
  const filteredList = useMemo(() => {
    const s = search.toLowerCase().trim();

    return clientBirthdayList.filter(item => {
      const { recipientName, entityName, mobile, pan, client, hasDob, metrics, isGST, isIT, isBoth } = item;

      // Search match across recipient, entity trade name, legal name, mobile, PAN, GSTIN
      if (s) {
        const rName = (recipientName || '').toLowerCase();
        const eName = (entityName || '').toLowerCase();
        const legal = (client.legalName || '').toLowerCase();
        const trade = (client.tradeName || '').toLowerCase();
        const mob = (mobile || '').toLowerCase();
        const p = (pan || client.pan || client.itProfile?.pan || '').toLowerCase();
        const gstin = (client.gstProfile?.gstin || '').toLowerCase();
        const matchesSearch = rName.includes(s) || eName.includes(s) || legal.includes(s) || trade.includes(s) || mob.includes(s) || p.includes(s) || gstin.includes(s);
        if (!matchesSearch) return false;
      }

      // Portfolio filter (All, Both, GST, IT)
      if (portfolioFilter === 'both' && !isBoth) return false;
      if (portfolioFilter === 'gst' && !isGST) return false;
      if (portfolioFilter === 'it' && !isIT) return false;

      // Time filter
      if (timeFilter === 'missing_dob') {
        return !hasDob;
      }
      if (timeFilter === 'all_clients') {
        return true;
      }

      if (!hasDob || !metrics) return false;

      if (timeFilter === 'today') {
        return metrics.isToday;
      }
      if (timeFilter === 'upcoming_7') {
        return metrics.isUpcoming7Days;
      }
      if (timeFilter === 'this_month') {
        return metrics.isThisMonth;
      }
      if (timeFilter === 'by_month') {
        return metrics.parsed.month === selectedMonthIndex;
      }

      return true; // 'all_dob'
    }).sort((a, b) => {
      // Sort priority: Today first, then upcoming days ascending, then without DOB
      if (!a.metrics && !b.metrics) return 0;
      if (!a.metrics) return 1;
      if (!b.metrics) return -1;
      return a.metrics.daysUntil - b.metrics.daysUntil;
    });
  }, [clientBirthdayList, search, timeFilter, selectedMonthIndex, portfolioFilter]);

  // Handle direct WhatsApp Wish
  const handleDirectWish = useCallback((item: BirthdayRecipient) => {
    const message = generateBirthdayWish(
      settings.template, 
      item.client, 
      settings.firmName, 
      item.metrics?.turningAge,
      item.recipientName
    );
    const success = openWhatsAppWish(item.mobile, message);
    if (success) {
      toast.success(`WhatsApp chat opened for ${item.recipientName}! 🎂`);
    } else {
      toast.error('Could not open WhatsApp for this contact.');
    }
  }, [settings]);

  // Handle open custom preview wish modal
  const handleOpenPreviewWish = useCallback((item: BirthdayRecipient) => {
    setPreviewRecipient(item);
    setCustomMsgText(generateBirthdayWish(
      settings.template, 
      item.client, 
      settings.firmName, 
      item.metrics?.turningAge,
      item.recipientName
    ));
  }, [settings]);

  // Handle send custom wish from modal
  const handleSendCustomWish = () => {
    if (!previewRecipient) return;
    openWhatsAppWish(previewRecipient.mobile, customMsgText);
    toast.success(`Birthday greeting dispatched via WhatsApp for ${previewRecipient.recipientName}! 🎉`);
    setPreviewRecipient(null);
  };

  // Handle Save Template Settings
  const handleSaveSettings = async () => {
    const updated: BirthdaySettings = {
      template: templateDraft || DEFAULT_BIRTHDAY_TEMPLATE,
      firmName: firmNameDraft.trim() || 'Chartered Accountants & Tax Consultants'
    };
    await saveBirthdaySettings(updated);
    setSettings(updated);
    setIsSettingsOpen(false);
    toast.success('Birthday message template saved successfully!');
  };

  // Handle Send Test WhatsApp
  const handleSendTestWhatsApp = () => {
    if (!testMobile.trim()) {
      toast.error('Please enter a mobile number to test send.');
      return;
    }
    const sampleClient: Client = {
      id: 'test',
      legalName: 'Rajesh Kumar Sharma',
      tradeName: 'Sharma Trading Co.',
      mobile: testMobile.trim(),
      email: 'rajesh@example.com',
      status: 'Active',
      createdAt: Date.now()
    };
    const msg = generateBirthdayWish(templateDraft, sampleClient, firmNameDraft, 45, 'Rajesh Kumar Sharma');
    openWhatsAppWish(testMobile.trim(), msg);
    toast.success('Sample WhatsApp greeting opened!');
  };

  // Open Edit DOB Modal
  const handleOpenDobModal = (item?: BirthdayRecipient) => {
    if (item) {
      setSelectedClientForDob(item.client);
      setSelectedRecipientTarget(item.isStakeholder ? (item.stakeholderId || `idx_${item.stakeholderIndex}`) : 'entity');
      setDobInputVal(item.dob || '');
    } else {
      setSelectedClientForDob(null);
      setSelectedRecipientTarget('entity');
      setDobInputVal('');
    }
    setClientSearchInModal('');
    setIsDobModalOpen(true);
  };

  // Save DOB for Client or Stakeholder/Partner
  const handleSaveClientDob = async () => {
    if (!selectedClientForDob) {
      toast.error('Please select a client to update DOB.');
      return;
    }
    if (!dobInputVal) {
      toast.error('Please select or enter a valid Date of Birth.');
      return;
    }

    setIsSavingDob(true);
    try {
      let updatedClient: Client = { ...selectedClientForDob };

      if (selectedRecipientTarget === 'entity') {
        // Update client-level DOB across GST and IT
        updatedClient.dob = dobInputVal;
        if (updatedClient.gstProfile) {
          updatedClient.gstProfile = { ...updatedClient.gstProfile, dob: dobInputVal };
        }
        if (updatedClient.itProfile) {
          updatedClient.itProfile = { ...updatedClient.itProfile, dob: dobInputVal };
        }
      } else {
        // Update stakeholder DOB in GST and IT profiles
        const targetId = selectedRecipientTarget;

        if (updatedClient.gstProfile?.stakeholders) {
          const updatedStakeholders = updatedClient.gstProfile.stakeholders.map((sh, idx) => {
            if (sh.id === targetId || `idx_${idx}` === targetId) {
              return { ...sh, dob: dobInputVal };
            }
            return sh;
          });
          updatedClient.gstProfile = { ...updatedClient.gstProfile, stakeholders: updatedStakeholders };
        }

        if (updatedClient.itProfile?.stakeholders) {
          const updatedStakeholders = updatedClient.itProfile.stakeholders.map((sh, idx) => {
            if (sh.id === targetId || `idx_${idx}` === targetId) {
              return { ...sh, dob: dobInputVal };
            }
            return sh;
          });
          updatedClient.itProfile = { ...updatedClient.itProfile, stakeholders: updatedStakeholders };
        }
      }

      await api.saveClient(updatedClient);
      
      // Update local state
      setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['nav_counts'] });

      toast.success(`Date of Birth saved successfully!`);
      setIsDobModalOpen(false);
    } catch (err) {
      console.error('Failed to save client DOB:', err);
      toast.error('Failed to update Date of Birth. Please try again.');
    } finally {
      setIsSavingDob(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'S.No.', 'Recipient Name', 'Firm / Entity', 'Designation', 'Portfolio', 
      'Mobile', 'Email', 'PAN', 'GSTIN', 'DOB (DD/MM/YYYY)', 'Next Birthday', 'Days Left', 'Turning Age'
    ];
    const rows = filteredList.map((item, idx) => [
      (idx + 1).toString().padStart(2, '0'),
      item.recipientName || '---',
      item.entityName || '---',
      item.designation || '---',
      item.sourcePortfolio,
      item.mobile || '---',
      item.email || '---',
      item.pan || '---',
      item.client.gstProfile?.gstin || '---',
      item.hasDob ? (item.metrics?.formattedDate || formatDate(item.dob)) : 'Missing',
      item.metrics ? formatDate(item.metrics.nextBirthday) : 'N/A',
      item.metrics ? (item.metrics.isToday ? 'Today! 🎂' : `${item.metrics.daysUntil} days`) : 'N/A',
      item.metrics?.turningAge ? `${item.metrics.turningAge} Yrs` : 'N/A'
    ]);
    exportToCSV(headers, rows, `Client_Birthday_Calendar_${new Date().toISOString().split('T')[0]}.csv`);
    toast.success('Birthday calendar exported to CSV!');
  };

  // Export / Print PDF
  const handlePrintPDF = () => {
    const headers = [
      'S.No.', 'Recipient Name', 'Firm / Entity', 'Designation', 'Portfolio', 
      'Mobile', 'PAN', 'DOB (DD/MM/YYYY)', 'Next Birthday', 'Days Left', 'Turning Age'
    ];
    const rows = filteredList.map((item, idx) => [
      (idx + 1).toString().padStart(2, '0'),
      item.recipientName || '---',
      item.entityName || '---',
      item.designation || '---',
      item.sourcePortfolio,
      item.mobile || '---',
      item.pan || '---',
      item.hasDob ? (item.metrics?.formattedDate || formatDate(item.dob)) : 'Missing',
      item.metrics ? formatDate(item.metrics.nextBirthday) : 'N/A',
      item.metrics ? (item.metrics.isToday ? 'Today! 🎂' : `${item.metrics.daysUntil} days`) : 'N/A',
      item.metrics?.turningAge ? `${item.metrics.turningAge} Yrs` : 'N/A'
    ]);
    printList('Client Birthday Calendar', headers, rows);
  };

  // Clients matching search in DOB selector modal
  const modalClientOptions = useMemo(() => {
    if (!clientSearchInModal.trim()) return clients.slice(0, 100);
    const q = clientSearchInModal.toLowerCase();
    return clients.filter(c => 
      (c.legalName || '').toLowerCase().includes(q) ||
      (c.tradeName || '').toLowerCase().includes(q) ||
      (c.mobile || '').toLowerCase().includes(q) ||
      (c.gstProfile?.gstin || '').toLowerCase().includes(q) ||
      (c.itProfile?.pan || '').toLowerCase().includes(q)
    ).slice(0, 100);
  }, [clients, clientSearchInModal]);

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* ── Modern Unified Single-Line Toolbar (All options in one line, overflow-visible) ── */}
      <div className="relative z-50 flex items-center justify-between gap-1.5 sm:gap-2 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs shrink-0 w-full max-w-full min-w-0 flex-nowrap overflow-visible transition-colors">
        
        {/* Left Section: Search Input + Count Filter Dropdown + Month Filter + Portfolio Filter */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 flex-nowrap overflow-visible">
          
          {/* Search Bar with Ctrl+K */}
          <div className="relative group flex-1 min-w-[130px] max-w-[220px]">
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search client, partner, PAN..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-7 sm:pr-14 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none" 
            />
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-slate-600 dark:group-focus-within:text-slate-300 transition-colors" />
            {search ? (
              <button 
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
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
                  : timeFilter !== 'all_dob' && timeFilter !== 'all_clients'
                    ? timeFilter === 'today'
                      ? 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                      : 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
              title="Click to view all birthday status counts and filters"
            >
              <span className={`h-2 w-2 rounded-full ${currentFilterOption.dot} shrink-0`} />
              <span>{currentFilterOption.shortLabel}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${
                isFilterDropdownOpen
                  ? 'bg-slate-800 dark:bg-indigo-700 text-white'
                  : timeFilter === 'today'
                    ? 'bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-100'
                    : timeFilter !== 'all_dob' && timeFilter !== 'all_clients'
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
                  <span>Filter by Birthday Status</span>
                  <span>Count</span>
                </div>
                <div className="space-y-0.5">
                  {filterOptions.map((option) => {
                    const isSelected = timeFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setTimeFilter(option.value as any);
                          if (option.value !== 'by_month') setSelectedMonthVal('all');
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

          {/* Month Filter */}
          <CustomSelect
            value={selectedMonthVal}
            onChange={handleMonthChange}
            options={monthOptions}
            labelPrefix="Month: "
            icon={<Calendar className="h-3.5 w-3.5 text-indigo-500 shrink-0" />}
            title="Filter by Birth Month"
            align="left"
            menuWidth="min-w-[160px]"
          />

          {/* Portfolio Filter */}
          <CustomSelect
            value={portfolioFilter}
            onChange={(val) => setPortfolioFilter(val as any)}
            options={portfolioOptions}
            labelPrefix="Portfolio: "
            icon={<Building2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />}
            title="Filter by Client Portfolio (GST / IT / Both)"
            align="left"
            menuWidth="min-w-[180px]"
          />

        </div>

        {/* Right Section: Customize Wish + Set DOB + View Control + Export Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto flex-nowrap overflow-visible">

          {/* Customize Wish Button */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs hover:border-indigo-400 active:scale-95 shrink-0 whitespace-nowrap"
            title="Configure default WhatsApp message template"
          >
            <MessageSquare className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden xl:inline">Customize Wish</span>
            <span className="xl:hidden">Wish</span>
          </button>

          {/* Set Client DOB Button */}
          <button
            type="button"
            onClick={() => handleOpenDobModal()}
            className="h-9 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 whitespace-nowrap"
            title="Manually set or update a client or partner Date of Birth"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Set Client DOB</span>
            <span className="xl:hidden">Set DOB</span>
          </button>

          {/* View Control */}
          <ViewControl 
            viewMode={viewMode === 'cards' ? 'grid' : 'table'} 
            onViewChange={(mode) => setViewMode(mode === 'grid' ? 'cards' : 'table')} 
            className="h-9 rounded-lg shrink-0"
          />

          {/* Export Menu */}
          <ExportMenu 
            onExportCSV={handleExportCSV} 
            onExportPDF={handlePrintPDF} 
          />
        </div>
      </div>

      {/* ── Client / Partner Birthday List Table / Grid ── */}
      <div className="flex-1 min-h-[300px] bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col">
        {filteredList.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
              <Cake className="h-7 w-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">No matching clients or partners found</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              {timeFilter === 'missing_dob' 
                ? 'All clients and partners have their Dates of Birth recorded. Fantastic job keeping records complete!'
                : 'Try adjusting your search criteria, month, or portfolio options to locate clients.'}
            </p>
            {timeFilter !== 'all_dob' && (
              <button
                onClick={() => { setTimeFilter('all_dob'); setSearch(''); setSelectedMonthVal('all'); setPortfolioFilter('all'); }}
                className="mt-3 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Reset all filters
              </button>
            )}
          </div>
        ) : viewMode === 'table' ? (
          <div className="w-full overflow-x-auto flex-1 no-scrollbar">
            <table className="w-full text-left border-collapse min-w-[960px]">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider select-none">
                <tr>
                  <th className="px-3.5 py-3 w-12 text-center whitespace-nowrap">#</th>
                  <th className="px-3.5 py-3 min-w-[220px]">Celebrant / Entity</th>
                  <th className="px-3 py-3 w-28 text-center whitespace-nowrap">Portfolio</th>
                  <th className="px-3 py-3 w-32 whitespace-nowrap">DOB (DD/MM/YYYY)</th>
                  <th className="px-3 py-3 min-w-[140px] whitespace-nowrap">Next Birthday</th>
                  <th className="px-3 py-3 w-24 text-center whitespace-nowrap">Age</th>
                  <th className="px-3 py-3 min-w-[130px] whitespace-nowrap">Contact</th>
                  <th className="px-3.5 py-3 min-w-[180px] text-right sticky right-0 bg-slate-50 dark:bg-slate-800 z-20">Direct Wish Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredList.map((item, idx) => {
                  const { recipientName, entityName, designation, isStakeholder, dob, hasDob, metrics, isGST, isIT, isBoth } = item;
                  const isToday = metrics?.isToday;
                  const isUpcoming7 = metrics?.isUpcoming7Days;

                  return (
                    <tr 
                      key={item.id}
                      className={`transition-colors duration-150 ${
                        isToday 
                          ? 'bg-rose-50/60 dark:bg-rose-950/20 hover:bg-rose-50 dark:hover:bg-rose-950/30' 
                          : isUpcoming7 
                            ? 'bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30' 
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Serial Number */}
                      <td className="px-3.5 py-3 font-mono tabular-nums text-center text-slate-400">
                        {(idx + 1).toString().padStart(2, '0')}
                      </td>

                      {/* Recipient / Celebrant & Entity */}
                      <td className="px-3.5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`h-8 w-8 rounded-xl flex items-center justify-center font-bold text-xs uppercase shrink-0 ${
                            isToday 
                              ? 'bg-rose-500 text-white shadow-sm ring-2 ring-rose-400/40 animate-pulse' 
                              : isUpcoming7 
                                ? 'bg-amber-500 text-white shadow-2xs' 
                                : isStakeholder
                                  ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}>
                            {isToday ? '🎂' : (recipientName || 'C')[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-slate-900 dark:text-white truncate" title={recipientName}>
                                {recipientName}
                              </p>
                              {isStakeholder && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200/80 shrink-0">
                                  {designation}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5" title={entityName}>
                              <Building2 className="h-3 w-3 shrink-0 text-slate-400" />
                              <span className="truncate">{entityName}</span>
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Portfolio Tag */}
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {isBoth ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              GST & IT
                            </span>
                          ) : isGST ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              GST
                            </span>
                          ) : isIT ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              IT
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">General</span>
                          )}
                        </div>
                      </td>

                      {/* Date of Birth */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {hasDob ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200 font-medium">
                              {metrics?.formattedDate || formatDate(dob)}
                            </span>
                            <button
                              onClick={() => handleOpenDobModal(item)}
                              className="text-slate-300 hover:text-indigo-600 p-0.5 transition-colors cursor-pointer"
                              title="Edit Date of Birth"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleOpenDobModal(item)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Add DOB</span>
                          </button>
                        )}
                      </td>

                      {/* Next Birthday & Countdown */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {metrics ? (
                          <div>
                            {isToday ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-500 text-white shadow-xs animate-bounce">
                                <Sparkles className="h-3 w-3" />
                                Today! 🎂
                              </span>
                            ) : metrics.daysUntil === 1 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500 text-white">
                                Tomorrow 🎉
                              </span>
                            ) : metrics.daysUntil <= 7 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300/80">
                                In {metrics.daysUntil} days
                              </span>
                            ) : (
                              <span className="font-mono text-slate-600 dark:text-slate-400">
                                {formatDate(metrics.nextBirthday)} ({metrics.daysUntil}d)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">---</span>
                        )}
                      </td>

                      {/* Age / Turning Age */}
                      <td className="px-3 py-3 text-center whitespace-nowrap font-mono tabular-nums">
                        {metrics?.turningAge ? (
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                            isToday ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200' : 'text-slate-700 dark:text-slate-300'
                          }`}>
                            {metrics.turningAge} Yrs
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">---</span>
                        )}
                      </td>

                      {/* Contact: Mobile & Email */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex flex-col">
                          {item.mobile ? (
                            <a
                              href={`tel:${item.mobile}`}
                              className="font-mono text-slate-800 dark:text-slate-200 hover:text-indigo-600 flex items-center gap-1"
                            >
                              <Phone className="h-3 w-3 text-slate-400" />
                              <span>{item.mobile}</span>
                            </a>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">No Mobile</span>
                          )}
                          {item.email && (
                            <span className="text-[10px] text-slate-400 truncate max-w-[120px]" title={item.email}>
                              {item.email}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Direct Wish Action Buttons */}
                      <td className="px-3.5 py-3 text-right whitespace-nowrap sticky right-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 transition-colors">
                        <div className="flex items-center justify-end gap-1.5">
                          {item.mobile ? (
                            <button
                              onClick={() => handleDirectWish(item)}
                              className={`px-2.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-2xs ${
                                isToday 
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-500/30' 
                                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-600 dark:hover:text-white border border-emerald-300/80 dark:border-emerald-800'
                              }`}
                              title="Direct 1-click WhatsApp Wish"
                            >
                              <Send className="h-3 w-3" />
                              <span>Wish on WhatsApp</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">No Mobile</span>
                          )}

                          <button
                            onClick={() => handleOpenPreviewWish(item)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
                            title="Preview or edit custom wish before sending"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              const msg = generateBirthdayWish(settings.template, item.client, settings.firmName, item.metrics?.turningAge, item.recipientName);
                              navigator.clipboard.writeText(msg);
                              toast.success('Birthday wish message copied to clipboard!');
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                            title="Copy message to clipboard"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Cards / Grid View */
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 overflow-y-auto no-scrollbar">
            {filteredList.map(item => {
              const { recipientName, entityName, designation, isStakeholder, dob, hasDob, metrics, isGST, isIT, isBoth } = item;
              const isToday = metrics?.isToday;
              const isUpcoming7 = metrics?.isUpcoming7Days;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 relative overflow-hidden ${
                    isToday
                      ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800 shadow-md ring-2 ring-rose-500/20'
                      : isUpcoming7
                        ? 'bg-amber-50/30 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/80 shadow-2xs'
                        : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-750 hover:bg-white dark:hover:bg-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        {isBoth ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            GST & IT
                          </span>
                        ) : isGST ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            GST
                          </span>
                        ) : isIT ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            IT
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">General</span>
                        )}
                        {isStakeholder && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200">
                            {designation}
                          </span>
                        )}
                      </div>

                      {isToday ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white shadow-2xs animate-pulse">
                          Today! 🎂
                        </span>
                      ) : isUpcoming7 ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                          In {metrics?.daysUntil} days
                        </span>
                      ) : metrics ? (
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formatDate(metrics.nextBirthday)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-rose-500 font-bold">Missing DOB</span>
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate" title={recipientName}>
                      {recipientName}
                    </h4>
                    <p className="text-[11px] text-slate-400 truncate mb-3 flex items-center gap-1">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span>{entityName}</span>
                    </p>

                    {/* Birthday & Age Badges */}
                    <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-medium text-[11px]">DOB (DD/MM/YYYY):</span>
                        {hasDob ? (
                          <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                            {metrics?.formattedDate || formatDate(dob)}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleOpenDobModal(item)}
                            className="text-rose-600 font-bold hover:underline text-[11px]"
                          >
                            + Add DOB
                          </button>
                        )}
                      </div>

                      {metrics?.turningAge && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium text-[11px]">Turning Age:</span>
                          <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                            {metrics.turningAge} Years
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-medium text-[11px]">Mobile:</span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                          {item.mobile || '---'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                    <button
                      onClick={() => handleOpenDobModal(item)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="h-3 w-3" />
                      <span>Edit DOB</span>
                    </button>

                    {item.mobile ? (
                      <button
                        onClick={() => handleDirectWish(item)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer active:scale-95"
                      >
                        <Send className="h-3 w-3" />
                        <span>Wish on WhatsApp</span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No Mobile</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal 1: WhatsApp Template & Firm Settings ── */}
      {isSettingsOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl p-6 space-y-5">
            
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                    Customize WhatsApp Birthday Message
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Set default message sent when you click "Wish on WhatsApp"
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Firm Name Setting */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-indigo-500" />
                <span>Your Firm / Practice Name</span>
              </label>
              <input
                type="text"
                value={firmNameDraft}
                onChange={e => setFirmNameDraft(e.target.value)}
                placeholder="e.g. Sharma & Associates, Chartered Accountants"
                className="w-full h-10 px-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <p className="text-[10px] text-slate-400">This replaces the <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-indigo-600 font-mono">{'{firmName}'}</code> tag in messages.</p>
            </div>

            {/* Quick Presets Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>Pre-formatted Professional Presets</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESET_BIRTHDAY_TEMPLATES.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => setTemplateDraft(preset.text)}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-600 text-left bg-slate-50/70 hover:bg-white dark:bg-slate-800/40 dark:hover:bg-slate-800 transition-all cursor-pointer group"
                  >
                    <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 block">
                      {preset.label}
                    </span>
                    <span className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                      {preset.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Variable Chips */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Click Variable to Insert:
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { tag: '{name}', label: 'Recipient Name' },
                  { tag: '{tradeName}', label: 'Business / Firm Name' },
                  { tag: '{age}', label: 'Turning Age (e.g. 45th)' },
                  { tag: '{firmName}', label: 'Firm Name' }
                ].map(v => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => setTemplateDraft(prev => `${prev} ${v.tag}`)}
                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-semibold border border-indigo-200 dark:border-indigo-800 transition-all cursor-pointer"
                  >
                    + {v.label} <span className="font-mono opacity-60">({v.tag})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Template Textarea */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Message Content:
              </label>
              <textarea
                rows={7}
                value={templateDraft}
                onChange={e => setTemplateDraft(e.target.value)}
                className="w-full p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-sans leading-relaxed"
                placeholder="Type your WhatsApp greeting message here..."
              />
            </div>

            {/* Live WhatsApp Bubble Preview */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Live WhatsApp Chat Bubble Preview
              </span>
              <div className="bg-[#EFEAE2] dark:bg-[#0b141a] p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex justify-end">
                <div className="max-w-[85%] bg-[#DCF8C6] dark:bg-[#005c4b] text-slate-900 dark:text-white p-3 rounded-2xl rounded-tr-none shadow-xs text-xs whitespace-pre-wrap font-sans leading-relaxed relative">
                  {generateBirthdayWish(
                    templateDraft, 
                    { id: 'sample', legalName: 'Shri Rajesh Gupta', tradeName: 'Gupta Enterprises', mobile: '9876543210', email: '', status: 'Active', createdAt: 0 },
                    firmNameDraft || 'Chartered Accountants',
                    42,
                    'Shri Rajesh Gupta'
                  )}
                  <div className="flex items-center justify-end gap-1 text-[9px] text-slate-500 dark:text-slate-300 mt-1.5">
                    <span>10:30 AM</span>
                    <span className="text-sky-600 dark:text-sky-400 font-bold">✓✓</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Test Send Input */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <input
                type="text"
                placeholder="Enter mobile to test (e.g. 9876543210)"
                value={testMobile}
                onChange={e => setTestMobile(e.target.value)}
                className="flex-1 h-9 px-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono outline-none"
              />
              <button
                type="button"
                onClick={handleSendTestWhatsApp}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Test WhatsApp</span>
              </button>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal 2: Set / Edit Client or Partner Date of Birth ── */}
      {isDobModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 w-full max-w-lg shadow-2xl p-6 space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-pink-50 text-pink-600 dark:bg-pink-950 dark:text-pink-400 flex items-center justify-center">
                  <Cake className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                    {selectedClientForDob ? 'Update Date of Birth' : 'Add Client / Partner Date of Birth'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Saves to profile across GST & Income Tax systems
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsDobModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* If no client selected, show client search / picker */}
            {!selectedClientForDob ? (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Select Client / Firm:
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search client by name, trade name, GSTIN or PAN..."
                    value={clientSearchInModal}
                    onChange={e => setClientSearchInModal(e.target.value)}
                    className="w-full h-9.5 pl-8.5 pr-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto no-scrollbar divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/40">
                  {modalClientOptions.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedClientForDob(c);
                        setSelectedRecipientTarget('entity');
                        setDobInputVal(getClientDob(c));
                      }}
                      className="w-full text-left p-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors flex items-center justify-between group cursor-pointer"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600">
                          {c.tradeName || c.legalName}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {c.legalName} • {c.mobile || 'No Mobile'}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-600 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Selected Client / Firm</span>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {selectedClientForDob.tradeName || selectedClientForDob.legalName}
                    </p>
                    <p className="text-[11px] text-slate-500">{selectedClientForDob.legalName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClientForDob(null);
                      setSelectedRecipientTarget('entity');
                      setDobInputVal('');
                    }}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                {/* Target Selector: Primary Client or Partner / Member */}
                {(() => {
                  const gstSh = selectedClientForDob.gstProfile?.stakeholders || [];
                  const itSh = selectedClientForDob.itProfile?.stakeholders || [];
                  const allSh = [...gstSh];
                  itSh.forEach(s => {
                    if (!allSh.some(existing => existing.pan === s.pan && existing.name === s.name)) {
                      allSh.push(s);
                    }
                  });

                  if (allSh.length === 0) return null;

                  return (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-indigo-500" />
                        <span>Update DOB For:</span>
                      </label>
                      <select
                        value={selectedRecipientTarget}
                        onChange={e => {
                          const val = e.target.value;
                          setSelectedRecipientTarget(val);
                          if (val === 'entity') {
                            setDobInputVal(getClientDob(selectedClientForDob));
                          } else {
                            const found = allSh.find((s, idx) => s.id === val || `idx_${idx}` === val);
                            setDobInputVal(found?.dob || '');
                          }
                        }}
                        className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="entity">Primary Client / Firm ({selectedClientForDob.legalName || selectedClientForDob.tradeName})</option>
                        {allSh.map((s, idx) => (
                          <option key={s.id || idx} value={s.id || `idx_${idx}`}>
                            {s.name || `Partner ${idx + 1}`} ({s.designation || 'Partner/Member'}) {s.dob ? `[DOB: ${formatDate(s.dob)}]` : '[No DOB]'}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Date of Birth Input */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                  <span>Date of Birth (DOB)</span>
                </label>
                {dobInputVal && (
                  <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                    {formatDate(dobInputVal)} (DD/MM/YYYY)
                  </span>
                )}
              </div>
              <input
                type="date"
                value={dobInputVal}
                onChange={e => setDobInputVal(e.target.value)}
                className="w-full h-10 px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 uppercase"
              />
              <p className="text-[10px] text-slate-400">
                Format: <strong className="font-mono text-indigo-600 dark:text-indigo-400">DD/MM/YYYY</strong>. Automatically stored on the profile and reflected across GST & Income Tax systems.
              </p>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsDobModalOpen(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingDob || !selectedClientForDob || !dobInputVal}
                onClick={handleSaveClientDob}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isSavingDob ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Save Date of Birth</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal 3: Preview / Edit Custom Message before WhatsApp Send ── */}
      {previewRecipient && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 w-full max-w-lg shadow-2xl p-6 space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                    Send WhatsApp Greeting
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    To: {previewRecipient.recipientName} ({previewRecipient.mobile || 'No Mobile'})
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setPreviewRecipient(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Personalized Message (Editable):
              </label>
              <textarea
                rows={8}
                value={customMsgText}
                onChange={e => setCustomMsgText(e.target.value)}
                className="w-full p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-sans leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPreviewRecipient(null)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendCustomWish}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Open WhatsApp & Send</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default BirthdayWishes;
