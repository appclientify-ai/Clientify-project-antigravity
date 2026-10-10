import React, { useState, useEffect } from 'react';

interface LoaderProps {
  title?: string;
  subtitle?: string;
  statusText?: string;
}

const Loader: React.FC<LoaderProps> = ({
  title = 'Clientify',
  subtitle = 'Loading Practice Workspace...',
  statusText
}) => {
  const [stepIndex, setStepIndex] = useState(0);

  const loadingSteps = [
    'Connecting database...',
    'Checking session...',
    'Loading practice modules...',
    'Workspace ready'
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex((prev) => (prev < loadingSteps.length - 1 ? prev + 1 : prev));
    }, 450);

    return () => clearInterval(timer);
  }, []);

  const currentStatus = statusText || loadingSteps[stepIndex];

  return (
    <div className="fixed inset-0 z-[9999] flex h-screen w-full flex-col items-center justify-center bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-2xl text-slate-900 dark:text-white select-none overflow-hidden transition-colors duration-300">
      
      {/* High-tech ambient background lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full bg-gradient-to-tr from-indigo-500/15 via-purple-500/10 to-cyan-500/15 blur-3xl pointer-events-none animate-pulse-glow" />
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />

      {/* Main High-Tech Container */}
      <div className="relative z-10 flex flex-col items-center max-w-sm w-full px-6 text-center animate-in fade-in zoom-in-95 duration-400">
        
        {/* Orbital Radar / Rotating Rings & Logo Badge */}
        <div className="relative flex items-center justify-center mb-8">
          
          {/* Outer glowing orbital pulse ring */}
          <div className="absolute -inset-6 rounded-full bg-indigo-500/20 dark:bg-indigo-500/30 blur-xl animate-pulse" />

          {/* SVG Tech Ring: Clockwise Dash Spin */}
          <svg className="absolute -inset-4 h-28 w-28 md:h-32 md:w-32 animate-[spin_8s_linear_infinite]" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="8 6 16 6"
              className="text-indigo-400/40 dark:text-indigo-400/50"
            />
          </svg>

          {/* SVG Tech Ring: Counter-Clockwise Outer Accent */}
          <svg className="absolute -inset-6 h-32 w-32 md:h-36 md:w-36 animate-[spin_12s_linear_infinite_reverse]" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="56"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="4 12 24 12"
              className="text-cyan-400/35 dark:text-cyan-400/45"
            />
          </svg>

          {/* Central Logo Box with Clean Glass Shadow */}
          <div className="relative flex h-20 w-20 md:h-24 md:w-24 items-center justify-center rounded-2xl bg-white dark:bg-slate-900 p-2 border border-slate-200/80 dark:border-slate-800 shadow-[0_16px_40px_rgba(79,70,229,0.2)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.5)] overflow-hidden transition-transform duration-300 hover:scale-105">
            <img 
              src="/icon.png" 
              alt="Clientify Logo" 
              className="h-full w-full rounded-xl object-cover transition-opacity duration-500"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (!target.dataset.triedIcon) {
                  target.dataset.triedIcon = 'true';
                  target.src = '/icon.svg';
                } else {
                  const parent = target.parentElement;
                  if (parent) {
                    parent.innerHTML = `<span class="text-2xl md:text-3xl font-black text-indigo-600 dark:text-indigo-400">C</span>`;
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Brand Title & Version Tag */}
        <div className="flex items-center justify-center gap-2 mb-1.5">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 text-[10px] font-semibold border border-indigo-200/60 dark:border-indigo-800/60">
            v2026.1 OS
          </span>
        </div>

        {/* Dynamic Status Text */}
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-5 min-h-[1.25rem]">
          {subtitle}
        </p>

        {/* High-Tech Animated Gradient Shimmer Progress Bar */}
        <div className="w-full max-w-[240px] h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative mb-3">
          <div className="absolute inset-y-0 left-0 h-full w-2/5 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 animate-[shimmer_1.4s_cubic-bezier(0.4,0,0.2,1)_infinite] shadow-sm shadow-indigo-500/50" />
        </div>

        {/* Live Step Tracker */}
        <div className="flex items-center gap-2 text-[11px] font-mono text-indigo-600 dark:text-indigo-400 transition-all duration-300">
          <span className="flex h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping" />
          <span className="font-semibold">{currentStatus}</span>
        </div>

        {/* Micro-Telemetry Status Chips */}
        <div className="mt-8 pt-5 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-center gap-4 text-[10px] font-mono text-slate-400 dark:text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Database</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
            <span>Local Cache</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            <span>Sync Engine</span>
          </span>
        </div>

      </div>

      <style>{`
        @keyframes shimmer {
          0% {
            left: -40%;
            width: 35%;
          }
          50% {
            width: 50%;
          }
          100% {
            left: 100%;
            width: 35%;
          }
        }
      `}</style>
    </div>
  );
};

export default Loader;
