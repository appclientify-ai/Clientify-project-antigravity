import React, { useState, useRef, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  FileText, 
  CalendarRange, 
  Calculator, 
  AlertCircle, 
  Scale, 
  Landmark, 
  Building, 
  FilePlus2, 
  UtensilsCrossed, 
  Briefcase, 
  Clock, 
  MessageSquare, 
  Bell, 
  Receipt, 
  CreditCard, 
  BookOpen, 
  Calendar, 
  Settings, 
  Archive, 
  History,
  ChevronRight, 
  ChevronDown, 
  ArrowRight,
  Search,
  X
} from 'lucide-react';
import { ActiveView } from '../types';
import { useNavCounts } from '../hooks/useNavCounts';
import { useTheme } from '../hooks/useTheme';
import { THEME_COLORS } from '../services/theme';

export interface NavItem {
  id: ActiveView | string;
  label: string;
  icon?: React.ReactNode;
  children?: NavItem[];
}

interface SidebarProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  onOpenFolder: (item: NavItem) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  activeView, 
  onViewChange, 
  isCollapsed, 
  onToggle, 
  onOpenFolder 
}) => {
  const { settings } = useTheme();
  const currentTheme = THEME_COLORS.find(c => c.id === settings.themeColor) || THEME_COLORS[0];
  const [hoveredItem, setHoveredItem] = useState<{ id: string; top: number; item: NavItem } | null>(null);
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null);

  const navigation: { group: string; items: NavItem[] }[] = [
    {
      group: 'Primary',
      items: [
        { 
          id: 'dashboard', 
          label: 'Dashboard', 
          icon: <LayoutDashboard className="h-4.5 w-4.5" /> 
        },
      ]
    },
    {
      group: 'Portfolios',
      items: [
        { 
          id: 'gst-portfolio', 
          label: 'GST Portfolio', 
          icon: <Building2 className="h-4.5 w-4.5" /> 
        },
        { 
          id: 'it-portfolio', 
          label: 'Income Tax Portfolio', 
          icon: <Users className="h-4.5 w-4.5" /> 
        },
      ]
    },
    {
      group: 'Compliance',
      items: [
        { 
          id: 'gst-ret-f', 
          label: 'GST Returns', 
          icon: <FileText className="h-4.5 w-4.5" />,
          children: [
            { id: 'compliance-monthly', label: 'Monthly Filing (GSTR-1/3B)' },
            { id: 'compliance-quarterly', label: 'Quarterly QRMP (CMP-08)' },
            { id: 'compliance-composition', label: 'Composition Filing' },
          ]
        },
        { 
          id: 'annual-ret-f', 
          label: 'Annual Returns', 
          icon: <CalendarRange className="h-4.5 w-4.5" />,
          children: [
            { id: 'compliance-gstr4', label: 'GSTR-4 Annual' },
            { id: 'compliance-gstr9', label: 'GSTR-9 & 9C Reconciliation' },
          ]
        },
        { 
          id: 'it-audit-f', 
          label: 'IT & Audit', 
          icon: <Calculator className="h-4.5 w-4.5" />,
          children: [
            { id: 'compliance-itr', label: 'ITR Returns' },
            { id: 'compliance-taxaudit', label: 'Tax Audit & Balance Sheet' },
          ]
        },
      ]
    },
    {
      group: 'Litigation & Appeals',
      items: [
        { 
          id: 'l-notices', 
          label: 'GST Notices', 
          icon: <AlertCircle className="h-4.5 w-4.5" />,
          children: [
            { id: 'lit-notice-pending', label: 'Pending Notices' },
            { id: 'lit-notice-filed', label: 'Filed Notices' },
            { id: 'lit-notice-drop', label: 'Closed / Relieved' },
            { id: 'lit-notice-demand', label: 'Confirmed Demand' },
          ]
        },
        { 
          id: 'l-appeals', 
          label: 'GST Appeals', 
          icon: <Scale className="h-4.5 w-4.5" />,
          children: [
            { id: 'lit-appeal-pending', label: 'Pending Appeals' },
            { id: 'lit-appeal-filed', label: 'Filed Appeals' },
            { id: 'lit-appeal-drop', label: 'Closed / Relief' },
            { id: 'lit-appeal-demand', label: 'Sustained Demand' },
          ]
        },
        { 
          id: 'l-tribunal', 
          label: 'Appellate Tribunal', 
          icon: <Landmark className="h-4.5 w-4.5" />,
          children: [
            { id: 'lit-tribunal-pending', label: 'Pending Cases' },
            { id: 'lit-tribunal-filed', label: 'Filed Cases' },
            { id: 'lit-tribunal-drop', label: 'Relief / Dropped' },
            { id: 'lit-tribunal-demand', label: 'Sustained Demand' },
          ]
        },
        { 
          id: 'l-court', 
          label: 'High Court', 
          icon: <Building className="h-4.5 w-4.5" />,
          children: [
            { id: 'lit-hc-pending', label: 'Pending Writs' },
            { id: 'lit-hc-filed', label: 'Filed Writs' },
            { id: 'lit-hc-drop', label: 'Relief Granted' },
            { id: 'lit-hc-demand', label: 'Sustained' },
          ]
        },
      ]
    },
    {
      group: 'Services & Practice',
      items: [
        { id: 'misc-gst-reg', label: 'GST Registration', icon: <FilePlus2 className="h-4.5 w-4.5" /> },
        { id: 'misc-food-lic', label: 'Food License (FSSAI)', icon: <UtensilsCrossed className="h-4.5 w-4.5" /> },
        { id: 'misc-msme', label: 'MSME Registration', icon: <Briefcase className="h-4.5 w-4.5" /> },
        { id: 'misc-work', label: 'Practice Work Log', icon: <Clock className="h-4.5 w-4.5" /> },
      ]
    },
    {
      group: 'Administration',
      items: [
        { id: 'messenger', label: 'Client Messenger', icon: <MessageSquare className="h-4.5 w-4.5" /> },
        { id: 'reminders', label: 'Compliance Reminders', icon: <Bell className="h-4.5 w-4.5" /> },
        { id: 'admin-invoices', label: 'Fee Invoices', icon: <Receipt className="h-4.5 w-4.5" /> },
        { id: 'admin-payments', label: 'Payment Receipts', icon: <CreditCard className="h-4.5 w-4.5" /> },
        { id: 'admin-client-ledger', label: 'Client Ledger', icon: <BookOpen className="h-4.5 w-4.5" /> },
        { id: 'admin-duedates', label: 'Due Date Calendar', icon: <Calendar className="h-4.5 w-4.5" /> },
        { id: 'settings', label: 'Firm & App Settings', icon: <Settings className="h-4.5 w-4.5" /> },
        { id: 'trash', label: 'Activity & Trash Log', icon: <History className="h-4.5 w-4.5" /> },
      ]
    }
  ];

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const { data: navCounts = {} } = useNavCounts();

  const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768;

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredNavigation = useMemo(() => {
    if (!searchQuery.trim()) return navigation;
    const q = searchQuery.toLowerCase().trim();
    return navigation
      .map(group => {
        const filteredItems = group.items
          .map(item => {
            const matchesParent = item.label.toLowerCase().includes(q);
            const matchingChildren = item.children?.filter(c => c.label.toLowerCase().includes(q));
            if (matchesParent) {
              return item;
            }
            if (matchingChildren && matchingChildren.length > 0) {
              return { ...item, children: matchingChildren };
            }
            return null;
          })
          .filter((item): item is NavItem => item !== null);

        return { ...group, items: filteredItems };
      })
      .filter(group => group.items.length > 0);
  }, [navigation, searchQuery]);

  const handleItemClick = (e: React.MouseEvent, item: NavItem) => {
    if (item.children?.length) {
      if (!isCollapsed) {
        toggleGroup(item.id);
      } else {
        if (hoveredItem?.id === item.id) {
          setHoveredItem(null);
        } else {
          const rect = e.currentTarget.getBoundingClientRect();
          setHoveredItem({ id: item.id, top: rect.top, item });
        }
      }
    } else {
      onViewChange(item.id as ActiveView);
      if (isMobile() && !isCollapsed) {
        onToggle();
      }
    }
  };

  const handleChildClick = (childId: string) => {
    onViewChange(childId as ActiveView);
    setHoveredItem(null);
    if (isMobile() && !isCollapsed) {
      onToggle();
    }
  };

  const handleMouseEnter = (e: React.MouseEvent, item: NavItem) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    if (!isCollapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredItem({ id: item.id, top: rect.top, item });
  };

  const renderItem = (item: NavItem) => {
    const isActive = activeView === item.id || item.children?.some(c => c.id === activeView);
    const hasChildren = !!item.children?.length;
    const isExpanded = expandedGroups[item.id] ?? isActive;
    const count = navCounts[item.id];

    // Unified Muted Tone for icons
    const iconColor = isActive
      ? 'text-indigo-600 dark:text-indigo-400'
      : 'text-slate-400 dark:text-slate-500 group-hover/item:text-slate-700 dark:group-hover/item:text-slate-200 transition-colors';

    // Collapsed Mode Item: Centered pill
    if (isCollapsed) {
      return (
        <div key={item.id} className="w-full relative px-2 py-0.5 flex justify-center">
          <button
            onClick={(e) => handleItemClick(e, item)}
            onMouseEnter={(e) => handleMouseEnter(e, item)}
            onMouseLeave={() => { hoverTimeout.current = setTimeout(() => setHoveredItem(null), 150); }}
            className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150 group/item cursor-pointer ${
              isActive 
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs' 
                : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/80'
            }`}
            title={item.label}
            aria-label={item.label}
          >
            {isActive && (
              <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-indigo-600 dark:bg-indigo-400" />
            )}
            <span className={`transition-transform duration-150 group-hover/item:scale-105 flex items-center justify-center shrink-0 ${iconColor}`}>
              {item.icon}
            </span>
            {count !== undefined && count > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-slate-900 dark:bg-indigo-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900 shadow-2xs">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        </div>
      );
    }

    // Expanded / Open Mode Item: Sleek SaaS Row
    return (
      <div key={item.id} className="w-full relative px-2.5 space-y-0.5">
        <button
          onClick={(e) => handleItemClick(e, item)}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-all duration-150 group/item relative cursor-pointer ${
            isActive 
              ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white font-semibold shadow-2xs' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white font-medium'
          }`}
        >
          {isActive && (
            <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-indigo-600 dark:bg-indigo-400" />
          )}

          {item.icon && (
            <div className="relative shrink-0 flex items-center justify-center">
              <span className={`transition-transform duration-150 group-hover/item:scale-105 flex items-center justify-center shrink-0 ${iconColor}`}>
                {item.icon}
              </span>
            </div>
          )}
          
          <span className="flex-1 text-left truncate text-xs font-medium tracking-tight">
            {item.label}
          </span>

          {count !== undefined && count > 0 && (
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 transition-colors ${
              isActive 
                ? 'bg-slate-900 text-white dark:bg-indigo-600 shadow-2xs' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 group-hover/item:bg-slate-200 dark:group-hover/item:bg-slate-700'
            }`}>
              {count}
            </span>
          )}
          
          {hasChildren && (
            <span className={`transition-transform duration-150 text-slate-400 shrink-0 ${isExpanded ? 'rotate-90 text-slate-700 dark:text-slate-200' : 'opacity-60'}`}>
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
        </button>

        {/* Inline Sub-Menu Accordion for expanded view */}
        {hasChildren && isExpanded && (
          <div className="pl-3 pr-1 space-y-0.5 my-0.5 border-l border-slate-200 dark:border-slate-800 ml-3.5 animate-in slide-in-from-top-1 duration-150">
            {item.children!.map(child => {
              const isChildActive = activeView === child.id;
              return (
                <button
                  key={child.id}
                  onClick={() => handleChildClick(child.id)}
                  className={`w-full text-left py-1.5 px-2 rounded-md text-xs transition-colors flex items-center justify-between cursor-pointer ${
                    isChildActive 
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold' 
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white font-medium'
                  }`}
                >
                  <span className="truncate">{child.label}</span>
                  {isChildActive && <div className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {!isCollapsed && (
        <div 
          className="fixed inset-0 bg-slate-950/40 dark:bg-slate-950/60 backdrop-blur-xs z-[140] md:hidden transition-opacity"
          onClick={onToggle}
        />
      )}

      {/* Main Sidebar Aside */}
      <aside 
        className={`fixed inset-y-0 left-0 z-[150] md:relative md:inset-auto md:z-30 flex flex-col shrink-0 border-r border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl md:shadow-none transition-all duration-300 ease-in-out md:translate-x-0 ${
          isCollapsed ? '-translate-x-full md:w-16' : 'translate-x-0 md:w-60 w-[85vw] max-w-[320px]'
        }`}
      >
        {/* Brand / Logo Header */}
        <div className={`flex h-16 items-center border-b border-slate-200/80 dark:border-slate-800 shrink-0 ${isCollapsed ? 'justify-center px-2' : 'px-4 justify-between'}`}>
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-3 min-w-0 animate-in fade-in duration-200">
                <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 dark:bg-indigo-600 text-white font-bold overflow-hidden shadow-xs shrink-0">
                  <img 
                    src="/icon.png" 
                    alt="Clientify Logo" 
                    className="relative z-10 h-full w-full object-cover rounded-lg" 
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.dataset.triedIcon) {
                        target.dataset.triedIcon = 'true';
                        target.src = '/icon.svg';
                      } else {
                        target.style.display = 'none';
                      }
                    }}
                  />
                  <span className="absolute z-0 text-sm font-bold text-white">C</span>
                </div>
                <div className="min-w-0">
                  <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white leading-tight block">
                    Client<span style={{ color: currentTheme.primary }}>ify</span>
                  </span>
                </div>
              </div>

              {/* Mobile Drawer Close Button */}
              <button
                onClick={onToggle}
                className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Close Navigation"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center">
              <button
                onClick={onToggle}
                className="group relative flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 dark:bg-indigo-600 text-white font-bold overflow-hidden shadow-xs cursor-pointer"
                title="Click to expand sidebar"
              >
                <img 
                  src="/icon.png" 
                  alt="Clientify Logo" 
                  className="relative z-10 h-full w-full object-cover rounded-lg" 
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (!target.dataset.triedIcon) {
                      target.dataset.triedIcon = 'true';
                      target.src = '/icon.svg';
                    } else {
                      target.style.display = 'none';
                    }
                  }}
                />
                <span className="absolute z-0 text-sm font-bold text-white">C</span>
              </button>
            </div>
          )}
        </div>

        {/* Quick Module Search in Open Mode */}
        {!isCollapsed && (
          <div className="px-3 pt-2.5 pb-1 shrink-0">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search modules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg py-1.5 pl-8 pr-7 text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scrollable Navigation Items */}
        <nav className="flex-1 overflow-y-auto py-2.5 pb-8 space-y-2 no-scrollbar scroll-smooth">
          {filteredNavigation.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-400 font-medium">
              No modules match "{searchQuery}"
            </div>
          ) : (
            filteredNavigation.map((group, i) => (
              <div key={i} className="space-y-0.5">
                {i > 0 && (
                  <div className="my-2 border-t border-slate-100 dark:border-slate-800/80 mx-3" />
                )}
                {!isCollapsed && (
                  <h5 className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                    {group.group}
                  </h5>
                )}
                <div className="space-y-0.5">{group.items.map(item => renderItem(item))}</div>
              </div>
            ))
          )}
        </nav>
      </aside>

      {/* Floating Tooltip / Menu when collapsed */}
      {hoveredItem && isCollapsed && (
        <div 
          className="fixed z-[990] left-16 ml-1.5 pl-1 animate-in fade-in zoom-in-95 duration-150"
          style={{ top: hoveredItem.top }}
          onMouseEnter={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); }}
          onMouseLeave={() => { hoverTimeout.current = setTimeout(() => setHoveredItem(null), 150); }}
        >
          <div className="relative bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl text-slate-900 dark:text-white rounded-2xl shadow-2xl p-2.5 border border-slate-200/90 dark:border-slate-800 min-w-[200px]">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="flex items-center justify-center shrink-0">{hoveredItem.item.icon}</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {hoveredItem.item.label}
              </span>
            </div>
            
            {hoveredItem.item.children ? (
              <div className="space-y-1">
                {hoveredItem.item.children.map(child => (
                  <button
                    key={child.id}
                    onClick={() => {
                      onViewChange(child.id as ActiveView);
                      setHoveredItem(null);
                    }}
                    className="w-full text-left text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/50 rounded-lg px-2 py-1.25 transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <span className="truncate">{child.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500 shrink-0 ml-1.5" />
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={() => {
                  onViewChange(hoveredItem.item.id as ActiveView);
                  setHoveredItem(null);
                }}
                className="w-full text-left text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg px-2 py-1 transition-colors flex items-center justify-between cursor-pointer"
              >
                <span>Open module</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
