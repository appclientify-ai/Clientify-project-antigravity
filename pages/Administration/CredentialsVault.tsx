import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { PortalCredentialRecord, PortalCategory } from '../../types';
import { toast } from 'sonner';
import { 
  KeyRound, Plus, Eye, EyeOff, Search, ExternalLink, 
  MessageCircle, Pencil, Trash2, X, Copy, Check, 
  ShieldCheck, Lock, Smartphone, Mail, Globe, Hash, Sparkles
} from 'lucide-react';

interface CredentialsVaultProps {
  onShowMessage?: (msg: { type: 'success' | 'error'; text: string }) => void;
}

const PORTAL_URL_MAP: Record<string, string> = {
  'GST Portal': 'https://www.gst.gov.in',
  'Income Tax': 'https://eportal.incometax.gov.in',
  'GSTAT Portal': 'https://efiling.gstat.gov.in/mainPage.drt',
  'E-Way Bill / E-Invoice': 'https://ewaybillgst.gov.in',
  'TRACES / TDS': 'https://contents.tdscpc.gov.in',
  'FSSAI / Food': 'https://foscos.fssai.gov.in/',
  'MSME / Udyam': 'https://udyamregistration.gov.in',
  'MCA / ROC V3': 'https://contents.mca.gov.in',
  'ICEGATE / Customs': 'https://www.icegate.gov.in',
  'DGFT': 'https://www.dgft.gov.in',
  'PF & ESIC': 'https://unifiedportal-mem.epfindia.gov.in',
  'App User Credential': '',
  'Other': ''
};

const PRACTITIONER_PRESETS = [
  'CA Authorized Practitioner',
  'Advocate & Legal Practitioner',
  'Tax Consultant Firm Master',
  'Authorized Firm Admin Account',
  'App & Software User Account'
];

