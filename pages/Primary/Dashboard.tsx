import { ErrorBoundary } from '../../components/ErrorBoundary.tsx';

import { useParams, useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useCallback, Suspense, lazy, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  Building2, Users, FileText, CheckCircle2, Clock, 
  Scale, ShieldAlert, AlertTriangle, ArrowRight, RefreshCw, 
  Receipt, Briefcase, FileCheck, Landmark, MessageSquare, 
  Calendar, Trash2, ChevronDown, Check, Sparkles, AlertCircle, ArrowUpRight
} from 'lucide-react';
import { useModuleData } from '../../hooks/useModuleData.ts';
import { MetricData, ActiveView, LitigationRecord, Client, InvoiceRecord } from '../../types.ts';
import { useAuth } from '../../auth/AuthContext.tsx';
import { useOffline } from '../../hooks/useOffline.ts';
import { usePWA } from '../../hooks/usePWA.ts';
import { api } from '../../services/api.ts';
import { socketService } from '../../services/socket.ts';

import Sidebar, { NavItem } from '../../components/Sidebar.tsx';
import MobileBottomNav from '../../components/MobileBottomNav.tsx';
import Header from '../../components/Header.tsx';
import Loader from '../../components/Loader.tsx';
import InstallBanner from '../../components/InstallBanner.tsx';
import CommandPalette from '../../components/CommandPalette.tsx';
import GSTClientFormModal from '../Clientform/GSTClientFormModal.tsx';
import ITClientFormModal from '../Clientform/ITClientFormModal.tsx';
import LitigationGuidelinesModal from '../../components/LitigationGuidelinesModal';
import { YEARS, FY_MONTHS, FY_QUARTERS, getDefaultPeriod, isClientVisibleInPeriod, periodToDate } from '../Compliance/GSTReturn/filinglogic/MonthlyFilingLogic';
import { formatDate } from '../../dateUtils.ts';

// Lazy loading sub-pages
const GSTPortfolio = lazy(() => import('../ClientHub/GSTPortfolio.tsx'));
const ITPortfolio = lazy(() => import('../ClientHub/ITPortfolio.tsx'));
const MonthlyFiling = lazy(() => import('../Compliance/GSTReturn/MonthlyFiling.tsx'));
const QuarterlyFiling = lazy(() => import('../Compliance/GSTReturn/QuarterlyFiling.tsx'));
const CompositionFiling = lazy(() => import('../Compliance/GSTReturn/CompositionFiling.tsx'));
const GSTR4 = lazy(() => import('../Compliance/AnnualReturns/GSTR4.tsx'));
const GSTR9_9C = lazy(() => import('../Compliance/AnnualReturns/GSTR9_9C.tsx'));
const ITRReturn = lazy(() => import('../Compliance/ITAudit/ITRReturn.tsx'));
const TAXAudit = lazy(() => import('../Compliance/ITAudit/TAXAudit.tsx'));
const NoticePending = lazy(() => import('../LitigationSuite/GSTNotices/NoticePending.tsx'));
const NoticeFiled = lazy(() => import('../LitigationSuite/GSTNotices/NoticeFiled.tsx'));
const NoticeDrop = lazy(() => import('../LitigationSuite/GSTNotices/NoticeDrop.tsx'));
const NoticeDemand = lazy(() => import('../LitigationSuite/GSTNotices/NoticeDemand.tsx'));
const AppealPending = lazy(() => import('../LitigationSuite/GSTAppeals/AppealPending.tsx'));
const AppealFiled = lazy(() => import('../LitigationSuite/GSTAppeals/AppealFiled.tsx'));
const AppealDrop = lazy(() => import('../LitigationSuite/GSTAppeals/AppealDrop.tsx'));
const AppealDemand = lazy(() => import('../LitigationSuite/GSTAppeals/AppealDemand.tsx'));
const TribunalPending = lazy(() => import('../LitigationSuite/Tribunal/TribunalPending.tsx'));
const TribunalFiled = lazy(() => import('../LitigationSuite/Tribunal/TribunalFiled.tsx'));
const TribunalDrop = lazy(() => import('../LitigationSuite/Tribunal/TribunalDrop.tsx'));
const TribunalDemand = lazy(() => import('../LitigationSuite/Tribunal/TribunalDemand.tsx'));
const CourtPending = lazy(() => import('../LitigationSuite/HighCourt/CourtPending.tsx'));
const CourtFiled = lazy(() => import('../LitigationSuite/HighCourt/CourtFiled.tsx'));
const CourtDrop = lazy(() => import('../LitigationSuite/HighCourt/CourtDrop.tsx'));
const CourtDemand = lazy(() => import('../LitigationSuite/HighCourt/CourtDemand.tsx'));
const GSTRegistration = lazy(() => import('../Miscellaneous/GSTRegistration.tsx'));
const FoodLicenses = lazy(() => import('../Miscellaneous/FoodLicenses.tsx'));
const MSMERegistration = lazy(() => import('../Miscellaneous/MSMERegistration.tsx'));
const Miscellaneouswork = lazy(() => import('../Miscellaneous/Miscellaneouswork.tsx'));
const Reminders = lazy(() => import('../Administration/Reminders.tsx'));
const Messenger = lazy(() => import('../Administration/Messenger.tsx'));
const Invoices = lazy(() => import('../Administration/invoice/Invoices.tsx'));
const AddInvoice = lazy(() => import('../Administration/invoice/addinvoice.tsx'));
const PaymentReceived = lazy(() => import('../Administration/invoice/PaymentReceived.tsx'));
const ClientLedger = lazy(() => import('../Administration/invoice/ClientLedger.tsx'));
const DueDateSetting = lazy(() => import('../Administration/DueDateSetting.tsx'));
const Setting = lazy(() => import('../Administration/Setting.tsx'));
const Trash = lazy(() => import('../Administration/Trash.tsx'));

const InvoiceSetting = lazy(() => import('../Administration/invoice/invoicesetting.tsx'));

