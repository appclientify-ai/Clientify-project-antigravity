import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import Loader from '../../components/Loader';
import { YEARS, FY_MONTHS, FY_QUARTERS } from '../Compliance/GSTReturn/filinglogic/MonthlyFilingLogic';
import { formatDate, formatISOToDDMMYYYY } from '../../dateUtils';
import { 
  Calendar, Clock, AlertTriangle, CheckCircle2, Copy, Share2, 
  Printer, Download, RefreshCw, Sliders, Sparkles, Filter, 
  Search, ArrowUpRight, FileText, Building2, Bell, ExternalLink,
  ShieldAlert, Send, Check, ChevronRight, X
} from 'lucide-react';
import { toast } from 'sonner';

export type ReturnCategory = 
  | 'ALL'
  | 'GST_MONTHLY' 
  | 'GST_QUARTERLY' 
  | 'GST_COMPOSITION' 
  | 'INCOME_TAX' 
  | 'TDS_TCS'
  | 'ADVANCE_TAX'
  | 'ROC_MCA'
  | 'ANNUAL_RETURNS';

export interface ComplianceDefinition {
  moduleId: string;
  formName: string;
  title: string;
  statutoryAct: string;
  section: string;
  category: ReturnCategory;
  periodType: 'Monthly' | 'Quarterly' | 'Annual' | 'Instalment';
  periods: string[];
  defaultDay: string;
  viewRoute?: string;
  badgeColor: 'indigo' | 'emerald' | 'amber' | 'blue' | 'rose' | 'purple' | 'cyan';
}

