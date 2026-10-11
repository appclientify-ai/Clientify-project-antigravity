import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Client, InvoiceRecord, InvoiceLineItem, InvoiceSettings } from '../../../types';
import { api } from '../../../services/api.ts';
import Loader from '../../../components/Loader';
import { toast } from 'sonner';

const TAX_RATES = [0, 5, 12, 18, 28];

interface AddInvoiceProps {
  onBack: () => void;
  editingInvoice?: InvoiceRecord | null;
}

const AddInvoice: React.FC<AddInvoiceProps> = ({ onBack, editingInvoice }) => {
  const queryClient = useQueryClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceType, setInvoiceType] = useState<'Tax Invoice' | 'Bill of Supply'>('Tax Invoice');
  
  const [selectedClientId, setSelectedClientId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMiscClient, setIsMiscClient] = useState(false);
  const [invDate, setInvDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [clientLegalName, setClientLegalName] = useState('');
  const [clientTradeName, setClientTradeName] = useState('');
  const [clientGstin, setClientGstin] = useState('');
  const [clientMobile, setClientMobile] = useState('');
  const [clientAddress, setClientAddress] = useState('');

  const [billingUnitType, setBillingUnitType] = useState<'month' | 'quantity' | 'both'>('month');
  const [showQuantity, setShowQuantity] = useState<boolean>(true);

  const [items, setItems] = useState<InvoiceLineItem[]>([
    { id: '1', period: '2026-27', month: '', hsn: '998231', description: '', quantity: 1, rate: 0, taxRate: 18, amount: 0 }
  ]);
  const [status, setStatus] = useState<InvoiceRecord['status']>('Sent');
  const [isSaving, setIsSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const clisPromise = api.getClients();
        const setsPromise = api.getInvoiceSettings();
        
        const [clis, sets] = await Promise.all([clisPromise, setsPromise]);
        setClients(clis);
        setSettings(sets);
        
        if (editingInvoice) {
          setInvoiceNo(editingInvoice.invoiceNo);
          setInvoiceType(editingInvoice.invoiceType || 'Tax Invoice');
          setBillingUnitType(editingInvoice.billingUnitType || (editingInvoice.items?.some(i => i.month) ? 'month' : 'quantity'));
          setShowQuantity(editingInvoice.showQuantity !== undefined ? editingInvoice.showQuantity : true);
          setSelectedClientId(editingInvoice.clientId);
          setSearchQuery(editingInvoice.clientTradeName || editingInvoice.clientName);
          setIsMiscClient(!!editingInvoice.isMiscClient);
          setClientLegalName(editingInvoice.clientName);
          setClientTradeName(editingInvoice.clientTradeName || '');
          setClientGstin(editingInvoice.clientGstin || '');
          setClientMobile(editingInvoice.miscMobile || '');
          setClientAddress(editingInvoice.miscAddress || '');
          setInvDate(editingInvoice.date);
          setItems(editingInvoice.items && editingInvoice.items.length > 0 ? editingInvoice.items.map(i => ({
            ...i,
            period: i.period || '2026-27',
            month: i.month || '',
            hsn: i.hsn || '998231',
            quantity: i.quantity !== undefined ? i.quantity : 1
          })) : [{ id: '1', period: '2026-27', month: '', hsn: '998231', description: '', quantity: 1, rate: 0, taxRate: 18, amount: 0 }]);
          setStatus(editingInvoice.status || 'Sent');
        } else {
          setInvoiceType(sets?.defaultInvoiceType || (sets?.isGstEnabled ? 'Tax Invoice' : 'Bill of Supply'));
          try {
            const nextNo = await api.generateNextInvoiceNo();
            setInvoiceNo(nextNo);
          } catch {
            const fy = () => {
              const d = new Date();
              const year = d.getFullYear();
              const month = d.getMonth();
              if (month >= 3) return `${year.toString().slice(2)}-${(year + 1).toString().slice(2)}`;
              return `${(year - 1).toString().slice(2)}-${year.toString().slice(2)}`;
            };
            const fYear = fy();
            const prefix = sets.invoicePrefix || 'INV';
            setInvoiceNo(`${prefix}/${fYear}/01`);
          }
        }
      } catch (err) {
        console.error('AddInvoice init error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [editingInvoice]);

  const filteredClients = useMemo(() => {
    if (!searchQuery) return clients.slice(0, 15);
    const sq = searchQuery.toLowerCase().trim();
    return clients.filter(c => 
      (c.legalName || '').toLowerCase().includes(sq) ||
      (c.tradeName || '').toLowerCase().includes(sq) ||
      (c.gstProfile?.gstin || '').toLowerCase().includes(sq) ||
      (c.itProfile?.pan || '').toLowerCase().includes(sq) ||
      (c.mobile || '').toLowerCase().includes(sq)
    );
  }, [clients, searchQuery]);

  const handleClientSelect = (c: Client) => {
    setSelectedClientId(c.id);
    setSearchQuery(c.tradeName || c.legalName);
    setIsMiscClient(false);
    setClientLegalName(c.legalName || c.tradeName || '');
    setClientTradeName(c.tradeName || '');
    setClientGstin(c.gstProfile?.gstin || c.itProfile?.pan || '');
    setClientMobile(c.mobile || '');
    setClientAddress(c.address || '');
    setIsDropdownOpen(false);
  };

  const totals = useMemo(() => {
    const subTotal = items.reduce((acc, item) => {
      const qty = showQuantity ? (item.quantity !== undefined ? item.quantity : 1) : 1;
      return acc + ((item.rate || 0) * qty);
    }, 0);
    const hasFirmGstin = Boolean(
      settings?.firmGstin && 
      settings.firmGstin.trim() !== '' && 
      settings.firmGstin.trim().toUpperCase() !== 'N/A'
    );
    const shouldAddTax = Boolean(
      hasFirmGstin && 
      settings?.isGstEnabled && 
      invoiceType !== 'Bill of Supply'
    );
    const totalTax = shouldAddTax
      ? items.reduce((acc, item) => {
          const qty = showQuantity ? (item.quantity !== undefined ? item.quantity : 1) : 1;
          return acc + (((item.rate || 0) * qty) * ((item.taxRate || 0) / 100));
        }, 0)
      : 0;
    return { subTotal, totalTax, grandTotal: subTotal + totalTax, hasFirmGstin, shouldAddTax };
  }, [items, settings, invoiceType, showQuantity]);

  const addItem = () => {
    const hasFirmGstin = Boolean(
      settings?.firmGstin && 
      settings.firmGstin.trim() !== '' && 
      settings.firmGstin.trim().toUpperCase() !== 'N/A'
    );
    const shouldAddTax = Boolean(
      hasFirmGstin && 
      settings?.isGstEnabled && 
      invoiceType !== 'Bill of Supply'
    );
    setItems([...items, { 
      id: Date.now().toString(), 
      period: '2026-27',
      month: '',
      hsn: '998231',
      description: '', 
      quantity: 1, 
      rate: 0, 
      taxRate: shouldAddTax ? 18 : 0, 
      amount: 0 
    }]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) setItems(items.filter(i => i.id !== id));
  };

  const updateItem = (id: string, field: keyof InvoiceLineItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        const effectiveQty = showQuantity ? (updated.quantity !== undefined ? updated.quantity : 1) : 1;
        updated.amount = (updated.rate || 0) * effectiveQty;
        return updated;
      }
      return item;
    }));
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    
    if (!clientLegalName.trim()) {
      toast.error('Specify a client billing entity name.');
      setIsSaving(false);
      return;
    }

    if (!invoiceNo.trim()) {
      toast.error('Please specify an invoice number.');
      setIsSaving(false);
      return;
    }
    
    try {
      // Check for duplicate invoice numbers
      const allInvs = await api.getInvoices(true);
      if (allInvs.some(i => (i.invoiceNo || '').trim().toLowerCase() === invoiceNo.trim().toLowerCase() && i.id !== editingInvoice?.id)) {
         toast.error('Invoice number already exists. Please use another number.');
         setIsSaving(false);
         return;
      }

      const dDate = new Date(invDate);
      dDate.setDate(dDate.getDate() + 15);
      const record: Partial<InvoiceRecord> = {
        id: editingInvoice?.id,
        clientId: isMiscClient ? 'misc' : (selectedClientId || 'misc'),
        clientName: clientLegalName.trim(),
        clientTradeName: clientTradeName.trim(),
        clientGstin: clientGstin.trim(),
        isMiscClient,
        miscMobile: clientMobile.trim(),
        miscAddress: clientAddress.trim(),
        invoiceNo: invoiceNo.trim(),
        invoiceType: invoiceType || 'Tax Invoice',
        date: invDate,
        dueDate: dDate.toISOString().split('T')[0],
        billingUnitType,
        showQuantity,
        items,
        subTotal: totals.subTotal,
        totalTax: totals.totalTax,
        totalAmount: totals.grandTotal,
        status: status || 'Sent',
        amountPaid: status === 'Paid' ? totals.grandTotal : (editingInvoice?.amountPaid || 0),
        balanceDue: status === 'Paid' ? 0 : (status === 'Cancelled' ? 0 : Math.max(0, totals.grandTotal - (editingInvoice?.amountPaid || 0))),
        paymentDate: status === 'Paid' ? (editingInvoice?.paymentDate || new Date().toISOString().split('T')[0]) : editingInvoice?.paymentDate,
        paymentMode: editingInvoice?.paymentMode || 'Online'
      };

      const saved = await api.saveInvoice(record);
      api.invalidateCache();

      if (status === 'Paid' && totals.grandTotal > 0) {
        try {
          await api.savePayment({
            clientId: record.clientId,
            clientName: record.clientName,
            clientTradeName: record.clientTradeName,
            invoiceNo: record.invoiceNo,
            date: record.paymentDate || new Date().toISOString().split('T')[0],
            amount: totals.grandTotal,
            mode: (record.paymentMode as any) || 'Online'
          });
          queryClient.invalidateQueries({ queryKey: ['payments'] });
        } catch (e) {
          console.warn('Could not auto-create payment record:', e);
        }
      }
      
      // Invalidate and optimistically populate cache
      await queryClient.invalidateQueries({ queryKey: ['category_items', 'invoice'] });
      await queryClient.invalidateQueries({ queryKey: ['category_items'] });
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });

      queryClient.setQueriesData<any>({ queryKey: ['category_items', 'invoice'] }, (old: any) => {
        if (!old || !old.items) return old;
        const exists = old.items.some((i: any) => i.id === saved.id || i._id === saved.id);
        if (exists) {
          return {
            ...old,
            items: old.items.map((i: any) => (i.id === saved.id || i._id === saved.id) ? saved : i)
          };
        }
        return {
          ...old,
          items: [saved, ...old.items],
          total: (old.total || 0) + 1
        };
      });

      queryClient.setQueriesData<any>({ queryKey: ['invoices'] }, (old: any) => {
        if (!old || !Array.isArray(old)) return [saved];
        const exists = old.some((i: any) => i.id === saved.id || i._id === saved.id);
        if (exists) {
          return old.map((i: any) => (i.id === saved.id || i._id === saved.id) ? saved : i);
        }
        return [saved, ...old];
      });

      toast.success(editingInvoice ? 'Invoice updated successfully' : 'Invoice created successfully');
      onBack();
    } catch (e: any) {
      console.error(e);
      setIsSaving(false);
      toast.error('Failed to save invoice: ' + (e.message || 'Server error'));
    }
  };

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      {/* Header Toolbar */}
      <div className="relative z-30 flex flex-wrap items-center justify-between gap-2.5 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs shrink-0 w-full transition-colors">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack} 
            className="h-8 w-8 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer shadow-2xs"
            title="Go Back"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>{editingInvoice ? 'Modify Invoice' : 'Draft New Invoice'}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2.5 mt-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Invoice No:</span>
                <input 
                  type="text" 
                  value={invoiceNo} 
                  onChange={e => setInvoiceNo(e.target.value)} 
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 rounded-md px-2 py-0.5 outline-none w-36 focus:ring-1 focus:ring-indigo-500 font-mono" 
                />
              </div>

              {/* Document Type Selector (Tax Invoice vs Bill of Supply) */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setInvoiceType('Tax Invoice')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    invoiceType === 'Tax Invoice'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Tax Invoice
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceType('Bill of Supply');
                    setItems(prev => prev.map(i => ({ ...i, taxRate: 0 })));
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    invoiceType === 'Bill of Supply'
                      ? 'bg-purple-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Bill of Supply
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={onBack}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button 
            disabled={isSaving} 
            onClick={handleSave} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold tracking-wide px-5 py-1.5 rounded-xl shadow-xs transition-all text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span>{isSaving ? 'Saving...' : 'Commit Invoice'}</span>
          </button>
        </div>
      </div>

      {/* Main Form Body */}
      <div className="relative z-10 flex-1 min-h-0 w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-y-auto no-scrollbar p-3.5 sm:p-5 space-y-5 transition-colors">
        {/* Billing Target Section */}
        <section>
          <div className="flex items-center justify-between mb-3.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
              Billing Target & Info
            </h4>
            <div className="h-px flex-1 bg-slate-200/80 dark:bg-slate-800 ml-4" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
            <div className="md:col-span-8 flex flex-col gap-2" ref={dropdownRef}>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  Client Lookup & Billing Recipient
                </label>
                {clientLegalName && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClientId('');
                      setSearchQuery('');
                      setIsMiscClient(false);
                      setClientLegalName('');
                      setClientTradeName('');
                      setClientGstin('');
                      setClientMobile('');
                      setClientAddress('');
                      setIsDropdownOpen(true);
                    }}
                    className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Change / Clear Client</span>
                  </button>
                )}
              </div>

              {/* Search Bar with Autocomplete */}
              <div className="relative">
                <input 
                  className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl py-2 pl-9 pr-8 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                  placeholder="Search client by Name, Trade Name, GSTIN, PAN or Mobile..." 
                  value={searchQuery} 
                  onChange={e => { setSearchQuery(e.target.value); setIsDropdownOpen(true); }} 
                  onFocus={() => { if (clients.length > 0) setIsDropdownOpen(true); }}
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button 
                    type="button"
                    onClick={() => { setSearchQuery(''); setIsDropdownOpen(false); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <div className="absolute top-full mt-1 z-50 left-0 right-0 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-1.5 overflow-hidden max-h-56 overflow-y-auto no-scrollbar">
                    {filteredClients.map(c => (
                      <button 
                        key={c.id} 
                        type="button"
                        onClick={() => handleClientSelect(c)} 
                        className="w-full text-left px-3 py-2 hover:bg-indigo-50/80 dark:hover:bg-slate-800 rounded-lg transition-all group border-b border-slate-100 dark:border-slate-800 last:border-none cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                            {c.tradeName || c.legalName}
                          </p>
                          <span className="text-[10px] font-mono text-slate-500 font-semibold">{c.gstProfile?.gstin || c.itProfile?.pan || ''}</span>
                        </div>
                        {c.tradeName && c.legalName && c.tradeName !== c.legalName && (
                          <p className="text-[10px] text-slate-500 font-medium">Legal: {c.legalName}</p>
                        )}
                        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-medium mt-0.5">
                          {c.mobile && <span>Mob: {c.mobile}</span>}
                          {c.address && <span className="truncate max-w-xs">{c.address}</span>}
                        </div>
                      </button>
                    ))}
                    {filteredClients.length === 0 && searchQuery && (
                      <div className="px-3 py-2 text-center text-xs text-slate-400 font-medium">
                        No matching client found in master vault.
                      </div>
                    )}
                    {searchQuery && (
                      <button 
                        type="button"
                        onClick={() => {
                          setIsMiscClient(true);
                          setClientLegalName(searchQuery);
                          setClientTradeName(searchQuery);
                          setClientGstin('');
                          setClientMobile('');
                          setClientAddress('');
                          setIsDropdownOpen(false);
                        }} 
                        className="w-full text-left px-3 py-2 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg transition-all group mt-1 cursor-pointer"
                      >
                        <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                          + Add One-Time / Manual Client: &ldquo;{searchQuery}&rdquo;
                        </p>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Selected Entity Card - Attached directly below lookup */}
              {clientLegalName && (
                <div className="bg-indigo-50/40 dark:bg-slate-800/40 border border-indigo-100/90 dark:border-slate-700/80 rounded-xl p-3 flex flex-col gap-2.5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-indigo-100/60 dark:border-slate-700/60 pb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        {clientTradeName || clientLegalName}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                        {isMiscClient ? 'Manual Client' : 'Vault Client'}
                      </span>
                    </div>
                    {clientGstin && (
                      <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {clientGstin}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 tracking-wider mb-1 block">Billed To (Legal Name) *</label>
                      <input 
                        type="text" 
                        value={clientLegalName} 
                        onChange={e => setClientLegalName(e.target.value)} 
                        className="w-full bg-white dark:bg-slate-900 border border-indigo-200/80 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500" 
                        placeholder="Legal Entity Name" 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 tracking-wider mb-1 block">Trade Name (Brand)</label>
                      <input 
                        type="text" 
                        value={clientTradeName} 
                        onChange={e => setClientTradeName(e.target.value)} 
                        className="w-full bg-white dark:bg-slate-900 border border-indigo-200/80 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500" 
                        placeholder="Optional Trade Name" 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 tracking-wider mb-1 block">GSTIN / PAN</label>
                      <input 
                        type="text" 
                        value={clientGstin} 
                        onChange={e => setClientGstin(e.target.value)} 
                        className="w-full bg-white dark:bg-slate-900 border border-indigo-200/80 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-semibold text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500" 
                        placeholder="GSTIN or PAN" 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 tracking-wider mb-1 block">Contact Mobile</label>
                      <input 
                        type="text" 
                        value={clientMobile} 
                        onChange={e => setClientMobile(e.target.value)} 
                        className="w-full bg-white dark:bg-slate-900 border border-indigo-200/80 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500" 
                        placeholder="Mobile Number" 
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 tracking-wider mb-1 block">Entity Address</label>
                      <textarea 
                        value={clientAddress} 
                        onChange={e => setClientAddress(e.target.value)} 
                        className="w-full bg-white dark:bg-slate-900 border border-indigo-200/80 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 min-h-[44px]" 
                        placeholder="Billing Address..." 
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="md:col-span-4 flex flex-col gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                  Document Type / Heading
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setInvoiceType('Tax Invoice')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer text-center ${
                      invoiceType === 'Tax Invoice'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Tax Invoice
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInvoiceType('Bill of Supply');
                      setItems(prev => prev.map(i => ({ ...i, taxRate: 0 })));
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer text-center ${
                      invoiceType === 'Bill of Supply'
                        ? 'bg-purple-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Bill of Supply
                  </button>
                </div>
                <p className="text-[9px] text-slate-400 mt-1 font-medium">
                  {invoiceType === 'Tax Invoice'
                    ? 'Standard taxable supply under GST'
                    : 'Composition / exempt supply (0% tax)'}
                </p>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-1.5 block">
                  Invoice Date
                </label>
                <div className="relative">
                  <input 
                    type="date" 
                    value={invDate} 
                    onChange={e => setInvDate(e.target.value)} 
                    className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-2.5 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                  />
                </div>
              </div>
              <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/70 dark:border-slate-700/70">
                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Status</p>
                <select 
                  value={status} 
                  onChange={e => setStatus(e.target.value as any)}
                  className="mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none"
                >
                  <option value="Draft">Draft</option>
                  <option value="Sent">Sent</option>
                  <option value="Paid">Paid</option>
                  <option value="Partial">Partial</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Services Line Items Table */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Services Description & Line Items
              </h4>
            </div>

            {/* Billing Metric & Quantity Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Metric Selector: Month vs Qty vs Both */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold uppercase text-slate-400 px-2">Column:</span>
                <button
                  type="button"
                  onClick={() => setBillingUnitType('month')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    billingUnitType === 'month'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Bill by Month/Period (replaces quantity)"
                >
                  Month
                </button>
                <button
                  type="button"
                  onClick={() => setBillingUnitType('quantity')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    billingUnitType === 'quantity'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Bill by Quantity Units"
                >
                  Qty
                </button>
                <button
                  type="button"
                  onClick={() => setBillingUnitType('both')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    billingUnitType === 'both'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Show both Month and Quantity columns"
                >
                  Month + Qty
                </button>
              </div>

              {/* Quick Toggle for Quantity Multiplier Column */}
              <button
                type="button"
                onClick={() => setShowQuantity(!showQuantity)}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer flex items-center gap-1.5 ${
                  showQuantity
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                }`}
                title="Toggle quantity multiplier on or off"
              >
                <span>Qty Multiplier: {showQuantity ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>
          
          <div className="bg-slate-50/80 dark:bg-slate-850/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto w-full no-scrollbar">
              <table className="w-full min-w-[760px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90">
                    <th className="p-2.5 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider w-10 text-center">#</th>
                    <th className="p-2.5 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider w-24 text-center">Period / FY</th>
                    {billingUnitType !== 'quantity' && (
                      <th className="p-2.5 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider w-28 text-center">Month</th>
                    )}
                    <th className="p-2.5 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Description of Compliance Service</th>
                    <th className="p-2.5 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider w-20 text-center">HSN/SAC</th>
                    {(showQuantity || billingUnitType === 'quantity' || billingUnitType === 'both') && (
                      <th className="p-2.5 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider w-16 text-center">Qty</th>
                    )}
                    <th className="p-2.5 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider w-24 text-right">Rate (₹)</th>
                    {settings?.isGstEnabled && (
                      <th className="p-2.5 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider w-20 text-center">GST %</th>
                    )}
                    <th className="p-2.5 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider w-28 text-right">Total (₹)</th>
                    <th className="p-2.5 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((item, idx) => (
                    <tr key={item.id} className="group hover:bg-white/80 dark:hover:bg-slate-800/60 transition-colors">
                      <td className="p-2.5 text-center font-bold text-slate-400 dark:text-slate-500 text-xs">{idx + 1}</td>
                      <td className="p-2.5 text-center">
                        <input 
                          className="w-full bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 p-1 text-xs font-semibold outline-none text-center placeholder:text-slate-400 transition-all text-slate-800 dark:text-slate-200"
                          value={item.period || ''} 
                          onChange={e => updateItem(item.id, 'period', e.target.value)} 
                          placeholder="2026-27" 
                        />
                      </td>
                      {billingUnitType !== 'quantity' && (
                        <td className="p-2.5 text-center">
                          <input 
                            className="w-full bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 p-1 text-xs font-semibold outline-none text-center placeholder:text-slate-400 transition-all text-slate-800 dark:text-slate-200"
                            value={item.month || ''} 
                            onChange={e => updateItem(item.id, 'month', e.target.value)} 
                            placeholder="e.g. April 2026" 
                          />
                        </td>
                      )}
                      <td className="p-2.5">
                        <input 
                          className="w-full bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 p-1 text-xs font-semibold outline-none placeholder:text-slate-400 transition-all text-slate-800 dark:text-slate-200"
                          value={item.description} 
                          onChange={e => updateItem(item.id, 'description', e.target.value)} 
                          placeholder="Enter service description..." 
                        />
                      </td>
                      <td className="p-2.5 text-center">
                        <input 
                          className="w-full bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 p-1 text-xs font-mono outline-none text-center placeholder:text-slate-400 transition-all text-slate-700 dark:text-slate-300"
                          value={item.hsn || '998231'} 
                          onChange={e => updateItem(item.id, 'hsn', e.target.value)} 
                          placeholder="998231" 
                        />
                      </td>
                      {(showQuantity || billingUnitType === 'quantity' || billingUnitType === 'both') && (
                        <td className="p-2.5">
                          <input 
                            type="number" 
                            className="w-full bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 p-1 text-xs font-bold outline-none text-center placeholder:text-slate-400 transition-all text-slate-800 dark:text-slate-200"
                            value={item.quantity !== undefined ? item.quantity : 1} 
                            onChange={e => updateItem(item.id, 'quantity', Number(e.target.value))} 
                            placeholder="1" 
                          />
                        </td>
                      )}
                      <td className="p-2.5">
                        <input 
                          type="number" 
                          className="w-full bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 p-1 text-xs font-bold outline-none text-right placeholder:text-slate-400 transition-all text-slate-800 dark:text-slate-200"
                          value={item.rate} 
                          onChange={e => updateItem(item.id, 'rate', Number(e.target.value))} 
                          placeholder="0.00" 
                        />
                      </td>
                      {settings?.isGstEnabled && (
                        <td className="p-2.5">
                          <select
                            className="w-full bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 p-1 text-xs font-bold outline-none text-center text-slate-800 dark:text-slate-200 cursor-pointer appearance-none"
                            value={item.taxRate}
                            onChange={e => updateItem(item.id, 'taxRate', Number(e.target.value))}
                          >
                            {TAX_RATES.map(rate => (
                              <option key={rate} value={rate} className="bg-white dark:bg-slate-900">{rate}%</option>
                            ))}
                          </select>
                        </td>
                      )}
                      <td className="p-2.5 text-right font-bold text-slate-900 dark:text-white text-xs font-mono">
                        ₹{((item.rate || 0) * (showQuantity ? (item.quantity !== undefined ? item.quantity : 1) : 1)).toLocaleString()}
                      </td>
                      <td className="p-2.5 text-center">
                        <button 
                          onClick={() => removeItem(item.id)} 
                          className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                          title="Remove item"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button 
              onClick={addItem} 
              className="w-full py-2.5 bg-slate-50 dark:bg-slate-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border-t border-slate-200 dark:border-slate-700 text-xs font-bold text-indigo-600 dark:text-indigo-400 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Service Item</span>
            </button>
          </div>
        </section>

        {/* Totals Summary */}
        <section className="flex justify-end pt-3">
          <div className="w-full max-w-sm bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-5 rounded-2xl shadow-xl space-y-4 border border-indigo-900/40">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-[10px] font-bold uppercase tracking-wider">Sub-Total</span>
                <span className="text-xs font-bold font-mono">₹{totals.subTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              {totals.shouldAddTax && (
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Total Tax (GST)</span>
                  <span className="text-xs font-bold font-mono">₹{totals.totalTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {totals.hasFirmGstin && !totals.shouldAddTax && (
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-[10px] font-bold uppercase tracking-wider">GST Status</span>
                  <span className="text-[10px] font-black uppercase bg-white/20 text-white px-1.5 py-0.5 rounded tracking-wider">RCM APPLICABLE</span>
                </div>
              )}
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex justify-between items-center pt-1">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">Grand Total</span>
              <span className="text-2xl font-black font-mono tracking-tight text-white">
                ₹{totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="pt-2 border-t border-white/5">
              <p className="text-[9px] text-center text-slate-400 uppercase tracking-wider">Authorized Signature Required</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AddInvoice;
