import { useQueryClient } from '@tanstack/react-query';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useModuleData } from '../../../hooks/useModuleData.ts';
import { api } from '../../../services/api';
import Loader from '../../../components/Loader';
import { formatDate } from '../../../dateUtils';
import { Client, InvoiceRecord, PaymentRecord, InvoiceSettings } from '../../../types';
import { TableFilter } from '../../../components/TableFilter';
import { ViewControl } from '../../../components/ViewControl';
import html2pdf from 'html2pdf.js';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

interface ClientLedgerProps {
  onBack?: () => void;
  onViewChange?: (view: string, extra?: any) => void;
}

// Convert numbers to Indian Rupees in words
const numberToWords = (num: number): string => {
  if (!num || isNaN(num) || num <= 0) return 'Rupees Zero Only';
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (n: number): string => {
    let str = '';
    if (n > 99) {
      str += a[Math.floor(n / 100)] + 'Hundred ';
      n %= 100;
    }
    if (n > 19) {
      str += b[Math.floor(n / 10)] + ' ' + a[n % 10];
    } else {
      str += a[n];
    }
    return str.trim();
  };

  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const hundred = Math.floor(num);

  let result = '';
  if (crore > 0) result += inWords(crore) + ' Crore ';
  if (lakh > 0) result += inWords(lakh) + ' Lakh ';
  if (thousand > 0) result += inWords(thousand) + ' Thousand ';
  if (hundred > 0) result += inWords(hundred) + ' ';

  return ('Rupees ' + result.trim() + ' Only').replace(/\s+/g, ' ');
};

// Safe record normalizers
const normalizeInvoice = (raw: any): InvoiceRecord => {
  if (!raw) return raw;
  const data = (raw.data && typeof raw.data === 'object' && !raw.invoiceNo) ? raw.data : raw;
  const id = raw._id || raw.id || data.id || data._id;
  const totalAmount = Number(data.totalAmount) || 0;
  const amountPaid = Number(data.amountPaid) || 0;
  const discount = Number(data.discount) || 0;
  const balanceDue = data.balanceDue !== undefined ? Number(data.balanceDue) : Math.max(0, totalAmount - amountPaid - discount);
  return {
    ...data,
    id,
    _id: id,
    clientId: data.clientId || raw.clientId,
    clientName: data.clientName || raw.clientName || '',
    clientTradeName: data.clientTradeName || raw.clientTradeName || '',
    clientGstin: data.clientGstin || raw.clientGstin || '',
    invoiceNo: data.invoiceNo || raw.invoiceNo || '',
    date: data.date || raw.date || '',
    totalAmount,
    amountPaid,
    discount,
    balanceDue,
    status: data.status || raw.status || 'Sent',
    createdAt: raw.createdAt || data.createdAt,
    updatedAt: raw.updatedAt || data.updatedAt,
  };
};

const normalizePayment = (raw: any): PaymentRecord => {
  if (!raw) return raw;
  const data = (raw.data && typeof raw.data === 'object' && !raw.amount) ? raw.data : raw;
  const id = raw._id || raw.id || data.id || data._id;
  const amount = Number(data.amount) || 0;
  const discount = Number(data.discount) || 0;
  return {
    ...data,
    id,
    _id: id,
    clientId: data.clientId || raw.clientId,
    clientName: data.clientName || raw.clientName || '',
    clientTradeName: data.clientTradeName || raw.clientTradeName || '',
    invoiceNo: data.invoiceNo || raw.invoiceNo || '',
    amount,
    discount,
    date: data.date || raw.date || '',
    createdAt: raw.createdAt || data.createdAt,
    updatedAt: raw.updatedAt || data.updatedAt,
  };
};

// Calculate actual debit for an invoice, excluding any legacy "Previous Balance" line items so past dues are not doubled
const getInvoiceActualDebit = (inv: InvoiceRecord): number => {
  if (!inv.items || inv.items.length === 0) return inv.totalAmount || 0;
  const hasPreviousBalanceItem = inv.items.some(it => (it.description || '').toLowerCase().startsWith('previous balance'));
  if (!hasPreviousBalanceItem) return inv.totalAmount || 0;
  
  const cleanItems = inv.items.filter(it => !(it.description || '').toLowerCase().startsWith('previous balance'));
  const cleanSubTotal = cleanItems.reduce((acc, it) => {
    const qty = inv.showQuantity !== false ? (it.quantity !== undefined ? it.quantity : 1) : 1;
    return acc + ((it.rate || 0) * qty);
  }, 0);
  
  const taxRatio = (inv.subTotal && inv.subTotal > 0 && inv.totalTax) ? (inv.totalTax / inv.subTotal) : 0;
  return Math.round(cleanSubTotal + (cleanSubTotal * taxRatio));
};

const isItemClientMatch = (
  client: Client & { _allIds?: string[], _allLegalNames?: string[], _allGstins?: string[] },
  item: { clientId?: string; clientName?: string; clientTradeName?: string; clientGstin?: string }
): boolean => {
  if (!item) return false;
  const itemClientId = (item.clientId || '').trim();
  const allIds = client._allIds || (client.id ? [client.id] : []);
  if (itemClientId && itemClientId !== 'misc' && allIds.includes(itemClientId)) {
    return true;
  }

  const allLegalNames = client._allLegalNames || (client.legalName ? [client.legalName.trim().toLowerCase()] : []);
  const allGstins = client._allGstins || (client.gstProfile?.gstin ? [client.gstProfile.gstin.trim().toLowerCase()] : []);
  
  const itemLegal = (item.clientName || '').trim().toLowerCase();
  const itemTrade = (item.clientTradeName || '').trim().toLowerCase();
  const itemGstin = (item.clientGstin || '').trim().toLowerCase();
  const clientTrade = (client.tradeName || '').trim().toLowerCase();

  if (itemLegal && allLegalNames.includes(itemLegal)) return true;
  if (itemTrade && clientTrade && itemTrade === clientTrade) return true;
  if (itemLegal && clientTrade && itemLegal === clientTrade) return true;
  if (itemTrade && allLegalNames.includes(itemTrade)) return true;
  if (itemGstin && allGstins.length > 0 && allGstins.includes(itemGstin)) return true;

  return false;
};