export const COMPLIANCE_REGISTRY: ComplianceDefinition[] = [
  // GST Monthly
  {
    moduleId: 'monthly_r1',
    formName: 'GSTR-1',
    title: 'Outward Supplies Statement (Monthly)',
    statutoryAct: 'CGST Act, 2017',
    section: 'Section 37',
    category: 'GST_MONTHLY',
    periodType: 'Monthly',
    periods: FY_MONTHS,
    defaultDay: '11',
    viewRoute: 'compliance-monthly',
    badgeColor: 'indigo'
  },
  {
    moduleId: 'monthly_r3b',
    formName: 'GSTR-3B',
    title: 'Monthly Summary Return & Tax Settlement',
    statutoryAct: 'CGST Act, 2017',
    section: 'Section 39(1)',
    category: 'GST_MONTHLY',
    periodType: 'Monthly',
    periods: FY_MONTHS,
    defaultDay: '20',
    viewRoute: 'compliance-monthly',
    badgeColor: 'emerald'
  },
  // GST Quarterly (QRMP)
  {
    moduleId: 'quarterly_iff',
    formName: 'IFF / GSTR-1',
    title: 'Invoice Furnishing Facility (QRMP)',
    statutoryAct: 'CGST Act, 2017',
    section: 'Rule 59(2)',
    category: 'GST_QUARTERLY',
    periodType: 'Quarterly',
    periods: FY_QUARTERS,
    defaultDay: '13',
    viewRoute: 'compliance-quarterly',
    badgeColor: 'blue'
  },
  {
    moduleId: 'quarterly_r3b',
    formName: 'GSTR-3B (QRMP)',
    title: 'Quarterly Summary Return & Tax Payment',
    statutoryAct: 'CGST Act, 2017',
    section: 'Section 39(1)',
    category: 'GST_QUARTERLY',
    periodType: 'Quarterly',
    periods: FY_QUARTERS,
    defaultDay: '22',
    viewRoute: 'compliance-quarterly',
    badgeColor: 'emerald'
  },
  // GST Composition
  {
    moduleId: 'composition_cmp08',
    formName: 'CMP-08',
    title: 'Composition Quarterly Tax Challan Statement',
    statutoryAct: 'CGST Act, 2017',
    section: 'Section 10 & Rule 62',
    category: 'GST_COMPOSITION',
    periodType: 'Quarterly',
    periods: FY_QUARTERS,
    defaultDay: '18',
    viewRoute: 'compliance-composition',
    badgeColor: 'amber'
  },
  {
    moduleId: 'annual_gstr4',
    formName: 'GSTR-4',
    title: 'Composition Annual Return',
    statutoryAct: 'CGST Act, 2017',
    section: 'Section 39(2)',
    category: 'GST_COMPOSITION',
    periodType: 'Annual',
    periods: ['Annual'],
    defaultDay: '30-04',
    viewRoute: 'compliance-gstr4',
    badgeColor: 'amber'
  },
  // Income Tax & Audit
  {
    moduleId: 'itr_return',
    formName: 'ITR (Non-Audit)',
    title: 'Income Tax Return (Individuals, HUF & Non-Audit Firms)',
    statutoryAct: 'Income Tax Act, 1961',
    section: 'Section 139(1)',
    category: 'INCOME_TAX',
    periodType: 'Annual',
    periods: ['Annual'],
    defaultDay: '31-07',
    viewRoute: 'compliance-itr',
    badgeColor: 'rose'
  },
  {
    moduleId: 'audit_tax',
    formName: 'Tax Audit (3CA/3CD)',
    title: 'Statutory Tax Audit Report Filing',
    statutoryAct: 'Income Tax Act, 1961',
    section: 'Section 44AB',
    category: 'INCOME_TAX',
    periodType: 'Annual',
    periods: ['Annual'],
    defaultDay: '30-09',
    viewRoute: 'compliance-taxaudit',
    badgeColor: 'purple'
  },
  {
    moduleId: 'itr_audit',
    formName: 'ITR (Audit / Corporate)',
    title: 'Income Tax Return (Companies & Audited Entities)',
    statutoryAct: 'Income Tax Act, 1961',
    section: 'Section 139(1)',
    category: 'INCOME_TAX',
    periodType: 'Annual',
    periods: ['Annual'],
    defaultDay: '31-10',
    viewRoute: 'compliance-itr',
    badgeColor: 'rose'
  },
  {
    moduleId: 'audit_bs',
    formName: 'Balance Sheet & Accounts',
    title: 'Annual Financial Statements Preparation Target',
    statutoryAct: 'Accounting Standards / Companies Act',
    section: 'Financial Finalization',
    category: 'INCOME_TAX',
    periodType: 'Annual',
    periods: ['Annual'],
    defaultDay: '15-09',
    viewRoute: 'compliance-taxaudit',
    badgeColor: 'blue'
  },
  // TDS & TCS
  {
    moduleId: 'tds_challan',
    formName: 'TDS Challan 281',
    title: 'Monthly TDS / TCS Statutory Payment to Govt',
    statutoryAct: 'Income Tax Act, 1961',
    section: 'Section 200(1) & Rule 30',
    category: 'TDS_TCS',
    periodType: 'Monthly',
    periods: FY_MONTHS,
    defaultDay: '07',
    badgeColor: 'cyan'
  },
  {
    moduleId: 'tds_quarterly',
    formName: 'TDS Return (24Q/26Q/27Q)',
    title: 'Quarterly TDS Return Electronic Statement',
    statutoryAct: 'Income Tax Act, 1961',
    section: 'Section 200(3)',
    category: 'TDS_TCS',
    periodType: 'Quarterly',
    periods: FY_QUARTERS,
    defaultDay: '31',
    badgeColor: 'indigo'
  },
  // Advance Tax
  {
    moduleId: 'adv_tax_q1',
    formName: 'Advance Tax (15%)',
    title: '1st Instalment of Advance Tax for FY',
    statutoryAct: 'Income Tax Act, 1961',
    section: 'Section 211',
    category: 'ADVANCE_TAX',
    periodType: 'Instalment',
    periods: ['1st Instalment (15%)'],
    defaultDay: '15-06',
    badgeColor: 'emerald'
  },
  {
    moduleId: 'adv_tax_q2',
    formName: 'Advance Tax (45%)',
    title: '2nd Instalment of Advance Tax for FY',
    statutoryAct: 'Income Tax Act, 1961',
    section: 'Section 211',
    category: 'ADVANCE_TAX',
    periodType: 'Instalment',
    periods: ['2nd Instalment (45%)'],
    defaultDay: '15-09',
    badgeColor: 'emerald'
  },
  {
    moduleId: 'adv_tax_q3',
    formName: 'Advance Tax (75%)',
    title: '3rd Instalment of Advance Tax for FY',
    statutoryAct: 'Income Tax Act, 1961',
    section: 'Section 211',
    category: 'ADVANCE_TAX',
    periodType: 'Instalment',
    periods: ['3rd Instalment (75%)'],
    defaultDay: '15-12',
    badgeColor: 'emerald'
  },
  {
    moduleId: 'adv_tax_q4',
    formName: 'Advance Tax (100%)',
    title: '4th & Final Instalment of Advance Tax',
    statutoryAct: 'Income Tax Act, 1961',
    section: 'Section 211',
    category: 'ADVANCE_TAX',
    periodType: 'Instalment',
    periods: ['4th Instalment (100%)'],
    defaultDay: '15-03',
    badgeColor: 'emerald'
  },
  // ROC & MCA
  {
    moduleId: 'roc_dpt3',
    formName: 'Form DPT-3',
    title: 'Annual Return of Deposits & Non-Deposit Loans',
    statutoryAct: 'Companies Act, 2013',
    section: 'Section 73 & Rule 16',
    category: 'ROC_MCA',
    periodType: 'Annual',
    periods: ['Annual'],
    defaultDay: '30-06',
    badgeColor: 'purple'
  },
  {
    moduleId: 'roc_dir3_kyc',
    formName: 'DIR-3 KYC',
    title: 'Annual Director KYC Verification (MCA)',
    statutoryAct: 'Companies Act, 2013',
    section: 'Rule 12A (DIR Rules)',
    category: 'ROC_MCA',
    periodType: 'Annual',
    periods: ['Annual'],
    defaultDay: '30-09',
    badgeColor: 'purple'
  },
  {
    moduleId: 'roc_aoc4',
    formName: 'Form AOC-4',
    title: 'Annual Financial Statements Filing with ROC',
    statutoryAct: 'Companies Act, 2013',
    section: 'Section 137',
    category: 'ROC_MCA',
    periodType: 'Annual',
    periods: ['Annual'],
    defaultDay: '29-10',
    badgeColor: 'blue'
  },
  {
    moduleId: 'roc_mgt7',
    formName: 'Form MGT-7 / 7A',
    title: 'Annual Return of Company with ROC',
    statutoryAct: 'Companies Act, 2013',
    section: 'Section 92(4)',
    category: 'ROC_MCA',
    periodType: 'Annual',
    periods: ['Annual'],
    defaultDay: '28-11',
    badgeColor: 'blue'
  },
  {
    moduleId: 'roc_llp11',
    formName: 'LLP Form 11',
    title: 'Annual Return of Limited Liability Partnership',
    statutoryAct: 'LLP Act, 2008',
    section: 'Rule 25(1)',
    category: 'ROC_MCA',
    periodType: 'Annual',
    periods: ['Annual'],
    defaultDay: '30-05',
    badgeColor: 'cyan'
  },
  {
    moduleId: 'roc_llp8',
    formName: 'LLP Form 8',
    title: 'Statement of Account & Solvency for LLPs',
    statutoryAct: 'LLP Act, 2008',
    section: 'Rule 24',
    category: 'ROC_MCA',
    periodType: 'Annual',
    periods: ['Annual'],
    defaultDay: '30-10',
    badgeColor: 'cyan'
  },
  // GST Annual Returns
  {
    moduleId: 'annual_gstr9',
    formName: 'GSTR-9',
    title: 'GST Annual Return (Regular Taxpayers)',
    statutoryAct: 'CGST Act, 2017',
    section: 'Section 44',
    category: 'ANNUAL_RETURNS',
    periodType: 'Annual',
    periods: ['Annual'],
    defaultDay: '31-12',
    viewRoute: 'compliance-gstr9',
    badgeColor: 'indigo'
  },
  {
    moduleId: 'annual_gstr9c',
    formName: 'GSTR-9C',
    title: 'GST Annual Reconciliation Certification',
    statutoryAct: 'CGST Act, 2017',
    section: 'Section 44(2)',
    category: 'ANNUAL_RETURNS',
    periodType: 'Annual',
    periods: ['Annual'],
    defaultDay: '31-12',
    viewRoute: 'compliance-gstr9',
    badgeColor: 'emerald'
  }
];

