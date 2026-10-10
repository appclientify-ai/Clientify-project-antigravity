import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Client, GSTProfile } from '../types';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useQueryClient } from '@tanstack/react-query';

interface GSTPortalLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  onDataChange?: () => void;
  initialType?: 'gst' | 'eway' | 'gstat';
}

export const GSTPortalLoginModal: React.FC<GSTPortalLoginModalProps> = ({
  isOpen,
  onClose,
  client,
  onDataChange,
  initialType = 'gst',
}) => {
  const [portalType, setPortalType] = useState<'gst' | 'eway' | 'gstat'>(initialType);
  const [localClient, setLocalClient] = useState<Client | null>(client);
  const [userIdInput, setUserIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [isMasked, setIsMasked] = useState(false); // Default is VISIBLE (not hidden)
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    setLocalClient(client);
  }, [client]);

  useEffect(() => {
    if (isOpen) {
      setPortalType(initialType);
      setCopiedId(false);
      setCopiedPass(false);
    }
  }, [isOpen, initialType]);

  // Sync inputs with currently selected portal
  useEffect(() => {
    if (localClient) {
      if (portalType === 'eway') {
        setUserIdInput(localClient.gstProfile?.ewayBillId || '');
        setPasswordInput(localClient.gstProfile?.ewayBillPass || '');
      } else if (portalType === 'gstat') {
        setUserIdInput(localClient.gstProfile?.gstatId || '');
        setPasswordInput(localClient.gstProfile?.gstatPass || '');
      } else {
        setUserIdInput(localClient.gstProfile?.username || localClient.gstProfile?.gstin || '');
        setPasswordInput(localClient.gstProfile?.password || '');
      }
      setCopiedId(false);
      setCopiedPass(false);
    }
  }, [portalType, localClient]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !localClient) return null;

  const getPortalDetails = () => {
    switch (portalType) {
      case 'eway':
        return {
          title: 'E-Way Bill Portal',
          subtitle: 'Official E-Way Bill System',
          icon: '🚚',
          bgGradient: 'from-emerald-950 to-slate-900',
          accentColor: 'emerald' as const,
          bgGlow: 'bg-emerald-500/20',
          badgeText: 'E-Way Bill Direct Login',
          userIdLabel: 'E-Way Bill User ID',
          passwordLabel: 'E-Way Bill Password',
          launchUrl: 'https://ewaybillgst.gov.in/login.aspx',
          launchButtonLabel: 'Open E-Way Bill Portal',
          idKey: 'ewayBillId' as const,
          passKey: 'ewayBillPass' as const,
        };
      case 'gstat':
        return {
          title: 'GSTAT Portal',
          subtitle: 'Appellate Tribunal System',
          icon: '⚖️',
          bgGradient: 'from-amber-950 to-slate-900',
          accentColor: 'amber' as const,
          bgGlow: 'bg-amber-500/20',
          badgeText: 'GSTAT Direct Login',
          userIdLabel: 'GSTAT User ID',
          passwordLabel: 'GSTAT Password',
          launchUrl: 'https://efiling.gstat.gov.in/',
          launchButtonLabel: 'Open GSTAT Portal',
          idKey: 'gstatId' as const,
          passKey: 'gstatPass' as const,
        };
      case 'gst':
      default:
        return {
          title: 'GST Portal',
          subtitle: 'National GST Portal Access',
          icon: '🔐',
          bgGradient: 'from-slate-900 to-indigo-950',
          accentColor: 'indigo' as const,
          bgGlow: 'bg-indigo-500/20',
          badgeText: 'GST Direct Login',
          userIdLabel: 'GST User ID / Username',
          passwordLabel: 'GST Password',
          launchUrl: 'https://services.gst.gov.in/services/login',
          launchButtonLabel: 'Open GST Portal',
          idKey: 'username' as const,
          passKey: 'password' as const,
        };
    }
  };

  const details = getPortalDetails();

  // Detect unsaved edits
  const originalUserId = portalType === 'eway' 
    ? (localClient.gstProfile?.ewayBillId || '')
    : portalType === 'gstat'
    ? (localClient.gstProfile?.gstatId || '')
    : (localClient.gstProfile?.username || localClient.gstProfile?.gstin || '');

  const originalPassword = portalType === 'eway'
    ? (localClient.gstProfile?.ewayBillPass || '')
    : portalType === 'gstat'
    ? (localClient.gstProfile?.gstatPass || '')
    : (localClient.gstProfile?.password || '');

  const isPasswordChanged = passwordInput.trim() !== originalPassword.trim();
  const isUserIdChanged = userIdInput.trim() !== originalUserId.trim();
  const hasChanges = isPasswordChanged || isUserIdChanged;

  const handleCopy = (text: string, label: 'User ID' | 'Password' | 'Link') => {
    if (!text) {
      toast.error(`No ${label} to copy`);
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        toast.success(`${details.title} ${label} copied!`);
        if (label === 'User ID') setCopiedId(true);
        if (label === 'Password') setCopiedPass(true);
      }).catch(() => {
        toast.info(`${label}: ${text}`);
      });
    }
  };

  const handleCopyBoth = () => {
    const text = `Portal: ${details.title}\nUser ID: ${userIdInput || 'N/A'}\nPassword: ${passwordInput || 'N/A'}\nURL: ${details.launchUrl}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        toast.success(`Copied User ID & Password for ${details.title}!`);
      });
    }
  };

  // Save changes to database permanently
  const handleSaveCredentials = async () => {
    if (!localClient) return;
    setIsSaving(true);
    try {
      const baseProfile: GSTProfile = localClient.gstProfile || {
        gstin: '',
        username: '',
        gstStatus: 'Active',
        regDate: new Date().toISOString().split('T')[0],
        regType: 'Regular',
        filingFreq: 'Monthly',
        constitution: 'Proprietorship',
        jurisdictionType: 'State',
        stakeholders: [],
      };

      const updatedProfile: GSTProfile = { ...baseProfile };
      if (portalType === 'eway') {
        updatedProfile.ewayBillId = userIdInput.trim();
        updatedProfile.ewayBillPass = passwordInput.trim();
      } else if (portalType === 'gstat') {
        updatedProfile.gstatId = userIdInput.trim();
        updatedProfile.gstatPass = passwordInput.trim();
      } else {
        updatedProfile.username = userIdInput.trim();
        updatedProfile.password = passwordInput.trim();
      }

      const updatedClient: Client = {
        ...localClient,
        gstProfile: updatedProfile,
      };

      const saved = await api.saveClient(updatedClient);
      setLocalClient(saved);
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['gst_clients'] });
      if (onDataChange) onDataChange();
      toast.success(`${details.title} credentials updated and saved in vault!`);
    } catch (err) {
      toast.error('Failed to update credentials in database');
    } finally {
      setIsSaving(false);
    }
  };

  // Open Portal in new tab & copy User ID
  const handleLaunchPortal = async () => {
    // Auto-save changes if user edited ID or password
    if (hasChanges) {
      await handleSaveCredentials();
    }

    // Copy User ID to clipboard
    if (userIdInput.trim() && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(userIdInput.trim());
        setCopiedId(true);
      } catch (err) {}
    }

    toast.success(`${details.title} User ID copied! Opening portal...`);
    window.open(details.launchUrl, '_blank', 'noopener,noreferrer');
  };

  const accentColorClasses = {
    indigo: {
      text: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-950/60',
      hoverBg: 'hover:bg-indigo-100 dark:hover:bg-indigo-900/60',
      border: 'border-indigo-200 dark:border-indigo-800',
      glow: 'shadow-indigo-600/30',
      btn: 'bg-indigo-600 hover:bg-indigo-700',
      bannerText: 'text-indigo-900 dark:text-indigo-200',
      bannerBg: 'bg-indigo-50/70 dark:bg-indigo-950/40',
      bannerBorder: 'border-indigo-100 dark:border-indigo-900/60',
      kbd: 'border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300',
    },
    emerald: {
      text: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/60',
      hoverBg: 'hover:bg-emerald-100 dark:hover:bg-emerald-900/60',
      border: 'border-emerald-200 dark:border-emerald-800',
      glow: 'shadow-emerald-600/30',
      btn: 'bg-emerald-600 hover:bg-emerald-700',
      bannerText: 'text-emerald-900 dark:text-emerald-200',
      bannerBg: 'bg-emerald-50/70 dark:bg-emerald-950/40',
      bannerBorder: 'border-emerald-100 dark:border-emerald-900/60',
      kbd: 'border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
    },
    amber: {
      text: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/60',
      hoverBg: 'hover:bg-amber-100 dark:hover:bg-amber-900/60',
      border: 'border-amber-200 dark:border-amber-800',
      glow: 'shadow-amber-600/30',
      btn: 'bg-amber-600 hover:bg-amber-700',
      bannerText: 'text-amber-900 dark:text-amber-200',
      bannerBg: 'bg-amber-50/70 dark:bg-amber-950/40',
      bannerBorder: 'border-amber-100 dark:border-amber-900/60',
      kbd: 'border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
    },
  }[details.accentColor];

  const modalContent = (
    <div 
      className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 overflow-hidden"
      onClick={onClose}
    >
      <div 
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg max-h-[92vh] bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col animate-in zoom-in-95 duration-200 transition-all font-sans"
      >
        {/* Header Hero */}
        <header className="px-5 py-4 sm:px-6 bg-slate-900 dark:bg-slate-950 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`h-10 w-10 rounded-xl ${accentColorClasses.btn} flex items-center justify-center text-white text-lg font-black shadow-md shrink-0`}>
              {details.icon}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold uppercase tracking-tight text-white truncate">
                Direct Portal Login
              </h3>
              <p className="text-[11px] text-slate-400 font-medium truncate">
                {localClient.tradeName || localClient.legalName} {localClient.gstProfile?.gstin ? `• ${localClient.gstProfile.gstin}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0 ml-2 active:scale-95 shadow-2xs"
            title="Close (Esc)"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Tab switcher inside the modal */}
        <div className="bg-slate-100/90 dark:bg-slate-850/90 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-2 flex items-center gap-2 shrink-0 overflow-x-auto no-scrollbar">
          {[
            { id: 'gst', label: 'GST Portal', icon: '🔐' },
            { id: 'eway', label: 'E-Way Bill', icon: '🚚' },
            { id: 'gstat', label: 'GSTAT Portal', icon: '⚖️' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPortalType(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                portalType === tab.id
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content Body (Scrollable with max height protection) */}
        <div className="p-4 sm:p-6 space-y-4 bg-slate-50/50 dark:bg-slate-900/50 flex-1 overflow-y-auto no-scrollbar">
          
          {/* User ID Section - Editable with Auto-Copy */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <span>{details.userIdLabel}</span>
                {isUserIdChanged && (
                  <span className="text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold px-1.5 py-0.2 rounded">
                    Modified
                  </span>
                )}
              </label>
              {copiedId && (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                  ✓ Copied to Clipboard
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                placeholder={`Enter ${details.userIdLabel}`}
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => handleCopy(userIdInput, 'User ID')}
                className={`px-3 py-2.5 ${accentColorClasses.bg} ${accentColorClasses.hoverBg} ${accentColorClasses.text} font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shrink-0 border ${accentColorClasses.border} cursor-pointer active:scale-95`}
                title="Copy User ID"
              >
                <span>📋</span>
                <span>Copy</span>
              </button>
            </div>
          </div>

          {/* Password Section - VISIBLE BY DEFAULT & DIRECTLY EDITABLE */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <span>{details.passwordLabel} (Visible & Editable)</span>
                {isPasswordChanged && (
                  <span className="text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-1.5 py-0.2 rounded">
                    Modified
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMasked(!isMasked)}
                  className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium flex items-center gap-1 cursor-pointer"
                  title={isMasked ? 'Show plain text' : 'Mask password'}
                >
                  <span>{isMasked ? '👁️ Show' : '🙈 Hide'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type={isMasked ? 'password' : 'text'}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder={`Enter ${details.passwordLabel}`}
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => handleCopy(passwordInput, 'Password')}
                className={`px-3 py-2.5 ${accentColorClasses.bg} ${accentColorClasses.hoverBg} ${accentColorClasses.text} font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shrink-0 border ${accentColorClasses.border} cursor-pointer active:scale-95`}
                title="Copy Password"
              >
                <span>📋</span>
                <span>Copy</span>
              </button>
            </div>

            {/* Save Button for Password Updates */}
            {hasChanges && (
              <div className="pt-1 flex items-center justify-between animate-in fade-in duration-150">
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  ⚠️ Unsaved edits. Save to update client profile.
                </span>
                <button
                  type="button"
                  onClick={handleSaveCredentials}
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <span>{isSaving ? '⏳ Saving...' : '💾 Save & Update Profile'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Direct Portal URL Link */}
          <div className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                Official Portal Link
              </span>
              <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400 truncate block font-medium">
                {details.launchUrl}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(details.launchUrl, 'Link')}
              className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Copy Portal Link"
            >
              Copy Link
            </button>
          </div>

          {/* Guidance Tip */}
          <div className={`${accentColorClasses.bannerBg} border ${accentColorClasses.bannerBorder} rounded-2xl p-3 sm:p-3.5 flex items-start gap-2.5`}>
            <span className="text-base shrink-0">💡</span>
            <p className={`text-xs ${accentColorClasses.bannerText} font-medium leading-relaxed`}>
              <strong>User ID is copied automatically</strong> when you click <strong>Open Portal</strong>! Press <kbd className={`px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded border ${accentColorClasses.kbd} font-mono text-[10px] font-bold shadow-2xs`}>Ctrl+V</kbd> on the login page to paste your User ID instantly.
            </p>
          </div>

        </div>

        {/* Modal Action Footer */}
        <footer className="p-4 sm:p-5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 sm:px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shrink-0 cursor-pointer"
          >
            Close
          </button>
          
          <button
            type="button"
            onClick={handleCopyBoth}
            className="px-3 sm:px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all shrink-0 cursor-pointer hidden sm:flex items-center gap-1.5"
            title="Copy ID & Password"
          >
            <span>📋</span>
            <span>Copy Both</span>
          </button>

          <button
            type="button"
            onClick={handleLaunchPortal}
            disabled={isSaving}
            className={`flex-1 py-3 ${accentColorClasses.btn} text-white rounded-xl font-bold uppercase text-xs tracking-wider transition-all shadow-md ${accentColorClasses.glow} flex items-center justify-center gap-2 group active:scale-[0.99] cursor-pointer`}
          >
            <span>🚀 {details.launchButtonLabel} & Copy ID</span>
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </footer>

      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};

export default GSTPortalLoginModal;
