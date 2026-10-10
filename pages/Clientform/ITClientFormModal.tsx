import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Client, NatureOfWork, ClientStatus } from '../../types.ts';
import { api } from '../../services/api.ts';
import { toast } from 'sonner';

interface ITClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (client: Client) => void;
  initialData?: Client | null;
  context?: 'it';
}

const IT_FORM_TABS = [
  { id: 1, name: '1. PAN & Credentials', short: 'Credentials', icon: '🔑' },
  { id: 2, name: '2. Personal & Employment', short: 'Particulars', icon: '👤' },
  { id: 3, name: '3. Bank & Remarks', short: 'Bank & Notes', icon: '🏦' },
];

const ITClientFormModal: React.FC<ITClientFormModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const queryClient = useQueryClient();
  const [activeTabStep, setActiveTabStep] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isDataLinked, setIsDataLinked] = useState(false);

  const { data: existingClientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.getClients(),
    staleTime: 1000 * 60 * 5,
    enabled: isOpen,
  });

  const existingClients = useMemo(() => existingClientsData || [], [existingClientsData]);

  const saveMutation = useMutation({
    mutationFn: (clientData: Partial<Client>) => api.saveClient(clientData),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      toast.success(initialData ? 'IT Record Updated' : 'New IT Profile Created');
      onSave(saved);
      onClose();
    },
    onError: (err: any) => {
      setError(err.message || "Cloud vault synchronization failed.");
    }
  });

  const isSaving = saveMutation.isPending;

  const [formData, setFormData] = useState<Partial<Client>>({
    legalName: '',
    tradeName: '',
    mobile: '',
    email: '',
    address: '',
    status: 'Active',
    itProfile: {
      pan: '',
      username: '',
      password: '',
      category: 'Individual',
      fatherName: '',
      dob: '',
      natureOfWork: 'Salaried',
      employmentType: 'Private',
      businessName: '',
      itrFiled: 'ITR-1',
    },
    bankDetails: { bankName: '', accountNo: '', ifsc: '' },
    remarks: ''
  });

  useEffect(() => {
    if (isOpen) {
      setActiveTabStep(1);
      if (initialData) {
        setFormData(initialData);
        setIsDataLinked(false);
      } else {
        resetForm();
      }
    }
  }, [isOpen, initialData]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const resetForm = () => {
    setFormData({
      legalName: '', 
      tradeName: '', 
      mobile: '', 
      email: '', 
      address: '',
      status: 'Active',
      itProfile: {
        pan: '', username: '', password: '', category: 'Individual',
        fatherName: '', dob: '', natureOfWork: 'Salaried',
        employmentType: 'Private', businessName: '', itrFiled: 'ITR-1',
      },
      bankDetails: { bankName: '', accountNo: '', ifsc: '' },
      remarks: ''
    });
    setError(null);
    setIsDataLinked(false);
  };

  const handlePanChange = (val: string) => {
    const pan = val.trim().toUpperCase().slice(0, 10);
    setFormData(prev => ({
      ...prev,
      itProfile: { ...prev.itProfile!, pan, username: pan }
    }));

    if (!initialData && pan.length === 10) {
      const match = existingClients.find(c => 
        (c.gstProfile?.pan === pan || c.gstProfile?.gstin?.substring(2, 12) === pan || c.itProfile?.pan === pan)
      );

      if (match) {
        const fetchedDob = match.dob || match.itProfile?.dob || match.gstProfile?.dob || '';
        const itCategory = match.itProfile?.category || (
          match.gstProfile?.constitution === 'Proprietorship' ? 'Individual' :
          match.gstProfile?.constitution === 'Partnership' ? 'Firm' :
          match.gstProfile?.constitution === 'Company' ? 'Company' :
          match.gstProfile?.constitution === 'HUF' ? 'HUF' :
          match.gstProfile?.constitution === 'Trust' ? 'Trust' : 'Individual'
        );

        setFormData(prev => ({
          ...prev,
          id: match.id,
          legalName: match.legalName || prev.legalName || match.tradeName,
          tradeName: match.tradeName || prev.tradeName || match.legalName,
          mobile: match.mobile || prev.mobile,
          email: match.email || prev.email,
          address: match.address || prev.address,
          dob: fetchedDob || prev.dob,
          status: match.status || prev.status,
          bankDetails: match.bankDetails || prev.bankDetails,
          remarks: match.remarks || prev.remarks,
          itProfile: {
            ...prev.itProfile,
            ...(match.itProfile || {}),
            pan,
            username: match.itProfile?.username || pan,
            category: itCategory,
            dob: fetchedDob || match.itProfile?.dob || prev.itProfile?.dob || '',
            businessName: match.tradeName || match.legalName || prev.itProfile?.businessName || '',
          }
        }));
        setIsDataLinked(true);
        toast.info("Auto-linked matching client records from Vault!");
      } else {
        setIsDataLinked(false);
      }
    }
  };

  const handleSave = () => {
    setError(null);
    const profile = formData.itProfile!;

    const panRegex = /[A-Z]{5}[0-9]{4}[A-Z]{1}/;
    if (!formData.legalName) return setError("Principal Legal Name is required.");
    if (!panRegex.test(profile.pan)) return setError("Invalid PAN format (e.g. ABCDE1234F).");
    if (formData.mobile && !/^\d{10}$/.test(formData.mobile)) return setError("Mobile must be 10 digits.");

    if (!initialData && existingClients.some(c => c.itProfile?.pan === profile.pan)) {
      return setError(`PAN ${profile.pan} is already archived in IT records.`);
    }
    if (initialData && existingClients.some(c => c.itProfile?.pan === profile.pan && c.id !== formData.id)) {
      return setError(`PAN ${profile.pan} is already archived in IT records.`);
    }

    const payload = { ...formData };
    if (formData.itProfile?.dob) {
      payload.dob = formData.itProfile.dob;
    } else if (formData.dob) {
      payload.dob = formData.dob;
      if (payload.itProfile) payload.itProfile.dob = formData.dob;
    }

    saveMutation.mutate(payload);
  };

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-2 sm:p-4 md:p-6 overflow-hidden animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        onClick={e => e.stopPropagation()}
        className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[88vh] overflow-hidden border border-slate-200 dark:border-slate-800 transition-all font-sans"
      >
        
        {/* Header */}
        <header className="px-4 sm:px-6 md:px-8 py-3.5 sm:py-4 bg-slate-900 dark:bg-slate-950 text-white flex items-center justify-between shrink-0 border-b border-slate-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 md:gap-4 relative z-10 min-w-0">
             <div className="h-10 w-10 md:h-11 md:w-11 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-indigo-600/30 shrink-0">
                IT
             </div>
             <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base md:text-lg font-bold tracking-tight text-white truncate">
                    {initialData 
                      ? (formData.legalName || formData.tradeName || 'Edit IT Client Profile') 
                      : 'Add New Income Tax Client'}
                  </h2>
                  {initialData && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                        formData.status === 'Active' 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                          : formData.status === 'Litigation'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-700/60 text-slate-300 border border-slate-600'
                      }`}>
                        {formData.status || 'Active'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[9px] font-bold uppercase tracking-wider">
                        {formData.itProfile?.category || 'Individual'}
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-[10px] font-medium text-indigo-300/90 tracking-wide mt-0.5 truncate">
                  {isDataLinked ? '✨ Auto-Linked from Vault Record' : (initialData ? 'Modify Client Record & Credentials' : 'Income Tax Vault Registration')}
                </p>
             </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer relative z-10 shrink-0 ml-2 active:scale-95 shadow-2xs"
            title="Close modal (Esc)"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Step Tabs */}
        <div className="bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 md:px-8 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
          {IT_FORM_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabStep(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTabStep === tab.id
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700 ring-2 ring-indigo-500/10'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.name}</span>
              <span className="sm:hidden">{tab.short}</span>
            </button>
          ))}
        </div>

        {/* Form Body - Scrollable with min-h-0 so it fits on screen */}
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-4 sm:p-6 space-y-4 sm:space-y-5">
          {error && (
            <div className="p-3 sm:p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 text-center animate-in fade-in">
              ⚠️ {error}
            </div>
          )}

          {/* STEP 1: PAN & CREDENTIALS */}
          {activeTabStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <span>🔑</span>
                  <span>Taxpayer Identity & Credentials</span>
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                  <div className="flex flex-col justify-end space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">PAN Identity *</label>
                    <input 
                      className="w-full h-10 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 px-3.5 py-2 rounded-xl font-mono font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20" 
                      value={formData.itProfile?.pan || ''} 
                      onChange={e => handlePanChange(e.target.value)} 
                      placeholder="ABCDE1234F" 
                      maxLength={10}
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">e-Filing Password</label>
                    <div className="relative">
                      <input 
                        type={showPassword ? "text" : "password"} 
                        className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl font-bold text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-600 pr-10" 
                        value={formData.itProfile?.password || ''} 
                        onChange={e => setFormData({...formData, itProfile: {...formData.itProfile!, password: e.target.value}})} 
                        placeholder="••••••••" 
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)} 
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs p-1 cursor-pointer"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col justify-end space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Assessee Category</label>
                    <select 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl font-bold text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-600" 
                      value={formData.itProfile?.category || 'Individual'} 
                      onChange={e => setFormData({...formData, itProfile: {...formData.itProfile!, category: e.target.value}})}
                    >
                      <option value="Individual">Individual</option>
                      <option value="HUF">HUF (Hindu Undivided Family)</option>
                      <option value="Firm">Partnership Firm / LLP</option>
                      <option value="Company">Company</option>
                      <option value="Trust">Trust / Association</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <span>👤</span>
                  <span>Legal Entity Names & Particulars</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                  <div className="flex flex-col justify-end space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider truncate" title="Legal Name (As per PAN)">Legal Name (PAN) *</label>
                    <input 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl font-bold text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-600" 
                      value={formData.legalName || ''} 
                      onChange={e => setFormData({...formData, legalName: e.target.value})} 
                      placeholder="Name as printed on PAN" 
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider truncate" title="Trade Name / Alias">Trade Name / Alias</label>
                    <input 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl font-bold text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-600" 
                      value={formData.tradeName || ''} 
                      onChange={e => setFormData({...formData, tradeName: e.target.value})} 
                      placeholder="Business / Trading Name" 
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider truncate" title="Date of Birth / Incorporation Date">DOB / Inc. Date</label>
                    <input 
                      type="date" 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl font-bold text-xs text-slate-900 dark:text-white outline-none uppercase focus:border-indigo-600" 
                      value={formData.itProfile?.dob || formData.dob || ''} 
                      onChange={e => {
                        const val = e.target.value;
                        setFormData(prev => ({
                          ...prev,
                          dob: val,
                          itProfile: {
                            ...prev.itProfile!,
                            dob: val
                          }
                        }));
                      }} 
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Client Status</label>
                    <select 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl font-bold text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-600" 
                      value={formData.status} 
                      onChange={e => setFormData({...formData, status: e.target.value as ClientStatus})}
                    >
                      <option value="Active">Active Client</option>
                      <option value="Litigation">Under Litigation</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PERSONAL & EMPLOYMENT */}
          {activeTabStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <span>👤</span>
                  <span>Individual Particulars</span>
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                  <div className="flex flex-col justify-end space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Father's Name</label>
                    <input 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl font-bold text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-600" 
                      value={formData.itProfile?.fatherName || ''} 
                      onChange={e => setFormData({...formData, itProfile: {...formData.itProfile!, fatherName: e.target.value}})} 
                      placeholder="Father's Full Name" 
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">DOB / Incorporation Date</label>
                    <input 
                      type="date" 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl font-bold text-xs text-slate-900 dark:text-white outline-none uppercase" 
                      value={formData.itProfile?.dob || formData.dob || ''} 
                      onChange={e => {
                        const val = e.target.value;
                        setFormData(prev => ({
                          ...prev,
                          dob: val,
                          itProfile: {
                            ...prev.itProfile!,
                            dob: val
                          }
                        }));
                      }} 
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Mobile Number</label>
                    <input 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl font-mono font-bold text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-600" 
                      value={formData.mobile || ''} 
                      onChange={e => setFormData({...formData, mobile: e.target.value.replace(/\D/g, '').slice(0, 10)})} 
                      placeholder="10-digit Mobile" 
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Email Address</label>
                    <input 
                      type="email" 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl font-bold text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-600" 
                      value={formData.email || ''} 
                      onChange={e => setFormData({...formData, email: e.target.value})} 
                      placeholder="email@example.com" 
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1 sm:col-span-2">
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Communication Address</label>
                    <input 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl font-bold text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-600" 
                      value={formData.address || ''} 
                      onChange={e => setFormData({...formData, address: e.target.value})} 
                      placeholder="Full Address" 
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <span>💼</span>
                  <span>Nature of Income & Employment</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                  <div className="flex flex-col justify-end space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Primary Income Source</label>
                    <select 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl font-bold text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-600" 
                      value={formData.itProfile?.natureOfWork || 'Salaried'} 
                      onChange={e => setFormData({...formData, itProfile: {...formData.itProfile!, natureOfWork: e.target.value as NatureOfWork}})}
                    >
                      <option value="Salaried">Salaried Employee</option>
                      <option value="Business/Profession">Business / Profession</option>
                      <option value="Capital Gains">Capital Gains</option>
                      <option value="House Property">House Property</option>
                      <option value="Other Sources">Other Sources</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-end space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Employment Sector</label>
                    <select 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl font-bold text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-600" 
                      value={formData.itProfile?.employmentType || 'Private'} 
                      onChange={e => setFormData({...formData, itProfile: {...formData.itProfile!, employmentType: e.target.value}})}
                    >
                      <option value="Private">Private Enterprise</option>
                      <option value="Govt">Government Sector</option>
                      <option value="PSU">Public Sector Unit (PSU)</option>
                      <option value="Pensioner">Pensioner</option>
                      <option value="N/A">Not Applicable</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-end space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Business Name</label>
                    <input 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl font-bold text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-600" 
                      value={formData.itProfile?.businessName || ''} 
                      onChange={e => setFormData({...formData, itProfile: {...formData.itProfile!, businessName: e.target.value}})} 
                      placeholder="Business Name" 
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">ITR Form Filed *</label>
                    <select 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl font-bold text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-600" 
                      value={formData.itProfile?.itrFiled || 'ITR-1'} 
                      onChange={e => setFormData({...formData, itProfile: {...formData.itProfile!, itrFiled: e.target.value as any}})}
                    >
                      <option value="ITR-1">ITR-1 (Sahaj)</option>
                      <option value="ITR-2">ITR-2</option>
                      <option value="ITR-3">ITR-3</option>
                      <option value="ITR-4">ITR-4 (Sugam)</option>
                      <option value="N/A">Not Applicable</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: BANK & REMARKS */}
          {activeTabStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                  <span>🏦</span> Bank Account for Income Tax Refunds
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input 
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl text-xs font-bold uppercase text-slate-900 dark:text-white w-full outline-none focus:border-indigo-600" 
                    value={formData.bankDetails?.bankName || ''} 
                    onChange={e => setFormData({...formData, bankDetails: {...formData.bankDetails!, bankName: e.target.value}})} 
                    placeholder="Bank Name" 
                  />
                  <input 
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl text-xs font-mono font-bold tracking-wider text-slate-900 dark:text-white w-full outline-none focus:border-indigo-600" 
                    value={formData.bankDetails?.accountNo || ''} 
                    onChange={e => setFormData({...formData, bankDetails: {...formData.bankDetails!, accountNo: e.target.value}})} 
                    placeholder="Account Number" 
                  />
                  <input 
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl text-xs font-mono font-bold tracking-wider uppercase text-slate-900 dark:text-white w-full outline-none focus:border-indigo-600" 
                    value={formData.bankDetails?.ifsc || ''} 
                    onChange={e => setFormData({...formData, bankDetails: {...formData.bankDetails!, ifsc: e.target.value.toUpperCase()}})} 
                    placeholder="IFSC Code" 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Income Tax Vault Remarks & History</label>
                <textarea 
                  className="w-full h-24 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-medium text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-600 transition-all resize-none" 
                  value={formData.remarks || ''} 
                  onChange={e => setFormData({...formData, remarks: e.target.value})} 
                  placeholder="Record internal client history, previous assessment notes, or filing instructions..." 
                />
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <footer className="px-4 sm:px-6 md:px-8 py-3 sm:py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between shrink-0 gap-3">
          <div className="flex items-center gap-2">
            {activeTabStep > 1 && (
              <button 
                type="button" 
                onClick={() => setActiveTabStep(prev => prev - 1)} 
                className="px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
              >
                ← Back
              </button>
            )}
            <button 
              type="button" 
              onClick={onClose} 
              className="px-3 py-2 text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTabStep < 3 ? (
              <button 
                type="button" 
                onClick={() => setActiveTabStep(prev => prev + 1)} 
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <span>Next Step</span>
                <span>→</span>
              </button>
            ) : (
              <button 
                type="button" 
                onClick={handleSave} 
                disabled={isSaving} 
                className="bg-emerald-600 text-white font-bold uppercase tracking-wider text-xs px-6 py-2 rounded-xl shadow-md hover:bg-emerald-500 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <span>{isSaving ? 'Saving Record...' : 'Save IT Profile'}</span>
              </button>
            )}
          </div>
        </footer>

      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};

export default ITClientFormModal;