export const CATEGORIES: { id: ReturnCategory; label: string; count?: number }[] = [
  { id: 'ALL', label: 'All Statutory' },
  { id: 'GST_MONTHLY', label: 'GST Monthly' },
  { id: 'GST_QUARTERLY', label: 'GST Quarterly' },
  { id: 'GST_COMPOSITION', label: 'Composition' },
  { id: 'INCOME_TAX', label: 'Income Tax & Audit' },
  { id: 'TDS_TCS', label: 'TDS & TCS' },
  { id: 'ADVANCE_TAX', label: 'Advance Tax' },
  { id: 'ROC_MCA', label: 'ROC & MCA' },
  { id: 'ANNUAL_RETURNS', label: 'Annual Returns' },
];

export const calculateDefaultDueDate = (moduleId: string, yearStr: string, period: string): string => {
  const startYear = parseInt(yearStr.split('-')[0], 10) || 2024;
  const endYear = startYear + 1;

  // Monthly GST
  if (moduleId === 'monthly_r1' || moduleId === 'monthly_r3b') {
    const dueDay = moduleId === 'monthly_r1' ? '11' : '20';
    const monthMap: Record<string, { year: number; dueMonth: string }> = {
      April: { year: startYear, dueMonth: '05' },
      May: { year: startYear, dueMonth: '06' },
      June: { year: startYear, dueMonth: '07' },
      July: { year: startYear, dueMonth: '08' },
      August: { year: startYear, dueMonth: '09' },
      September: { year: startYear, dueMonth: '10' },
      October: { year: startYear, dueMonth: '11' },
      November: { year: startYear, dueMonth: '12' },
      December: { year: endYear, dueMonth: '01' },
      January: { year: endYear, dueMonth: '02' },
      February: { year: endYear, dueMonth: '03' },
      March: { year: endYear, dueMonth: '04' },
    };
    const info = monthMap[period];
    if (info) return `${info.year}-${info.dueMonth}-${dueDay}`;
  }

  // Monthly TDS Challan
  if (moduleId === 'tds_challan') {
    const monthMap: Record<string, { year: number; dueMonth: string; dueDay: string }> = {
      April: { year: startYear, dueMonth: '05', dueDay: '07' },
      May: { year: startYear, dueMonth: '06', dueDay: '07' },
      June: { year: startYear, dueMonth: '07', dueDay: '07' },
      July: { year: startYear, dueMonth: '08', dueDay: '07' },
      August: { year: startYear, dueMonth: '09', dueDay: '07' },
      September: { year: startYear, dueMonth: '10', dueDay: '07' },
      October: { year: startYear, dueMonth: '11', dueDay: '07' },
      November: { year: startYear, dueMonth: '12', dueDay: '07' },
      December: { year: endYear, dueMonth: '01', dueDay: '07' },
      January: { year: endYear, dueMonth: '02', dueDay: '07' },
      February: { year: endYear, dueMonth: '03', dueDay: '07' },
      March: { year: endYear, dueMonth: '04', dueDay: '30' },
    };
    const info = monthMap[period];
    if (info) return `${info.year}-${info.dueMonth}-${info.dueDay}`;
  }

  // Quarterly GST & Composition
  if (moduleId === 'quarterly_iff' || moduleId === 'quarterly_r3b') {
    const isIff = moduleId === 'quarterly_iff';
    const day = isIff ? '13' : '22';
    if (period.includes('Q1')) return `${startYear}-07-${day}`;
    if (period.includes('Q2')) return `${startYear}-10-${day}`;
    if (period.includes('Q3')) return `${endYear}-01-${day}`;
    if (period.includes('Q4')) return `${endYear}-04-${day}`;
  }

  if (moduleId === 'composition_cmp08') {
    if (period.includes('Q1')) return `${startYear}-07-18`;
    if (period.includes('Q2')) return `${startYear}-10-18`;
    if (period.includes('Q3')) return `${endYear}-01-18`;
    if (period.includes('Q4')) return `${endYear}-04-18`;
  }

  // Quarterly TDS Returns
  if (moduleId === 'tds_quarterly') {
    if (period.includes('Q1')) return `${startYear}-07-31`;
    if (period.includes('Q2')) return `${startYear}-10-31`;
    if (period.includes('Q3')) return `${endYear}-01-31`;
    if (period.includes('Q4')) return `${endYear}-05-31`;
  }

  // Advance Tax
  if (moduleId === 'adv_tax_q1') return `${startYear}-06-15`;
  if (moduleId === 'adv_tax_q2') return `${startYear}-09-15`;
  if (moduleId === 'adv_tax_q3') return `${startYear}-12-15`;
  if (moduleId === 'adv_tax_q4') return `${endYear}-03-15`;

  // ROC & MCA
  if (moduleId === 'roc_dpt3') return `${endYear}-06-30`;
  if (moduleId === 'roc_dir3_kyc') return `${endYear}-09-30`;
  if (moduleId === 'roc_aoc4') return `${endYear}-10-29`;
  if (moduleId === 'roc_mgt7') return `${endYear}-11-28`;
  if (moduleId === 'roc_llp11') return `${endYear}-05-30`;
  if (moduleId === 'roc_llp8') return `${endYear}-10-30`;

  // Income Tax & Audit
  if (moduleId === 'audit_bs') return `${endYear}-09-15`;
  if (moduleId === 'audit_tax') return `${endYear}-09-30`;
  if (moduleId === 'itr_return') return `${endYear}-07-31`;
  if (moduleId === 'itr_audit') return `${endYear}-10-31`;
  if (moduleId === 'annual_gstr4') return `${endYear}-04-30`;
  if (moduleId === 'annual_gstr9') return `${endYear}-12-31`;
  if (moduleId === 'annual_gstr9c') return `${endYear}-12-31`;

  return '';
};

