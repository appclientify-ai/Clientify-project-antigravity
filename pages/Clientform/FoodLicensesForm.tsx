import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FoodLicenseRecord, FoodLicenseType, FoodLicenseStatus, Client } from '../../types';
import { api } from '../../services/api.ts';
import { calculateRenewalDueDate } from '../../dateUtils.ts';
import LitigationGuidelinesModal from '../../components/LitigationGuidelinesModal';

interface FoodLicensesFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<FoodLicenseRecord>) => void;
  initialData?: FoodLicenseRecord | null;
}

const FoodLicensesForm: React.FC<FoodLicensesFormProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [isGuidelinesOpen, setIsGuidelinesOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<FoodLicenseRecord>>({
    clientName: '',
    tradeName: '',
    legalName: '',
    mobile: '',
    licenseType: 'FSSAI Basic Registration',
    status: 'Pending',
    appDate: '',
    licenseNo: '',
    expiryDate: '',
    dueDate: '',
    password: '',
    remarks: ''
  });

  const [dbClients, setDbClients] = useState<Client[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      api.getClients().then(setDbClients);
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialData) {
      const calcDue = initialData.dueDate || (initialData.expiryDate ? calculateRenewalDueDate(initialData.expiryDate) : '');
      setFormData({
        ...initialData,
        tradeName: initialData.tradeName || initialData.clientName || '',
        legalName: initialData.legalName || initialData.clientName || '',
        mobile: initialData.mobile || '',
        dueDate: calcDue
      });
    } else {
      setFormData({
        clientName: '',
        tradeName: '',
        legalName: '',
        mobile: '',
        licenseType: 'FSSAI Basic Registration',
        status: 'Pending',
        appDate: new Date().toISOString().split('T')[0],
        licenseNo: '',
        expiryDate: '',
        dueDate: '',
        password: '',
        remarks: ''
      });
    }
  }, [initialData, isOpen]);

  const handleExpiryDateChange = (expDate: string) => {
    const calcDue = calculateRenewalDueDate(expDate);
    setFormData(prev => ({
      ...prev,
      expiryDate: expDate,
      dueDate: calcDue
    }));
  };

  const suggestions = useMemo(() => {
    const query = (formData.tradeName || formData.legalName || formData.clientName || '').toLowerCase();
    if (!query || initialData) return [];
    return dbClients.filter(c => 
      (c.tradeName || '').toLowerCase().includes(query) || 
      (c.legalName || '').toLowerCase().includes(query) || 
      (c.gstProfile?.gstin || '').toLowerCase().includes(query) ||
      (c.pan || '').toLowerCase().includes(query) ||
      (c.mobile || '').includes(query)
    ).slice(0, 8);
  }, [formData.tradeName, formData.legalName, formData.clientName, dbClients, initialData]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="fixed inset-0 pointer-events-auto"
        onClick={onClose}
      />

      <form 
        onSubmit={(e) => { 
          e.preventDefault(); 
          const payload = {
            ...formData,
            clientName: formData.legalName || formData.tradeName || formData.clientName || '',
            tradeName: formData.tradeName || formData.clientName || '',
            legalName: formData.legalName || formData.clientName || ''
          };
          onSave(payload); 
        }}
        className="relative z-10 w-full max-w-2xl max-h-[calc(100vh-2rem)] sm:max-h-[88vh] bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-900 dark:bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block mb-0.5">
              Food Safety & FSSAI Registry
            </span>
            <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">
              {initialData ? 'Update Food License' : 'New Food License Entry'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsGuidelinesOpen(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-600/40 hover:bg-emerald-600 text-emerald-200 hover:text-white border border-emerald-400/30 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="View FSSAI Legal Framework & Guidelines"
            >
              <span>⚖️</span>
              <span className="hidden sm:inline">Guidelines</span>
            </button>
            <button 
              type="button" 
              onClick={onClose} 
              className="h-8 w-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all cursor-pointer active:scale-95 shadow-2xs" 
              title="Close (Esc)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 space-y-3.5 flex-1 overflow-y-auto overscroll-contain">
          {/* Statutory note banner */}
          <div className="bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl p-3.5 flex items-start gap-3">
            <span className="text-xl">🥗</span>
            <div className="space-y-0.5 flex-1 min-w-0">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <h4 className="text-xs font-bold text-emerald-950 dark:text-emerald-200 uppercase tracking-wide">
                  FSSAI Act 2006 Rules
                </h4>
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 uppercase">
                  Renew: 30-60 Days Before Expiry
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                Renewal applications must be submitted <strong>at least 30 days before license expiration</strong> on FoSCoS to avoid late penalty fee (₹100/day). Operating on an expired license carries penalties up to ₹5,00,000 u/s 63.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative">
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                Trade Name (Display Name) <span className="text-rose-500">*</span>
              </label>
              <input 
                required 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 uppercase transition-all"
                value={formData.tradeName || ''} 
                onChange={e => { 
                  setFormData(prev => ({ ...prev, tradeName: e.target.value, clientName: e.target.value })); 
                  setIsDropdownOpen(true); 
                }} 
                onFocus={() => setIsDropdownOpen(true)} 
                placeholder="Business / Trade Name..." 
              />
              {isDropdownOpen && suggestions.length > 0 && (
                <div className="absolute top-full mt-1 z-50 left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                  {suggestions.map(c => {
                    const trade = c.tradeName || c.legalName;
                    const legal = c.legalName;
                    return (
                      <button 
                        key={c.id} 
                        type="button" 
                        onClick={() => { 
                          setFormData(prev => ({ 
                            ...prev, 
                            tradeName: trade,
                            legalName: legal || trade,
                            clientName: trade,
                            mobile: c.mobile || prev.mobile
                          })); 
                          setIsDropdownOpen(false); 
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-emerald-50 dark:hover:bg-slate-700/70 border-b border-slate-100 dark:border-slate-700/50 last:border-0 cursor-pointer"
                      >
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{trade}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">Legal Name: {legal || '---'}</p>
                        <p className="text-[9px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                          GSTIN: {c.gstProfile?.gstin || 'N/A'} • Mob: {c.mobile || 'N/A'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                Legal Entity Name
              </label>
              <input 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 uppercase transition-all"
                value={formData.legalName || ''} 
                onChange={e => setFormData(prev => ({ ...prev, legalName: e.target.value }))} 
                placeholder="Proprietor / Company Legal Name..." 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                Mobile No <span className="text-rose-500">*</span>
              </label>
              <input 
                required 
                maxLength={10} 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono"
                value={formData.mobile || ''} 
                onChange={e => setFormData(prev => ({ ...prev, mobile: e.target.value.replace(/\D/g, '') }))} 
                placeholder="10-digit mobile" 
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                FSSAI Category
              </label>
              <select 
                required 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                value={formData.licenseType} 
                onChange={e => setFormData(prev => ({ ...prev, licenseType: e.target.value as FoodLicenseType }))}
              >
                <option value="FSSAI Basic Registration">Basic Registration (&lt; 12 Lakhs)</option>
                <option value="State License">State License (12L - 20 Crores)</option>
                <option value="Central License">Central License (&gt; 20 Crores)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                Application Status
              </label>
              <select 
                required 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                value={formData.status || 'Pending'} 
                onChange={e => setFormData(prev => ({ ...prev, status: e.target.value as FoodLicenseStatus }))}
              >
                <option value="Pending">Pending</option>
                <option value="Applied">Applied</option>
                <option value="Completed">Completed / Active</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                FSSAI License No / Application ID
              </label>
              <input 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-xs uppercase font-mono tracking-widest outline-none text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                value={formData.licenseNo || ''} 
                onChange={e => setFormData({...formData, licenseNo: e.target.value})} 
                placeholder="14-digit registration or ref..." 
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                FoSCoS Portal Password
              </label>
              <input 
                type="text" 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-mono font-bold text-xs outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                value={formData.password || ''} 
                onChange={e => setFormData({...formData, password: e.target.value})} 
                placeholder="Password for FoSCoS portal..." 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                Applied Date
              </label>
              <input 
                type="date" 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-xs text-slate-900 dark:text-white outline-none uppercase font-mono"
                value={formData.appDate} 
                onChange={e => setFormData({...formData, appDate: e.target.value})} 
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                Expiry Date
              </label>
              <input 
                type="date" 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-xs text-slate-900 dark:text-white outline-none uppercase font-mono"
                value={formData.expiryDate} 
                onChange={e => handleExpiryDateChange(e.target.value)} 
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 tracking-wider mb-1.5 block">
                Renewal Due Date
              </label>
              <input 
                type="date" 
                className="w-full bg-amber-50/60 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl px-3.5 py-2.5 font-bold text-xs text-amber-900 dark:text-amber-300 outline-none uppercase font-mono"
                value={formData.dueDate || (formData.expiryDate ? calculateRenewalDueDate(formData.expiryDate) : '')} 
                onChange={e => setFormData({...formData, dueDate: e.target.value})} 
              />
              <p className="text-[9px] font-medium text-amber-600 dark:text-amber-400 mt-1 ml-0.5">
                *Auto-set 60 days prior to expiry
              </p>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
              Staff Remarks & Notes
            </label>
            <textarea 
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-medium text-xs text-slate-900 dark:text-white outline-none h-20 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
              value={formData.remarks} 
              onChange={e => setFormData({...formData, remarks: e.target.value})} 
              placeholder="Internal tracking notes, premise inspection date, FO clarification..." 
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/70 flex gap-3 shrink-0">
          <button 
            type="button" 
            onClick={onClose} 
            className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer"
          >
            {initialData ? 'Update License' : 'Save License Record'}
          </button>
        </div>
      </form>

      {isGuidelinesOpen && (
        <LitigationGuidelinesModal 
          isOpen={isGuidelinesOpen} 
          onClose={() => setIsGuidelinesOpen(false)} 
          initialCategory="FoodLicense" 
        />
      )}
    </div>,
    document.body
  );
};

export default FoodLicensesForm;