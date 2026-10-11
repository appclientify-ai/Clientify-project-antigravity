
import React, { useState, useEffect } from 'react';
import { getStoredUiSettings, THEME_COLORS } from '../services/theme.ts';

interface NavbarProps {
  onLoginClick: () => void;
  onHomeClick: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onLoginClick, onHomeClick }) => {
  const [settings, setSettings] = useState(getStoredUiSettings());

  useEffect(() => {
    // Keep settings in sync with any external updates
    const handleSettingsChange = (e: Event) => {
      const customEv = e as CustomEvent;
      if (customEv.detail) {
        setSettings(customEv.detail);
      }
    };
    window.addEventListener('clientify_ui_settings_changed', handleSettingsChange);
    return () => {
      window.removeEventListener('clientify_ui_settings_changed', handleSettingsChange);
    };
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      onHomeClick();
    }
  };

  const currentThemeColor = THEME_COLORS.find(c => c.id === settings.themeColor) || THEME_COLORS[0];

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] w-full bg-white/80 dark:bg-slate-900/80 px-4 sm:px-8 lg:px-12 py-3.5 sm:py-4 backdrop-blur-2xl border-b border-slate-200/80 dark:border-slate-800/80 transition-all">
      <div className="w-full max-w-[1720px] mx-auto flex items-center justify-between relative">
        
        {/* Brand/Logo */}
        <button onClick={onHomeClick} className="flex items-center gap-3.5 sm:gap-4 group text-left cursor-pointer">
          <div className="relative flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-bold overflow-hidden border border-indigo-400/30 dark:border-indigo-500/30 shadow-md shadow-indigo-500/20 shrink-0 transition-transform group-hover:scale-105">
            <img 
              src="/icon.png" 
              alt="Clientify Logo" 
              className="relative z-10 h-full w-full object-cover rounded-full" 
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
            <span className="absolute z-0 text-xl sm:text-2xl font-black text-white">C</span>
          </div>
          <div className="text-left">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight block leading-none">
              Client<span style={{ color: currentThemeColor.primary }}>ify</span>
            </span>
            <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 mt-1.5 block">
              Practice Suite
            </span>
          </div>
        </button>
        
        {/* Navigation Items and Switchers */}
        <div className="flex items-center gap-4 sm:gap-7">
          <div className="hidden lg:flex items-center gap-8 border-r border-slate-200/80 dark:border-slate-800 pr-8 mr-1">
             <button onClick={() => scrollToSection('bento')} className="text-xs sm:text-sm font-semibold text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 transition-colors cursor-pointer tracking-normal">Capabilities</button>
             <button onClick={() => scrollToSection('platform')} className="text-xs sm:text-sm font-semibold text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 transition-colors cursor-pointer tracking-normal">Modules</button>
             <button onClick={() => scrollToSection('security')} className="text-xs sm:text-sm font-semibold text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 transition-colors cursor-pointer tracking-normal">Storage & Sync</button>
          </div>

          <button 
            onClick={onLoginClick} 
            style={{ backgroundColor: currentThemeColor.primary }}
            className="rounded-xl px-5 sm:px-7 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-white transition-all hover:brightness-110 hover:-translate-y-0.5 shadow-md active:scale-95 whitespace-nowrap tracking-wide cursor-pointer"
          >
            Consultant Login
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