const ClientLedger: React.FC<ClientLedgerProps> = ({ onBack, onViewChange }) => {
  const queryClient = useQueryClient();
  const { data: clients = [], isLoading: isClientsLoading } = useModuleData<Client[]>('clients');
  const { data: invoices = [], isLoading: isInvoicesLoading } = useModuleData<InvoiceRecord[]>('invoices');
  const { data: payments = [], isLoading: isPaymentsLoading } = useModuleData<PaymentRecord[]>('payments');
  const { data: settings } = useModuleData<InvoiceSettings>('invoice_settings');

  const [searchTerm, setSearchTerm] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'All' | 'Due' | 'Settled' | 'Advance'>('All');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [compactMode, setCompactMode] = useState(true);

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [manualCarryForward, setManualCarryForward] = useState('');
  const [entryToDelete, setEntryToDelete] = useState<{ id: string; type: string; ref: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const isLoading = isClientsLoading || isInvoicesLoading || isPaymentsLoading || isPurging;

  // Real-time synchronization on DB changes
  useEffect(() => {
    const syncHandler = () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    };
    window.addEventListener('clientify_db_change', syncHandler);
    return () => window.removeEventListener('clientify_db_change', syncHandler);
  }, [queryClient]);

  // Click outside listener for filter dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setStartDate('');
    setEndDate('');
    setManualCarryForward('');
  }, [selectedClient]);

  const normalizedInvoices = useMemo(() => {
    return (invoices || []).filter(Boolean).map(normalizeInvoice);
  }, [invoices]);

  const normalizedPayments = useMemo(() => {
    return (payments || []).filter(Boolean).map(normalizePayment);
  }, [payments]);

  const validInvoices = useMemo(() => {
    return normalizedInvoices.filter(i => i.status !== 'Cancelled' && i.status !== 'Draft');
  }, [normalizedInvoices]);

  const activeInvoiceNos = useMemo(() => {
    return new Set(validInvoices.map(i => i.invoiceNo ? i.invoiceNo.trim() : ''));
  }, [validInvoices]);

  const validPayments = useMemo(() => {
    return normalizedPayments.filter(p => {
      if (!p.invoiceNo) return true;
      return activeInvoiceNos.has(p.invoiceNo.trim());
    });
  }, [normalizedPayments, activeInvoiceNos]);

  const handlePurgeDatabase = async () => {
    if (window.confirm('Do you want to clean deleted/cancelled invoice data and orphaned payments from the database?')) {
      setIsPurging(true);
      try {
        const res = await api.purgeOrphanAndCancelledRecords();
        toast.success(`Database cleaned successfully! ${res.purgedCount} orphaned/cancelled item(s) removed.`);
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        queryClient.invalidateQueries({ queryKey: ['payments'] });
      } catch (err) {
        toast.error('Failed to clean database.');
      } finally {
        setIsPurging(false);
      }
    }
  };

  const clientBalances = useMemo(() => {
    // 0. Group clients by tradeName (or legalName if no tradeName)
    const groupedClientsMap = new Map<string, Client & { _allIds: string[], _allLegalNames: string[], _allGstins: string[] }>();
    clients.forEach(c => {
      if (!c) return;
      const key = (c.tradeName || c.legalName || '').trim().toLowerCase();
      if (!key) return;
      const gstin = c.gstProfile?.gstin ? c.gstProfile.gstin.trim().toLowerCase() : '';
      if (!groupedClientsMap.has(key)) {
        groupedClientsMap.set(key, { 
          ...c, 
          _allIds: [c.id], 
          _allLegalNames: [c.legalName ? c.legalName.trim().toLowerCase() : key],
          _allGstins: gstin ? [gstin] : []
        });
      } else {
        const existing = groupedClientsMap.get(key)!;
        if (!existing._allIds.includes(c.id)) existing._allIds.push(c.id);
        if (c.legalName && !existing._allLegalNames.includes(c.legalName.trim().toLowerCase())) {
          existing._allLegalNames.push(c.legalName.trim().toLowerCase());
        }
        if (gstin && !existing._allGstins.includes(gstin)) {
          existing._allGstins.push(gstin);
        }
      }
    });
    const groupedClients = Array.from(groupedClientsMap.values());

    // Helper to synthesize payment records for invoices having amountPaid > sum of recorded payments
    const getEffectiveClientPayments = (clientInvs: typeof validInvoices, basePayments: typeof validPayments) => {
      const syntheticPayments: typeof validPayments = [];
      clientInvs.forEach(inv => {
        const invPaid = Number(inv.amountPaid) || 0;
        if (invPaid > 0) {
          const recordedForInv = basePayments.filter(p => p.invoiceNo && p.invoiceNo === inv.invoiceNo);
          const recordedTotal = recordedForInv.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
          if (invPaid > recordedTotal) {
            const gap = invPaid - recordedTotal;
            syntheticPayments.push({
              id: `inv-part-${inv.id}`,
              clientId: inv.clientId,
              clientName: inv.clientName,
              clientTradeName: inv.clientTradeName,
              invoiceNo: inv.invoiceNo,
              invoiceDate: inv.date,
              date: inv.paymentDate || inv.date,
              amount: gap,
              mode: (inv.paymentMode as any) || 'Online',
              chequeNo: inv.paymentMode ? `${inv.paymentMode} Payment` : 'Direct Payment'
            });
          }
        }
      });
      return [...basePayments, ...syntheticPayments];
    };

    // 1. Process regular clients
    const regularBalances = groupedClients.map(client => {
      const clientInvoices = validInvoices.filter(i => isItemClientMatch(client, i));
      const clientBasePayments = validPayments.filter(p => isItemClientMatch(client, p));
      const clientPayments = getEffectiveClientPayments(clientInvoices, clientBasePayments);
      
      const totalInvoiced = clientInvoices.reduce((sum, i) => sum + getInvoiceActualDebit(i), 0);
      const totalPaid = clientPayments.reduce((sum, p) => sum + p.amount, 0);
      const totalDiscount = clientInvoices.reduce((sum, i) => sum + (Number(i.discount) || 0), 0);
      
      const balance = totalInvoiced - totalPaid - totalDiscount; // positive = debit, negative = credit
      return { 
        client: client as Client, 
        balance, 
        totalInvoiced, 
        totalPaid, 
        totalDiscount,
        hasActivity: clientInvoices.length > 0 || clientPayments.length > 0 
      };
    });

    // 2. Identify and group unmatched invoices/payments (manual or misc clients)
    const unmatchedInvoices = validInvoices.filter(i => 
      !groupedClients.some(c => isItemClientMatch(c, i))
    );

    const unmatchedPayments = validPayments.filter(p => 
      !groupedClients.some(c => isItemClientMatch(c, p))
    );

    const unmatchedNames = new Set<string>();
    unmatchedInvoices.forEach(i => i.clientName && unmatchedNames.add(i.clientName.trim()));
    unmatchedPayments.forEach(p => p.clientName && unmatchedNames.add(p.clientName.trim()));

    const manualBalances = Array.from(unmatchedNames).map(name => {
      const clientInvoices = unmatchedInvoices.filter(i => (i.clientName || '').trim().toLowerCase() === name.toLowerCase());
      const clientBasePayments = unmatchedPayments.filter(p => (p.clientName || '').trim().toLowerCase() === name.toLowerCase());
      const clientPayments = getEffectiveClientPayments(clientInvoices, clientBasePayments);

      const totalInvoiced = clientInvoices.reduce((sum, i) => sum + getInvoiceActualDebit(i), 0);
      const totalPaid = clientPayments.reduce((sum, p) => sum + p.amount, 0);
      const totalDiscount = clientInvoices.reduce((sum, i) => sum + (Number(i.discount) || 0), 0);
      const balance = totalInvoiced - totalPaid - totalDiscount;

      const pseudoClient: Client = {
        id: `manual-${encodeURIComponent(name)}`,
        legalName: name,
        tradeName: clientInvoices[0]?.clientTradeName || '',
        mobile: clientInvoices[0]?.miscMobile || clientPayments[0]?.chequeNo || '',
        address: clientInvoices[0]?.miscAddress || '',
        gstProfile: { gstin: clientInvoices[0]?.clientGstin || '' }
      } as any;

      return { client: pseudoClient, balance, totalInvoiced, totalPaid, totalDiscount, hasActivity: true };
    });

    return [...regularBalances, ...manualBalances]
      .filter(c => c.hasActivity)
      .sort((a, b) => b.balance - a.balance); // Sort by balance descending
  }, [clients, validInvoices, validPayments]);

  const ledgerStats = useMemo(() => {
    return {
      total: clientBalances.length,
      due: clientBalances.filter(c => c.balance > 0).length,
      settled: clientBalances.filter(c => c.balance === 0).length,
      advance: clientBalances.filter(c => c.balance < 0).length,
    };
  }, [clientBalances]);

  const totalDueAmount = useMemo(() => {
    return clientBalances.filter(c => c.balance > 0).reduce((sum, c) => sum + c.balance, 0);
  }, [clientBalances]);

  const totalAdvanceAmount = useMemo(() => {
    return clientBalances.filter(c => c.balance < 0).reduce((sum, c) => sum + Math.abs(c.balance), 0);
  }, [clientBalances]);

  const filteredBalances = useMemo(() => {
    const s = searchTerm.toLowerCase();
    let list = clientBalances.filter(c => 
      c.client.tradeName?.toLowerCase().includes(s) || 
      c.client.legalName?.toLowerCase().includes(s)
    );

    if (balanceFilter === 'Due') {
      list = list.filter(c => c.balance > 0);
    } else if (balanceFilter === 'Settled') {
      list = list.filter(c => c.balance === 0);
    } else if (balanceFilter === 'Advance') {
      list = list.filter(c => c.balance < 0);
    }

    return list;
  }, [clientBalances, searchTerm, balanceFilter]);

  const allEntries = useMemo(() => {
    if (!selectedClient) return [];
    
    type LedgerEntry = { id: string; date: string; type: string; ref: string; debit: number; credit: number };
    const entries: LedgerEntry[] = [];
    
    const isManual = selectedClient.id.startsWith('manual-');
    
    const clientInvoices = validInvoices.filter(i => {
      if (isManual) return (i.clientName || '').trim().toLowerCase() === selectedClient.legalName.trim().toLowerCase();
      return isItemClientMatch(selectedClient as any, i);
    });

    const clientBasePayments = validPayments.filter(p => {
      if (isManual) return (p.clientName || '').trim().toLowerCase() === selectedClient.legalName.trim().toLowerCase();
      return isItemClientMatch(selectedClient as any, p);
    });

    const syntheticPayments: typeof validPayments = [];
    clientInvoices.forEach(inv => {
      const invPaid = Number(inv.amountPaid) || 0;
      if (invPaid > 0) {
        const recordedForInv = clientBasePayments.filter(p => p.invoiceNo && p.invoiceNo === inv.invoiceNo);
        const recordedTotal = recordedForInv.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        if (invPaid > recordedTotal) {
          const gap = invPaid - recordedTotal;
          syntheticPayments.push({
            id: `inv-part-${inv.id}`,
            clientId: inv.clientId,
            clientName: inv.clientName,
            clientTradeName: inv.clientTradeName,
            invoiceNo: inv.invoiceNo,
            invoiceDate: inv.date,
            date: inv.paymentDate || inv.date,
            amount: gap,
            mode: (inv.paymentMode as any) || 'Online',
            chequeNo: inv.paymentMode ? `${inv.paymentMode} Payment` : 'Direct Payment'
          });
        }
      }
    });

    const clientPayments = [...clientBasePayments, ...syntheticPayments];

    clientInvoices.forEach(inv => {
       entries.push({
         id: inv.id,
         date: inv.date,
         type: 'Invoice',
         ref: inv.invoiceNo,
         debit: getInvoiceActualDebit(inv),
         credit: 0
       });

       const discountAmt = Number(inv.discount) || 0;
       if (discountAmt > 0) {
         entries.push({
           id: `disc-${inv.id}`,
           date: inv.paymentDate || inv.date,
           type: 'Credit Note',
           ref: `Settlement Discount / Waiver (${inv.invoiceNo})`,
           debit: 0,
           credit: discountAmt
         });
       }
    });
    
    clientPayments.forEach(pay => {
       entries.push({
         id: pay.id,
         date: pay.date,
         type: 'Payment',
         ref: pay.mode + (pay.chequeNo ? ` - ${pay.chequeNo}` : ''),
         debit: 0,
         credit: pay.amount
       });
    });
    
    return entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedClient, validInvoices, validPayments]);

  const { filteredLedgerEntries, openingBalanceRow, finalClosingDr, finalClosingCr, finalClosingBal } = useMemo(() => {
    const manualCarryNum = parseFloat(manualCarryForward) || 0;
    let calculatedPriorBalance = 0;
    
    let priorEntries: typeof allEntries = [];
    let visibleEntries = allEntries;
    
    if (startDate) {
      priorEntries = allEntries.filter(e => e.date < startDate);
      visibleEntries = visibleEntries.filter(e => e.date >= startDate);
      calculatedPriorBalance = priorEntries.reduce((sum, e) => sum + (e.debit - e.credit), 0);
    }
    
    if (endDate) {
      visibleEntries = visibleEntries.filter(e => e.date <= endDate);
    }
    
    const totalOpeningBalance = calculatedPriorBalance + manualCarryNum;
    
    const openingRow = (startDate || manualCarryNum !== 0 || calculatedPriorBalance !== 0) ? {
      id: 'opening-balance',
      date: startDate || (visibleEntries.length > 0 ? visibleEntries[0].date : new Date().toISOString().split('T')[0]),
      type: 'Opening Balance',
      ref: 'Balance Carried Forward' + (manualCarryNum !== 0 && calculatedPriorBalance !== 0 ? ' (Prior + Manual)' : manualCarryNum !== 0 ? ' (Manual)' : ' (Prior)'),
      debit: totalOpeningBalance > 0 ? totalOpeningBalance : 0,
      credit: totalOpeningBalance < 0 ? Math.abs(totalOpeningBalance) : 0,
      balance: totalOpeningBalance,
      isOpening: true
    } : null;
    
    const totalVisibleDr = visibleEntries.reduce((sum, e) => sum + e.debit, 0);
    const totalVisibleCr = visibleEntries.reduce((sum, e) => sum + e.credit, 0);
    
    const closingDr = totalVisibleDr + (totalOpeningBalance > 0 ? totalOpeningBalance : 0);
    const closingCr = totalVisibleCr + (totalOpeningBalance < 0 ? Math.abs(totalOpeningBalance) : 0);
    const closingBal = closingDr - closingCr;
    
    return {
      filteredLedgerEntries: visibleEntries,
      openingBalanceRow: openingRow,
      finalClosingDr: closingDr,
      finalClosingCr: closingCr,
      finalClosingBal: closingBal
    };
  }, [allEntries, startDate, endDate, manualCarryForward]);

  const handleDeleteConfirm = async () => {
    if (!entryToDelete) return;
    setIsDeleting(true);
    try {
      if (entryToDelete.type === 'Invoice') {
        await api.deleteInvoice(entryToDelete.id);
        toast.success('Invoice entry deleted successfully');
      } else if (entryToDelete.type === 'Payment') {
        await api.deletePayment(entryToDelete.id);
        toast.success('Payment entry deleted successfully');
      } else if (entryToDelete.type === 'Credit Note' || entryToDelete.id.startsWith('disc-')) {
        const invId = entryToDelete.id.replace('disc-', '');
        const targetInv = validInvoices.find(i => i.id === invId || (i as any)._id === invId);
        if (targetInv) {
          const originalAmt = Number(targetInv.totalAmount) || 0;
          const paidAmt = Number(targetInv.amountPaid) || 0;
          const newBal = Math.max(0, originalAmt - paidAmt);
          const newStatus = newBal <= 0 ? 'Paid' : (paidAmt > 0 ? 'Partial' : 'Sent');
          await api.saveInvoice({
            ...targetInv,
            discount: 0,
            balanceDue: newBal,
            status: newStatus
          });
          toast.success('Settlement discount / waiver removed from invoice and ledger');
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ['invoices'] }); 
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['category_items'] });
      setEntryToDelete(null);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('clientify_db_change'));
    } catch (err) {
      console.error('Error deleting entry:', err);
      toast.error('Failed to delete entry.');
    } finally {
      setIsDeleting(false);
    }
  };

  const exportLedger = () => {
    if (!printRef.current || !selectedClient) return;
    const clientName = selectedClient.tradeName || selectedClient.legalName;
    const opt = {
      margin: [8, 10, 8, 10] as [number, number, number, number],
      filename: `Statement_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollX: 0, scrollY: 0, windowWidth: 794 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };
    toast.info('Generating A4 Statement PDF...');
    html2pdf().from(printRef.current).set(opt).save().then(() => {
      toast.success('A4 Statement PDF downloaded successfully!');
    });
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const clientName = selectedClient ? (selectedClient.tradeName || selectedClient.legalName) : 'Client';
    const printWindow = window.open('about:blank', '_blank', 'width=900,height=1100');
    if (printWindow) {
      const pageStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
        .map(el => el.outerHTML)
        .join('\n');

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Statement - ${clientName}</title>
          ${pageStyles}
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm 10mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              color: #0f172a;
              background: #fff;
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
            }
            #client-ledger-a4-sheet {
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 auto !important;
              padding: 0 !important;
              border: none !important;
              box-shadow: none !important;
              border-radius: 0 !important;
            }
            table { 
              page-break-inside: auto; 
              width: 100%;
              border-collapse: collapse;
            }
            tr { 
              page-break-inside: avoid !important; 
              break-inside: avoid !important; 
            }
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }
            [data-html2pdf-ignore="true"] {
              display: none !important;
            }
            .no-break { page-break-inside: avoid !important; break-inside: avoid !important; }
          </style>
        </head>
        <body class="p-0 m-0 bg-white text-slate-900">
          <div style="width: 100%; max-width: 100%; margin: 0 auto;">
            ${printContent.outerHTML}
          </div>
          <script>
            window.onload = function() {
              setTimeout(() => {
                window.print();
                window.close();
              }, 400);
            };
            setTimeout(() => {
              window.print();
              window.close();
            }, 800);
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      window.print();
    }
  };

  const handleShareWhatsApp = () => {
    if (!selectedClient) return;
    const clientName = selectedClient.tradeName || selectedClient.legalName;
    const statusStr = finalClosingBal > 0 
      ? `Outstanding Due: ₹${finalClosingBal.toLocaleString()} (Dr)` 
      : finalClosingBal < 0 
      ? `Advance Credit: ₹${Math.abs(finalClosingBal).toLocaleString()} (Cr)` 
      : 'Account is Fully Settled (NIL)';
    const text = `*Account Statement from ${settings?.firmName || 'Our Firm'}*\n\nClient: ${clientName}\nStatement Date: ${formatDate(new Date())}\n${statusStr}\nTotal Invoiced: ₹${finalClosingDr.toLocaleString()}\nTotal Paid: ₹${finalClosingCr.toLocaleString()}\n\nPlease review your statement. Thank you!`;
    const phone = selectedClient.mobile ? selectedClient.mobile.replace(/[^0-9]/g, '') : '';
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (isLoading) return <Loader />;

  // -------------------------------------------------------------
  // VIEW: Client Ledger Statement (A4 Standard View)
  // -------------------------------------------------------------
  if (selectedClient) {
    return (
      <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
        
        {/* Print Stylesheet for pure A4 print output */}
        <style>{`
          @media print {
            body * {
              visibility: hidden !important;
            }
            #client-ledger-a4-sheet, #client-ledger-a4-sheet * {
              visibility: visible !important;
            }
            #client-ledger-a4-sheet {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
              border: none !important;
            }
          }
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
        `}</style>

        {/* Top Control Bar */}
        <div className="relative z-50 flex flex-wrap items-center justify-between gap-2 sm:gap-2.5 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl p-2 sm:p-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs shrink-0 w-full max-w-full min-w-0 transition-colors">
          <div className="flex items-center gap-2.5 min-w-0">
            <button 
              onClick={() => setSelectedClient(null)} 
              className="h-8 w-8 sm:h-8.5 sm:w-8.5 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer text-slate-600 dark:text-slate-300 shrink-0"
              title="Back to Client List"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-tight leading-tight truncate">
                  {selectedClient.tradeName || selectedClient.legalName}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 border ${
                  finalClosingBal > 0 
                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800' 
                    : finalClosingBal < 0 
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' 
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                }`}>
                  {finalClosingBal > 0 ? `Due: ₹${finalClosingBal.toLocaleString()} Dr` : finalClosingBal < 0 ? `Advance: ₹${Math.abs(finalClosingBal).toLocaleString()} Cr` : 'Settled'}
                </span>
              </div>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Statement of Account • A4 Sheet Preview</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 h-8 sm:h-8.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
              title="Print standard A4 sheet"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span className="hidden sm:inline">Print</span>
            </button>

            <button 
              type="button"
              onClick={exportLedger} 
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 sm:px-4 h-8 sm:h-8.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors shadow-xs cursor-pointer"
              title="Download high-resolution A4 PDF"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              <span>Export PDF</span>
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-3 h-8 sm:h-8.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors shadow-xs cursor-pointer"
              title="Share statement summary on WhatsApp"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.669-.699c.969.585 1.961.884 3.03.885h.005c3.181 0 5.768-2.586 5.768-5.766 0-3.18-2.587-5.771-5.771-5.771zm3.393 8.163c-.144.405-.837.774-1.17.824-.312.045-.694.075-2.003-.464-1.674-.69-2.735-2.39-2.818-2.5-.084-.11-1.077-1.432-1.077-2.732 0-1.301.684-1.94 1.026-2.203.228-.175.498-.219.664-.219.167 0 .333.001.479.008.156.008.365-.059.57.433.21.503.716 1.745.779 1.872.062.128.104.278.021.442-.083.164-.125.267-.249.412-.124.145-.262.324-.374.436-.125.124-.255.26-.11.51.146.25.648 1.069 1.39 1.731.955.852 1.76 1.116 2.01 1.241.25.125.395.104.541-.062.146-.167.625-.729.791-.979.166-.25.333-.209.562-.125.229.083 1.458.688 1.708.813.25.125.416.188.479.292.063.104.063.604-.081 1.009z" />
              </svg>
              <span className="hidden md:inline">WhatsApp</span>
            </button>
          </div>
        </div>

        {/* Ledger Date / Balance Controls Bar */}
        <div className="bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs p-2.5 sm:p-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5 shrink-0 transition-colors">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-400 tracking-wider">Start Date</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-1.5 font-bold text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-400 tracking-wider">End Date</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-1.5 font-bold text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-400 tracking-wider">Manual Previous Balance (₹)</label>
            <div className="relative">
              <span className="absolute left-3 inset-y-0 flex items-center text-xs font-bold text-slate-400">₹</span>
              <input 
                type="number" 
                placeholder="0"
                value={manualCarryForward} 
                onChange={(e) => setManualCarryForward(e.target.value)}
                className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl pl-7 pr-3 py-1.5 font-bold text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>
          {(startDate || endDate || manualCarryForward) && (
            <div className="sm:col-span-3 flex justify-end">
              <button 
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setManualCarryForward('');
                }}
                className="text-rose-600 hover:text-rose-700 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Clear Statement Filters
              </button>
            </div>
          )}
        </div>

        {/* Scrollable Canvas Viewport */}
        <div className="flex-1 overflow-y-auto bg-slate-200/60 dark:bg-slate-950/80 p-3 sm:p-6 flex justify-center no-scrollbar">
           
          {/* Printable Standard A4 Canvas Sheet (210mm x 297mm) */}
          <div 
            id="client-ledger-a4-sheet"
            ref={printRef}
            style={{ width: '100%', maxWidth: '190mm', margin: '0 auto', boxSizing: 'border-box' }}
            className="w-full max-w-[190mm] bg-white rounded-none sm:rounded-lg shadow-xl relative flex flex-col justify-between text-slate-800 box-border text-[11px] leading-normal mx-auto p-6 sm:p-8"
          >
            {/* Watermark */}
            {settings?.watermark ? (
              <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none z-0 overflow-hidden">
                <img src={settings.watermark} alt="Watermark" className="w-[75%] object-contain mix-blend-multiply grayscale" />
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center opacity-[0.035] pointer-events-none z-0 overflow-hidden select-none">
                <span className="text-5xl sm:text-6xl font-black uppercase tracking-widest text-slate-900 -rotate-30 whitespace-nowrap">
                  {settings?.firmName || 'ADVOCATE PRAKHAR GUPTA'}
                </span>
              </div>
            )}

            {/* Main Sheet Content */}
            <div className="relative z-10 space-y-5">
              
              {/* 1. Header: Firm Details on Left, Large STATEMENT on Right */}
              <div className="flex justify-between items-start gap-4">
                <div className="flex flex-col justify-center max-w-[65%]">
                  <h1 className="text-3xl sm:text-[32px] font-black uppercase tracking-tight text-slate-900 leading-tight">
                    {settings?.firmName || 'ADVOCATE PRAKHAR GUPTA'}
                  </h1>
                  {settings?.firmServices && (
                    <p className="text-xs sm:text-[13px] font-bold text-indigo-700 uppercase tracking-wider mt-1">
                      {settings.firmServices}
                    </p>
                  )}
                  {settings?.professionType && settings?.registrationNo && (
                    <p className="text-[11px] sm:text-xs font-bold text-slate-600 uppercase mt-0.5">
                      {settings.professionType === 'CA' ? 'ICAI MEMBERSHIP NO: ' : 'BAR COUNCIL REG NO: '}{settings.registrationNo}
                    </p>
                  )}
                  {settings?.firmAddress && (
                    <p className="text-xs sm:text-[12.5px] font-semibold text-slate-800 mt-1.5 leading-snug uppercase whitespace-pre-wrap max-w-md">
                      {settings.firmAddress}
                    </p>
                  )}
                  <div className="text-[11px] sm:text-[11.5px] font-semibold text-slate-700 uppercase mt-1.5 space-y-0.5">
                    {settings?.firmMobile && (
                      <p>CONTACT: <span className="font-bold text-slate-900">{settings.firmMobile}</span></p>
                    )}
                    {settings?.firmEmail && (
                      <p>EMAIL: <span className="font-bold text-slate-900">{settings.firmEmail.toUpperCase()}</span></p>
                    )}
                    {settings?.firmGstin && settings.firmGstin.toLowerCase() !== 'n/a' && (
                      <p>GSTIN: <span className="font-mono font-bold text-slate-900">{settings.firmGstin}</span></p>
                    )}
                  </div>
                </div>

                {/* Right STATEMENT Title & Metadata */}
                <div className="text-right flex flex-col items-end shrink-0">
                  <h2 className="text-5xl sm:text-6xl font-black uppercase tracking-wider text-slate-200/90 leading-none select-none">
                    STATEMENT
                  </h2>
                  <div className="mt-3 space-y-1 text-right text-[11.5px] sm:text-xs font-bold text-slate-700 uppercase">
                    <p>AS ON: <span className="font-bold text-slate-900">{formatDate(new Date())}</span></p>
                    {(startDate || endDate) && (
                      <p className="text-indigo-700">
                        PERIOD: {startDate ? formatDate(startDate) : 'BEGINNING'} - {endDate ? formatDate(endDate) : 'PRESENT'}
                      </p>
                    )}
                    <p>
                      STATUS: <span className={`font-mono font-black ${finalClosingBal > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {finalClosingBal > 0 ? `DUE ₹${finalClosingBal.toLocaleString()} (Dr)` : finalClosingBal < 0 ? `ADV ₹${Math.abs(finalClosingBal).toLocaleString()} (Cr)` : 'SETTLED'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. Client Details Section */}
              <div className="pt-2">
                <span className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  STATEMENT FOR
                </span>
                <h3 className="text-lg sm:text-xl font-black uppercase text-slate-900 tracking-tight leading-snug">
                  {selectedClient.tradeName || selectedClient.legalName}
                </h3>
                {selectedClient.tradeName && selectedClient.legalName && selectedClient.tradeName !== selectedClient.legalName && (
                  <p className="text-xs sm:text-[12.5px] font-bold text-slate-600 uppercase mt-0.5">
                    {selectedClient.legalName}
                  </p>
                )}
                {selectedClient.gstProfile?.gstin && (
                  <p className="text-[11.5px] sm:text-xs font-bold text-slate-800 uppercase mt-1">
                    GSTIN: <span className="font-mono font-bold text-slate-900">{selectedClient.gstProfile.gstin}</span>
                  </p>
                )}
                {selectedClient.address && (
                  <p className="text-[11px] sm:text-[11.5px] font-medium text-slate-600 uppercase mt-0.5 max-w-lg leading-relaxed">
                    {selectedClient.address}
                  </p>
                )}
                {selectedClient.mobile && (
                  <p className="text-[11.5px] sm:text-xs font-bold text-slate-800 uppercase mt-1">
                    MOBILE: <span className="font-mono font-bold text-slate-900">{selectedClient.mobile}</span>
                  </p>
                )}
              </div>

              {/* 3. Detailed Transaction Ledger Table */}
              <div className="pt-1">
                <table className="w-full text-left border-collapse table-auto">
                  <thead>
                    <tr className="border-t-2 border-b-2 border-slate-900 text-[10.5px] font-black uppercase text-slate-900">
                      <th className="py-2.5 px-2 w-24 text-center">DATE</th>
                      <th className="py-2.5 px-2 text-left whitespace-nowrap">VOUCHER & PARTICULARS</th>
                      <th className="py-2.5 px-2 w-24 text-right whitespace-nowrap">DEBIT(/₹)</th>
                      <th className="py-2.5 px-2 w-24 text-right whitespace-nowrap">CREDIT(/₹)</th>
                      <th className="py-2.5 px-2 w-28 text-right whitespace-nowrap">BALANCE(/₹)</th>
                      <th className="py-2.5 px-1 w-8 text-center" data-html2pdf-ignore="true"></th>
                    </tr>
                  </thead>
                  <tbody className="text-[11px] text-slate-800 divide-y divide-slate-100">
                    {/* Opening Balance Row */}
                    {openingBalanceRow && (
                      <tr className="bg-amber-50/50 font-bold">
                        <td className="py-3 px-2 font-mono text-slate-600 text-center whitespace-nowrap">
                          {openingBalanceRow.date ? formatDate(openingBalanceRow.date) : '-'}
                        </td>
                        <td className="py-3 px-2">
                          <span className="text-[8.5px] bg-amber-200 text-amber-900 font-black px-1.5 py-0.5 rounded mr-1.5 uppercase tracking-wider">OPENING</span>
                          <span className="text-slate-900 font-bold">{openingBalanceRow.ref}</span>
                        </td>
                        <td className="py-3 px-2 text-right font-mono text-rose-700 whitespace-nowrap">
                          {openingBalanceRow.debit > 0 ? openingBalanceRow.debit.toLocaleString() : '-'}
                        </td>
                        <td className="py-3 px-2 text-right font-mono text-emerald-700 whitespace-nowrap">
                          {openingBalanceRow.credit > 0 ? openingBalanceRow.credit.toLocaleString() : '-'}
                        </td>
                        <td className="py-3 px-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          ₹{Math.abs(openingBalanceRow.balance).toLocaleString()} {openingBalanceRow.balance > 0 ? 'Dr' : openingBalanceRow.balance < 0 ? 'Cr' : ''}
                        </td>
                        <td className="py-3 px-1 text-center" data-html2pdf-ignore="true" />
                      </tr>
                    )}

                    {filteredLedgerEntries.length === 0 && !openingBalanceRow ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400 font-bold text-xs uppercase tracking-wider">
                          No transactions recorded for the selected period.
                        </td>
                      </tr>
                    ) : (() => {
                      let printRunningBalance = openingBalanceRow ? openingBalanceRow.balance : 0;
                      return filteredLedgerEntries.map((entry, idx) => {
                        printRunningBalance += (entry.debit - entry.credit);
                        return (
                          <tr key={entry.id || idx} className="hover:bg-slate-50/60 group">
                            <td className="py-3 px-2 font-mono text-slate-600 text-center whitespace-nowrap">
                              {formatDate(entry.date)}
                            </td>
                            <td className="py-3 px-2">
                              <span className={`text-[8.5px] font-black px-1.5 py-0.5 rounded mr-1.5 uppercase tracking-wider ${
                                entry.type === 'Invoice' 
                                  ? 'bg-indigo-100 text-indigo-800' 
                                  : entry.type === 'Credit Note' 
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {entry.type}
                              </span>
                              <span className="text-slate-900 font-bold">{entry.ref}</span>
                            </td>
                            <td className="py-3 px-2 text-right font-mono text-rose-700 font-medium whitespace-nowrap">
                              {entry.debit > 0 ? entry.debit.toLocaleString() : '-'}
                            </td>
                            <td className="py-3 px-2 text-right font-mono text-emerald-700 font-medium whitespace-nowrap">
                              {entry.credit > 0 ? entry.credit.toLocaleString() : '-'}
                            </td>
                            <td className="py-3 px-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                              ₹{Math.abs(printRunningBalance).toLocaleString()} {printRunningBalance > 0 ? 'Dr' : printRunningBalance < 0 ? 'Cr' : ''}
                            </td>
                            <td className="py-3 px-1 text-center" data-html2pdf-ignore="true">
                              <button 
                                onClick={() => setEntryToDelete({ id: entry.id, type: entry.type, ref: entry.ref })}
                                className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                                title={`Delete ${entry.type} #${entry.ref}`}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>

                  {/* Summary Totals Footer */}
                  {(filteredLedgerEntries.length > 0 || openingBalanceRow) && (
                    <tfoot className="border-t-2 border-slate-900 font-bold text-slate-900 text-[10.5px]">
                      <tr>
                        <td colSpan={2} className="py-2.5 px-2 text-right uppercase tracking-wider">
                          TOTAL DEBITS & CREDITS:
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-rose-700 whitespace-nowrap">
                          ₹{finalClosingDr.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-emerald-700 whitespace-nowrap">
                          ₹{finalClosingCr.toLocaleString()}
                        </td>
                        <td className={`py-2.5 px-2 text-right font-mono font-black text-xs whitespace-nowrap ${
                          finalClosingBal > 0 ? 'text-rose-700' : finalClosingBal < 0 ? 'text-indigo-700' : 'text-slate-900'
                        }`}>
                          ₹{Math.abs(finalClosingBal).toLocaleString()} {finalClosingBal > 0 ? 'Dr' : finalClosingBal < 0 ? 'Cr' : 'Nil'}
                        </td>
                        <td className="py-2.5 px-1" data-html2pdf-ignore="true" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* 4. Bank Information (Left) & Net Position + Authorized Signatory (Right) */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-4 pb-2 border-b border-slate-200">
                
                {/* Left: Scan to Settle QR + Bank Details */}
                <div className="flex items-start gap-3.5">
                  {settings?.upiId && finalClosingBal > 0 && (
                    <div className="flex flex-col items-center shrink-0">
                      <div className="p-1 bg-white border border-slate-200 rounded shadow-2xs">
                        <QRCodeSVG 
                          value={`upi://pay?pa=${settings.upiId}&pn=${encodeURIComponent(settings.firmName || '')}&am=${finalClosingBal}&cu=INR&tn=Ledger ${encodeURIComponent(selectedClient.tradeName || selectedClient.legalName)}`} 
                          size={90} 
                        />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-800 text-center mt-1.5 leading-tight">
                        SCAN TO SETTLE
                      </span>
                    </div>
                  )}

                  <div className="text-[11px] sm:text-[11.5px] space-y-1 text-slate-700 min-w-[190px]">
                    <h4 className="font-black uppercase tracking-wider text-slate-900 text-xs sm:text-sm mb-1 border-b border-slate-200 pb-0.5">
                      REMITTANCE & BANK DETAILS
                    </h4>
                    <p className="font-bold">A/C NAME: <span className="font-black text-slate-900 uppercase">{settings?.accountName || settings?.firmName || 'PRAKHAR GUPTA'}</span></p>
                    <p className="font-bold">BANK: <span className="font-black text-slate-900 uppercase">{settings?.bankName || 'KOTAK MAHINDRA BANK'}</span></p>
                    <p className="font-bold">A/C NO: <span className="font-mono font-black text-slate-900">{settings?.accountNo || '0346884449'}</span></p>
                    <p className="font-bold">IFSC: <span className="font-mono font-black text-slate-900">{settings?.ifsc || 'KKBK0005077'}</span></p>
                  </div>
                </div>

                {/* Right: Summary Card + Authorized Signatory */}
                <div className="w-full sm:w-72 space-y-3 text-right shrink-0">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-slate-600 uppercase">
                      <span>TOTAL INVOICED (DEBIT)</span>
                      <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm">₹{finalClosingDr.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-[11.5px] font-bold text-emerald-700 uppercase">
                      <span>TOTAL RECEIVED (CREDIT)</span>
                      <span className="font-mono font-bold text-emerald-700 text-xs sm:text-sm">₹{finalClosingCr.toLocaleString()}</span>
                    </div>
                    <div className="border-t border-slate-300 pt-2 mt-2 flex justify-between items-baseline">
                      <span className="text-base sm:text-lg font-black uppercase text-slate-900 tracking-tight">
                        NET BALANCE
                      </span>
                      <span className={`text-xl sm:text-2xl font-black font-mono ${finalClosingBal > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        ₹{Math.abs(finalClosingBal).toLocaleString()} {finalClosingBal > 0 ? 'Dr' : finalClosingBal < 0 ? 'Cr' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Authorized Signatory placed directly below Net Balance */}
                  <div className="pt-2 text-center flex flex-col items-center justify-end min-w-[150px] ml-auto">
                    {settings?.firmSignature ? (
                      <img src={settings.firmSignature} alt="Authorized Signatory" className="h-10 sm:h-12 object-contain mb-1" />
                    ) : (
                      <div className="font-serif italic text-2xl sm:text-3xl text-slate-800 tracking-wide font-bold mb-1 select-none" style={{ fontFamily: 'Georgia, "Brush Script MT", cursive' }}>
                        {settings?.accountName || (settings?.firmName ? (settings.firmName.split(' ')[0] + ' ' + (settings.firmName.split(' ')[1] || '')) : 'Prakhar Gupta')}
                      </div>
                    )}
                    <p className="text-[10px] sm:text-[10.5px] font-black uppercase text-slate-900 tracking-wider">
                      AUTHORIZED SIGNATORY
                    </p>
                    <p className="text-[9px] sm:text-[9.5px] font-bold uppercase text-slate-600">
                      {settings?.firmName || 'ADVOCATE PRAKHAR GUPTA'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 5. Footer: Terms (Left) & WhatsApp US (Right) - In line on the downside */}
              <div className="mt-auto pt-3 pb-1 no-break w-full">
                <div className="flex justify-between items-start gap-4 sm:gap-6">
                  {/* Left: Notes & Terms */}
                  <div className="flex-1 text-[8.5px] sm:text-[9px] leading-relaxed text-slate-600 uppercase space-y-1">
                    <h5 className="font-black text-[9.5px] sm:text-[10px] text-slate-900 tracking-wider mb-1">NOTES & TERMS:</h5>
                    <p>1. THIS IS A COMPUTER-GENERATED STATEMENT OF ACCOUNTS AS PER VAULT RECORDS.</p>
                    <p>2. PLEASE NOTIFY ANY DISCREPANCY WITHIN 7 DAYS OF STATEMENT ISSUANCE.</p>
                    <p>3. CHEQUES & ELECTRONIC REMITTANCES REMAIN SUBJECT TO FINAL REALIZATION.</p>
                  </div>

                  {/* Right: WhatsApp US QR */}
                  {settings?.whatsappNumber && (
                    <div className="flex flex-col items-center shrink-0 self-start sm:self-center">
                      <div className="p-1 bg-white border border-slate-200 rounded shadow-2xs">
                        <QRCodeSVG 
                          value={`https://wa.me/${settings.whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello, regarding account statement for ${selectedClient.tradeName || selectedClient.legalName}`)}`} 
                          size={90} 
                        />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-900 text-center mt-1.5 leading-tight">
                        WHATSAPP US
                      </span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {entryToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" data-html2pdf-ignore="true">
            <div className="bg-white rounded-[2rem] max-w-md w-full border border-slate-100 shadow-2xl p-6 space-y-6 animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-4 text-rose-600">
                <div className="h-12 w-12 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Delete Ledger Entry?</h3>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Permanently remove record</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase text-[10px]">Entry Details:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="font-bold text-slate-400 uppercase text-[10px]">Type:</span>
                    <p className="font-black text-slate-900 uppercase">{entryToDelete.type}</p>
                  </div>
                  <div>
                    <span className="font-bold text-slate-400 uppercase text-[10px]">Reference:</span>
                    <p className="font-black text-slate-900">{entryToDelete.ref}</p>
                  </div>
                </div>
              </div>

              <p className="text-xs font-bold text-slate-500 uppercase leading-relaxed text-slate-500">
                Are you sure? This action will permanently delete this {entryToDelete.type.toLowerCase()} from the database. This cannot be undone.
              </p>

              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setEntryToDelete(null)}
                  disabled={isDeleting}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2 shadow-md cursor-pointer"
                >
                  {isDeleting ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Yes, Delete</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW: Directory List of All Client Ledgers
  // -------------------------------------------------------------
  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* Modern Unified Single-Line Toolbar: Search First, Count Badge Second */}
      <div className="relative z-50 flex flex-wrap items-center justify-between gap-2 sm:gap-2.5 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl p-2 sm:p-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs shrink-0 w-full max-w-full min-w-0 transition-colors">
        
        {/* Left Side: Back Button, Search Bar & Combined Count Badge Dropdown */}
        <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-2xl">
          {/* Back button */}
          {onBack && (
            <button 
              type="button"
              onClick={onBack} 
              className="h-8 w-8 sm:h-8.5 sm:w-8.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
              title="Go Back"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* 1. Search Input FIRST */}
          <div className="relative flex-1 group">
            <input 
              type="text" 
              placeholder="Search Client Ledgers by trade or legal name..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl py-1.5 pl-9 pr-7 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none" 
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchTerm && (
              <button 
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          {/* 2. Combined Count Dropdown Badge SECOND */}
          <div className="relative shrink-0" ref={filterDropdownRef}>
            <button
              type="button"
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
              className={`h-8 sm:h-8.5 px-3 rounded-xl border flex items-center gap-2 font-bold text-xs transition-all shadow-2xs cursor-pointer ${
                balanceFilter === 'All'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                  : balanceFilter === 'Due'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : balanceFilter === 'Settled'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-indigo-600 text-white border-indigo-600'
              }`}
            >
              <span>
                {balanceFilter === 'All' 
                  ? 'All Clients' 
                  : balanceFilter === 'Due' 
                  ? 'Pending (Due)' 
                  : balanceFilter === 'Settled' 
                  ? 'Settled' 
                  : 'Advance / Credit'}
              </span>
              <span className="px-1.5 py-0.2 rounded-md text-[10px] font-black bg-white/25 dark:bg-black/20 text-current">
                {balanceFilter === 'All'
                  ? ledgerStats.total
                  : balanceFilter === 'Due'
                  ? ledgerStats.due
                  : balanceFilter === 'Settled'
                  ? ledgerStats.settled
                  : ledgerStats.advance}
              </span>
              <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isFilterDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isFilterDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-60 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Filter Client Ledgers
                </div>
                <div className="space-y-0.5 mt-1">
                  <button
                    type="button"
                    onClick={() => { setBalanceFilter('All'); setIsFilterDropdownOpen(false); }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      balanceFilter === 'All'
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-slate-500"></span>
                      <span>All Clients</span>
                    </div>
                    <span className="text-[10px] font-mono font-black px-1.5 py-0.2 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                      {ledgerStats.total}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setBalanceFilter('Due'); setIsFilterDropdownOpen(false); }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      balanceFilter === 'Due'
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                      <span>Pending (Due)</span>
                    </div>
                    <span className="text-[10px] font-mono font-black px-1.5 py-0.2 rounded-md bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
                      {ledgerStats.due}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setBalanceFilter('Settled'); setIsFilterDropdownOpen(false); }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      balanceFilter === 'Settled'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      <span>Settled</span>
                    </div>
                    <span className="text-[10px] font-mono font-black px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                      {ledgerStats.settled}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setBalanceFilter('Advance'); setIsFilterDropdownOpen(false); }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      balanceFilter === 'Advance'
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                      <span>Advance</span>
                    </div>
                    <span className="text-[10px] font-mono font-black px-1.5 py-0.2 rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                      {ledgerStats.advance}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Snapshots & Controls */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap justify-end">
          
          {/* Total Outstanding Snapshot */}
          <div className="hidden md:flex items-center gap-2 bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/60 px-3 h-8 sm:h-8.5 rounded-xl">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse"></span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">Total Due:</span>
            <span className="text-xs font-black text-rose-900 dark:text-rose-200 font-mono">
              ₹{totalDueAmount.toLocaleString()}
            </span>
          </div>

          {totalAdvanceAmount > 0 && (
            <div className="hidden xl:flex items-center gap-2 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 px-3 h-8 sm:h-8.5 rounded-xl">
              <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">Total Advance:</span>
              <span className="text-xs font-black text-indigo-900 dark:text-indigo-200 font-mono">
                ₹{totalAdvanceAmount.toLocaleString()}
              </span>
            </div>
          )}

          {onViewChange && (
            <>
              <button
                type="button"
                onClick={() => onViewChange('invoices')}
                className="hidden lg:flex items-center gap-1.5 h-8 sm:h-8.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer shrink-0"
              >
                <svg className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Invoices</span>
              </button>

              <button
                type="button"
                onClick={() => onViewChange('payments')}
                className="hidden lg:flex items-center gap-1.5 h-8 sm:h-8.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer shrink-0"
              >
                <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>Payments</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handlePurgeDatabase}
            className="h-8 sm:h-8.5 px-2.5 sm:px-3 flex items-center gap-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 font-bold text-xs uppercase tracking-wider transition-colors shrink-0 cursor-pointer"
            title="Purge deleted invoices and orphaned payments from database"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span className="hidden sm:inline">Clean DB</span>
          </button>

          <ViewControl 
            viewMode={viewMode}
            onViewChange={setViewMode}
            onViewModeChange={setViewMode}
            compactMode={compactMode}
            onCompactModeChange={setCompactMode}
          />
        </div>
      </div>

      {/* Directory Content (Grid or Table) */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto pr-1">
          {filteredBalances.length === 0 ? (
            <div className="col-span-full bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
              No clients found with ledger activity.
            </div>
          ) : filteredBalances.map(({ client, balance, totalInvoiced, totalPaid }) => {
            const isManual = client.id.startsWith('manual-');

            return (
              <div key={client.id} className="bg-white/80 dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-all flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    {isManual ? (
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                        Manual Entry
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600">
                        Client Record
                      </span>
                    )}
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                      balance > 0 ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800' :
                      balance < 0 ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' :
                      'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    }`}>
                      {balance > 0 ? 'Due (Dr)' : balance < 0 ? 'Advance (Cr)' : 'Settled'}
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-900 dark:text-white text-sm uppercase leading-tight line-clamp-1">
                    {client.tradeName || client.legalName}
                  </h4>
                  {client.tradeName && (
                    <p className="text-[11px] font-medium text-slate-400 dark:text-slate-400 uppercase line-clamp-1">{client.legalName}</p>
                  )}

                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-400">Total Invoiced</p>
                      <p className="font-bold text-slate-700 dark:text-slate-300 text-xs font-mono">₹{totalInvoiced.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-400">Total Paid</p>
                      <p className="font-bold text-slate-700 dark:text-slate-300 text-xs font-mono">₹{totalPaid.toLocaleString()}</p>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-slate-50 dark:border-slate-700/40 flex justify-between items-center">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-400">Net Balance</p>
                      <p className={`font-black text-sm font-mono ${balance > 0 ? 'text-rose-600 dark:text-rose-400' : balance < 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        ₹{Math.abs(balance).toLocaleString()} {balance > 0 ? 'Dr' : balance < 0 ? 'Cr' : ''}
                      </p>
                    </div>
                  </div>
                </div>

                <button 
                  type="button"
                  onClick={() => setSelectedClient(client)}
                  className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer text-xs font-medium active:scale-95"
                  title="View Complete Client Ledger"
                >
                  <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 12z" />
                  </svg>
                  <span>View</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="relative z-10 flex-1 min-h-0 w-full max-w-full min-w-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden flex flex-col transition-colors">
          <div className="w-full overflow-x-auto overflow-y-auto no-scrollbar flex-1 relative h-full">
            <table className={`w-full text-left border-collapse table-auto min-w-[700px] invoices-table gst-portfolio-table ${compactMode ? 'compact-table' : ''}`}>
              <thead className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 shadow-2xs">
                <tr>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 whitespace-nowrap min-w-[220px]">Client Name</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 text-right whitespace-nowrap min-w-[130px]">Total Invoiced</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 text-right whitespace-nowrap min-w-[130px]">Total Paid</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 text-right whitespace-nowrap min-w-[140px]">
                    <TableFilter
                      label="Net Balance"
                      isActive={balanceFilter !== 'All'}
                      onClear={() => setBalanceFilter('All')}
                    >
                      <div className="py-1">
                        {(['All', 'Due', 'Settled', 'Advance'] as const).map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => setBalanceFilter(b)}
                            className={`w-full text-left px-3 py-1.5 text-xs font-bold transition-colors ${
                              balanceFilter === b ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            {b === 'Due' ? 'Pending (Due)' : b}
                          </button>
                        ))}
                      </div>
                    </TableFilter>
                  </th>
                  <th className="sticky top-0 right-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-3 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 text-center w-[130px] min-w-[130px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[var(--table-font-size)]">
                {filteredBalances.length === 0 ? (
                   <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                         No clients found with ledger activity.
                      </td>
                   </tr>
                ) : filteredBalances.map(({ client, balance, totalInvoiced, totalPaid }) => {
                   const isManual = client.id.startsWith('manual-');
                   
                   return (
                    <tr key={client.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-all group text-[var(--table-font-size)] border-b border-slate-100 dark:border-slate-800/60">
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-slate-900 dark:text-white truncate leading-tight text-sm">
                          {client.tradeName || client.legalName}
                          {isManual && <span className="ml-2 text-[9px] font-bold text-amber-500 uppercase tracking-widest bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">Manual Entry</span>}
                        </div>
                        {client.tradeName && <div className="font-medium text-[11px] text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5">{client.legalName}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className="font-semibold text-xs text-slate-700 dark:text-slate-300 font-mono">₹{totalInvoiced.toLocaleString()}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className="font-semibold text-xs text-slate-700 dark:text-slate-300 font-mono">₹{totalPaid.toLocaleString()}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className={`font-black text-sm font-mono ${balance > 0 ? 'text-rose-600 dark:text-rose-400' : balance < 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
                          ₹{Math.abs(balance).toLocaleString()} {balance > 0 ? 'Dr' : balance < 0 ? 'Cr' : ''}
                        </span>
                      </td>
                      <td className="sticky right-0 bg-white/95 dark:bg-slate-900/95 group-hover:bg-indigo-50/40 dark:group-hover:bg-slate-850 backdrop-blur-md z-20 px-3 py-2 text-center w-[130px] min-w-[130px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                        <button 
                          type="button"
                          onClick={() => setSelectedClient(client)}
                          className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center justify-center gap-1 shadow-2xs cursor-pointer text-xs font-medium active:scale-95 mx-auto"
                          title="View Complete Client Ledger"
                        >
                          <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 12z" />
                          </svg>
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                   );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientLedger;
