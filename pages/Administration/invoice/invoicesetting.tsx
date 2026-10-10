import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState, useEffect } from 'react';
import { InvoiceSettings } from '../../../types';
import { api } from '../../../services/api.ts';
import Loader from '../../../components/Loader';
import { toast } from 'sonner';


const InvoiceSetting: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  
  const [isSaving, setIsSaving] = useState(false);


  const queryClient = useQueryClient();
  const { data: initialSettings, isLoading } = useQuery({ queryKey: ['invoice_settings'], queryFn: () => api.getInvoiceSettings(), staleTime: 0 });
  const [settings, setSettings] = useState<InvoiceSettings>({} as any);

  useEffect(() => {
    if (initialSettings) setSettings(initialSettings);
  }, [initialSettings]);


  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.saveInvoiceSettings(settings);
      queryClient.invalidateQueries({ queryKey: ['invoice_settings'] });
      onBack();
    } catch (err) {
      toast.error("Settings update failed.");
    } finally {
      setIsSaving(false);
    }
  };

  
  const handleDeleteImage = async (field: 'firmLogo' | 'firmSignature' | 'watermark') => {
    const updatedSettings = { ...settings, [field]: '' };
    setSettings(updatedSettings);
    setIsSaving(true);
    try {
      await api.saveInvoiceSettings(updatedSettings);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'firmLogo' | 'firmSignature' | 'watermark') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 400;
          const MAX_HEIGHT = 400;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL(file.type, 0.7);
          setSettings(prev => ({ ...prev, [field]: dataUrl }));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  if (isLoading) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      {/* Header Toolbar */}
      <div className="relative z-30 flex flex-wrap items-center justify-between gap-2.5 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs shrink-0 w-full transition-colors">
        <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-[200px]">
          <button 
            onClick={onBack} 
            className="h-8 w-8 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer shadow-2xs shrink-0 active:scale-95"
            title="Go Back"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Invoice Configuration
            </h2>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium line-clamp-1">
              Manage firm profile, tax preferences, and banking credentials
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <button 
            type="button"
            onClick={onBack}
            className="px-3 sm:px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs transition-all cursor-pointer active:scale-95"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            disabled={isSaving} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold tracking-wide px-4 sm:px-5 py-1.5 rounded-xl shadow-xs transition-all text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {/* Main Settings Body */}
      <div className="relative z-10 flex-1 min-h-0 w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-y-auto no-scrollbar p-3.5 sm:p-6 pb-28 sm:pb-24 md:pb-8 space-y-6 transition-colors">
        {/* Section 1: Firm Branding */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
              Firm Branding & Registration
            </h4>
            <div className="h-px flex-1 bg-slate-200/80 dark:bg-slate-800 ml-4" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">Legal Firm Name</label>
              <input 
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs font-bold uppercase text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={settings.firmName || ''} 
                onChange={e => setSettings({...settings, firmName: e.target.value})} 
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">Service Provided (Description)</label>
              <input 
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                placeholder="e.g. Tax Consultancy & Legal Services"
                value={settings.firmServices || ''} 
                onChange={e => setSettings({...settings, firmServices: e.target.value})} 
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">Profession Type</label>
              <select 
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                value={settings.professionType || ''} 
                onChange={e => setSettings({...settings, professionType: e.target.value as 'CA' | 'Advocate'})}
              >
                <option value="">Select Profession</option>
                <option value="CA">Chartered Accountant (CA)</option>
                <option value="Advocate">Advocate</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                {settings.professionType === 'CA' ? 'Membership No' : 'Bar Registration No'}
              </label>
              <input 
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs font-semibold uppercase text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50" 
                placeholder="Registration No" 
                disabled={!settings.professionType}
                value={settings.registrationNo || ''} 
                onChange={e => setSettings({...settings, registrationNo: e.target.value})} 
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">Firm Address</label>
              <textarea 
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[60px]"
                value={settings.firmAddress || ''} 
                onChange={e => setSettings({...settings, firmAddress: e.target.value})} 
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">Firm Mobile No.</label>
              <input 
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={settings.firmMobile || ''} 
                onChange={e => setSettings({...settings, firmMobile: e.target.value})} 
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">Firm Email ID</label>
              <input 
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={settings.firmEmail || ''} 
                onChange={e => setSettings({...settings, firmEmail: e.target.value})} 
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">Invoice Prefix</label>
              <input 
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs font-semibold uppercase text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={settings.invoicePrefix || ''} 
                onChange={e => setSettings({...settings, invoicePrefix: e.target.value})} 
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">Firm GSTIN</label>
              <input 
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono font-semibold uppercase text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={settings.firmGstin || ''} 
                onChange={e => setSettings({...settings, firmGstin: e.target.value})} 
              />
            </div>
            
            {/* Signature Upload */}
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">Signature</label>
              {settings.firmSignature ? (
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                  <button 
                    type="button" 
                    onClick={() => handleDeleteImage('firmSignature')} 
                    className="h-8 w-8 shrink-0 flex items-center justify-center bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer" 
                    title="Delete Signature"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  <img src={settings.firmSignature} alt="Signature" className="h-10 object-contain rounded" />
                </div>
              ) : (
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={e => handleImageUpload(e, 'firmSignature')} 
                  className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-2 text-xs font-medium text-slate-700 dark:text-slate-300 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-950/60 file:text-indigo-600 dark:file:text-indigo-400 cursor-pointer" 
                />
              )}
            </div>

            {/* Watermark Upload */}
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">Watermark (Center Logo)</label>
              {settings.watermark ? (
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                  <button 
                    type="button" 
                    onClick={() => handleDeleteImage('watermark')} 
                    className="h-8 w-8 shrink-0 flex items-center justify-center bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer" 
                    title="Delete Watermark"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  <img src={settings.watermark} alt="Watermark" className="h-10 object-contain rounded" />
                </div>
              ) : (
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={e => handleImageUpload(e, 'watermark')} 
                  className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-2 text-xs font-medium text-slate-700 dark:text-slate-300 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-950/60 file:text-indigo-600 dark:file:text-indigo-400 cursor-pointer" 
                />
              )}
            </div>

            {/* GST Enabled Toggle */}
            <div className="md:col-span-2 flex items-center gap-3 bg-slate-50/90 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
              <input 
                type="checkbox" 
                id="gstEnabled" 
                checked={settings.isGstEnabled || false} 
                onChange={e => setSettings({...settings, isGstEnabled: e.target.checked})} 
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer" 
              />
              <label htmlFor="gstEnabled" className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                Enable GST Calculations on Invoices
              </label>
            </div>

            {/* Default Document Type (Tax Invoice vs Bill of Supply) */}
            <div className="md:col-span-2 flex flex-col gap-1.5 bg-slate-50/90 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Default Document Header</label>
              <div className="flex flex-wrap items-center gap-4 mt-0.5">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200">
                  <input
                    type="radio"
                    name="defaultInvoiceType"
                    value="Tax Invoice"
                    checked={(settings.defaultInvoiceType || 'Tax Invoice') === 'Tax Invoice'}
                    onChange={() => setSettings({ ...settings, defaultInvoiceType: 'Tax Invoice' })}
                    className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>Tax Invoice (Standard GST Invoice)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200">
                  <input
                    type="radio"
                    name="defaultInvoiceType"
                    value="Bill of Supply"
                    checked={settings.defaultInvoiceType === 'Bill of Supply'}
                    onChange={() => setSettings({ ...settings, defaultInvoiceType: 'Bill of Supply' })}
                    className="text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                  <span>Bill of Supply (Composition / Exempt Supply)</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Payment & Bank Details */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
              Payment & Bank Details
            </h4>
            <div className="h-px flex-1 bg-slate-200/80 dark:bg-slate-800 ml-4" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">Account Holder Name</label>
              <input 
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs font-bold uppercase text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={settings.accountName || ''} 
                onChange={e => setSettings({...settings, accountName: e.target.value})} 
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">Bank Name</label>
              <input 
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs font-bold uppercase text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={settings.bankName || ''} 
                onChange={e => setSettings({...settings, bankName: e.target.value})} 
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">Account Number</label>
              <input 
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={settings.accountNo || ''} 
                onChange={e => setSettings({...settings, accountNo: e.target.value})} 
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">IFSC Code</label>
              <input 
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={settings.ifsc || ''} 
                onChange={e => setSettings({...settings, ifsc: e.target.value})} 
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">UPI ID (For Payment QR)</label>
              <input 
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={settings.upiId || ''} 
                onChange={e => setSettings({...settings, upiId: e.target.value})} 
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">WhatsApp Number (For Message QR)</label>
              <input 
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs font-semibold uppercase text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={settings.whatsappNumber || ''} 
                onChange={e => setSettings({...settings, whatsappNumber: e.target.value})} 
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">Terms & Conditions</label>
              <textarea 
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs font-normal text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[90px]"
                value={settings.terms || ''} 
                onChange={e => setSettings({...settings, terms: e.target.value})} 
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default InvoiceSetting;
