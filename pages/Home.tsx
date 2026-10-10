import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';

interface HomeProps {
  onGetStarted: (targetPath?: string) => void;
}

const ParallaxCard: React.FC<{
  children: React.ReactNode;
  index: number;
  onClick?: () => void;
  className?: string;
}> = ({ children, onClick, className = "" }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [brightness, setBrightness] = useState(1);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const card = cardRef.current;
    const rect = card.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left - width / 2;
    const mouseY = e.clientY - rect.top - height / 2;
    
    const rX = -(mouseY / (height / 2)) * 6;
    const rY = (mouseX / (width / 2)) * 6;
    
    setRotateX(rX);
    setRotateY(rY);

    const glareBrightness = 1 + (mouseY / height) * 0.1;
    setBrightness(glareBrightness);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
    setBrightness(1);
  };

  const shadowX = -rotateY * 1.5;
  const shadowY = rotateX * 1.5;

  return (
    <motion.div
      ref={cardRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={{
        rotateX,
        rotateY,
        scale: rotateX !== 0 ? 1.02 : 1,
        filter: `brightness(${brightness})`,
        boxShadow: rotateX !== 0 
          ? `${shadowX}px ${shadowY + 16}px 32px rgba(9, 13, 22, 0.16)` 
          : '0px 10px 24px rgba(9, 13, 22, 0.05)',
      }}
      transition={{
        type: 'spring',
        stiffness: 160,
        damping: 18,
        mass: 0.6,
      }}
      style={{
        transformStyle: 'preserve-3d',
        perspective: 1000,
      }}
      className={`group cursor-pointer transition-all h-full flex flex-col ${className}`}
    >
      <div 
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-15 bg-gradient-to-tr from-transparent via-white/20 to-white/40 transition-opacity duration-300 z-30 rounded-3xl"
        style={{
          transform: `translate(${rotateY * 2}px, ${-rotateX * 2}px) translateZ(10px)`,
        }}
      />
      <div 
        style={{ 
          transform: rotateX !== 0 ? 'translateZ(20px)' : 'translateZ(0px)',
          transformStyle: 'preserve-3d'
        }} 
        className="h-full w-full flex flex-col justify-between transition-transform duration-300 ease-out"
      >
        {children}
      </div>
    </motion.div>
  );
};

type ModuleCategory = 'all' | 'gst' | 'itr' | 'litigation' | 'vault';

interface ModuleItem {
  id: string;
  title: string;
  badge: string;
  category: 'gst' | 'itr' | 'litigation' | 'vault';
  targetPath: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}

const TYPEWRITER_PHRASES = [
  'GST Returns (GSTR-1 & 3B)',
  'GST Notices & SCN Defense',
  'Income Tax & Form 3CD Audits',
  'Annual Returns (GSTR-9 & 9C)',
  'AES-256 Portal Key Vault',
  'GST Certificate REG-06 Sharing'
];

