import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FoodLicenseRecord } from '../types';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useQueryClient } from '@tanstack/react-query';

interface FoodPortalLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: FoodLicenseRecord | null;
  onDataChange?: () => void;
}

export const FoodPortalLoginModal: React.FC<FoodPortalLoginModalProps> = ({
  isOpen,
  onClose,
  record,
  onDataChange,
}) => {
  const [localRecord, setLocalRecord] = useState<FoodLicenseRecord | null>(record);
  const [userIdInput, setUserIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [isMasked, setIsMasked] = useState(false); // Plain text visible by default like GST modal
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    setLocalRecord(record);
    if (record) {
      setUserIdInput(record.licenseNo || '');
      setPasswordInput(record.password || '');
    }
    setCopiedId(false);
    setCopiedPass(false);
  }, [record, isOpen]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !localRecord) return null;

  const launchUrl = 'https://foscos.fssai.gov.in/public/';
  const originalUserId = localRecord.licenseNo || '';
  const originalPassword = localRecord.password || '';

  const isPasswordChanged = passwordInput.trim() !== originalPassword.trim();
  const isUserIdChanged = userIdInput.trim() !== originalUserId.trim();
  const hasChanges = isPasswordChanged || isUserIdChanged;

  const handleCopy = (text: string, label: 'User ID' | 'Password' | 'Link') => {
    if (!text) {
      toast.error(`No ${label} configured to copy`);
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        toast.success(`FSSAI ${label} copied!`);
        if (label === 'User ID') setCopiedId(true);
        if (label === 'Password') setCopiedPass(true);
      }).catch(() => {
        toast.info(`${label}: ${text}`);
      });
    }
  };

  const handleCopyBoth = () => {
    const text = `Portal: FoSCoS FSSAI\nUser ID / License No: ${userIdInput || 'N/A'}\nPassword: ${passwordInput || 'N/A'}\nURL: ${launchUrl}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        toast.success('Copied FSSAI License No & Password!');
      });
    }
  };

  const handleSaveCredentials = async () => {
    if (!localRecord) return;
    setIsSaving(true);
    try {
      const updated: FoodLicenseRecord = {
        ...localRecord,
        licenseNo: userIdInput.trim(),
        password: passwordInput.trim(),
      };

      await api.saveFoodLicense(updated);
      setLocalRecord(updated);
      queryClient.invalidateQueries({ queryKey: ['food_licenses'] });
      if (onDataChange) onDataChange();
      toast.success('FSSAI credentials updated and saved in vault!');
    } catch (err) {
      toast.error('Failed to update credentials in database');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLaunchPortal = async () => {
    if (hasChanges) {
      await handleSaveCredentials();
    }

    if (userIdInput.trim() && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(userIdInput.trim());
        setCopiedId(true);
      } catch (err) {}
    }

    toast.success('FSSAI License No / ID copied! Opening FoSCoS portal...');
    window.open(launchUrl, '_blank', 'noopener,noreferrer');
  };

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
            <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white text-lg font-black shadow-md shrink-0">
              🥗
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold uppercase tracking-tight text-white truncate">
                Direct Portal Login
              </h3>
              <p className="text-[11px] text-slate-400 font-medium truncate">
                {localRecord.tradeName || localRecord.clientName} {localRecord.licenseNo ? `• ${localRecord.licenseNo}` : ''}
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

        {/* Portal Info Pill Bar */}
        <div className="bg-slate-100/90 dark:bg-slate-850/90 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs border border-slate-200 dark:border-slate-700 flex items-center gap-1.5">
              <span>🥗</span>
              <span>FoSCoS FSSAI Portal</span>
            </span>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hidden sm:inline">
              Food Safety Compliance System
            </span>
          </div>
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded px-2 py-0.5 uppercase tracking-wide">
            {localRecord.licenseType || 'FSSAI License'}
          </span>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-4 bg-slate-50/50 dark:bg-slate-900/50 flex-1 overflow-y-auto no-scrollbar">
          
          {/* User ID Section - Editable with Auto-Copy */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <span>FSSAI License No / User ID</span>
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
                placeholder="Enter FSSAI License No or Application ID"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => handleCopy(userIdInput, 'User ID')}
                className="px-3.5 py-2.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shrink-0 border border-emerald-200 dark:border-emerald-800 cursor-pointer active:scale-95 shadow-2xs"
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
                <span>FoSCoS Portal Password (Visible & Editable)</span>
                {isPasswordChanged && (
                  <span className="text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-1.5 py-0.2 rounded">
                    Modified
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={() => setIsMasked(!isMasked)}
                className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium flex items-center gap-1 cursor-pointer"
                title={isMasked ? 'Show plain text' : 'Mask password'}
              >
                <span>{isMasked ? '👁️ Show' : '🙈 Hide'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type={isMasked ? 'password' : 'text'}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter FoSCoS portal password"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => handleCopy(passwordInput, 'Password')}
                className="px-3.5 py-2.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shrink-0 border border-emerald-200 dark:border-emerald-800 cursor-pointer active:scale-95 shadow-2xs"
                title="Copy Password"
              >
                <span>📋</span>
                <span>Copy</span>
              </button>
            </div>

            {/* Save Button for Edits */}
            {hasChanges && (
              <div className="pt-1 flex items-center justify-between animate-in fade-in duration-150">
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  ⚠️ Unsaved edits. Save to update record in vault.
                </span>
                <button
                  type="button"
                  onClick={handleSaveCredentials}
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <span>{isSaving ? '⏳ Saving...' : '💾 Save & Update Vault'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Direct Portal URL Link */}
          <div className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                Official FoSCoS Portal Link
              </span>
              <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400 truncate block font-medium">
                {launchUrl}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(launchUrl, 'Link')}
              className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Copy Portal Link"
            >
              Copy Link
            </button>
          </div>

          {/* Guidance Tip */}
          <div className="bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60 rounded-2xl p-3 sm:p-3.5 flex items-start gap-2.5">
            <span className="text-base shrink-0">💡</span>
            <p className="text-xs text-emerald-900 dark:text-emerald-200 font-medium leading-relaxed">
              <strong>User ID / License No is copied automatically</strong> when you click <strong>Open FoSCoS Portal</strong>! Press <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-mono text-[10px] font-bold shadow-2xs">Ctrl+V</kbd> on the login page to paste your User ID instantly.
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
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold uppercase text-xs tracking-wider transition-all shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2 group active:scale-[0.99] cursor-pointer"
          >
            <span>🚀 Open FoSCoS Portal & Copy ID</span>
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

export default FoodPortalLoginModal;