interface DueDateSettingProps {
  onViewChange?: (view: any, extra?: any) => void;
}

export const DueDateSetting: React.FC<DueDateSettingProps> = ({ onViewChange }) => {
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState(YEARS[0] || '2026-27');
  const [activeCategory, setActiveCategory] = useState<ReturnCategory>('ALL');
  const [activeViewMode, setActiveViewMode] = useState<'timeline' | 'matrix'>('timeline');
  const [dates, setDates] = useState<Record<string, string>>({});
  const [extensions, setExtensions] = useState<Record<string, { notifNo: string; remarks: string }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'URGENT' | 'THIS_MONTH' | 'OVERDUE' | 'EXTENDED'>('ALL');

  // Modal State for Client Reminder Notice Generator
  const [reminderModalData, setReminderModalData] = useState<{
    formName: string;
    title: string;
    period: string;
    dueDate: string;
    section: string;
  } | null>(null);

  // Modal State for Extension Details
  const [extensionModalKey, setExtensionModalKey] = useState<string | null>(null);
  const [extensionInput, setExtensionInput] = useState({ notifNo: '', remarks: '' });

  const STORAGE_KEY = 'clientify_global_compliance_dates_v1';
  const EXTENSIONS_STORAGE_KEY = 'clientify_compliance_extensions_v1';

  useEffect(() => {
    const load = async () => {
      try {
        const [savedDates, savedExtensions] = await Promise.all([
          api.getAppData(STORAGE_KEY),
          api.getAppData(EXTENSIONS_STORAGE_KEY)
        ]);
        if (savedDates) setDates(savedDates);
        if (savedExtensions) setExtensions(savedExtensions);
      } catch (e) {
        console.error('Failed to load compliance dates/extensions:', e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
    const syncHandler = () => load();
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, []);

  const getDateValue = (moduleId: string, period: string) => {
    const key = `${moduleId}_${selectedYear}_${period}`;
    return dates[key] || calculateDefaultDueDate(moduleId, selectedYear, period);
  };

  const handleDateChange = (moduleId: string, period: string, value: string) => {
    const key = `${moduleId}_${selectedYear}_${period}`;
    setDates(prev => ({ ...prev, [key]: value }));
  };

  const handleAutoSetDefaults = () => {
    const nextDates = { ...dates };
    YEARS.forEach(yr => {
      COMPLIANCE_REGISTRY.forEach(comp => {
        comp.periods.forEach(p => {
          const k = `${comp.moduleId}_${yr}_${p}`;
          if (!nextDates[k]) {
            nextDates[k] = calculateDefaultDueDate(comp.moduleId, yr, p);
          }
        });
      });
    });
    setDates(nextDates);
    toast.success('Populated all official statutory default due dates');
  };

  const handleSave = async () => {
    setIsSaving(true);
    const finalDates = { ...dates };

    // Fill any missing for selected year
    COMPLIANCE_REGISTRY.forEach(comp => {
      comp.periods.forEach(p => {
        const k = `${comp.moduleId}_${selectedYear}_${p}`;
        if (!finalDates[k]) {
          finalDates[k] = calculateDefaultDueDate(comp.moduleId, selectedYear, p);
        }
      });
    });

    setDates(finalDates);
    try {
      await Promise.all([
        api.patchAppData(STORAGE_KEY, Object.fromEntries(Object.entries(finalDates).map(([k, v]) => [`data.${k}`, v]))),
        api.patchAppData(EXTENSIONS_STORAGE_KEY, Object.fromEntries(Object.entries(extensions).map(([k, v]) => [`data.${k}`, v])))
      ]);
      queryClient.invalidateQueries({ queryKey: ['due_dates'] });
      socketService.emit('data_updated', { type: 'due_dates' });
      window.dispatchEvent(new Event('clientify_db_change'));
      toast.success('Master Due Date Matrix synchronized successfully');
    } catch (e) {
      console.error(e);
      toast.error('Failed to sync master due dates');
    } finally {
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  const handleSaveExtension = (key: string) => {
    setExtensions(prev => ({
      ...prev,
      [key]: { ...extensionInput }
    }));
    setExtensionModalKey(null);
    toast.success('Government extension details recorded');
  };

  // Compile all flat deadline items for the selected year
  const allDeadlineItems = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const items: Array<{
      key: string;
      moduleId: string;
      formName: string;
      title: string;
      statutoryAct: string;
      section: string;
      category: ReturnCategory;
      period: string;
      dueDateStr: string;
      dueDateObj: Date;
      daysRemaining: number;
      isOverdue: boolean;
      isDueToday: boolean;
      isDueThisWeek: boolean;
      isDueThisMonth: boolean;
      viewRoute?: string;
      badgeColor: 'indigo' | 'emerald' | 'amber' | 'blue' | 'rose' | 'purple' | 'cyan';
      extension?: { notifNo: string; remarks: string };
    }> = [];

    COMPLIANCE_REGISTRY.forEach(comp => {
      comp.periods.forEach(p => {
        const key = `${comp.moduleId}_${selectedYear}_${p}`;
        const dueDateStr = getDateValue(comp.moduleId, p);
        const dueDateObj = new Date(dueDateStr);
        const validDate = !isNaN(dueDateObj.getTime());
        
        let daysRemaining = 999;
        let isOverdue = false;
        let isDueToday = false;
        let isDueThisWeek = false;
        let isDueThisMonth = false;

        if (validDate) {
          dueDateObj.setHours(0, 0, 0, 0);
          const diffMs = dueDateObj.getTime() - today.getTime();
          daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          isOverdue = daysRemaining < 0;
          isDueToday = daysRemaining === 0;
          isDueThisWeek = daysRemaining >= 0 && daysRemaining <= 7;
          isDueThisMonth = dueDateObj.getMonth() === today.getMonth() && dueDateObj.getFullYear() === today.getFullYear();
        }

        items.push({
          key,
          moduleId: comp.moduleId,
          formName: comp.formName,
          title: comp.title,
          statutoryAct: comp.statutoryAct,
          section: comp.section,
          category: comp.category,
          period: p,
          dueDateStr,
          dueDateObj,
          daysRemaining,
          isOverdue,
          isDueToday,
          isDueThisWeek,
          isDueThisMonth,
          viewRoute: comp.viewRoute,
          badgeColor: comp.badgeColor,
          extension: extensions[key]
        });
      });
    });

    // Sort by due date chronologically
    return items.sort((a, b) => a.dueDateObj.getTime() - b.dueDateObj.getTime());
  }, [selectedYear, dates, extensions]);

  // Filtered Deadline Items
  const filteredDeadlines = useMemo(() => {
    return allDeadlineItems.filter(item => {
      // Category filter
      if (activeCategory !== 'ALL' && item.category !== activeCategory) {
        return false;
      }
      // Status filter
      if (statusFilter === 'URGENT' && !item.isDueThisWeek && !item.isDueToday) return false;
      if (statusFilter === 'THIS_MONTH' && !item.isDueThisMonth) return false;
      if (statusFilter === 'OVERDUE' && !item.isOverdue) return false;
      if (statusFilter === 'EXTENDED' && !item.extension?.notifNo) return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesForm = item.formName.toLowerCase().includes(q);
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesSection = item.section.toLowerCase().includes(q);
        const matchesPeriod = item.period.toLowerCase().includes(q);
        const matchesDate = item.dueDateStr.includes(q) || formatDate(item.dueDateStr).toLowerCase().includes(q);
        return matchesForm || matchesTitle || matchesSection || matchesPeriod || matchesDate;
      }
      return true;
    });
  }, [allDeadlineItems, activeCategory, statusFilter, searchQuery]);

  // KPI Metrics
  const stats = useMemo(() => {
    const total = allDeadlineItems.length;
    const urgent = allDeadlineItems.filter(i => i.isDueThisWeek || i.isDueToday).length;
    const thisMonth = allDeadlineItems.filter(i => i.isDueThisMonth).length;
    const overdue = allDeadlineItems.filter(i => i.isOverdue).length;
    const extended = allDeadlineItems.filter(i => Boolean(i.extension?.notifNo)).length;
    return { total, urgent, thisMonth, overdue, extended };
  }, [allDeadlineItems]);

  const copyReminderMessage = (item: { formName: string; period: string; dueDateStr: string; section: string }) => {
    const msg = `*📢 STATUTORY COMPLIANCE DEADLINE ALERT*
━━━━━━━━━━━━━━━━━━━━━━━━
📋 *Compliance:* ${item.formName}
⏳ *Statutory Due Date:* ${formatDate(item.dueDateStr)}
🗓 *Applicable Period:* ${item.period}
⚖️ *Provision:* ${item.section}
━━━━━━━━━━━━━━━━━━━━━━━━
Dear Valued Client,
Kindly arrange to transmit your invoices, bank statements, and relevant records at the earliest to ensure timely statutory submission and avoid late fee penalties (Section 47) and interest (Section 50).

Thank you for your cooperation!`;

    navigator.clipboard.writeText(msg);
    toast.success('Compliance reminder message copied to clipboard');
  };

  const handlePrintCalendar = () => {
    window.print();
  };

  if (isLoading) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* 1. Header Toolbar */}
      <div className="relative z-50 flex flex-col gap-2.5 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs shrink-0 w-full max-w-full min-w-0 transition-colors">
        
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Title & Icon */}
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white flex items-center justify-center shadow-xs shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  Compliance Due Dates & Calendar
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  FY {selectedYear}
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Master Statutory Compliance Calendar • GST, Income Tax, TDS, Advance Tax & ROC Deadlines
              </p>
            </div>
          </div>

          {/* Controls: Mode Switch, Year Selector & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
              <button
                type="button"
                onClick={() => setActiveViewMode('timeline')}
                className={`h-7 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeViewMode === 'timeline'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Calendar & Runway</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveViewMode('matrix')}
                className={`h-7 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeViewMode === 'matrix'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Settings Matrix</span>
              </button>
            </div>

            {/* Financial Year Selector */}
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="h-8 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl px-2.5 text-xs font-black uppercase outline-none cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
            >
              {YEARS.map(y => <option key={y} value={y}>FY {y}</option>)}
            </select>

            {/* Action: Auto Defaults */}
            <button
              type="button"
              onClick={handleAutoSetDefaults}
              title="Populate statutory standard government dates"
              className="h-8 px-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span className="hidden sm:inline">Statutory Defaults</span>
            </button>

            {/* Action: Save Matrix */}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="h-8 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Syncing...' : 'Save Matrix'}</span>
            </button>

            {/* Action: Print */}
            <button
              type="button"
              onClick={handlePrintCalendar}
              title="Print Statutory Calendar"
              className="h-8 w-8 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 2. KPI Metrics Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
          <div 
            onClick={() => setStatusFilter('ALL')}
            className={`p-2 rounded-xl border cursor-pointer transition-all ${
              statusFilter === 'ALL'
                ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 shadow-2xs'
                : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Total Tracked</span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-base font-black text-slate-900 dark:text-white font-mono">{stats.total}</span>
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">Deadlines</span>
            </div>
          </div>

          <div 
            onClick={() => setStatusFilter('URGENT')}
            className={`p-2 rounded-xl border cursor-pointer transition-all ${
              statusFilter === 'URGENT'
                ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 shadow-2xs'
                : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 block">Due Next 7 Days</span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-base font-black text-amber-700 dark:text-amber-300 font-mono">{stats.urgent}</span>
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            </div>
          </div>

          <div 
            onClick={() => setStatusFilter('THIS_MONTH')}
            className={`p-2 rounded-xl border cursor-pointer transition-all ${
              statusFilter === 'THIS_MONTH'
                ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 shadow-2xs'
                : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">Due This Month</span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-base font-black text-emerald-700 dark:text-emerald-300 font-mono">{stats.thisMonth}</span>
              <span className="text-[10px] font-bold text-emerald-600">Active</span>
            </div>
          </div>

          <div 
            onClick={() => setStatusFilter('OVERDUE')}
            className={`p-2 rounded-xl border cursor-pointer transition-all ${
              statusFilter === 'OVERDUE'
                ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 shadow-2xs'
                : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="text-[9px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 block">Overdue / Expired</span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-base font-black text-rose-700 dark:text-rose-300 font-mono">{stats.overdue}</span>
              <span className="text-[10px] font-bold text-rose-600">Past</span>
            </div>
          </div>

          <div 
            onClick={() => setStatusFilter('EXTENDED')}
            className={`p-2 rounded-xl border cursor-pointer transition-all col-span-2 sm:col-span-1 ${
              statusFilter === 'EXTENDED'
                ? 'bg-purple-50/80 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800 shadow-2xs'
                : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="text-[9px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 block">Govt Extensions</span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-base font-black text-purple-700 dark:text-purple-300 font-mono">{stats.extended}</span>
              <span className="text-[10px] font-bold text-purple-600">Notified</span>
            </div>
          </div>
        </div>

        {/* 3. Filter Category Pills & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
          
          {/* Scrollable Categories */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`h-7 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                  activeCategory === cat.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search forms, acts, periods..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-7.5 pl-8 pr-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

      </div>

      {/* 2. Main Content Canvas */}
      <div className="relative z-10 flex-1 min-h-0 w-full max-w-full min-w-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden flex flex-col transition-colors">
        
        {/* VIEW 1: Interactive Timeline & Calendar Runway */}
        {activeViewMode === 'timeline' && (
          <div className="overflow-y-auto no-scrollbar flex-1 p-3 sm:p-5">
            {filteredDeadlines.length === 0 ? (
              <div className="py-24 text-center">
                <Calendar className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-600 dark:text-slate-400">No statutory deadlines match the criteria</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Try resetting the category filter or searching for another term.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredDeadlines.map(item => {
                  const days = item.daysRemaining;

                  let urgencyBadgeClass = 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
                  let urgencyText = `In ${days} days`;

                  if (item.isOverdue) {
                    urgencyBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900';
                    urgencyText = `Overdue (${Math.abs(days)}d ago)`;
                  } else if (item.isDueToday) {
                    urgencyBadgeClass = 'bg-rose-500 text-white border-rose-600 animate-pulse';
                    urgencyText = 'Due Today!';
                  } else if (item.isDueThisWeek) {
                    urgencyBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800';
                    urgencyText = days === 1 ? 'Due Tomorrow' : `In ${days} days`;
                  } else if (days <= 15) {
                    urgencyBadgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800';
                    urgencyText = `In ${days} days`;
                  }

                  return (
                    <div
                      key={item.key}
                      className="bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl p-3.5 border border-slate-200/80 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800/70 hover:shadow-xs transition-all flex flex-col justify-between space-y-3 group"
                    >
                      {/* Top Header Row */}
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-tight bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs">
                              {item.formName}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                              {item.period}
                            </span>
                          </div>

                          {/* Urgency Badge */}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shrink-0 ${urgencyBadgeClass}`}>
                            {urgencyText}
                          </span>
                        </div>

                        {/* Title & Section */}
                        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-1 leading-snug">
                          {item.title}
                        </h3>
                        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                          {item.statutoryAct} &bull; {item.section}
                        </p>
                      </div>

                      {/* Due Date Display & Govt Extension */}
                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            Statutory Due Date:
                          </span>
                          <span className="text-xs font-black font-mono text-slate-900 dark:text-white bg-slate-200/60 dark:bg-slate-700/60 px-2.5 py-0.5 rounded-md">
                            {formatDate(item.dueDateStr)}
                          </span>
                        </div>

                        {/* Official Extension Notice (if any) */}
                        {item.extension?.notifNo && (
                          <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-[10px] text-purple-700 dark:text-purple-300 font-bold flex items-center justify-between">
                            <span>Notif: {item.extension.notifNo}</span>
                            <span className="text-[9px] uppercase font-mono">Extended</span>
                          </div>
                        )}
                      </div>

                      {/* Actions Footer */}
                      <div className="flex items-center justify-between pt-1 gap-1.5">
                        {/* Copy / Broadcast Reminder */}
                        <button
                          type="button"
                          onClick={() => setReminderModalData({
                            formName: item.formName,
                            title: item.title,
                            period: item.period,
                            dueDate: item.dueDateStr,
                            section: item.section
                          })}
                          className="h-7 px-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                          title="Generate Client Compliance Reminder Notice"
                        >
                          <Send className="w-3 h-3" />
                          <span>Client Alert</span>
                        </button>

                        <div className="flex items-center gap-1">
                          {/* Quick Extension Record */}
                          <button
                            type="button"
                            onClick={() => {
                              setExtensionModalKey(item.key);
                              setExtensionInput({
                                notifNo: item.extension?.notifNo || '',
                                remarks: item.extension?.remarks || ''
                              });
                            }}
                            className="h-7 px-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-purple-950/60 text-slate-600 hover:text-purple-600 dark:text-slate-300 dark:hover:text-purple-400 border border-slate-200 dark:border-slate-700 text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                            title="Record Govt Extension Notification"
                          >
                            <Bell className="w-3 h-3" />
                            <span>Extension</span>
                          </button>

                          {/* Jump to Register (if linked) */}
                          {item.viewRoute && onViewChange && (
                            <button
                              type="button"
                              onClick={() => onViewChange(item.viewRoute)}
                              className="h-7 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                              title="Open Filing Register Module"
                            >
                              <span>Register</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: Due Date Settings Matrix */}
        {activeViewMode === 'matrix' && (
          <div className="overflow-y-auto no-scrollbar flex-1 p-4 sm:p-6 space-y-6">
            
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-black uppercase text-slate-900 dark:text-white">
                    Master Due Date Matrix Editor &bull; FY {selectedYear}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Adjust specific compliance due dates for your practice. Overrides take effect across all registers.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAutoSetDefaults}
                  className="h-7.5 px-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-all hover:bg-indigo-100 flex items-center gap-1.5 cursor-pointer self-start"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Populate Official Defaults</span>
                </button>
              </div>

              {COMPLIANCE_REGISTRY.map(comp => (
                <div 
                  key={comp.moduleId}
                  className="bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                        {comp.formName}
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        {comp.title}
                      </h4>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      {comp.statutoryAct} &bull; {comp.section}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                    {comp.periods.map(period => {
                      const val = getDateValue(comp.moduleId, period);
                      return (
                        <div key={period} className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate max-w-[120px]">
                              {period}
                            </span>
                            <span className="text-[9px] font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                              {formatISOToDDMMYYYY(val)}
                            </span>
                          </div>
                          
                          <input
                            type="date"
                            value={val || ''}
                            onChange={e => handleDateChange(comp.moduleId, period, e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 outline-none cursor-pointer focus:border-indigo-500"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}

      </div>

      {/* MODAL: Client Reminder Notice Generator */}
      {reminderModalData && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-black uppercase text-slate-900 dark:text-white">
                  Client Compliance Reminder Notice
                </h3>
              </div>
              <button 
                onClick={() => setReminderModalData(null)}
                className="h-7 w-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Send this ready-formatted statutory notice to your client broadcast list on WhatsApp or Email:
              </p>

              <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 font-mono text-[11px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
{`📢 STATUTORY COMPLIANCE DEADLINE ALERT
━━━━━━━━━━━━━━━━━━━━━━━━
📋 Compliance: ${reminderModalData.formName} - ${reminderModalData.title}
⏳ Statutory Due Date: ${formatDate(reminderModalData.dueDate)}
🗓 Applicable Period: ${reminderModalData.period}
⚖️ Provision: ${reminderModalData.section}
━━━━━━━━━━━━━━━━━━━━━━━━
Dear Valued Client,
Kindly arrange to transmit your invoices, bank statements, and relevant records at the earliest to ensure timely statutory submission and avoid late fee penalties (Section 47) and interest (Section 50).

Thank you for your cooperation!`}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReminderModalData(null)}
                  className="h-8.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    copyReminderMessage({
                      formName: reminderModalData.formName,
                      period: reminderModalData.period,
                      dueDateStr: reminderModalData.dueDate,
                      section: reminderModalData.section
                    });
                    setReminderModalData(null);
                  }}
                  className="h-8.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Notice</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Government Extension Details */}
      {extensionModalKey && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-purple-600" />
                <h3 className="text-xs font-black uppercase text-slate-900 dark:text-white">
                  Record Government Extension
                </h3>
              </div>
              <button 
                onClick={() => setExtensionModalKey(null)}
                className="h-7 w-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Official Notification / Circular No:
                </label>
                <input
                  type="text"
                  placeholder="e.g. CBIC Notification No. 14/2026-CT"
                  value={extensionInput.notifNo}
                  onChange={e => setExtensionInput(prev => ({ ...prev, notifNo: e.target.value }))}
                  className="w-full h-8 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Remarks / Reason:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Portal technical glitches / extended to all taxpayers"
                  value={extensionInput.remarks}
                  onChange={e => setExtensionInput(prev => ({ ...prev, remarks: e.target.value }))}
                  className="w-full h-8 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setExtensionModalKey(null)}
                  className="h-8.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveExtension(extensionModalKey)}
                  className="h-8.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Extension</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DueDateSetting;