const Home: React.FC<HomeProps> = ({ onGetStarted }) => {
  const currentYear = new Date().getFullYear();
  const [activeCategory, setActiveCategory] = useState<ModuleCategory>('all');

  // Typewriter effect state
  const [typewriterText, setTypewriterText] = useState('');
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  // Main Heading Typewriter Effect
  const MAIN_HEADING = 'Clientify';
  const [headingChars, setHeadingChars] = useState('');
  const [isHeadingDone, setIsHeadingDone] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (headingChars.length < MAIN_HEADING.length) {
      timer = setTimeout(() => {
        setHeadingChars(MAIN_HEADING.slice(0, headingChars.length + 1));
      }, 100);
    } else {
      setIsHeadingDone(true);
    }
    return () => clearTimeout(timer);
  }, [headingChars]);

  useEffect(() => {
    const currentPhrase = TYPEWRITER_PHRASES[phraseIdx % TYPEWRITER_PHRASES.length];
    let timer: NodeJS.Timeout;

    if (!isDeleting) {
      if (typewriterText.length < currentPhrase.length) {
        timer = setTimeout(() => {
          setTypewriterText(currentPhrase.slice(0, typewriterText.length + 1));
        }, 70);
      } else {
        timer = setTimeout(() => {
          setIsDeleting(true);
        }, 1900);
      }
    } else {
      if (typewriterText.length > 0) {
        timer = setTimeout(() => {
          setTypewriterText(currentPhrase.slice(0, typewriterText.length - 1));
        }, 35);
      } else {
        setIsDeleting(false);
        setPhraseIdx(prev => (prev + 1) % TYPEWRITER_PHRASES.length);
      }
    }

    return () => clearTimeout(timer);
  }, [typewriterText, isDeleting, phraseIdx]);



  const modules: ModuleItem[] = [
    {
      id: 'dashboard',
      title: 'Executive Pulse Dashboard',
      badge: 'Nerve Center',
      category: 'vault',
      targetPath: 'dashboard',
      desc: 'Real-time firm workload analytics, compliance status counters, statutory deadline countdowns, and client activity logs.',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800'
    },
    {
      id: 'gst-portfolio',
      title: 'GST Client Master Hub',
      badge: 'Master Directory',
      category: 'gst',
      targetPath: 'gst-portfolio',
      desc: 'Unified GST master database with jurisdiction tags, trade names, state classifications, 1-click portal links, and status badges.',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800'
    },
    {
      id: 'gst-monthly',
      title: 'Monthly GST Filings',
      badge: 'GSTR-1 & 3B',
      category: 'gst',
      targetPath: 'gst-monthly',
      desc: 'Comprehensive monthly return tracking for GSTR-1, IFF, and GSTR-3B with interactive status count filters, grid view, and CSV export.',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: 'text-sky-600 dark:text-sky-400',
      bg: 'bg-sky-50 dark:bg-sky-950/50 border-sky-200 dark:border-sky-800'
    },
    {
      id: 'gst-quarterly',
      title: 'Quarterly QRMP Suite',
      badge: 'QRMP Compliance',
      category: 'gst',
      targetPath: 'gst-quarterly',
      desc: 'Dedicated QRMP compliance monitor for IFF filing months 1 & 2 and quarterly GSTR-3B return status tracking.',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      color: 'text-teal-600 dark:text-teal-400',
      bg: 'bg-teal-50 dark:bg-teal-950/50 border-teal-200 dark:border-teal-800'
    },
    {
      id: 'gst-composition',
      title: 'Composition Tax (CMP-08)',
      badge: 'CMP-08 & GSTR-4',
      category: 'gst',
      targetPath: 'gst-composition',
      desc: 'Quarterly CMP-08 tax payment tracker and GSTR-4 annual return status management for composition taxpayers.',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800'
    },
    {
      id: 'gstr9-9c',
      title: 'GSTR-9 & 9C Annual Audit',
      badge: 'Annual Compliance',
      category: 'gst',
      targetPath: 'gstr9-9c',
      desc: 'Financial year annual return tracking, GSTR-9C reconciliation audit manager, turnover eligibility filters, and audit logs.',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800'
    },
    {
      id: 'itr-filing',
      title: 'Income Tax Return Suite',
      badge: 'ITR-1 to ITR-7',
      category: 'itr',
      targetPath: 'itr-filing',
      desc: 'Income Tax Return filing lifecycle manager for individuals, firms, companies, and trusts. Tracks computation, 3CA/3CB audits, and refunds.',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
        </svg>
      ),
      color: 'text-violet-600 dark:text-violet-400',
      bg: 'bg-violet-50 dark:bg-violet-950/50 border-violet-200 dark:border-violet-800'
    },
    {
      id: 'lit-notice-pending',
      title: 'Litigation & Notice Vault',
      badge: 'GST & High Court',
      category: 'litigation',
      targetPath: 'lit-notice-pending',
      desc: 'End-to-end lifecycle tracking for GST statutory notices (Sec 61, 73, 74, DRC-01), First Appeals (APL-01), GSTAT Tribunals, and High Court Writs.',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
        </svg>
      ),
      color: 'text-rose-600 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800'
    },
    {
      id: 'credentials',
      title: 'Portal Credentials Vault',
      badge: 'Portal Passwords',
      category: 'vault',
      targetPath: 'credentials',
      desc: 'Centralized manager for portal usernames, passwords, and PINs across GST, Income Tax, Traces, e-Way bill, and MCA portals with 1-click copy.',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 0121 9z" />
        </svg>
      ),
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-950/50 border-purple-200 dark:border-purple-800'
    },
    {
      id: 'gstin-search',
      title: 'GSTIN & PAN Quick Search',
      badge: 'Portal Verification',
      category: 'vault',
      targetPath: 'gstin-search',
      desc: 'Instant lookup tool to search taxpayer registration status, jurisdiction details, legal trade name, and return filing history.',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
      color: 'text-cyan-600 dark:text-cyan-400',
      bg: 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-200 dark:border-cyan-800'
    },
    {
      id: 'ai-response-writer',
      title: 'Notice AI Response Drafter',
      badge: 'AI Legal Drafter',
      category: 'litigation',
      targetPath: 'ai-response-writer',
      desc: 'Intelligent AI assistant to draft legal replies, grounds of appeal, and statutory explanations for tax show-cause notices.',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
      color: 'text-pink-600 dark:text-pink-400',
      bg: 'bg-pink-50 dark:bg-pink-950/50 border-pink-200 dark:border-pink-800'
    }
  ];

  const filteredModules = activeCategory === 'all' 
    ? modules 
    : modules.filter(m => m.category === activeCategory);

  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-indigo-500 selection:text-white scroll-smooth font-sans overflow-x-hidden pt-24 sm:pt-28">
      
      {/* Ambient Aurora Mesh & Radial Glow Backdrop */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute left-[15%] top-[-5%] h-[550px] w-[550px] sm:h-[750px] sm:w-[750px] rounded-full bg-gradient-to-br from-indigo-500/15 via-purple-500/10 to-transparent blur-[140px] animate-pulse" />
        <div className="absolute right-[10%] top-[25%] h-[450px] w-[450px] sm:h-[650px] sm:w-[650px] rounded-full bg-gradient-to-br from-blue-500/15 via-cyan-500/10 to-transparent blur-[140px]" />
        <div className="absolute left-[30%] bottom-[10%] h-[350px] w-[350px] rounded-full bg-emerald-500/10 blur-[120px]" />
        {/* Subtle Geometric Background Dot Grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.035] dark:opacity-[0.07]" />
      </div>

      {/* Floating Pill Announcement Bar */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-5xl px-4 mb-6"
      >
        <div className="flex items-center justify-between gap-3 p-1.5 pl-3 pr-2 rounded-full bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs backdrop-blur-xl">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 shrink-0 animate-ping" />
            <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold uppercase tracking-wider border border-indigo-200/60 dark:border-indigo-800/60 shrink-0">v2026.1 OS</span>
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
              All-in-One Tax Tracking & Practice Management Software
            </p>
          </div>
          <button 
            onClick={() => onGetStarted('dashboard')}
            className="px-3.5 py-1.5 rounded-full bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold tracking-wide shrink-0 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
          >
            <span>Practice Hub</span>
            <span>→</span>
          </button>
        </div>
      </motion.div>

      {/* Hero Section */}
      <section className="relative flex flex-col items-center px-4 sm:px-8 lg:px-12 pt-2 pb-12 text-center max-w-[1536px] 2xl:max-w-[1720px] w-full">
        
        {/* Floating Glassmorphic Badges (Desktop & Large Screens) */}
        {/* Widget 1: Top Left */}
        <div className="hidden xl:flex absolute left-4 2xl:left-8 top-8 w-[240px] h-[92px] flex-col justify-between p-3.5 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-slate-200/80 dark:border-slate-800/80 shadow-[0_16px_36px_-6px_rgba(15,23,42,0.08),inset_0_1px_1px_rgba(255,255,255,0.9)] backdrop-blur-2xl animate-float z-20 pointer-events-auto hover:scale-105 hover:shadow-[0_20px_45px_-8px_rgba(16,185,129,0.18)] transition-all text-left">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm shadow-xs border border-emerald-200/50 dark:border-emerald-800/50 shrink-0">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">GSTR Return Easy Traceable</p>
              <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 truncate">100% Reconciled</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px] font-mono text-slate-500">
            <span>Monthly / QRMP</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Active</span>
          </div>
        </div>

        {/* Widget 2: Top Right */}
        <div className="hidden xl:flex absolute right-4 2xl:right-8 top-6 w-[240px] h-[92px] flex-col justify-between p-3.5 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-slate-200/80 dark:border-slate-800/80 shadow-[0_16px_36px_-6px_rgba(15,23,42,0.08),inset_0_1px_1px_rgba(255,255,255,0.9)] backdrop-blur-2xl animate-float [animation-delay:2s] z-20 pointer-events-auto hover:scale-105 hover:shadow-[0_20px_45px_-8px_rgba(244,63,94,0.18)] transition-all text-left">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-sm shadow-xs border border-rose-200/50 dark:border-rose-800/50 shrink-0">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">DRC-01 SCN Radar</p>
              <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400 truncate">Zero Overdue SCN</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px] font-mono text-slate-500">
            <span>Sec 73/74 Defense</span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">Protected</span>
          </div>
        </div>

        {/* Widget 3: Bottom Left */}
        <div className="hidden xl:flex absolute left-6 2xl:left-12 bottom-24 w-[240px] h-[92px] flex-col justify-between p-3.5 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-slate-200/80 dark:border-slate-800/80 shadow-[0_16px_36px_-6px_rgba(15,23,42,0.08),inset_0_1px_1px_rgba(255,255,255,0.9)] backdrop-blur-2xl animate-float [animation-delay:4s] z-20 pointer-events-auto hover:scale-105 hover:shadow-[0_20px_45px_-8px_rgba(245,158,11,0.18)] transition-all text-left">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-sm shadow-xs border border-amber-200/50 dark:border-amber-800/50 shrink-0">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 0121 9z" /></svg>
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">Portal Credentials Vault</p>
              <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 truncate">1-Click Portal Login</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px] font-mono text-slate-500">
            <span>Client Credentials</span>
            <span className="font-semibold text-amber-600 dark:text-amber-400">Stored In Database</span>
          </div>
        </div>

        {/* Widget 4: Bottom Right */}
        <div className="hidden xl:flex absolute right-6 2xl:right-12 bottom-28 w-[240px] h-[92px] flex-col justify-between p-3.5 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-slate-200/80 dark:border-slate-800/80 shadow-[0_16px_36px_-6px_rgba(15,23,42,0.08),inset_0_1px_1px_rgba(255,255,255,0.9)] backdrop-blur-2xl animate-float [animation-delay:3s] z-20 pointer-events-auto hover:scale-105 hover:shadow-[0_20px_45px_-8px_rgba(79,70,229,0.18)] transition-all text-left">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm shadow-xs border border-indigo-200/50 dark:border-indigo-800/50 shrink-0">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">Form GST REG-06</p>
              <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 truncate">Certificate PDF Sync</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px] font-mono text-slate-500">
            <span>Govt Verification QR</span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">A4 Ready</span>
          </div>
        </div>
        
        {/* Main Hero Header: Scaled Clientify Title & Prominent Typewriter Subtitle */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="mb-5 mt-4 text-center max-w-4xl mx-auto"
        >
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight mb-3 sm:mb-4 inline-flex items-center justify-center select-none">
            <span>{headingChars.slice(0, 6)}</span>
            <span className="text-indigo-600 dark:text-indigo-400">{headingChars.slice(6)}</span>
            <span className={`inline-block w-1 sm:w-1.5 md:w-2 h-7 sm:h-10 md:h-12 bg-indigo-600 dark:bg-indigo-400 ml-1.5 rounded-full align-middle transition-opacity duration-300 ${isHeadingDone ? 'opacity-0' : 'animate-pulse'}`} />
          </h1>

          <div className="flex items-center justify-center flex-wrap gap-2 text-lg sm:text-2xl md:text-3xl lg:text-3xl font-semibold text-slate-700 dark:text-slate-200 max-w-3xl mx-auto tracking-normal">
            <span className="text-slate-500 dark:text-slate-400 font-medium">The All-in-One Software for</span>
            <span className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 bg-clip-text text-transparent font-bold">
              {typewriterText}
            </span>
            <span className="inline-block w-0.5 sm:w-1 h-5 sm:h-7 bg-indigo-600 dark:bg-indigo-400 ml-0.5 animate-pulse align-middle" />
          </div>
        </motion.div>

        <motion.p 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mb-8 text-sm sm:text-base font-normal leading-relaxed text-slate-500 dark:text-slate-400 max-w-2xl mx-auto"
        >
          Easily manage GST returns, tax notices, Income Tax filings, GST certificates, and portal passwords in one simple workspace.
        </motion.p>

        {/* Primary CTA Button */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="flex items-center justify-center w-full max-w-md mx-auto mb-6"
        >
          <button 
            onClick={() => onGetStarted('dashboard')}
            className="w-full sm:w-auto relative group overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 p-[1px] transition-all shadow-xl shadow-indigo-600/20 active:scale-95 cursor-pointer"
          >
            <div className="relative px-9 py-3.5 rounded-2xl bg-slate-950/20 text-sm font-semibold text-white flex items-center justify-center gap-2.5">
              <span>Launch Clientify</span>
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
          </button>
        </motion.div>

        {/* Mobile / Tablet Quick Feature Chips */}
        <div className="flex xl:hidden flex-wrap items-center justify-center gap-2 mb-4 max-w-xl">
          <span className="px-3 py-1 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium shadow-xs flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span> GSTR Return Easy Traceable
          </span>
          <span className="px-3 py-1 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium shadow-xs flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500"></span> DRC-01 SCN Radar
          </span>
          <span className="px-3 py-1 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium shadow-xs flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500"></span> Portal Credentials
          </span>
          <span className="px-3 py-1 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium shadow-xs flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-indigo-500"></span> Form REG-06 PDF
          </span>
        </div>

      </section>

      {/* Trust & Performance Metrics Banner */}
      <section className="w-full border-y border-slate-200/80 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md py-6 px-4 mb-16">
        <div className="max-w-[1536px] 2xl:max-w-[1720px] mx-auto px-4 sm:px-8 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 text-center">
          <div className="p-4 sm:p-5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl hover:-translate-y-1 hover:shadow-lg hover:border-indigo-300 dark:hover:border-indigo-800 transition-all">
            <div className="text-2xl sm:text-3xl font-bold text-indigo-600 dark:text-indigo-400 tracking-tight font-mono tabular-nums">&lt; 10ms</div>
            <p className="text-xs font-medium text-slate-500 mt-1">Instant Search & Load</p>
          </div>
          <div className="p-4 sm:p-5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl hover:-translate-y-1 hover:shadow-lg hover:border-emerald-300 dark:hover:border-emerald-800 transition-all">
            <div className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight font-mono tabular-nums">100%</div>
            <p className="text-xs font-medium text-slate-500 mt-1">Notice & Appeal Tracking</p>
          </div>
          <div className="p-4 sm:p-5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl hover:-translate-y-1 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-800 transition-all">
            <div className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 tracking-tight font-mono tabular-nums">1-Click</div>
            <p className="text-xs font-medium text-slate-500 mt-1">Quick Portal Logins</p>
          </div>
          <div className="p-4 sm:p-5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl hover:-translate-y-1 hover:shadow-lg hover:border-purple-300 dark:hover:border-purple-800 transition-all">
            <div className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400 tracking-tight font-mono tabular-nums">Offline Mode</div>
            <p className="text-xs font-medium text-slate-500 mt-1">Works Even Without Internet</p>
          </div>
        </div>
      </section>



      {/* MODERN ASYMMETRIC BENTO GRID */}
      <section id="bento" className="w-full max-w-[1536px] 2xl:max-w-[1720px] mx-auto px-4 sm:px-8 lg:px-12 mb-24">
        <div className="text-center mb-10 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold uppercase tracking-widest border border-indigo-200/80 dark:border-indigo-800">
            Core Architecture
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
            Built for Fast & Smooth Daily Office Work
          </h2>
          <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
            Everything your CA and tax consultant office needs to manage clients, returns, and notices easily.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
          
          {/* Bento 1: Large 2-Col Card (GST Return & Filing Tracker) */}
          <div className="md:col-span-2 h-full min-h-[340px] p-6 sm:p-8 rounded-3xl bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-[0_12px_36px_-6px_rgba(15,23,42,0.06),inset_0_1px_1px_rgba(255,255,255,0.85)] dark:shadow-[0_12px_36px_-6px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.05)] hover:shadow-2xl hover:border-indigo-400/50 transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800">
                  Return Tracker
                </span>
                <span className="text-xs font-mono font-medium text-slate-400">Monthly Cycle</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                GST Return & Due Date Tracker
              </h3>
              <p className="text-xs sm:text-sm font-normal text-slate-500 dark:text-slate-400 mt-2 max-w-xl leading-relaxed">
                Automatic due date calendar for GSTR-1 (11th), QRMP IFF (13th), GSTR-3B (20th), and Tax Audits so your team never misses a filing deadline.
              </p>

              {/* Visual Statutory Timeline */}
              <div className="mt-6 grid grid-cols-4 gap-2 pt-2">
                {[
                  { day: '11th', title: 'GSTR-1 Monthly', status: 'Sales Statement' },
                  { day: '13th', title: 'IFF QRMP', status: 'Invoice Furnishing' },
                  { day: '20th', title: 'GSTR-3B', status: 'Tax Settlement' },
                  { day: '31st', title: 'ITR & Audit', status: 'Annual Filings' },
                ].map((step, idx) => (
                  <div key={idx} className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/60 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 text-center hover:scale-105 hover:shadow-md transition-all">
                    <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">{step.day}</span>
                    <p className="text-[10px] font-semibold text-slate-900 dark:text-white mt-0.5">{step.title}</p>
                    <p className="text-[9px] text-slate-400">{step.status}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Auto-configured for FY 2025-26</span>
              <button onClick={() => onGetStarted('gst-monthly')} className="text-xs font-semibold text-indigo-600 hover:underline">
                Explore Radar →
              </button>
            </div>
          </div>

          {/* Bento 2: 1-Col Card (Portal Credentials Manager) */}
          <div className="h-full min-h-[340px] p-6 sm:p-8 rounded-3xl bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-[0_12px_36px_-6px_rgba(15,23,42,0.06),inset_0_1px_1px_rgba(255,255,255,0.85)] dark:shadow-[0_12px_36px_-6px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.05)] hover:shadow-2xl hover:border-purple-400/50 transition-all flex flex-col justify-between group">
            <div>
              <div className="h-10 w-10 rounded-2xl bg-purple-50 dark:bg-purple-950 flex items-center justify-center text-purple-600 dark:text-purple-400 mb-4 shadow-xs border border-purple-200/50 dark:border-purple-800/50">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 0121 9z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Portal Credentials Vault
              </h3>
              <p className="text-xs font-normal text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                Centralized and organized storage for GST, Income Tax, Traces, e-Way bill, and MCA login credentials with quick 1-click clipboard copy.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase text-purple-600 dark:text-purple-400">Stored In Database</span>
              <button onClick={() => onGetStarted('credentials')} className="text-xs font-semibold text-purple-600 hover:underline">
                View Vault →
              </button>
            </div>
          </div>

          {/* Bento 3: 1-Col Card (Offline Mode) */}
          <div className="h-full min-h-[340px] p-6 sm:p-8 rounded-3xl bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-[0_12px_36px_-6px_rgba(15,23,42,0.06),inset_0_1px_1px_rgba(255,255,255,0.85)] dark:shadow-[0_12px_36px_-6px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.05)] hover:shadow-2xl hover:border-emerald-400/50 transition-all flex flex-col justify-between group">
            <div>
              <div className="h-10 w-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4 shadow-xs border border-emerald-200/50 dark:border-emerald-800/50">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Works Even Without Internet
              </h3>
              <p className="text-xs font-normal text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                Working at a client office or tax department with no internet? Clientify saves your work safely in your browser and syncs automatically when back online.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">Offline Supported</span>
            </div>
          </div>

          {/* Bento 4: Large 2-Col Card (Notice & Appeal Tracking) */}
          <div className="md:col-span-2 h-full min-h-[340px] p-6 sm:p-8 rounded-3xl bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-[0_12px_36px_-6px_rgba(15,23,42,0.06),inset_0_1px_1px_rgba(255,255,255,0.85)] dark:shadow-[0_12px_36px_-6px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.05)] hover:shadow-2xl hover:border-rose-400/50 transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800">
                  Notice Management
                </span>
                <span className="text-xs font-mono font-medium text-slate-400">Appeals & SCN</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Tax Notice & Appeal Tracking
              </h3>
              <p className="text-xs sm:text-sm font-normal text-slate-500 dark:text-slate-400 mt-2 max-w-xl leading-relaxed">
                Track tax notices through every stage: from Show Cause Notices (DRC-01, Sec 73/74) to Appeals (APL-01), GSTAT Tribunal, and High Court.
              </p>

              {/* Appellate Flowchart */}
              <div className="mt-6 flex items-center justify-between gap-1 overflow-x-auto pb-2">
                {[
                  { step: '01', title: 'SCN Notice', sub: 'Sec 61 / 73 / 74' },
                  { step: '02', title: '1st Appeal', sub: 'APL-01 / Order' },
                  { step: '03', title: 'Tribunal', sub: 'GSTAT Benches' },
                  { step: '04', title: 'High Court', sub: 'Art 226 Writs' },
                ].map((item, i) => (
                  <div key={i} className="flex-1 min-w-[90px] p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 text-center hover:scale-105 hover:shadow-md transition-all">
                    <span className="text-[9px] font-semibold text-indigo-500">{item.step}</span>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">{item.title}</p>
                    <p className="text-[9px] text-slate-400">{item.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Statutory 30/90-Day Limitation Watches</span>
              <button onClick={() => onGetStarted('lit-notice-pending')} className="text-xs font-semibold text-indigo-600 hover:underline">
                View Notice Tracker →
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* FULL MODULE CATALOG SECTION */}
      <section id="platform" className="w-full bg-slate-100/60 dark:bg-slate-900/60 py-16 sm:py-24 border-y border-slate-200/80 dark:border-slate-800">
        <div className="w-full max-w-[1536px] 2xl:max-w-[1720px] mx-auto px-4 sm:px-8 lg:px-12">
          <div className="mb-10 text-center space-y-3">
             <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold uppercase tracking-widest border border-indigo-200 dark:border-indigo-800">
               Practice Features
             </div>
             <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white tracking-tight">
               Built for <span className="text-indigo-600 dark:text-indigo-400">CAs & Tax Professionals</span>
             </h2>
             <p className="text-slate-600 dark:text-slate-300 font-normal text-xs sm:text-sm max-w-xl mx-auto">
               Everything designed to make your daily client handling, return filing, and notice tracking fast and easy.
             </p>

             {/* Category Filter Pills */}
             <div className="flex items-center justify-center gap-2 pt-4 flex-wrap">
               {[
                 { id: 'all', label: 'All Modules' },
                 { id: 'gst', label: 'GST Compliance' },
                 { id: 'itr', label: 'Income Tax' },
                 { id: 'litigation', label: 'Litigation & Appeals' },
                 { id: 'vault', label: 'Vault & Tools' }
               ].map((cat) => (
                 <button
                   key={cat.id}
                   onClick={() => setActiveCategory(cat.id as ModuleCategory)}
                   className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all border cursor-pointer ${
                     activeCategory === cat.id
                       ? 'bg-indigo-600 text-white border-indigo-600 shadow-md scale-105'
                       : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                   }`}
                 >
                   {cat.label}
                 </button>
               ))}
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6 items-stretch">
            {filteredModules.map((m, idx) => (
              <ParallaxCard 
                key={m.id} 
                index={idx}
                onClick={() => onGetStarted(m.targetPath)}
                className="h-full bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-[0_12px_36px_-6px_rgba(15,23,42,0.06),inset_0_1px_1px_rgba(255,255,255,0.85)] dark:shadow-[0_12px_36px_-6px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.05)] hover:border-indigo-400/50 flex flex-col justify-between"
              >
                <div className="w-full flex flex-col h-full justify-between min-h-[265px]">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className={`h-11 w-11 rounded-2xl ${m.bg} border flex items-center justify-center ${m.color} shadow-xs group-hover:scale-110 transition-transform shrink-0`}>
                        {m.icon}
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 shrink-0">
                        {m.badge}
                      </span>
                    </div>
                    <div className="min-h-[3rem] sm:min-h-[3.25rem] flex items-center mb-2">
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2 leading-snug">
                        {m.title}
                      </h3>
                    </div>
                    <p className="text-xs font-normal text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3 min-h-[3.75rem]">
                      {m.desc}
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 group-hover:underline">Launch Module</span>
                    <span className="text-indigo-600 dark:text-indigo-400 group-hover:translate-x-1.5 transition-transform font-bold">→</span>
                  </div>
                </div>
              </ParallaxCard>
            ))}
          </div>
        </div>
      </section>

      {/* CENTRALIZED DATABASE STORAGE SECTION */}
      <section id="security" className="w-full bg-slate-50 dark:bg-slate-950 py-16 sm:py-24 relative overflow-hidden">
        <div className="w-full max-w-[1536px] 2xl:max-w-[1720px] mx-auto px-4 sm:px-8 lg:px-12 relative z-10">
          <div className="mb-12 text-center space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold uppercase tracking-widest border border-indigo-200 dark:border-indigo-800">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
              <span>Safe & Organized Data</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white tracking-tight">
              Centralized <span className="text-indigo-600 dark:text-indigo-400">Database Storage</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-300 font-normal text-xs sm:text-sm max-w-xl mx-auto">
              All your client details, tax returns, notice records, and portal passwords are safely organized in your database.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {/* Card 1 */}
            <div className="h-full min-h-[275px] bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-[0_12px_36px_-6px_rgba(15,23,42,0.06),inset_0_1px_1px_rgba(255,255,255,0.85)] dark:shadow-[0_12px_36px_-6px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.05)] hover:shadow-2xl hover:border-indigo-400/50 transition-all flex flex-col justify-between group">
              <div>
                <div className="h-11 w-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-6 shadow-xs">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                </div>
                <div className="min-h-[2.5rem] flex items-center mb-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-tight">Structured Client Database</h3>
                </div>
                <p className="text-xs font-normal text-slate-500 dark:text-slate-400 leading-relaxed min-h-[3.75rem]">
                  Client details, GST numbers, return history, and tax documents are safely stored in your database for quick search anytime.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-semibold uppercase text-indigo-600 dark:text-indigo-400 tracking-widest">Database Persistence</span>
              </div>
            </div>

            {/* Card 2 */}
            <div className="h-full min-h-[275px] bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-[0_12px_36px_-6px_rgba(15,23,42,0.06),inset_0_1px_1px_rgba(255,255,255,0.85)] dark:shadow-[0_12px_36px_-6px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.05)] hover:shadow-2xl hover:border-amber-400/50 transition-all flex flex-col justify-between group">
              <div>
                <div className="h-11 w-11 rounded-2xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-6 shadow-xs">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 0121 9z" />
                  </svg>
                </div>
                <div className="min-h-[2.5rem] flex items-center mb-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-tight">Portal Passwords Manager</h3>
                </div>
                <p className="text-xs font-normal text-slate-500 dark:text-slate-400 leading-relaxed min-h-[3.75rem]">
                  Save and organize login usernames, passwords, and portal PINs for GST, Income Tax, Traces, and e-Way bill with 1-click easy copy.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400 tracking-widest">Stored In Database</span>
              </div>
            </div>

            {/* Card 3 */}
            <div className="h-full min-h-[275px] bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-[0_12px_36px_-6px_rgba(15,23,42,0.06),inset_0_1px_1px_rgba(255,255,255,0.85)] dark:shadow-[0_12px_36px_-6px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.05)] hover:shadow-2xl hover:border-emerald-400/50 transition-all flex flex-col justify-between group">
              <div>
                <div className="h-11 w-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-6 shadow-xs">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
                  </svg>
                </div>
                <div className="min-h-[2.5rem] flex items-center mb-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-tight">Auto-Sync & Offline Access</h3>
                </div>
                <p className="text-xs font-normal text-slate-500 dark:text-slate-400 leading-relaxed min-h-[3.75rem]">
                  Changes save automatically across your office computers, with offline mode so your work never stops even if internet drops.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400 tracking-widest">Fast & Reliable</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER SECTION */}
      <footer className="mt-auto w-full border-t border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 py-10">
        <div className="w-full max-w-[1536px] 2xl:max-w-[1720px] mx-auto px-4 sm:px-8 lg:px-12 flex flex-col md:flex-row justify-between items-center gap-8">
          
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2.5 mb-2">
               <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold overflow-hidden shadow-xs shrink-0">
                 <img 
                   src="/icon.png" 
                   alt="Logo" 
                   className="relative z-10 h-full w-full object-cover" 
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
               <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Client<span className="text-indigo-600 dark:text-indigo-400">ify</span></span>
            </div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">Tax Practice Intelligence Operating System</p>
          </div>
          
          <div className="text-center space-y-1">
             <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">Conceived & Developed By</p>
             <div className="text-xl sm:text-2xl font-bold text-indigo-700 dark:text-indigo-400 tracking-tight transition-colors">
                Advocate Prakhar Gupta
             </div>
             <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">High Court & Direct/Indirect Tax Counsel</p>
          </div>

          <div className="text-center md:text-right space-y-1.5">
             <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold">
               <span>© {currentYear} Clientify</span>
               <span className="text-slate-300 dark:text-slate-600">•</span>
               <span className="text-indigo-600 dark:text-indigo-400">All Rights Reserved</span>
             </div>
             <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
               Copyright Protected • Built for Legal & Tax Practitioners
             </p>
          </div>

        </div>
      </footer>
    </div>
  );
};

export default Home;