export const CredentialsVault: React.FC<CredentialsVaultProps> = ({ onShowMessage }) => {
  const [credsList, setCredsList] = useState<PortalCredentialRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  
  // Visibility toggles for passwords
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [showAllPasswords, setShowAllPasswords] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modal states for adding/editing authorized practitioner credentials
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCred, setEditingCred] = useState<Partial<PortalCredentialRecord> | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Form state
  const [formData, setFormData] = useState<Partial<PortalCredentialRecord>>({
    clientName: 'CA Authorized Practitioner',
    category: 'GST Portal',
    identifier: '',
    username: '',
    password: '',
    portalUrl: PORTAL_URL_MAP['GST Portal'],
    associatedMobile: '',
    associatedEmail: '',
    securityKey: '',
    remarks: ''
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const credsData = await api.getPortalCredentials(true);
      setCredsList(credsData || []);
    } catch (err: any) {
      console.error('Failed to load practitioner credential vault:', err);
      if (onShowMessage) onShowMessage({ type: 'error', text: 'Failed to load credential vault.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleDbChange = () => loadData();
    window.addEventListener('clientify_db_change', handleDbChange);
    return () => window.removeEventListener('clientify_db_change', handleDbChange);
  }, []);

  // Filtered List
  const filteredCredentials = useMemo(() => {
    let list = credsList;

    if (selectedCategory !== 'ALL') {
      list = list.filter(item => item.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(item => 
        (item.clientName && item.clientName.toLowerCase().includes(q)) ||
        (item.identifier && item.identifier.toLowerCase().includes(q)) ||
        (item.username && item.username.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.remarks && item.remarks.toLowerCase().includes(q)) ||
        (item.associatedMobile && item.associatedMobile.includes(q))
      );
    }

    return list;
  }, [credsList, selectedCategory, searchQuery]);

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleLoginPortal = (item: PortalCredentialRecord) => {
    const userIdToCopy = item.username || item.identifier || '';
    if (userIdToCopy) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(userIdToCopy);
      }
      const msg = `${item.category || 'Portal'} User ID (${userIdToCopy}) copied! Opening portal...`;
      toast.success(msg);
      if (onShowMessage) {
        onShowMessage({ type: 'success', text: msg });
      }
    } else {
      toast.success('Opening portal...');
    }

    if (item.portalUrl) {
      window.open(item.portalUrl, '_blank');
    }
  };

  const handleShareWhatsApp = (item: PortalCredentialRecord) => {
    const text = `🔐 *AUTHORIZED PRACTITIONER CREDENTIAL RECORD*\n\n` +
      `👤 *Practitioner / Entity:* ${item.clientName || 'Authorized Practitioner'}\n` +
      `🌐 *Portal / App:* ${item.category}\n` +
      (item.identifier ? `🆔 *Reg No / ID:* ${item.identifier}\n` : '') +
      `🔑 *User ID / Username:* ${item.username}\n` +
      `🔒 *Password:* ${item.password || '---'}\n` +
      (item.securityKey ? `🛡️ *Security PIN / Key:* ${item.securityKey}\n` : '') +
      (item.portalUrl ? `🔗 *Login Link:* ${item.portalUrl}\n` : '') +
      (item.remarks ? `📝 *Notes:* ${item.remarks}\n` : '') +
      `\n_Sent safely via Practice Credential Vault_`;

    const mobile = item.associatedMobile ? item.associatedMobile.replace(/\D/g, '') : '';
    const encoded = encodeURIComponent(text);
    if (mobile && mobile.length >= 10) {
      window.open(`https://wa.me/91${mobile}?text=${encoded}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }
  };

  const handleOpenAddModal = () => {
    setEditingCred(null);
    setFormData({
      clientName: 'CA Authorized Practitioner',
      category: 'GST Portal',
      identifier: '',
      username: '',
      password: '',
      portalUrl: PORTAL_URL_MAP['GST Portal'],
      associatedMobile: '',
      associatedEmail: '',
      securityKey: '',
      remarks: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: PortalCredentialRecord) => {
    setEditingCred(item);
    setFormData({ ...item });
    setIsModalOpen(true);
  };

  const handleDelete = async (item: PortalCredentialRecord) => {
    if (!confirm(`Are you sure you want to delete credential record for "${item.clientName || 'Practitioner'} - ${item.category}"?`)) return;

    try {
      await api.deletePortalCredential(item.id);
      if (onShowMessage) onShowMessage({ type: 'success', text: 'Credential record removed from vault.' });
      loadData();
    } catch (err: any) {
      if (onShowMessage) onShowMessage({ type: 'error', text: 'Delete failed.' });
    }
  };

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientName || !formData.username) {
      if (onShowMessage) onShowMessage({ type: 'error', text: 'Practitioner name and username are required.' });
      return;
    }

    setIsSaving(true);
    try {
      await api.savePortalCredential({
        ...formData,
        id: editingCred?.id
      });

      setIsModalOpen(false);
      if (onShowMessage) onShowMessage({ 
        type: 'success', 
        text: editingCred ? 'Authorized Practitioner credential updated.' : 'New Authorized Practitioner credential saved to vault.' 
      });
      loadData();
    } catch (err: any) {
      console.error('Save credential error:', err);
      if (onShowMessage) onShowMessage({ type: 'error', text: 'Save failed.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-in slide-in-from-bottom-4 duration-300">
      
      {/* Top Banner & Action Header */}
      <div className="bg-slate-900 dark:bg-slate-950 p-5 sm:p-7 rounded-3xl text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 right-0 h-48 w-48 bg-indigo-500/10 blur-3xl rounded-full" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 sm:h-14 sm:w-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
              <KeyRound className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-xl font-black uppercase tracking-tight">
                  Authorized Practitioner Vault
                </h3>
                <span className="bg-fuchsia-500/30 text-fuchsia-300 text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full border border-fuchsia-400/30">
                  CA & Advocate Hub
                </span>
              </div>
              <p className="text-slate-400 text-xs font-medium mt-0.5">
                Centralized credential manager for CA, Advocate & Tax Professional authorized practitioner logins.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto shrink-0">
            <button
              onClick={() => setShowAllPasswords(!showAllPasswords)}
              className="flex-1 md:flex-initial px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 border border-white/10 cursor-pointer active:scale-95"
            >
              {showAllPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showAllPasswords ? 'Hide Passwords' : 'Reveal Passwords'}</span>
            </button>
            <button
              onClick={handleOpenAddModal}
              className="flex-1 md:flex-initial px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add Credential</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className="bg-slate-50/80 dark:bg-slate-800/40 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 backdrop-blur-sm space-y-3 transition-colors">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          
          {/* Search Box */}
          <div className="relative w-full sm:max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search practitioner, membership, username, portal..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-9 pr-8 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')} 
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          <div className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0">
            Showing <span className="text-slate-900 dark:text-white font-black">{filteredCredentials.length}</span> Credential Records
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
          {[
            { id: 'ALL', label: 'All Portals & Apps' },
            { id: 'App User Credential', label: '📱 App & Software User Credentials', isApp: true },
            { id: 'GST Portal', label: 'GST Practitioner' },
            { id: 'Income Tax', label: 'Income Tax ERIC' },
            { id: 'GSTAT Portal', label: 'GSTAT Tribunal' },
            { id: 'TRACES / TDS', label: 'TRACES / TDS' },
            { id: 'MCA / ROC V3', label: 'MCA V3 / ROC' },
            { id: 'FSSAI / Food', label: 'FSSAI / Food' },
            { id: 'MSME / Udyam', label: 'MSME / Udyam' },
            { id: 'ICEGATE / Customs', label: 'Customs' },
            { id: 'DGFT', label: 'DGFT' },
            { id: 'Other', label: 'Custom / Other' }
          ].map(cat => {
            const isSelected = selectedCategory === cat.id;
            let btnStyle = 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700';
            if (isSelected) {
              btnStyle = cat.isApp 
                ? 'bg-fuchsia-600 text-white shadow-xs font-black' 
                : 'bg-indigo-600 text-white shadow-xs font-black';
            } else if (cat.isApp) {
              btnStyle = 'bg-fuchsia-50 dark:bg-fuchsia-950/40 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-200 dark:border-fuchsia-800 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-900/50 font-bold';
            }

            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer active:scale-95 ${btnStyle}`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Credential Table / Cards */}
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden backdrop-blur-sm transition-colors">
        {isLoading ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400 dark:text-slate-500">
            Loading Practitioner Credential Vault...
          </div>
        ) : filteredCredentials.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
              <KeyRound className="w-6 h-6 stroke-[1.5]" />
            </div>
            <p className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">No Matching Practitioner Credential Found</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm mx-auto">
              {searchQuery ? 'Try adjusting your search criteria or filter.' : 'Click "Add Credential" above to save logins for CA, Advocate, Tax Consultants, or software apps.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse min-w-[850px]">
              <thead className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-700/80 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-5">Practitioner / Entity Name</th>
                  <th className="py-3 px-4">Portal / App Category</th>
                  <th className="py-3 px-4">User ID / Username</th>
                  <th className="py-3 px-4">Password & Security PIN</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filteredCredentials.map(item => {
                  const isVisible = showAllPasswords || visiblePasswords[item.id];
                  const userCopyKey = `user_${item.id}`;
                  const passCopyKey = `pass_${item.id}`;
                  const isAppCategory = item.category === 'App User Credential';

                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group ${
                        isAppCategory ? 'bg-fuchsia-50/30 dark:bg-fuchsia-950/20' : ''
                      }`}
                    >
                      {/* Practitioner / Entity */}
                      <td className="py-3.5 px-5 align-top">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${isAppCategory ? 'bg-fuchsia-500' : 'bg-indigo-600'}`} />
                          <p className="font-bold text-slate-900 dark:text-white uppercase tracking-tight text-xs group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {item.clientName || 'Authorized Practitioner'}
                          </p>
                        </div>
                        {item.remarks && (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 max-w-xs truncate">
                            {item.remarks}
                          </p>
                        )}
                        <span className={`inline-block mt-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          isAppCategory 
                            ? 'bg-fuchsia-100 dark:bg-fuchsia-950/50 text-fuchsia-800 dark:text-fuchsia-300 border border-fuchsia-200 dark:border-fuchsia-800/60' 
                            : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/40'
                        }`}>
                          {isAppCategory ? '📱 Software / App User' : '⚖️ Practitioner Vault'}
                        </span>
                      </td>

                      {/* Portal & ID */}
                      <td className="py-3.5 px-4 align-top">
                        {isAppCategory ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-fuchsia-100 dark:bg-fuchsia-950/50 text-fuchsia-900 dark:text-fuchsia-300 border border-fuchsia-200 dark:border-fuchsia-800/60">
                            📱 App User
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {item.category}
                          </span>
                        )}
                        {item.identifier && (
                          <p className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-1 uppercase">
                            {item.identifier}
                          </p>
                        )}
                        {item.portalUrl && (
                          <button 
                            type="button"
                            onClick={() => handleLoginPortal(item)}
                            className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold block truncate max-w-[160px] mt-0.5 text-left cursor-pointer"
                            title="Copy User ID & Open Portal"
                          >
                            🔗 {item.portalUrl.replace(/^https?:\/\//, '')}
                          </button>
                        )}
                      </td>

                      {/* Username */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900 dark:text-white text-xs">
                            {item.username}
                          </span>
                          <button
                            onClick={() => handleCopy(item.username, userCopyKey)}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                            title="Copy Username"
                          >
                            {copiedKey === userCopyKey ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        {item.associatedMobile && (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Mob: {item.associatedMobile}</p>
                        )}
                        {item.associatedEmail && (
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate max-w-[140px]">{item.associatedEmail}</p>
                        )}
                      </td>

                      {/* Password */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-slate-800 dark:text-slate-200 text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 min-w-[90px] text-center">
                            {isVisible ? (item.password || '---') : '••••••••••••'}
                          </span>
                          <button
                            onClick={() => togglePasswordVisibility(item.id)}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer text-xs"
                            title={isVisible ? 'Hide Password' : 'Show Password'}
                          >
                            {isVisible ? '🙈' : '👁️'}
                          </button>
                          {item.password && (
                            <button
                              onClick={() => handleCopy(item.password || '', passCopyKey)}
                              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                              title="Copy Password"
                            >
                              {copiedKey === passCopyKey ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                        {item.securityKey && (
                          <p className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-bold mt-1">
                            PIN: {item.securityKey}
                          </p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 align-top text-center">
                        <div className="flex items-center justify-center gap-1">
                          {item.portalUrl ? (
                            <button
                              type="button"
                              onClick={() => handleLoginPortal(item)}
                              className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95 ${
                                isAppCategory 
                                  ? 'bg-fuchsia-100 hover:bg-fuchsia-600 text-fuchsia-800 hover:text-white dark:bg-fuchsia-950/60 dark:text-fuchsia-300 dark:hover:bg-fuchsia-600 dark:hover:text-white border border-fuchsia-200 dark:border-fuchsia-800' 
                                  : 'bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-600 dark:hover:text-white border border-indigo-200 dark:border-indigo-800'
                              }`}
                              title={`Copy User ID & Open ${item.category} Portal`}
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Login</span>
                            </button>
                          ) : null}

                          <button
                            onClick={() => handleShareWhatsApp(item)}
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-600 dark:hover:text-white border border-emerald-200 dark:border-emerald-800 transition-all text-xs font-bold flex items-center gap-1 cursor-pointer active:scale-95"
                            title="Share Credential via WhatsApp"
                          >
                            <MessageCircle className="w-3 h-3" />
                            <span>Share</span>
                          </button>

                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                            title="Edit Practitioner Credential"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 dark:hover:bg-rose-600 dark:hover:text-white border border-rose-200 dark:border-rose-900/50 transition-all cursor-pointer"
                            title="Delete Credential Record"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Credential Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveSubmit}
            className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col my-auto border border-slate-200/80 dark:border-slate-800 overflow-hidden animate-in zoom-in-95"
          >
            <div className="px-6 py-5 bg-slate-900 dark:bg-slate-950 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-black text-base uppercase tracking-tight">
                    {editingCred ? 'Edit Practitioner Credential' : 'Add Practitioner Credential'}
                  </h4>
                  <p className="text-fuchsia-300 text-[10px] font-bold uppercase tracking-widest">
                    Save CA, Advocate, Tax Professional & Software App User Login
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="h-8 w-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
              
              {/* Category */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest block mb-1.5">
                  Portal / Application Category
                </label>
                <select
                  required
                  value={formData.category}
                  onChange={e => {
                    const cat = e.target.value as PortalCategory;
                    setFormData(prev => ({
                      ...prev,
                      category: cat,
                      portalUrl: PORTAL_URL_MAP[cat] || prev.portalUrl || ''
                    }));
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-semibold text-slate-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="App User Credential">📱 App & Software User Credentials (Software Apps / Firm)</option>
                  <option value="GST Portal">GST Practitioner Portal (www.gst.gov.in)</option>
                  <option value="Income Tax">Income Tax Portal / ERIC (eportal.incometax.gov.in)</option>
                  <option value="GSTAT Portal">GSTAT Appellate Tribunal (efiling.gstat.gov.in)</option>
                  <option value="E-Way Bill / E-Invoice">E-Way Bill & E-Invoice (ewaybillgst.gov.in)</option>
                  <option value="TRACES / TDS">TRACES / TDS Portal (contents.tdscpc.gov.in)</option>
                  <option value="FSSAI / Food">FSSAI / Food License (foscos.fssai.gov.in)</option>
                  <option value="MCA / ROC V3">MCA / ROC V3 Practitioner (contents.mca.gov.in)</option>
                  <option value="MSME / Udyam">MSME / Udyam (udyamregistration.gov.in)</option>
                  <option value="ICEGATE / Customs">ICEGATE / Customs (www.icegate.gov.in)</option>
                  <option value="DGFT">DGFT Portal (www.dgft.gov.in)</option>
                  <option value="PF & ESIC">PF & ESIC Portal</option>
                  <option value="Other">Custom Website / Other App</option>
                </select>
              </div>

              {/* Practitioner / Entity Name */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest block mb-1.5 flex items-center justify-between">
                  <span>Practitioner / Entity / Firm Name</span>
                  <span className="text-[9px] text-indigo-600 dark:text-indigo-400 font-bold">CA / Advocate / Firm</span>
                </label>
                <input
                  required
                  type="text"
                  value={formData.clientName || ''}
                  onChange={e => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
                  placeholder="e.g. CA M. K. Sharma & Co. / Advocate R. V. Patel"
                  className="w-full bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-semibold text-slate-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
                
                {/* Preset Chips */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {PRACTITIONER_PRESETS.map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, clientName: preset }))}
                      className="px-2.5 py-1 rounded-lg text-[9px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-300 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60 transition-colors cursor-pointer"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Identifier */}
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest block mb-1.5">
                    Practitioner ID / Membership No
                  </label>
                  <input
                    type="text"
                    value={formData.identifier || ''}
                    onChange={e => setFormData(prev => ({ ...prev, identifier: e.target.value.toUpperCase() }))}
                    placeholder="e.g. CA-123456 or ADV-8890"
                    className="w-full bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-semibold text-slate-900 dark:text-white text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Username */}
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest block mb-1.5">
                    Login User ID / Username
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.username || ''}
                    onChange={e => setFormData(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="Portal User ID or Username"
                    className="w-full bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-semibold text-slate-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Password */}
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest block mb-1.5">
                    Login Password
                  </label>
                  <input
                    type="text"
                    value={formData.password || ''}
                    onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="••••••••••••"
                    className="w-full bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-semibold text-slate-900 dark:text-white text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Security Key / PIN */}
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest block mb-1.5">
                    Security Key / DSC PIN (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.securityKey || ''}
                    onChange={e => setFormData(prev => ({ ...prev, securityKey: e.target.value }))}
                    placeholder="Security PIN / Token PIN"
                    className="w-full bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-semibold text-slate-900 dark:text-white text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Portal URL */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest block mb-1.5">
                  Portal / Application Website URL
                </label>
                <input
                  type="url"
                  value={formData.portalUrl || ''}
                  onChange={e => setFormData(prev => ({ ...prev, portalUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-semibold text-slate-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Associated Mobile */}
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest block mb-1.5">
                    Associated Mobile for OTP
                  </label>
                  <input
                    type="text"
                    value={formData.associatedMobile || ''}
                    onChange={e => setFormData(prev => ({ ...prev, associatedMobile: e.target.value }))}
                    placeholder="Mobile No..."
                    className="w-full bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-semibold text-slate-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Associated Email */}
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest block mb-1.5">
                    Associated Email Address
                  </label>
                  <input
                    type="email"
                    value={formData.associatedEmail || ''}
                    onChange={e => setFormData(prev => ({ ...prev, associatedEmail: e.target.value }))}
                    placeholder="Email Address..."
                    className="w-full bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-semibold text-slate-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest block mb-1.5">
                  Remarks / Practitioner Notes
                </label>
                <textarea
                  rows={2}
                  value={formData.remarks || ''}
                  onChange={e => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                  placeholder="e.g. Master CA Practitioner Login, High Court Advocates Portal, Software Admin Password..."
                  className="w-full bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-semibold text-slate-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold uppercase text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase text-xs shadow-md shadow-indigo-500/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Credential'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};

export const CredentialVault = CredentialsVault;
export default CredentialsVault;
