import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { GSTRegistrationRecord, GSTRegistrationType, GSTRegistrationStatus, Client } from '../../types';
import { api } from '../../services/api.ts';
import LitigationGuidelinesModal from '../../components/LitigationGuidelinesModal';

interface GSTRegistrationFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<GSTRegistrationRecord>) => void;
  initialData?: GSTRegistrationRecord | null;
}

const GSTRegistrationForm: React.FC<GSTRegistrationFormProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [isGuidelinesOpen, setIsGuidelinesOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<GSTRegistrationRecord>>({
    clientName: '',
    mobile: '',
    appType: 'New Registration',
    status: 'Pending',
    appDate: '',
    arn: '',
    completionDate: '',
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
      setFormData(initialData);
    } else {
      setFormData({
        clientName: '',
        mobile: '',
        appType: 'New Registration',
        status: 'Pending',
        appDate: new Date().toISOString().split('T')[0],
        arn: '',
        completionDate: '',
        remarks: ''
      });
    }
  }, [initialData, isOpen]);

  const suggestions = useMemo(() => {
    const query = formData.clientName?.toLowerCase() || '';
    if (!query || initialData) return [];
    return dbClients.filter(c => 
      (c.legalName || '').toLowerCase().includes(query) || 
      (c.tradeName || '').toLowerCase().includes(query) ||
      (c.gstProfile?.gstin || '').toLowerCase().includes(query) ||
      (c.pan || '').toLowerCase().includes(query) ||
      (c.mobile || '').includes(query)
    ).slice(0, 8);
  }, [formData.clientName, dbClients, initialData]);

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
          onSave(formData); 
        }}
        className="relative z-10 w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 dark:bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 block mb-0.5">
              GST Registration & Amendments
            </span>
            <h3 className="text-lg font-black text-white uppercase tracking-tight">
              {initialData ? 'Update GST Application' : 'New GST Application'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsGuidelinesOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-indigo-600/40 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-400/30 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="View GST Registration Guidelines"
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
        <div className="p-5 sm:p-6 space-y-4 flex-1 overflow-y-auto">
          {/* Statutory note banner */}
          <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 rounded-2xl p-3.5 flex items-start gap-3">
            <span className="text-xl">🆔</span>
            <div className="space-y-0.5 flex-1 min-w-0">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <h4 className="text-xs font-bold text-indigo-950 dark:text-indigo-200 uppercase tracking-wide">
                  GST Registration Standard
                </h4>
                <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100/80 dark:bg-indigo-900/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 uppercase">
                  Threshold: 40L Goods • 20L Services
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                Applications filed in <strong>Form REG-01</strong>. Approval turnaround is <strong>7 working days</strong> for Aadhaar-verified filings; discrepancy notices in <strong>REG-03</strong> must be replied within <strong>7 days</strong> via <strong>REG-04</strong>.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                Entity / Trade Name <span className="text-rose-500">*</span>
              </label>
              <input 
                required 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 uppercase transition-all"
                value={formData.clientName} 
                onChange={e => { 
                  setFormData({...formData, clientName: e.target.value}); 
                  setIsDropdownOpen(true); 
                }} 
                onFocus={() => setIsDropdownOpen(true)} 
                placeholder="Enter or select entity name..." 
              />
              {isDropdownOpen && suggestions.length > 0 && (
                <div className="absolute top-full mt-1 z-50 left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                  {suggestions.map(c => {
                    const trade = c.tradeName || c.legalName;
                    const legal = c.legalName;
                    const displayName = c.tradeName && c.legalName && c.tradeName !== c.legalName 
                      ? `${c.tradeName} (${c.legalName})` 
                      : trade;
                    return (
                      <button 
                        key={c.id} 
                        type="button" 
                        onClick={() => { 
                          setFormData({ ...formData, clientName: displayName, mobile: c.mobile || formData.mobile }); 
                          setIsDropdownOpen(false); 
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-indigo-50 dark:hover:bg-slate-700/70 border-b border-slate-100 dark:border-slate-700/50 last:border-0 cursor-pointer"
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
                Contact Mobile No <span className="text-rose-500">*</span>
              </label>
              <input 
                required 
                maxLength={10} 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
                value={formData.mobile} 
                onChange={e => setFormData({...formData, mobile: e.target.value.replace(/\D/g, '')})} 
                placeholder="10-digit mobile number" 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                Tracking Type
              </label>
              <select 
                required 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={formData.appType} 
                onChange={e => setFormData({...formData, appType: e.target.value as GSTRegistrationType})}
              >
                <option value="New Registration">New GST Registration</option>
                <option value="Amendment">Core/Non-Core Amendment</option>
                <option value="Cancellation">GST Cancellation</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                Application Status
              </label>
              <select 
                required 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={formData.status} 
                onChange={e => setFormData({...formData, status: e.target.value as GSTRegistrationStatus})}
              >
                <option value="Pending">Pending</option>
                <option value="Data Requested">Data Requested</option>
                <option value="In Progress">In Progress</option>
                <option value="ARN Generated">ARN Generated</option>
                <option value="Completed">Completed</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                Application Date <span className="text-rose-500">*</span>
              </label>
              <input 
                type="date" 
                required 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-xs text-slate-900 dark:text-white outline-none uppercase focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
                value={formData.appDate} 
                onChange={e => setFormData({...formData, appDate: e.target.value})} 
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                ARN No
              </label>
              <input 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-xs text-slate-900 dark:text-white uppercase font-mono tracking-widest outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={formData.arn} 
                onChange={e => setFormData({...formData, arn: e.target.value})} 
                placeholder="e.g. AA070126..." 
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
              Staff Remarks & Notes
            </label>
            <textarea 
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-medium text-xs text-slate-900 dark:text-white outline-none h-20 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
              value={formData.remarks} 
              onChange={e => setFormData({...formData, remarks: e.target.value})} 
              placeholder="Internal tracking notes, documents pending..." 
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/70 flex gap-3 shrink-0">
          <button 
            type="button" 
            onClick={onClose} 
            className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer"
          >
            {initialData ? 'Update Record' : 'Save Record'}
          </button>
        </div>
      </form>

      {isGuidelinesOpen && (
        <LitigationGuidelinesModal 
          isOpen={isGuidelinesOpen} 
          onClose={() => setIsGuidelinesOpen(false)} 
          initialCategory="GstReg" 
        />
      )}
    </div>,
    document.body
  );
};

export default GSTRegistrationForm;