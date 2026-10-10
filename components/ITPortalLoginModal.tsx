import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Client, ITProfile } from '../types';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useQueryClient } from '@tanstack/react-query';

interface ITPortalLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  onDataChange?: () => void;
  initialType?: 'it' | 'traces';
}

export const ITPortalLoginModal: React.FC<ITPortalLoginModalProps> = ({
  isOpen,
  onClose,
  client,
  onDataChange,
  initialType = 'it',
}) => {
  const [portalType, setPortalType] = useState<'it' | 'traces'>(initialType);
  const [localClient, setLocalClient] = useState<Client | null>(client);
  const [userIdInput, setUserIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [isMasked, setIsMasked] = useState(false); // Default: Plain text visible
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

  // Sync inputs with selected portal
  useEffect(() => {
    if (localClient) {
      const itProf = localClient.itProfile;
      if (portalType === 'traces') {
        setUserIdInput(itProf?.pan || '');
        setPasswordInput((itProf as any)?.tracesPassword || itProf?.password || '');
      } else {
        setUserIdInput(itProf?.username || itProf?.pan || '');
        setPasswordInput(itProf?.password || '');
      }
      setCopiedId(false);
      setCopiedPass(false);
    }
  }, [portalType, localClient]);

  // Close on ESC
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
    if (portalType === 'traces') {
      return {
        title: 'TRACES Portal',
        subtitle: 'TDS Reconciliation Analysis and Correction Enabling System',
        icon: '📄',
        bgGradient: 'from-emerald-950 to-slate-900',
        accentColor: 'emerald' as const,
        badgeText: 'TRACES Direct Login',
        userIdLabel: 'User ID (PAN / TAN)',
        passwordLabel: 'TRACES Password',
        launchUrl: 'https://contents.tdscpc.gov.in/',
        launchButtonLabel: 'Open TRACES Portal',
      };
    }
    return {
      title: 'IT e-Filing Portal',
      subtitle: 'Income Tax Department National Portal',
      icon: '🏛️',
      bgGradient: 'from-slate-900 to-indigo-950',
      accentColor: 'indigo' as const,
      badgeText: 'IT e-Portal Direct Login',
      userIdLabel: 'User ID (PAN)',
      passwordLabel: 'e-Filing Password',
      launchUrl: 'https://eportal.incometax.gov.in/iec/foservices/#/login',
      launchButtonLabel: 'Open IT Portal',
    };
  };

  const details = getPortalDetails();

  const handleCopy = (text: string, type: 'id' | 'pass') => {
    if (!text) {
      toast.error('Nothing to copy');
      return;
    }
    navigator.clipboard.writeText(text);
    if (type === 'id') {
      setCopiedId(true);
      toast.success(`${details.userIdLabel} copied to clipboard!`);
      setTimeout(() => setCopiedId(false), 2000);
    } else {
      setCopiedPass(true);
      toast.success(`${details.passwordLabel} copied to clipboard!`);
      setTimeout(() => setCopiedPass(false), 2000);
    }
  };

  const handleSaveCredentials = async (silent = false): Promise<boolean> => {
    if (!localClient) return false;
    setIsSaving(true);
    try {
      const currentProfile: Partial<ITProfile> = localClient.itProfile || {
        pan: userIdInput.toUpperCase().trim(),
        username: userIdInput.toUpperCase().trim(),
        category: 'Individual'
      };

      let updatedProfile: Partial<ITProfile>;
      if (portalType === 'traces') {
        updatedProfile = {
          ...currentProfile,
          ...(userIdInput ? { pan: userIdInput.toUpperCase().trim() } : {}),
          ...({ tracesPassword: passwordInput.trim() } as any),
        };
      } else {
        updatedProfile = {
          ...currentProfile,
          username: userIdInput.trim() || currentProfile.username,
          password: passwordInput.trim(),
        };
      }

      const updatedClient: Client = {
        ...localClient,
        itProfile: updatedProfile as ITProfile,
      };

      await api.saveClient(updatedClient);
      setLocalClient(updatedClient);
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['it_clients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      window.dispatchEvent(new Event('clientify_db_change'));

      if (!silent) {
        toast.success(`Updated ${details.title} credentials in Vault!`);
      }
      if (onDataChange) onDataChange();
      return true;
    } catch (err: any) {
      toast.error(`Failed to save credentials: ${err.message || 'Server error'}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleLaunchPortal = async () => {
    // 1. Copy PAN / User ID immediately
    const idToCopy = userIdInput.trim() || localClient.itProfile?.pan || '';
    if (idToCopy) {
      navigator.clipboard.writeText(idToCopy);
      toast.success(`Copied ${idToCopy} to clipboard!`);
    }

    // 2. Check if password was modified and save
    const currentStoredPass = portalType === 'traces'
      ? ((localClient.itProfile as any)?.tracesPassword || localClient.itProfile?.password || '')
      : (localClient.itProfile?.password || '');

    if (passwordInput.trim() !== currentStoredPass) {
      await handleSaveCredentials(true);
    }

    // 3. Open portal in new tab
    window.open(details.launchUrl, '_blank');
    onClose();
  };

  const currentStoredPass = portalType === 'traces'
    ? ((localClient.itProfile as any)?.tracesPassword || localClient.itProfile?.password || '')
    : (localClient.itProfile?.password || '');
  const hasUnsavedChanges = passwordInput.trim() !== currentStoredPass;

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 ring-1 ring-black/5 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-5 sm:p-6 bg-gradient-to-br ${details.bgGradient} text-white relative overflow-hidden shrink-0`}>
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-start justify-between relative z-10 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-11 w-11 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-xl shrink-0 border border-white/10 shadow-inner">
                {details.icon}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                    {details.badgeText}
                  </span>
                  {localClient.itProfile?.category && (
                    <span className="text-[9px] font-semibold bg-white/15 px-2 py-0.5 rounded-full text-slate-200">
                      {localClient.itProfile.category}
                    </span>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white truncate mt-0.5">
                  {localClient.legalName || localClient.tradeName}
                </h3>
                <p className="text-[11px] text-slate-300 font-mono truncate">
                  PAN: {localClient.itProfile?.pan || '---'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all shrink-0 cursor-pointer active:scale-95 shadow-2xs"
              title="Close (Esc)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Portal Switcher Tabs */}
          <div className="flex gap-2 mt-4 pt-3 border-t border-white/10 relative z-10">
            <button
              type="button"
              onClick={() => setPortalType('it')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                portalType === 'it'
                  ? 'bg-white text-slate-900 shadow-md font-bold'
                  : 'bg-white/10 hover:bg-white/15 text-slate-200'
              }`}
            >
              <span>🏛️</span>
              <span>IT e-Filing</span>
            </button>
            <button
              type="button"
              onClick={() => setPortalType('traces')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                portalType === 'traces'
                  ? 'bg-white text-slate-900 shadow-md font-bold'
                  : 'bg-white/10 hover:bg-white/15 text-slate-200'
              }`}
            >
              <span>📄</span>
              <span>TRACES (TDS)</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto no-scrollbar flex-1 bg-white dark:bg-slate-900">
          
          {/* User ID / PAN Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {details.userIdLabel}
              </label>
              <span className="text-[10px] text-slate-400">Auto-copies on Launch</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value.toUpperCase())}
                placeholder="ABCDE1234F"
                className="flex-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl font-mono text-xs font-bold text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => handleCopy(userIdInput, 'id')}
                className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-all shrink-0 cursor-pointer ${
                  copiedId
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 text-emerald-600 dark:text-emerald-400'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750'
                }`}
                title="Copy User ID"
              >
                {copiedId ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
          </div>

          {/* Password Field - VISIBLE by default & directly editable */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>{details.passwordLabel}</span>
                {hasUnsavedChanges && (
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.2 rounded">
                    Modified
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMasked(!isMasked)}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                >
                  {isMasked ? '👁️ Show' : '🙈 Hide'}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={isMasked ? 'password' : 'text'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter portal password"
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl font-mono text-xs font-bold text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <button
                type="button"
                onClick={() => handleCopy(passwordInput, 'pass')}
                className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-all shrink-0 cursor-pointer ${
                  copiedPass
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 text-emerald-600 dark:text-emerald-400'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750'
                }`}
                title="Copy Password"
              >
                {copiedPass ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              ✏️ Password is plain text & editable. Edits will auto-save to Vault when launching portal.
            </p>
          </div>

          {/* Quick Helper Banner */}
          <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/60 rounded-2xl flex items-center gap-2.5 text-xs text-indigo-900 dark:text-indigo-200">
            <span className="text-base shrink-0">💡</span>
            <span className="text-[11px] leading-relaxed">
              Clicking <strong>Open Portal</strong> will copy the <strong>PAN</strong> and open the official website in a new tab.
            </span>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          {hasUnsavedChanges ? (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSaveCredentials(false)}
              className="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : '💾 Save to Vault'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
            >
              Close
            </button>
          )}

          <button
            type="button"
            onClick={handleLaunchPortal}
            disabled={isSaving}
            className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs shadow-md shadow-indigo-600/20 hover:shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span>🚀</span>
            <span>{details.launchButtonLabel} & Copy PAN</span>
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};

export default ITPortalLoginModal;