const Dashboard: React.FC = () => {
  const { user, token } = useAuth();
  const isOnline = useOffline();
  const { installPrompt, triggerInstall } = usePWA();
  const { view } = useParams<{ view: string }>();
  const navigate = useNavigate();
  const activeView = (view as ActiveView) || 'dashboard';
  const [viewExtra, setViewExtra] = useState<any>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const queryClient = useQueryClient();

  // Quick Nav Modal State
  const [navigationFolder, setNavigationFolder] = useState<NavItem | null>(null);

  // Single optimized React Query for Dashboard Data via useModuleData
  const {
    data: dashboardResponse,
    isLoading: isDashboardLoading
  } = useModuleData('dashboard_data');

  const summary = dashboardResponse?.summary;
  const filingDataCache = useMemo(() => dashboardResponse?.filingDataCache || {}, [dashboardResponse]);

  const clients: Client[] = useMemo(() => summary?.clients || [], [summary]);
  const invoices: InvoiceRecord[] = useMemo(() => summary?.invoices || [], [summary]);
  const litigation: LitigationRecord[] = useMemo(() => summary?.litigation || [], [summary]);
  const miscWork: any[] = useMemo(() => summary?.work || [], [summary]);
  const gstReg: any[] = useMemo(() => summary?.gstReg || [], [summary]);
  const foodLic: any[] = useMemo(() => summary?.foodLic || [], [summary]);
  const msme: any[] = useMemo(() => summary?.msme || [], [summary]);
  const payments: any[] = useMemo(() => summary?.payments || [], [summary]);

  const isInitialLoad = isDashboardLoading && !dashboardResponse;

  // Form Modals
  const [isGstModalOpen, setIsGstModalOpen] = useState(false);
  const [isItModalOpen, setIsItModalOpen] = useState(false);
  const [isGuidelinesOpen, setIsGuidelinesOpen] = useState(false);
  const [guidelinesCategory, setGuidelinesCategory] = useState<string>('Notice');

  // Period Filters for Dashboard Boxes
  const def = getDefaultPeriod();

  const getCurrentAY = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const startYear = currentMonth >= 3 ? currentYear : currentYear - 1;
    return `${startYear}-${(startYear + 1).toString().slice(-2)}`;
  };

  const getPrevFY = (fy: string) => {
    const parts = fy.split('-');
    if (parts.length === 2) {
      const start = parseInt(parts[0], 10);
      const end = parseInt(parts[1], 10);
      return `${start - 1}-${(end - 1).toString().padStart(2, '0')}`;
    }
    return fy;
  };

  const [monthlyFilter, setMonthlyFilter] = useState({ year: def.year, month: def.month });
  const [quarterlyFilter, setQuarterlyFilter] = useState({ year: def.quarterYear, quarter: def.quarter });
  const [compositionFilter, setCompositionFilter] = useState({ year: def.quarterYear, quarter: def.quarter });
  const [annualFilter, setAnnualFilter] = useState({ year: getPrevFY(def.year) });
  const [itrFilter, setItrFilter] = useState({ ay: getCurrentAY() });

  useEffect(() => {
    if (isOnline) { 
      socketService.connect(); 
      let debounceTimer: any = null;
      const syncHandler = (e: any) => { 
        console.log('Real-time sync event received:', e.detail);
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['dashboard_data'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
          queryClient.invalidateQueries({ queryKey: ['filing_data_cache'] });
        }, 150);
      };
      window.addEventListener('clientify_db_change', syncHandler);
      return () => {
        window.removeEventListener('clientify_db_change', syncHandler);
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        socketService.disconnect();
      };
    }
  }, [isOnline, queryClient]);

  const handleViewChange = (view: ActiveView, extra?: any) => {
    navigate(`/${view}`);
    setViewExtra(extra || null);
    setNavigationFolder(null);
    window.scrollTo(0, 0);
  };

  const getFilingCounts = (type: 'monthly' | 'quarterly' | 'composition' | 'gstr4' | 'gstr9' | 'itr' | 'audit', periodKey: string) => {
    const keys: Record<string, string> = {
      monthly: 'clientify_monthly_filing_v3',
      quarterly: 'clientify_quarterly_filing_v3',
      composition: 'clientify_composition_filing_v3',
      gstr4: 'clientify_gstr4_filing_v1',
      gstr9: 'clientify_gstr9_filing_data_v2',
      itr: 'clientify_itr_filing_data_v2',
      audit: 'clientify_audit_fin_data_v3'
    };
    const storageKey = keys[type];
    const data = filingDataCache[storageKey] || {};
    
    let year = '';
    let month = '';
    let qrmpIsQuarterEnd = false;
    
    if (type === 'quarterly' || type === 'composition') {
      const [y, q] = periodKey.split('_');
      year = y;
      if (q && q.includes('Q1')) month = 'June';
      else if (q && q.includes('Q2')) month = 'September';
      else if (q && q.includes('Q3')) month = 'December';
      else if (q && q.includes('Q4')) month = 'March';
      else month = q || '';
      qrmpIsQuarterEnd = true;
    } else if (type === 'monthly') {
      const parts = periodKey.split('_');
      year = parts[0] || '';
      month = parts[1] || '';
    } else {
      year = periodKey; // annual
      month = 'March'; // default to end of FY
    }

    const actualPeriodKey = type === 'quarterly' ? `${year}_${month}` : periodKey;
    const periodData = data[actualPeriodKey] || {};
        
    let total = 0;
    let filed = 0;
    let r1 = 0;
    let r3b = 0;
    let cmp08 = 0;
    
    const isFiled = (val: any) => val === true || val === 'Filed';

    if (type === 'monthly') {
      const applicable = (clients || []).filter(c => c && c.gstProfile?.regType === 'Regular' && c.gstProfile?.filingFreq === 'Monthly' && isClientVisibleInPeriod(c, year, month));
      total = applicable.length;
      r1 = applicable.filter(c => isFiled(periodData[c.id]?.r1)).length;
      r3b = applicable.filter(c => isFiled(periodData[c.id]?.r3b)).length;
      filed = r3b;
    } else if (type === 'quarterly') {
      const checkQrmpVisibility = (c: Client) => {
        if (!c || !c.gstProfile) return false;
        const visibleInMonth = isClientVisibleInPeriod(c, year, month);
        if (qrmpIsQuarterEnd) {
          if (c.gstProfile.cancelDate && c.gstProfile.gstStatus === 'Closed') {
            const cancelDate = new Date(c.gstProfile.cancelDate);
            if (!isNaN(cancelDate.getTime())) {
              const periodDate = periodToDate(year, month);
              const lastVisibleMonthDate = new Date(cancelDate.getFullYear(), cancelDate.getMonth(), 1);
              if (periodDate > lastVisibleMonthDate) return true;
            }
          }
        }
        return visibleInMonth;
      };
      const applicable = (clients || []).filter(c => c && c.gstProfile?.regType === 'Regular' && c.gstProfile?.filingFreq === 'Quarterly' && checkQrmpVisibility(c));
      total = applicable.length;
      r1 = applicable.filter(c => isFiled(periodData[c.id]?.r1)).length;
      r3b = applicable.filter(c => isFiled(periodData[c.id]?.r3b)).length;
      filed = r3b;
    } else if (type === 'composition') {
      const applicable = (clients || []).filter(c => c && c.gstProfile?.regType === 'Composition' && isClientVisibleInPeriod(c, year, month));
      total = applicable.length;
      cmp08 = applicable.filter(c => isFiled(periodData[c.id]?.cmp08)).length;
      filed = cmp08;
    } else if (type === 'itr') {
      const applicable = (clients || []).filter(c => c && c.itProfile && (c.status === 'Active' || c.status === 'Active Filing'));
      total = applicable.length;
      filed = applicable.filter(c => isFiled(periodData[c.id]?.filed)).length;
    } else if (type === 'gstr4') {
       const applicable = (clients || []).filter(c => c && c.gstProfile?.regType === 'Composition' && (c.status === 'Active' || c.status === 'Active Filing'));
       total = applicable.length;
       filed = applicable.filter(c => isFiled(periodData[c.id]?.filed)).length;
    } else if (type === 'gstr9') {
       const watchlistObj = filingDataCache['clientify_gstr9_watchlist_v2'] || {};
       const currentWatchlist: string[] = watchlistObj[periodKey] || [];
       const applicable = (clients || []).filter(c => c && c.gstProfile?.regType === 'Regular' && currentWatchlist.includes(c.id) && (c.status === 'Active' || c.status === 'Active Filing'));
       total = applicable.length;
       filed = applicable.filter(c => isFiled(periodData[c.id]?.gstr9)).length;
    } else if (type === 'audit') {
       const applicable = (clients || []).filter(c => c && c.itProfile?.advisoryWork?.taxAudit);
       total = applicable.length;
       filed = applicable.filter(c => isFiled(periodData[c.id]?.auditFiled)).length;
    }

    return { total, filed, pending: Math.max(0, total - filed), r1, r3b, cmp08 };
  };

  const getLitCounts = (forum: 'Notice' | 'Appeal' | 'Tribunal' | 'HighCourt', stage: 'Pending' | 'Filed' | 'Drop' | 'Demand') => {
    const items = litigation.filter(r => r.category === forum && r.status === stage);
    const seen = new Set<string>();
    let count = 0;
    for (const r of items) {
      const rec = r as any;
      const idKey = rec.id || rec._id ? String(rec.id || rec._id) : '';
      const contentKey = `${(rec.clientName||'').trim().toLowerCase()}_${(rec.noticeNo||rec.orderNo||rec.replyReferenceNo||rec.caseNo||rec.filingNo||'').trim().toLowerCase()}_${rec.hearingDate||rec.dueDate||''}`;
      const key = idKey || contentKey;
      if (!seen.has(key)) {
        seen.add(key);
        count++;
      }
    }
    return count;
  };

  const SectionHeader = ({ 
    title, 
    subtitle, 
    badge, 
    action 
  }: { 
    title: string; 
    subtitle: string; 
    badge?: string; 
    action?: React.ReactNode 
  }) => (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-4">
      <div>
        <div className="flex items-center gap-2.5">
          {badge && (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
              {badge}
            </span>
          )}
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            {title}
          </h2>
        </div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );

  const SubSectionTitle = ({ title }: { title: string }) => (
    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-1 flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
      {title}
    </h3>
  );

  const DetailedCard = ({ 
    label, 
    subLabel, 
    periodControls, 
    stats, 
    viewId, 
    icon, 
    badgeGradient = 'from-indigo-500 to-indigo-700' 
  }: any) => {
    const total = stats.total || 0;
    const filed = stats.filed !== undefined ? stats.filed : (stats.items?.[0]?.value || 0);
    const pending = stats.pending !== undefined ? stats.pending : Math.max(0, total - filed);
    const percentFiled = total > 0 ? Math.min(100, Math.round((filed / total) * 100)) : 0;

    return (
      <div 
        onClick={() => handleViewChange(viewId)}
        className="group bg-white/90 dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-5 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)] hover:border-indigo-400/80 dark:hover:border-indigo-500/80 hover:shadow-[0_16px_36px_-6px_rgba(79,70,229,0.12)] hover:-translate-y-1 transition-all cursor-pointer overflow-hidden relative backdrop-blur-xl flex flex-col justify-between"
      >
        <div>
          {/* Header Row */}
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${badgeGradient} flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform shrink-0`}>
                {icon}
              </div>
              <div className="min-w-0">
                <h4 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                  {label}
                </h4>
                {periodControls ? (
                  <div className="mt-0.5" onClick={(e) => e.stopPropagation()}>{periodControls}</div>
                ) : (
                  <p className="text-[11px] font-medium text-slate-400 dark:text-slate-400 truncate">{subLabel}</p>
                )}
              </div>
            </div>

            <div className="text-right shrink-0 ml-2">
              <span className="block text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white leading-none">
                {total}
              </span>
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Clients</span>
            </div>
          </div>

          {/* Quick Real-Time Status Row (Filed vs Pending) */}
          <div className="grid grid-cols-2 gap-2 my-3 relative z-10">
            <div className="p-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/60 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Filed
              </span>
              <span className="text-xs font-bold font-mono text-emerald-800 dark:text-emerald-300 tabular-nums">
                {filed}
              </span>
            </div>

            <div className={`p-2 rounded-xl border flex items-center justify-between ${
              pending > 0 
                ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200/60 dark:border-rose-800/60' 
                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800'
            }`}>
              <span className={`text-[10px] font-semibold flex items-center gap-1 ${
                pending > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'
              }`}>
                <Clock className="h-3 w-3" /> Pending
              </span>
              <span className={`text-xs font-bold font-mono tabular-nums ${
                pending > 0 ? 'text-rose-800 dark:text-rose-300' : 'text-slate-600 dark:text-slate-400'
              }`}>
                {pending}
              </span>
            </div>
          </div>

          {/* Compliance Rate Progress Bar */}
          <div className="space-y-1 mb-3 relative z-10">
            <div className="flex justify-between text-[10px] font-medium text-slate-500 dark:text-slate-400">
              <span>Compliance Rate</span>
              <span className="font-mono font-semibold">{percentFiled}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500" 
                style={{ width: `${percentFiled}%` }} 
              />
            </div>
          </div>
        </div>

        {/* Detailed Breakdown */}
        {stats.items && stats.items.length > 0 && (
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 relative z-10">
            {stats.items.map((item: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400 font-medium text-[11px] truncate">{item.label}</span>
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 text-xs tabular-nums">
                  {item.value} <span className="text-[10px] text-slate-400 font-normal">/ {total}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const CompactCard = ({ label, count, viewId, icon, badgeGradient = 'from-indigo-500 to-indigo-700' }: any) => (
    <div 
      onClick={() => handleViewChange(viewId)}
      className="group bg-white/90 dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-4 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.05)] hover:border-indigo-400/80 dark:hover:border-indigo-500/80 hover:shadow-[0_12px_28px_-6px_rgba(79,70,229,0.12)] hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden relative backdrop-blur-xl"
    >
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${badgeGradient} flex items-center justify-center text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform`}>
            {icon}
          </div>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
            {label}
          </span>
        </div>
        <span className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white shrink-0 ml-2">
          {count}
        </span>
      </div>
    </div>
  );

  const LitigationBlock = ({ forum, label, icon }: any) => {
    const forums: Record<string, string> = { 'Notice': 'lit-notice', 'Appeal': 'lit-appeal', 'Tribunal': 'lit-tribunal', 'HighCourt': 'lit-hc' };
    const prefix = forums[forum];

    const pendingCount = getLitCounts(forum, 'Pending');
    const filedCount = getLitCounts(forum, 'Filed');
    const droppedCount = getLitCounts(forum, 'Drop');
    const demandCount = getLitCounts(forum, 'Demand');

    const getEffectiveDate = (item: LitigationRecord) => {
      if (item.hearingDate && item.dueDate) {
        const hTime = new Date(item.hearingDate).getTime();
        const dTime = new Date(item.dueDate).getTime();
        if (isNaN(hTime)) return item.dueDate;
        if (isNaN(dTime)) return item.hearingDate;
        return hTime <= dTime ? item.hearingDate : item.dueDate;
      }
      return item.hearingDate || item.dueDate || '';
    };

    const sortedPending = useMemo(() => {
      const activeList = litigation.filter(r => {
        if (r.category !== forum) return false;
        if (r.status === 'Pending') {
          return Boolean(getEffectiveDate(r));
        }
        if (r.status === 'Filed') {
          return Boolean(r.hearingDate && r.hearingDate.trim() !== '');
        }
        return false;
      });
      const seen = new Set<string>();
      const uniqueList: LitigationRecord[] = [];
      for (const r of activeList) {
        const rec = r as any;
        const idKey = rec.id || rec._id ? String(rec.id || rec._id) : '';
        const contentKey = `${(rec.clientName||'').trim().toLowerCase()}_${(rec.noticeNo||rec.orderNo||rec.replyReferenceNo||rec.caseNo||rec.filingNo||'').trim().toLowerCase()}_${rec.hearingDate||rec.dueDate||''}`;
        const key = idKey || contentKey;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueList.push(r);
        }
      }
      return [...uniqueList].sort((a, b) => {
        const dateA = getEffectiveDate(a);
        const dateB = getEffectiveDate(b);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return new Date(dateA).getTime() - new Date(dateB).getTime();
      }).slice(0, 5);
    }, [forum, litigation]);

    const forumSingular = forum === 'HighCourt' ? 'Matter' : forum;

    const items = [
      { id: 'pending', statusLabel: `Pending ${forumSingular}`, count: pendingCount, bulletColor: 'bg-rose-500', icon: <Clock className="h-4 w-4" /> },
      { id: 'filed', statusLabel: `Filed ${forumSingular}`, count: filedCount, bulletColor: 'bg-indigo-500', icon: <CheckCircle2 className="h-4 w-4" /> },
      { id: 'drop', statusLabel: `Closed / Relief`, count: droppedCount, bulletColor: 'bg-emerald-500', icon: <Check className="h-4 w-4" /> },
      { id: 'demand', statusLabel: `Confirmed Demand`, count: demandCount, bulletColor: 'bg-amber-500', icon: <AlertTriangle className="h-4 w-4" /> }
    ];

    const isOverdue = (dateStr: string) => {
      if (!dateStr) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const d = new Date(dateStr);
      return d < today;
    };

    const isNearDue = (dateStr: string) => {
      if (!dateStr) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const d = new Date(dateStr);
      const diffTime = d.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 5;
    };

    return (
      <div className="space-y-3">
        {/* Header Title */}
        <div className="flex items-center gap-2.5 px-1">
          <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            {icon}
          </div>
          <h4 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">{label}</h4>
        </div>

        {/* Combined Main Card */}
        <div className="bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)] hover:shadow-lg transition-all backdrop-blur-xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Left Side: Vertical list of status routes */}
            <div className="space-y-2.5">
              <div className="mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Stages & Status</span>
              </div>
              {items.map((item) => (
                <div 
                  key={item.id}
                  onClick={() => handleViewChange(`${prefix}-${item.id}`)}
                  className="group/row flex items-center justify-between p-3 rounded-xl border bg-slate-50/70 dark:bg-slate-800/50 border-slate-200/60 dark:border-slate-800 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/40 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-7 w-7 rounded-lg ${item.bulletColor} text-white flex items-center justify-center shadow-xs group-hover/row:scale-105 transition-transform`}>
                      {item.icon}
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover/row:text-slate-900 dark:group-hover/row:text-white">{item.statusLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 px-2.5 py-0.5 rounded-lg shadow-xs min-w-[2rem] text-center">
                      {item.count}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover/row:text-slate-500 group-hover/row:translate-x-0.5 transition-all" />
                  </div>
                </div>
              ))}
            </div>

            {/* Right Side: Priority Deadlines */}
            <div className="flex flex-col border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 pt-5 lg:pt-0 lg:pl-6">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Top 5 Priority Deadlines</span>
                <span className="text-[9px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-full px-2 py-0.5">
                  Action Queue
                </span>
              </div>
              
              {sortedPending.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                  <div className="h-10 w-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-2 border border-emerald-100 dark:border-emerald-800/40">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">All Clear</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 max-w-[200px]">No pending hearings or responses required right now.</p>
                </div>
              ) : (
                <div className="space-y-2 flex-1 overflow-y-auto no-scrollbar max-h-[260px]">
                  {sortedPending.map((item) => {
                    const effDate = getEffectiveDate(item);
                    const isHearing = Boolean(item.hearingDate && (effDate === item.hearingDate || !item.dueDate));
                    const overdue = isOverdue(effDate);
                    const neardue = isNearDue(effDate);
                    const formattedDate = effDate ? formatDate(effDate) : 'No Date Set';
                    
                    return (
                      <div 
                        key={item.id}
                        onClick={() => handleViewChange(`${prefix}-${item.status === 'Filed' ? 'filed' : 'pending'}`)}
                        className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-indigo-50/20 dark:hover:bg-indigo-950/20 transition-all cursor-pointer flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{item.clientName}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                            Ref: {item.referenceNo || 'N/A'} <span className="mx-1 text-slate-300 dark:text-slate-700">|</span> Sec: {item.section || 'N/A'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                            overdue 
                              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400' 
                              : neardue 
                              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400' 
                              : isHearing
                              ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}>
                            <Calendar className="w-2.5 h-2.5" />
                            <span className="whitespace-nowrap">
                              {isHearing ? `Hearing: ${formattedDate}` : formattedDate}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard': {
        const monthlyStats = getFilingCounts('monthly', `${monthlyFilter.year}_${monthlyFilter.month}`);
        const quarterlyStats = getFilingCounts('quarterly', `${quarterlyFilter.year}_${quarterlyFilter.quarter}`);
        const compStats = getFilingCounts('composition', `${compositionFilter.year}_${compositionFilter.quarter}`);
        const gstr4Stats = getFilingCounts('gstr4', `${annualFilter.year}`);
        const gstr9Stats = getFilingCounts('gstr9', `${annualFilter.year}`);
        const itrStats = getFilingCounts('itr', itrFilter.ay);
        const auditStats = getFilingCounts('audit', itrFilter.ay);
        const pendingNotices = litigation.filter(r => r.category === 'Notice' && r.status === 'Pending').length;
        const pendingAppeals = litigation.filter(r => r.category === 'Appeal' && r.status === 'Pending').length;
        const pendingTribunals = litigation.filter(r => r.category === 'Tribunal' && r.status === 'Pending').length;
        const pendingCourt = litigation.filter(r => r.category === 'HighCourt' && r.status === 'Pending').length;

        const gstClients = (clients || []).filter(c => c && !!c.gstProfile);
        const gstTotal = gstClients.length;
        const gstActive = gstClients.filter(c => c.status === 'Active' || c.status === 'Active Filing').length;
        const gstLitigation = gstClients.filter(c => c.status === 'Litigation').length;
        const gstInactive = gstClients.filter(c => c.status === 'Inactive' || c.status === 'Suspended').length;

        const itClients = (clients || []).filter(c => c && !!c.itProfile);
        const itTotal = itClients.length;
        const itActive = itClients.filter(c => c.status === 'Active' || c.status === 'Active Filing').length;
        const itInactive = itClients.filter(c => c.status === 'Inactive' || c.status === 'Suspended').length;

        return (
          <div className="w-full mx-auto space-y-12 animate-in fade-in duration-500 pb-28">
            {installPrompt && <InstallBanner onInstall={triggerInstall} />}
            
            {/* Sector 1: Client Hub */}
            <section>
              <SectionHeader 
                badge="Directory" 
                title="Master Client Portfolios" 
                subtitle="Centralized client records for GST and Income Tax portfolios" 
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* GST Portfolio Card */}
                <div 
                  onClick={() => handleViewChange('gst-portfolio')} 
                  className="group bg-white/90 dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 sm:p-7 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)] hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between backdrop-blur-xl"
                >
                  <div className="flex items-start justify-between relative z-10">
                    <div>
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-xs mb-3.5 group-hover:scale-105 transition-transform">
                        <Building2 className="h-6 w-6" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">GST Portfolio</h3>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-400 mt-0.5">Active Regular & Composition Taxpayers</p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">{gstTotal}</p>
                      <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mt-1">Total Entities</p>
                    </div>
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 relative z-10">
                    <span className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 flex items-center justify-between">
                      <span>Total</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-indigo-200/80 dark:bg-indigo-900 text-indigo-950 dark:text-indigo-200 font-bold font-mono tabular-nums">{gstTotal}</span>
                    </span>
                    <span className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 flex items-center justify-between">
                      <span>Active</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-200/80 dark:bg-emerald-900 text-emerald-950 dark:text-emerald-200 font-bold font-mono tabular-nums">{gstActive}</span>
                    </span>
                    <span className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/80 flex items-center justify-between">
                      <span>Litigation</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-200/80 dark:bg-amber-900 text-amber-950 dark:text-amber-200 font-bold font-mono tabular-nums">{gstLitigation}</span>
                    </span>
                    <span className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <span>Inactive</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-300 font-bold font-mono tabular-nums">{gstInactive}</span>
                    </span>
                  </div>
                </div>

                {/* IT Portfolio Card */}
                <div 
                  onClick={() => handleViewChange('it-portfolio')} 
                  className="group bg-white/90 dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 sm:p-7 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)] hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between backdrop-blur-xl"
                >
                  <div className="flex items-start justify-between relative z-10">
                    <div>
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white shadow-xs mb-3.5 group-hover:scale-105 transition-transform">
                        <Users className="h-6 w-6" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">IT Portfolio</h3>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-400 mt-0.5">Personal & Corporate Assessees</p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">{itTotal}</p>
                      <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mt-1">Total Assessees</p>
                    </div>
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 relative z-10">
                    <span className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 flex items-center justify-between">
                      <span>Total</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-200/80 dark:bg-emerald-900 text-emerald-950 dark:text-emerald-200 font-bold font-mono tabular-nums">{itTotal}</span>
                    </span>
                    <span className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300/80 dark:border-emerald-700 flex items-center justify-between">
                      <span>Active</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-200/80 dark:bg-emerald-900 text-emerald-950 dark:text-emerald-200 font-bold font-mono tabular-nums">{itActive}</span>
                    </span>
                    <span className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <span>Inactive</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-300 font-bold font-mono tabular-nums">{itInactive}</span>
                    </span>
                  </div>
                </div>

              </div>
            </section>

            {/* Sector 2: Compliance Matrix */}
            <section>
              <SectionHeader 
                badge="Compliance" 
                title="Statutory Filing Lifecycle" 
                subtitle="Track real-time pending vs filed statuses across all GST and Income Tax cycles"
                action={
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 text-xs font-semibold">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Live Synced</span>
                    </div>
                    <button
                      onClick={() => {
                        queryClient.invalidateQueries({ queryKey: ['dashboard_data'] });
                        queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                      title="Instant Refresh Compliance Statuses"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span className="hidden sm:inline">Refresh</span>
                    </button>
                  </div>
                }
              />

              <div className="space-y-8">
                
                {/* 1. Filing Cycles */}
                <div>
                  <SubSectionTitle title="Periodic GST Filing Cycles" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    
                    {/* Monthly */}
                    <DetailedCard 
                      label="Monthly Returns" 
                      periodControls={
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                          <select 
                            className="bg-transparent border-none text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer focus:ring-0 p-0"
                            value={monthlyFilter.month} 
                            onChange={(e) => setMonthlyFilter({ ...monthlyFilter, month: e.target.value })}
                          >
                            {FY_MONTHS.map(m => <option key={m} value={m} className="dark:bg-slate-900">{m}</option>)}
                          </select>
                          <span className="text-slate-400">/</span>
                          <select 
                            className="bg-transparent border-none text-[11px] font-semibold text-slate-500 dark:text-slate-400 cursor-pointer focus:ring-0 p-0"
                            value={monthlyFilter.year}
                            onChange={(e) => setMonthlyFilter({ ...monthlyFilter, year: e.target.value })}
                          >
                            {YEARS.map(y => <option key={y} value={y} className="dark:bg-slate-900">{y}</option>)}
                          </select>
                        </div>
                      }
                      stats={{
                        total: monthlyStats.total,
                        filed: monthlyStats.filed,
                        pending: monthlyStats.pending,
                        items: [
                          { label: 'GSTR-1 Filed', value: monthlyStats.r1 },
                          { label: 'GSTR-3B Filed', value: monthlyStats.r3b }
                        ]
                      }}
                      viewId="compliance-monthly" 
                      badgeGradient="from-indigo-500 to-indigo-700" 
                      icon={<FileText className="h-5 w-5" />} 
                    />

                    {/* Quarterly */}
                    <DetailedCard 
                      label="Quarterly (QRMP)" 
                      periodControls={
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                          <select 
                            className="bg-transparent border-none text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer focus:ring-0 p-0"
                            value={quarterlyFilter.quarter} 
                            onChange={(e) => setQuarterlyFilter({ ...quarterlyFilter, quarter: e.target.value })}
                          >
                            {FY_QUARTERS.map(q => <option key={q} value={q} className="dark:bg-slate-900">{q}</option>)}
                          </select>
                          <span className="text-slate-400">/</span>
                          <select 
                            className="bg-transparent border-none text-[11px] font-semibold text-slate-500 dark:text-slate-400 cursor-pointer focus:ring-0 p-0"
                            value={quarterlyFilter.year}
                            onChange={(e) => setQuarterlyFilter({ ...quarterlyFilter, year: e.target.value })}
                          >
                            {YEARS.map(y => <option key={y} value={y} className="dark:bg-slate-900">{y}</option>)}
                          </select>
                        </div>
                      }
                      stats={{
                        total: quarterlyStats.total,
                        filed: quarterlyStats.filed,
                        pending: quarterlyStats.pending,
                        items: [
                          { label: 'IFF / GSTR-1 Filed', value: quarterlyStats.r1 },
                          { label: 'GSTR-3B Filed', value: quarterlyStats.r3b }
                        ]
                      }}
                      viewId="compliance-quarterly" 
                      badgeGradient="from-blue-500 to-blue-700" 
                      icon={<Receipt className="h-5 w-5" />} 
                    />

                    {/* Composition */}
                    <DetailedCard 
                      label="Composition (CMP-08)" 
                      periodControls={
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                          <select 
                            className="bg-transparent border-none text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer focus:ring-0 p-0"
                            value={compositionFilter.quarter} 
                            onChange={(e) => setCompositionFilter({ ...compositionFilter, quarter: e.target.value })}
                          >
                            {FY_QUARTERS.map(q => <option key={q} value={q} className="dark:bg-slate-900">{q}</option>)}
                          </select>
                          <span className="text-slate-400">/</span>
                          <select 
                            className="bg-transparent border-none text-[11px] font-semibold text-slate-500 dark:text-slate-400 cursor-pointer focus:ring-0 p-0"
                            value={compositionFilter.year}
                            onChange={(e) => setCompositionFilter({ ...compositionFilter, year: e.target.value })}
                          >
                            {YEARS.map(y => <option key={y} value={y} className="dark:bg-slate-900">{y}</option>)}
                          </select>
                        </div>
                      }
                      stats={{
                        total: compStats.total,
                        filed: compStats.cmp08,
                        pending: compStats.total - compStats.cmp08,
                        items: [
                          { label: 'CMP-08 Filed', value: compStats.cmp08 }
                        ]
                      }}
                      viewId="compliance-composition" 
                      badgeGradient="from-amber-500 to-amber-700" 
                      icon={<FileCheck className="h-5 w-5" />} 
                    />

                  </div>
                </div>

                {/* 2. Annual & Direct Tax */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  
                  {/* Annual GST Returns */}
                  <div>
                    <SubSectionTitle title="Annual GST Statements" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <DetailedCard 
                        label="GSTR-4 Annual" 
                        periodControls={
                          <select 
                            className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer focus:ring-0"
                            value={annualFilter.year}
                            onChange={(e) => setAnnualFilter({ ...annualFilter, year: e.target.value })}
                          >
                            {YEARS.map(y => <option key={y} value={y} className="dark:bg-slate-900">{y}</option>)}
                          </select>
                        }
                        stats={{
                          total: gstr4Stats.total,
                          filed: gstr4Stats.filed,
                          pending: gstr4Stats.pending,
                          items: [
                            { label: 'GSTR-4 Filed', value: gstr4Stats.filed }
                          ]
                        }}
                        viewId="compliance-gstr4" 
                        badgeGradient="from-indigo-600 to-indigo-800" 
                        icon={<FileText className="h-5 w-5" />} 
                      />

                      <DetailedCard 
                        label="GSTR-9 / 9C Audit" 
                        periodControls={
                          <select 
                            className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer focus:ring-0"
                            value={annualFilter.year}
                            onChange={(e) => setAnnualFilter({ ...annualFilter, year: e.target.value })}
                          >
                            {YEARS.map(y => <option key={y} value={y} className="dark:bg-slate-900">{y}</option>)}
                          </select>
                        }
                        stats={{
                          total: gstr9Stats.total,
                          filed: gstr9Stats.filed,
                          pending: gstr9Stats.pending,
                          items: [
                            { label: 'Audit Filed', value: gstr9Stats.filed }
                          ]
                        }}
                        viewId="compliance-gstr9" 
                        badgeGradient="from-slate-700 to-slate-900" 
                        icon={<Scale className="h-5 w-5" />} 
                      />
                    </div>
                  </div>

                  {/* Direct Tax & Financials */}
                  <div>
                    <SubSectionTitle title="Income Tax & Financial Audit" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <DetailedCard 
                        label="ITR Returns" 
                        periodControls={
                          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                            <span className="text-[10px] font-medium text-slate-400">AY</span>
                            <select 
                              className="bg-transparent border-none text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer focus:ring-0 p-0"
                              value={itrFilter.ay}
                              onChange={(e) => setItrFilter({ ...itrFilter, ay: e.target.value })}
                            >
                              {YEARS.map(y => {
                                const startYear = parseInt(y.split('-')[0]);
                                const ay = `${startYear + 1}-${(startYear + 2).toString().slice(-2)}`;
                                return <option key={ay} value={ay} className="dark:bg-slate-900">{ay}</option>;
                              })}
                            </select>
                          </div>
                        }
                        stats={{
                          total: itrStats.total,
                          filed: itrStats.filed,
                          pending: itrStats.pending,
                          items: [
                            { label: 'ITR Filed', value: itrStats.filed }
                          ]
                        }}
                        viewId="compliance-itr" 
                        badgeGradient="from-emerald-500 to-emerald-700" 
                        icon={<Briefcase className="h-5 w-5" />} 
                      />

                      <DetailedCard 
                        label="Tax Audit & B/S" 
                        periodControls={
                          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                            <span className="text-[10px] font-medium text-slate-400">AY</span>
                            <select 
                              className="bg-transparent border-none text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer focus:ring-0 p-0"
                              value={itrFilter.ay}
                              onChange={(e) => setItrFilter({ ...itrFilter, ay: e.target.value })}
                            >
                              {YEARS.map(y => {
                                const startYear = parseInt(y.split('-')[0]);
                                const ay = `${startYear + 1}-${(startYear + 2).toString().slice(-2)}`;
                                return <option key={ay} value={ay} className="dark:bg-slate-900">{ay}</option>;
                              })}
                            </select>
                          </div>
                        }
                        stats={{
                          total: auditStats.total,
                          filed: auditStats.filed,
                          pending: auditStats.pending,
                          items: [
                            { label: '3CA/3CD Filed', value: auditStats.filed }
                          ]
                        }}
                        viewId="compliance-taxaudit" 
                        badgeGradient="from-teal-500 to-teal-700" 
                        icon={<Landmark className="h-5 w-5" />} 
                      />
                    </div>
                  </div>

                </div>

              </div>
            </section>

            {/* Sector 3: Litigation */}
            <section>
              <SectionHeader 
                badge="Litigation" 
                title="Notice & Appeal Tracking" 
                subtitle="Manage replies, appeals, tribunal hearings, and high court writ matters" 
              />
              <div className="space-y-6">
                <LitigationBlock forum="Notice" label="GST Notices (S.73, S.74 & ASMT-10)" icon={<AlertCircle className="h-4 w-4" />} />
                <LitigationBlock forum="Appeal" label="First Appeals (Section 107)" icon={<Scale className="h-4 w-4" />} />
                <LitigationBlock forum="Tribunal" label="GSTAT Tribunal (Section 112)" icon={<Landmark className="h-4 w-4" />} />
                <LitigationBlock forum="HighCourt" label="High Court & Writ Petitions" icon={<ShieldAlert className="h-4 w-4" />} />
              </div>
            </section>

            {/* Sector 4: Services */}
            <section>
              <SectionHeader 
                badge="Services" 
                title="Service Desk & Miscellaneous Work" 
                subtitle="Client registrations, food licenses, MSME certificates, and office task logs" 
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <CompactCard 
                  label="GST Registrations" 
                  count={gstReg.length} 
                  viewId="misc-gst-reg" 
                  badgeGradient="from-indigo-500 to-indigo-700" 
                  icon={<Building2 className="h-4 w-4" />} 
                />
                <CompactCard 
                  label="Food Licenses (FSSAI)" 
                  count={foodLic.length} 
                  viewId="misc-food-lic" 
                  badgeGradient="from-emerald-500 to-emerald-700" 
                  icon={<FileCheck className="h-4 w-4" />} 
                />
                <CompactCard 
                  label="MSME / Udyam Reg." 
                  count={msme.length} 
                  viewId="misc-msme" 
                  badgeGradient="from-blue-500 to-blue-700" 
                  icon={<Landmark className="h-4 w-4" />} 
                />
                <CompactCard 
                  label="Work Logs & Tasks" 
                  count={miscWork.length} 
                  viewId="misc-work" 
                  badgeGradient="from-slate-700 to-slate-900" 
                  icon={<Briefcase className="h-4 w-4" />} 
                />
              </div>
            </section>

            {/* Sector 5: Admin */}
            <section>
              <SectionHeader 
                badge="Management" 
                title="Office & Billing Administration" 
                subtitle="Firm communications, billing invoices, receipts, and compliance due dates" 
              />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
                <CompactCard label="Messenger" count={0} viewId="messenger" badgeGradient="from-indigo-500 to-indigo-700" icon={<MessageSquare className="h-4 w-4" />} />
                <CompactCard label="Reminders" count={0} viewId="reminders" badgeGradient="from-rose-500 to-rose-700" icon={<Clock className="h-4 w-4" />} />
                <CompactCard label="Invoices" count={invoices.filter(i => i.status !== 'Paid').length} viewId="admin-invoices" badgeGradient="from-slate-800 to-slate-950" icon={<Receipt className="h-4 w-4" />} />
                <CompactCard label="Payments" count={payments.length} viewId="admin-payments" badgeGradient="from-emerald-600 to-emerald-800" icon={<CheckCircle2 className="h-4 w-4" />} />
                <CompactCard label="Due Dates" count={0} viewId="admin-duedates" badgeGradient="from-amber-500 to-amber-700" icon={<Calendar className="h-4 w-4" />} />
                <CompactCard label="Trash" count={0} viewId="trash" badgeGradient="from-slate-500 to-slate-700" icon={<Trash2 className="h-4 w-4" />} />
              </div>
            </section>
          </div>
        );
      }
      case 'gst-portfolio': return <GSTPortfolio />;
      case 'it-portfolio': return <ITPortfolio />;
      case 'compliance-monthly': return <MonthlyFiling />;
      case 'compliance-quarterly': return <QuarterlyFiling />;
      case 'compliance-composition': return <CompositionFiling />;
      case 'compliance-gstr4': return <GSTR4 />;
      case 'compliance-gstr9': return <GSTR9_9C />;
      case 'compliance-itr': return <ITRReturn />;
      case 'compliance-taxaudit': return <TAXAudit />;
      case 'lit-notice-pending': return <NoticePending />;
      case 'lit-notice-filed': return <NoticeFiled />;
      case 'lit-notice-drop': return <NoticeDrop />;
      case 'lit-notice-demand': return <NoticeDemand />;
      case 'lit-appeal-pending': return <AppealPending />;
      case 'lit-appeal-filed': return <AppealFiled />;
      case 'lit-appeal-drop': return <AppealDrop />;
      case 'lit-appeal-demand': return <AppealDemand />;
      case 'lit-tribunal-pending': return <TribunalPending />;
      case 'lit-tribunal-filed': return <TribunalFiled />;
      case 'lit-tribunal-drop': return <TribunalDrop />;
      case 'lit-tribunal-demand': return <TribunalDemand />;
      case 'lit-hc-pending': return <CourtPending />;
      case 'lit-hc-filed': return <CourtFiled />;
      case 'lit-hc-drop': return <CourtDrop />;
      case 'lit-hc-demand': return <CourtDemand />;
      case 'misc-gst-reg': return <GSTRegistration />;
      case 'misc-food-lic': return <FoodLicenses />;
      case 'misc-msme': return <MSMERegistration />;
      case 'misc-work': return <Miscellaneouswork />;
      case 'reminders': return <Reminders />;
      case 'messenger': return <Messenger />;
      case 'admin-invoices': return <Invoices onViewChange={handleViewChange} />;
      case 'admin-add-invoice': return <AddInvoice onBack={() => handleViewChange('admin-invoices')} editingInvoice={viewExtra} />;
      case 'admin-invoicesetting': return <InvoiceSetting onBack={() => handleViewChange('admin-invoices')} />;
      case 'admin-payments': return <PaymentReceived onViewChange={handleViewChange} />;
      case 'admin-client-ledger': {
        const fromView = (viewExtra && typeof viewExtra === 'string') ? viewExtra : 'admin-payments';
        return <ClientLedger onBack={() => handleViewChange(fromView as any)} />;
      }
      case 'admin-duedates': return <DueDateSetting onViewChange={handleViewChange} />;
      case 'settings': return <Setting />;
      case 'trash': return <Trash onViewChange={handleViewChange} />;
      default: return <div className="p-20 text-center text-slate-300 font-black uppercase tracking-widest text-sm">Synchronizing Secure Module...</div>;
    }
  };

  const headerInfo = useMemo(() => {
    const mappings: Record<string, { label: string; desc: string }> = {
      'dashboard': { label: 'Dashboard', desc: 'Real-Time Compliance & Practice Intelligence' },
      'gst-portfolio': { label: 'GST Portfolio', desc: 'GST Client Directory & Filing Registers' },
      'it-portfolio': { label: 'IT Portfolio', desc: 'Income Tax Client Directory & PAN Master' },
      'compliance-monthly': { label: 'Monthly Returns', desc: 'GSTR-1 and GSTR-3B Filing Registers' },
      'compliance-quarterly': { label: 'Quarterly Returns', desc: 'QRMP and IFF Compliance Hub' },
      'compliance-composition': { label: 'Composition Returns', desc: 'CMP-08 Quarterly Filing Registers' },
      'compliance-gstr4': { label: 'GSTR-4 Annual', desc: 'Composition Annual Return Filing' },
      'compliance-gstr9': { label: 'GSTR-9/9C Audit', desc: 'Statutory Annual Reconciliation Unit' },
      'compliance-itr': { label: 'ITR Returns', desc: 'Direct Tax Returns & Computation' },
      'compliance-taxaudit': { label: 'Audit & Financials', desc: 'Tax Audit (3CA/3CD) & Balance Sheet' },
      'lit-notice-pending': { label: 'Pending Notices', desc: 'Live GST Notice Response Tracking' },
      'lit-notice-filed': { label: 'Filed Notices', desc: 'Archived Submissions Awaiting Orders' },
      'lit-notice-drop': { label: 'Closed Notices', desc: 'Notices Dropped or Relief Granted' },
      'lit-notice-demand': { label: 'Confirmed Demands', desc: 'Notices Resulting in Tax Demands' },
      'lit-appeal-pending': { label: 'Pending Appeals', desc: 'First Appeals Drafting and Advisory' },
      'lit-appeal-filed': { label: 'Filed Appeals', desc: 'Appeals Awaiting Adjudication' },
      'lit-appeal-drop': { label: 'Relief Appeals', desc: 'Appeals Decided in Taxpayer Favor' },
      'lit-appeal-demand': { label: 'Sustained Appeals', desc: 'Appeals resulting in Confirmed Liabilities' },
      'lit-tribunal-pending': { label: 'Pending Tribunal', desc: 'GSTAT Preparation and Advisory' },
      'lit-tribunal-filed': { label: 'Filed Tribunal', desc: 'GSTAT Matters Awaiting Bench Hearing' },
      'lit-tribunal-drop': { label: 'Relief Tribunal', desc: 'Favorable Tribunal Orders Archived' },
      'lit-tribunal-demand': { label: 'Sustained Tribunal', desc: 'Confirmed Tribunal Assessment Demands' },
      'lit-hc-pending': { label: 'Pending High Court', desc: 'Writ Petition and Counsel Drafting' },
      'lit-hc-filed': { label: 'Filed High Court', desc: 'HC Matters Awaiting Adjudication' },
      'lit-hc-drop': { label: 'Relief High Court', desc: 'Favorable HC Judgments Archived' },
      'lit-hc-demand': { label: 'Sustained High Court', desc: 'Confirmed High Court Tax Liabilities' },
      'misc-gst-reg': { label: 'GST Registration', desc: 'New Enrollment and Amendment Tracking' },
      'misc-food-lic': { label: 'Food License', desc: 'FSSAI Registration and Renewal Hub' },
      'misc-msme': { label: 'MSME Registration', desc: 'Udyam Registration and Certificate Tracking' },
      'misc-work': { label: 'Work Log', desc: 'Staff Task & Job Management' },
      'messenger': { label: 'Practice Messenger', desc: 'Internal Office Communication' },
      'reminders': { label: 'Reminders', desc: 'Statutory Compliance Deadline Monitor' },
      'admin-invoices': { label: 'Invoices', desc: 'Professional Billing and Receivables' },
      'admin-add-invoice': { label: 'Draft Invoice', desc: 'New Professional Bill Preparation' },
      'admin-invoicesetting': { label: 'Invoice Settings', desc: 'Configure Firm Billing Details' },
      'admin-payments': { label: 'Payments', desc: 'Collection Realization and History' },
      'admin-client-ledger': { label: 'Client Ledger', desc: 'Overview of Client Balances' },
      'admin-duedates': { label: 'Due Dates', desc: 'Global Compliance Calendar & Deadlines' },
      'settings': { label: 'Firm Settings', desc: 'Firm Configuration, Billing & Staff' },
      'trash': { label: 'Activity & Trash Log', desc: 'Deleted Records & Audit Trail' }
    };
    return mappings[activeView] || { label: 'Practice Module', desc: 'Active Clientify Module' };
  }, [activeView]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F8FAFC] dark:bg-slate-950 relative">
      <Sidebar 
        activeView={activeView} 
        onViewChange={handleViewChange} 
        isCollapsed={isSidebarCollapsed} 
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
        onOpenFolder={setNavigationFolder}
      />
      <main className="flex flex-1 flex-col min-w-0 overflow-hidden relative transition-all duration-300">
        <Header 
          isConnected={isOnline} 
          currentUser={user} 
          onMenuClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
          activeViewLabel={headerInfo.label} 
          activeViewDescription={headerInfo.desc}
          onViewChange={handleViewChange}
          activeView={activeView}
          onOpenGuidelines={(cat) => {
            setGuidelinesCategory(cat);
            setIsGuidelinesOpen(true);
          }}
        />
        <div className="flex-1 flex flex-col min-h-0 w-full max-w-full min-w-0 pt-1.5 md:pt-2.5 pb-28 sm:pb-24 md:pb-8 px-2.5 sm:px-4 md:px-6 overflow-y-auto overflow-x-hidden no-scrollbar scroll-smooth relative z-0">
          {isInitialLoad && activeView === 'dashboard' ? <Loader /> : (
            <Suspense fallback={<Loader />}>{renderContent()}</Suspense>
          )}
        </div>
      </main>

      <MobileBottomNav 
        activeView={activeView} 
        onViewChange={handleViewChange} 
        onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
      />

      <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} onViewChange={handleViewChange} />
      
      <GSTClientFormModal isOpen={isGstModalOpen} onClose={() => setIsGstModalOpen(false)} onSave={() => queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] })} />
      <ITClientFormModal isOpen={isItModalOpen} onClose={() => setIsItModalOpen(false)} onSave={() => queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] })} />
      <LitigationGuidelinesModal isOpen={isGuidelinesOpen} onClose={() => setIsGuidelinesOpen(false)} initialCategory={guidelinesCategory} />
    </div>
  );
};

export default Dashboard;
