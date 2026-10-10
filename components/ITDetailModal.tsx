import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Client, ITProfile } from '../types';
import { formatDate } from '../exportUtils';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useQueryClient } from '@tanstack/react-query';
import CredentialShareModal from './CredentialShareModal';

interface ITDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  onEdit?: (client: Client) => void;
  onDataChange?: () => void;
}

const ITDetailModal: React.FC<ITDetailModalProps> = ({ isOpen, onClose, client, onEdit, onDataChange }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'personal_employment' | 'bank_notes'>('overview');
  const [showPassword, setShowPassword] = useState(true);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const [localClient, setLocalClient] = useState<Client | null>(client);
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [newPassVal, setNewPassVal] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    setLocalClient(client);
  }, [client]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isShareModalOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isShareModalOpen, onClose]);

  if (!isOpen || !localClient) return null;

  const currentClient = localClient;
  const itProf = currentClient.itProfile;

  const handleSavePassword = async () => {
    if (!currentClient) return;
    if (!newPassVal.trim()) {
      toast.error("Password cannot be empty");
      return;
    }
    setIsSavingPassword(true);
    try {
      const baseProfile: ITProfile = currentClient.itProfile || {
        pan: currentClient.gstProfile?.pan || '',
        category: 'Individual',
        username: currentClient.gstProfile?.pan || '',
        password: ''
      };
      const updated: Client = {
        ...currentClient,
        itProfile: {
          ...baseProfile,
          password: newPassVal.trim()
        }
      };
      await api.saveClient(updated);
      setLocalClient(updated);
      setIsEditingPassword(false);
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['it_clients'] });
      toast.success("e-Filing Password updated instantly!");
      if (onDataChange) onDataChange();
    } catch (err) {
      toast.error("Failed to update password");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const handlePortalLogin = () => {
    if (currentClient.itProfile?.pan) {
      navigator.clipboard.writeText(currentClient.itProfile.pan);
      toast.success('PAN copied! Opening Income Tax Portal...');
    }
    window.open(`https://eportal.incometax.gov.in/iec/foservices/#/login`, '_blank');
  };

  const modalContent = (
    <div 
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-5 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        onClick={e => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800"
      >
        
        {/* Header Hero Section */}
        <div className="p-4 sm:p-6 bg-slate-900 text-white flex flex-col gap-3 shrink-0 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex items-start justify-between relative z-10 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 shrink-0 font-bold text-lg">
                IT
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-xl font-bold tracking-tight text-white truncate">{client.legalName || client.tradeName}</h2>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    client.status === 'Active' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {client.status}
                  </span>
                </div>
                {client.tradeName && client.tradeName !== client.legalName && (
                  <p className="text-xs font-normal text-slate-400 mt-0.5 truncate">Trade Name: {client.tradeName}</p>
                )}
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

          {/* Key Identifiers & Quick Launch */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-slate-800/80 relative z-10 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              {itProf?.pan ? (
                <button
                  type="button"
                  onClick={() => copyToClipboard(itProf.pan, 'PAN')}
                  className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 font-mono font-semibold tracking-wider flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer group"
                  title="Click to copy PAN"
                >
                  <span className="text-[10px] font-bold uppercase text-slate-400">PAN:</span>
                  <span>{itProf.pan}</span>
                  <span className="text-slate-500 group-hover:text-white text-[10px]">📋</span>
                </button>
              ) : (
                <span className="text-slate-500 italic text-xs">No PAN recorded</span>
              )}

              {itProf?.category && (
                <span className="px-2.5 py-1 rounded-xl bg-slate-800 text-slate-300 font-semibold border border-slate-700 text-[11px]">
                  {itProf.category}
                </span>
              )}

              {(client.dob || itProf?.dob) && (
                <span className="px-2.5 py-1 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 font-medium text-[11px] flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase text-slate-400">DOB:</span>
                  <span className="font-mono font-bold text-white">{formatDate(client.dob || itProf?.dob)}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsShareModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white font-semibold text-xs flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer shadow-xs"
              >
                <span>📤 Share Credentials</span>
              </button>
              <button
                type="button"
                onClick={handlePortalLogin}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
              >
                <span>🚀 IT Portal Login</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
          {[
            { id: 'overview', label: 'Overview & Portal Credentials', icon: '🔑' },
            { id: 'personal_employment', label: 'Personal & Professional Details', icon: '👤' },
            { id: 'bank_notes', label: 'Banking & Office Notes', icon: '🏦' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200/80 dark:border-slate-700'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 no-scrollbar space-y-4 sm:space-y-5 bg-white dark:bg-slate-900">

          {/* TAB 1: OVERVIEW & CREDENTIALS */}
          {activeTab === 'overview' && (
            <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-200">
              
              {/* Credentials Highlight Card */}
              <div className="bg-slate-50 dark:bg-slate-850 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>Income Tax Portal Credentials</span>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">1-Click Portal Sync</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  
                  {/* PAN / User ID */}
                  <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                    <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">PAN / Portal Username</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm truncate">{itProf?.pan || '---'}</span>
                      {itProf?.pan && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(itProf.pan, 'PAN')}
                          className="text-slate-400 hover:text-indigo-600 text-xs p-1 cursor-pointer"
                          title="Copy PAN"
                        >
                          📋
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Password */}
                  <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">e-Filing Password</p>
                      {!isEditingPassword && (
                        <button
                          type="button"
                          onClick={() => {
                            setNewPassVal(itProf?.password || '');
                            setIsEditingPassword(true);
                          }}
                          className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 px-2 py-0.5 rounded-md transition-all border border-indigo-100 dark:border-indigo-900 flex items-center gap-1 shrink-0 cursor-pointer"
                          title="Change password instantly"
                        >
                          ✏️ Instant Change
                        </button>
                      )}
                    </div>

                    {isEditingPassword ? (
                      <div className="mt-2 space-y-2">
                        <input
                          type="text"
                          value={newPassVal}
                          onChange={e => setNewPassVal(e.target.value)}
                          placeholder="Enter new IT password"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-700 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50/30 dark:bg-slate-900"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSavePassword();
                            if (e.key === 'Escape') setIsEditingPassword(false);
                          }}
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setIsEditingPassword(false)}
                            className="px-2.5 py-1 rounded-md text-[10px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                            disabled={isSavingPassword}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSavePassword}
                            disabled={isSavingPassword}
                            className="px-3 py-1 rounded-md text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                          >
                            {isSavingPassword ? 'Saving...' : '✓ Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mt-1 gap-2 flex-wrap sm:flex-nowrap">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm break-all whitespace-pre-wrap select-all leading-snug min-w-0 flex-1">
                          {itProf?.password ? (showPassword ? itProf.password : '••••••••') : '---'}
                        </span>
                        {itProf?.password && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs p-1 cursor-pointer"
                              title={showPassword ? 'Hide Password' : 'Show Password'}
                            >
                              {showPassword ? '🙈' : '👁️'}
                            </button>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(itProf.password, 'Password')}
                              className="text-slate-400 hover:text-indigo-600 text-xs p-1 cursor-pointer"
                              title="Copy Password"
                            >
                              📋
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* Primary Contact Details */}
              <div className="bg-white dark:bg-slate-850 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Contact & Identity Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Mobile Number</p>
                    <p className="font-mono font-semibold text-slate-900 dark:text-slate-100 text-sm mt-0.5">{client.mobile || '---'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Email Address</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm mt-0.5 truncate">{client.email || '---'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">DOB / Incorporation</p>
                    <p className="font-mono font-semibold text-slate-900 dark:text-slate-100 text-sm mt-0.5">{formatDate(client.dob || itProf?.dob) || '---'}</p>
                  </div>
                  <div className="sm:col-span-2 md:col-span-1">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Communication Address</p>
                    <p className="font-medium text-slate-700 dark:text-slate-300 text-xs mt-0.5 line-clamp-2">{client.address || '---'}</p>
                  </div>
                </div>
              </div>

              {/* Remarks */}
              {client.remarks && (
                <div className="bg-amber-50/60 dark:bg-amber-950/30 p-4 sm:p-5 rounded-2xl border border-amber-200/60 dark:border-amber-800/40 space-y-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                    <span>📌</span>
                    <span>IT Vault Remarks</span>
                  </h3>
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-300 leading-relaxed whitespace-pre-wrap">{client.remarks}</p>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: PERSONAL & PROFESSIONAL */}
          {activeTab === 'personal_employment' && (
            <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-200">
              
              <div className="bg-white dark:bg-slate-850 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Individual / Entity Particulars</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Legal Name (As per PAN)</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm mt-0.5">{client.legalName || '---'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Father's Name</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm mt-0.5">{itProf?.fatherName || '---'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Date of Birth / Incorporation</p>
                    <p className="font-mono font-semibold text-slate-900 dark:text-slate-100 text-sm mt-0.5">{formatDate(itProf?.dob || client.dob) || '---'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-850 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Professional & Taxpayer Profile</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Nature of Work</p>
                    <p className="font-semibold text-indigo-600 dark:text-indigo-400 text-sm mt-0.5">{itProf?.natureOfWork || 'Salaried'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Employment Type</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm mt-0.5">{itProf?.employmentType || '---'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Assessee Category</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm mt-0.5">{itProf?.category || 'Individual'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">ITR Form Filed</p>
                    <p className="mt-0.5">
                      <span className="inline-block bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-lg font-bold text-xs tracking-wide">
                        {itProf?.itrFiled || 'N/A'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: BANK & NOTES */}
          {activeTab === 'bank_notes' && (
            <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-200">
              
              <div className="bg-white dark:bg-slate-850 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <span>🏦</span> Income Tax Bank Account for Refund
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Bank Name</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm mt-0.5">{client.bankDetails?.bankName || '---'}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Account Number</p>
                    <p className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm mt-0.5">{client.bankDetails?.accountNo || '---'}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase text-slate-400">IFSC Code</p>
                    <p className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm mt-0.5">{client.bankDetails?.ifsc || '---'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-850 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Vault Remarks & Notes</h3>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 min-h-[80px]">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{client.remarks || 'No internal remarks logged.'}</p>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <footer className="p-3.5 sm:px-6 sm:py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between shrink-0 gap-3">
          <p className="text-[10px] font-bold text-slate-400 hidden sm:block">Clientify IT Vault Dossier • Confidential</p>
          <div className="flex items-center gap-2.5 ml-auto">
            {onEdit && (
              <button 
                type="button"
                onClick={() => { onClose(); onEdit(client); }} 
                className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-xl font-semibold text-xs uppercase tracking-wider transition-all border border-indigo-200 dark:border-indigo-800 cursor-pointer active:scale-95"
              >
                ✏️ Edit Profile
              </button>
            )}
            <button 
              type="button"
              onClick={onClose} 
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-xl font-semibold text-xs uppercase tracking-wider shadow-xs transition-all cursor-pointer active:scale-95"
            >
              Close
            </button>
          </div>
        </footer>

      </div>

      {isShareModalOpen && (
        <CredentialShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          client={currentClient}
          mode="it"
        />
      )}
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};

export default ITDetailModal;
