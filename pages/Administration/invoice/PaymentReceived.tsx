import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useModuleData } from '../../../hooks/useModuleData.ts';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PaymentRecord, Client, InvoiceSettings, InvoiceRecord } from '../../../types';
import html2pdf from 'html2pdf.js';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { api } from '../../../services/api.ts';
import Loader from '../../../components/Loader';
import { TableFilter } from '../../../components/TableFilter';
import { ViewControl } from '../../../components/ViewControl';
import { formatDate } from '../../../dateUtils.ts';

interface PaymentReceivedProps {
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

const PaymentReceived: React.FC<PaymentReceivedProps> = ({ onViewChange }) => {
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<'All' | 'Online' | 'UPI' | 'Cash' | 'Cheque'>('All');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [compactMode, setCompactMode] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  
  const [previewPayment, setPreviewPayment] = useState<{ pay: PaymentRecord; inv: InvoiceRecord } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(0.85);
  const [isCompact, setIsCompact] = useState<boolean>(true);

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(1.5, Math.round((prev + 0.1) * 10) / 10));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(0.4, Math.round((prev - 0.1) * 10) / 10));
  };

  const handleResetZoom = () => {
    setZoomLevel(1.0);
  };

  const handleFitPage = () => {
    if (!canvasContainerRef.current) return;
    const container = canvasContainerRef.current;
    const paddingX = 40;
    const paddingY = 40;
    const availWidth = container.clientWidth - paddingX;
    const availHeight = container.clientHeight - paddingY;
    const a4WidthPx = 794;
    const a4HeightPx = 1123;
    const scaleX = availWidth / a4WidthPx;
    const scaleY = availHeight / a4HeightPx;
    const calculated = Math.min(scaleX, scaleY);
    const clamped = Math.max(0.4, Math.min(1.2, Math.round(calculated * 100) / 100));
    setZoomLevel(clamped);
  };

  const handleFitWidth = () => {
    if (!canvasContainerRef.current) return;
    const container = canvasContainerRef.current;
    const paddingX = 32;
    const availWidth = container.clientWidth - paddingX;
    const a4WidthPx = 794;
    const scale = Math.max(0.4, Math.min(1.4, Math.round((availWidth / a4WidthPx) * 100) / 100));
    setZoomLevel(scale);
  };

  useEffect(() => {
    if (previewPayment) {
      const timer = setTimeout(() => {
        handleFitPage();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [previewPayment]);

  const queryClient = useQueryClient();
  const { data: payments = [], isLoading, refetch: refetchPayments } = useModuleData<PaymentRecord[]>('payments');
  const { data: settings } = useModuleData<InvoiceSettings>('invoice_settings');
  const { data: invoices = [], refetch: refetchInvoices } = useModuleData<InvoiceRecord[]>('invoices');
  const { data: clients = [] } = useModuleData<Client[]>('clients');

  const [editingPayment, setEditingPayment] = useState<PaymentRecord | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editDate, setEditDate] = useState<string>('');
  const [editMode, setEditMode] = useState<'Cash' | 'Bank Transfer' | 'Cheque' | 'UPI' | 'Online'>('Online');
  const [editChequeNo, setEditChequeNo] = useState<string>('');

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleStartEdit = (pay: PaymentRecord) => {
    setEditingPayment(pay);
    setEditAmount(pay.amount);
    setEditDate(pay.date ? pay.date.split('T')[0] : '');
    setEditMode(pay.mode);
    setEditChequeNo(pay.chequeNo || pay.referenceNo || '');
  };

  const updatePaymentMutation = useMutation({
    mutationFn: async (updatedPay: PaymentRecord) => {
      await api.savePayment(updatedPay);
      if (updatedPay.invoiceNo) {
        const associatedInvoice = invoices.find(i => i.invoiceNo === updatedPay.invoiceNo);
        if (associatedInvoice) {
          const otherPayments = payments.filter(p => p.invoiceNo === updatedPay.invoiceNo && p.id !== updatedPay.id);
          const totalPaid = otherPayments.reduce((sum, p) => sum + p.amount, 0) + updatedPay.amount;
          const balanceDue = Math.max(0, associatedInvoice.totalAmount - totalPaid);
          const status: InvoiceRecord['status'] = balanceDue <= 0 
            ? 'Paid' 
            : (totalPaid > 0 ? 'Partial' : (associatedInvoice.status === 'Paid' || associatedInvoice.status === 'Partial' ? 'Sent' : associatedInvoice.status));
          
          await api.saveInvoice({
            ...associatedInvoice,
            amountPaid: totalPaid,
            balanceDue,
            status,
            paymentDate: updatedPay.date,
            paymentMode: updatedPay.mode
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Payment details modified successfully');
      setEditingPayment(null);
    },
    onError: () => {
      toast.error('Failed to modify payment details');
    }
  });

  const handleSaveEdit = async () => {
    if (!editingPayment) return;
    const updated: PaymentRecord = {
      ...editingPayment,
      amount: editAmount,
      date: editDate,
      mode: editMode,
      chequeNo: editMode === 'Cheque' ? editChequeNo : undefined,
      referenceNo: editMode !== 'Cheque' ? editChequeNo : undefined,
    };
    await updatePaymentMutation.mutateAsync(updated);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const pay = payments.find(p => p.id === id);
      await api.deletePayment(id);
      if (pay && pay.invoiceNo) {
        const associatedInvoice = invoices.find(i => i.invoiceNo === pay.invoiceNo);
        if (associatedInvoice) {
          const otherPayments = payments.filter(p => p.invoiceNo === pay.invoiceNo && p.id !== id);
          const totalPaid = otherPayments.reduce((sum, p) => sum + p.amount, 0);
          const balanceDue = Math.max(0, associatedInvoice.totalAmount - totalPaid);
          const status: InvoiceRecord['status'] = balanceDue <= 0 
            ? 'Paid' 
            : (totalPaid > 0 ? 'Partial' : (associatedInvoice.status === 'Paid' || associatedInvoice.status === 'Partial' ? 'Sent' : associatedInvoice.status));
          
          await api.saveInvoice({
            ...associatedInvoice,
            amountPaid: totalPaid,
            balanceDue,
            status,
            paymentDate: otherPayments.length > 0 ? otherPayments[otherPayments.length - 1].date : undefined,
            paymentMode: otherPayments.length > 0 ? otherPayments[otherPayments.length - 1].mode : undefined
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Payment record deleted and invoice balance updated');
    },
    onError: () => {
      toast.error('Failed to delete payment record');
    }
  });

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this payment record? This will adjust the balance due on the related invoice.')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const paymentStats = useMemo(() => {
    const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const onlineList = payments.filter(p => p.mode === 'Online');
    const upiList = payments.filter(p => p.mode === 'UPI');
    const cashList = payments.filter(p => p.mode === 'Cash');
    const chequeList = payments.filter(p => p.mode === 'Cheque' || p.mode === 'Bank Transfer');
    return {
      total: payments.length,
      totalAmount,
      online: onlineList.length,
      onlineAmount: onlineList.reduce((sum, p) => sum + (p.amount || 0), 0),
      upi: upiList.length,
      upiAmount: upiList.reduce((sum, p) => sum + (p.amount || 0), 0),
      cash: cashList.length,
      cashAmount: cashList.reduce((sum, p) => sum + (p.amount || 0), 0),
      cheque: chequeList.length,
      chequeAmount: chequeList.reduce((sum, p) => sum + (p.amount || 0), 0),
    };
  }, [payments]);

  const activeCount = useMemo(() => {
    switch (modeFilter) {
      case 'Online': return paymentStats.online;
      case 'UPI': return paymentStats.upi;
      case 'Cash': return paymentStats.cash;
      case 'Cheque': return paymentStats.cheque;
      default: return paymentStats.total;
    }
  }, [modeFilter, paymentStats]);

  const filteredPayments = useMemo(() => {
    const s = search.toLowerCase().trim();
    let list = payments.filter(p => {
      const cliName = (p.clientName || '').toLowerCase();
      const tradeName = (p.clientTradeName || '').toLowerCase();
      const refNo = (p.referenceNo || p.chequeNo || '').toLowerCase();
      const invNo = (p.invoiceNo || '').toLowerCase();
      return cliName.includes(s) || tradeName.includes(s) || refNo.includes(s) || invNo.includes(s);
    });

    if (modeFilter !== 'All') {
      if (modeFilter === 'Cheque') {
        list = list.filter(p => p.mode === 'Cheque' || p.mode === 'Bank Transfer');
      } else {
        list = list.filter(p => p.mode === modeFilter);
      }
    }

    return list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [payments, search, modeFilter]);

  const paginatedPayments = useMemo(() => {
    const startIndex = (page - 1) * limit;
    return filteredPayments.slice(startIndex, startIndex + limit);
  }, [filteredPayments, page, limit]);

  const totalPages = Math.ceil(filteredPayments.length / limit) || 1;

  useEffect(() => {
    setPage(1);
  }, [search, modeFilter]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    api.invalidateCache();
    await Promise.all([refetchPayments(), refetchInvoices()]);
    setTimeout(() => setIsRefreshing(false), 500);
    toast.success('Payments synced with vault');
  };

  const handlePrintPayment = (pay: PaymentRecord) => {
    let inv = invoices.find(i => i.invoiceNo === pay.invoiceNo);
    if (!inv) {
      inv = {
        id: pay.id,
        invoiceNo: pay.invoiceNo || 'DIRECT-RCPT',
        clientId: pay.clientId || 'misc',
        clientName: pay.clientName || 'Valued Client',
        clientTradeName: pay.clientTradeName,
        date: pay.date,
        dueDate: pay.date,
        subTotal: pay.amount,
        totalTax: 0,
        totalAmount: pay.amount,
        amountPaid: pay.amount,
        balanceDue: 0,
        status: 'Paid',
        items: [
          {
            id: '1',
            description: 'Professional Fee / Legal & Compliance Service Remittance',
            quantity: 1,
            rate: pay.amount,
            amount: pay.amount,
            taxRate: 0
          }
        ]
      };
    }
    setPreviewPayment({ pay, inv });
  };

  const handleDownloadA4PDF = async () => {
    if (!printRef.current || !previewPayment) return;
    const { pay, inv } = previewPayment;
    const filename = `Receipt_${(pay.referenceNo || pay.chequeNo || inv.invoiceNo || 'Payment').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    
    toast.info('Generating single-page A4 Receipt PDF...');

    const original = printRef.current;
    const clone = original.cloneNode(true) as HTMLElement;

    clone.id = 'receipt-a4-pdf-clone';
    clone.style.width = '210mm';
    clone.style.maxWidth = '210mm';
    clone.style.minHeight = '296mm';
    clone.style.height = '296mm';
    clone.style.maxHeight = '296mm';
    clone.style.boxSizing = 'border-box';
    clone.style.padding = '6mm 8mm';
    clone.style.margin = '0';
    clone.style.border = 'none';
    clone.style.boxShadow = 'none';
    clone.style.borderRadius = '0';
    clone.style.overflow = 'hidden';
    clone.style.background = '#ffffff';
    clone.style.transform = 'none';

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.top = '0';
    container.style.width = '210mm';
    container.style.height = '296mm';
    container.style.overflow = 'hidden';
    container.style.zIndex = '-9999';
    container.appendChild(clone);
    document.body.appendChild(container);

    try {
      const opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          letterRendering: true, 
          scrollX: 0, 
          scrollY: 0, 
          width: 794,
          windowWidth: 794 
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
      };

      await html2pdf().from(clone).set(opt).save();
      toast.success('A4 Receipt PDF downloaded successfully (1 Page)!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate PDF');
    } finally {
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    }
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!previewPayment || !printContent) return;
    const printWindow = window.open('about:blank', '_blank', 'width=900,height=1100');
    if (printWindow) {
      const pageStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
        .map(el => el.outerHTML)
        .join('\n');

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Receipt - ${previewPayment.pay.referenceNo || previewPayment.inv.invoiceNo}</title>
          ${pageStyles}
          <style>
            @page { 
              size: A4 portrait; 
              margin: 6mm 8mm; 
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              color: #0f172a; 
              background: #ffffff !important; 
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
            }
            #printable-receipt {
              width: 100% !important;
              max-width: 194mm !important;
              min-height: 280mm !important;
              margin: 0 auto !important;
              padding: 4mm 6mm !important;
              border: none !important;
              box-shadow: none !important;
              border-radius: 0 !important;
              transform: none !important;
            }
            table { 
              width: 100%;
              border-collapse: collapse;
              page-break-inside: auto; 
            }
            tr { 
              page-break-inside: avoid !important; 
              break-inside: avoid !important; 
            }
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }
            .no-break { page-break-inside: avoid !important; break-inside: avoid !important; }
          </style>
        </head>
        <body class="p-0 m-0 bg-white text-slate-900">
          <div style="width: 100%; max-width: 194mm; margin: 0 auto;">
            ${printContent.outerHTML}
          </div>
          <script>
            window.onload = function() {
              window.focus();
              setTimeout(() => {
                window.print();
                window.close();
              }, 250);
            };
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      window.print();
    }
  };

  const handleWhatsAppShare = async () => {
    if (!previewPayment || !printRef.current) return;
    const { pay, inv } = previewPayment;
    const filename = `PaymentReceipt_${(inv.invoiceNo || 'RCPT').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    const modeStr = pay.mode === 'Cheque' && pay.chequeNo ? `Cheque (${pay.chequeNo})` : pay.mode;
    const text = `*Official Payment Receipt from ${settings?.firmName || 'Our Firm'}*\n\nReceipt For Inv: ${inv.invoiceNo}\nAmount Received: ₹${(pay.amount || 0).toLocaleString()} (${numberToWords(pay.amount)})\nPayment Mode: ${modeStr}\nDate: ${formatDate(pay.date)}\n\nThank you for your prompt remittance!`;

    const original = printRef.current;
    const clone = original.cloneNode(true) as HTMLElement;

    clone.id = 'receipt-a4-pdf-clone-share';
    clone.style.width = '210mm';
    clone.style.maxWidth = '210mm';
    clone.style.minHeight = '296mm';
    clone.style.height = '296mm';
    clone.style.maxHeight = '296mm';
    clone.style.boxSizing = 'border-box';
    clone.style.padding = '6mm 8mm';
    clone.style.margin = '0';
    clone.style.border = 'none';
    clone.style.boxShadow = 'none';
    clone.style.borderRadius = '0';
    clone.style.overflow = 'hidden';
    clone.style.background = '#ffffff';
    clone.style.transform = 'none';

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.top = '0';
    container.style.width = '210mm';
    container.style.height = '296mm';
    container.style.overflow = 'hidden';
    container.style.zIndex = '-9999';
    container.appendChild(clone);
    document.body.appendChild(container);

    try {
      const opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollX: 0, scrollY: 0, width: 794, windowWidth: 794 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
      };

      const pdfBlob: Blob = await html2pdf().from(clone).set(opt).output('blob');
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });
      const nav = navigator as any;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ title: 'Payment Receipt', text: text, files: [file] });
          return;
        } catch (e) {
          console.error('Share failed', e);
        }
      }
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
      const phone = (inv.miscMobile || '').replace(/\D/g, '');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate WhatsApp share');
    } finally {
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    }
  };

  if (isLoading) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* Modern Unified Single-Line Toolbar: Search First, Count Badge Second */}
      <div className="relative z-50 flex flex-wrap items-center justify-between gap-2 sm:gap-2.5 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl p-2 sm:p-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs shrink-0 w-full max-w-full min-w-0 transition-colors">
        
        {/* Left Side: Search Bar & Count Badge Dropdown */}
        <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-2xl">
          {/* 1. Search input FIRST */}
          <div className="relative flex-1 group">
            <input 
              type="text" 
              placeholder="Search Client, Inv No, UTR, or Ref..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl py-1.5 pl-9 pr-7 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none" 
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {search && (
              <button 
                onClick={() => setSearch('')}
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
                modeFilter === 'All'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                  : modeFilter === 'Online'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : modeFilter === 'UPI'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : modeFilter === 'Cash'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-purple-600 text-white border-purple-600'
              }`}
            >
              <span>{modeFilter === 'All' ? 'All Modes' : modeFilter === 'Cheque' ? 'Cheque / Bank' : modeFilter}</span>
              <span className="px-1.5 py-0.2 rounded-md text-[10px] font-black bg-white/25 dark:bg-black/20 text-current">
                {activeCount}
              </span>
              <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isFilterDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isFilterDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200/90 dark:border-slate-700/90 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Modes</div>
                  <div className="text-xs font-black text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">
                    Total: ₹{paymentStats.totalAmount.toLocaleString()}
                  </div>
                </div>

                <div className="p-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => { setModeFilter('All'); setIsFilterDropdownOpen(false); }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      modeFilter === 'All'
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-slate-700 dark:bg-slate-300"></span>
                      <span>All Collections</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-slate-400">₹{paymentStats.totalAmount.toLocaleString()}</span>
                      <span className="text-[10px] font-mono font-black px-1.5 py-0.2 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                        {paymentStats.total}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setModeFilter('Online'); setIsFilterDropdownOpen(false); }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      modeFilter === 'Online'
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                      <span>Online / NEFT</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-indigo-500">₹{paymentStats.onlineAmount.toLocaleString()}</span>
                      <span className="text-[10px] font-mono font-black px-1.5 py-0.2 rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                        {paymentStats.online}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setModeFilter('UPI'); setIsFilterDropdownOpen(false); }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      modeFilter === 'UPI'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      <span>UPI Transfer</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-emerald-500">₹{paymentStats.upiAmount.toLocaleString()}</span>
                      <span className="text-[10px] font-mono font-black px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                        {paymentStats.upi}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setModeFilter('Cash'); setIsFilterDropdownOpen(false); }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      modeFilter === 'Cash'
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                      <span>Cash</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-amber-500">₹{paymentStats.cashAmount.toLocaleString()}</span>
                      <span className="text-[10px] font-mono font-black px-1.5 py-0.2 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                        {paymentStats.cash}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setModeFilter('Cheque'); setIsFilterDropdownOpen(false); }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      modeFilter === 'Cheque'
                        ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-purple-500"></span>
                      <span>Cheque / Bank</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-purple-500">₹{paymentStats.chequeAmount.toLocaleString()}</span>
                      <span className="text-[10px] font-mono font-black px-1.5 py-0.2 rounded-md bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                        {paymentStats.cheque}
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Quick Stats, View Controls & Actions */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap justify-end">
          
          {/* Realized Revenue Snapshot */}
          <div className="hidden md:flex items-center gap-2 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 px-3 h-8 sm:h-8.5 rounded-xl">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Total Realized:</span>
            <span className="text-xs font-black text-emerald-900 dark:text-emerald-200 font-mono">
              ₹{paymentStats.totalAmount.toLocaleString()}
            </span>
          </div>

          <button 
            type="button" 
            onClick={handleRefresh} 
            className="h-8 sm:h-8.5 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all flex items-center justify-center cursor-pointer shadow-2xs shrink-0" 
            title="Refresh payments"
          >
            <svg className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <ViewControl 
            viewMode={viewMode}
            onViewChange={setViewMode}
            onViewModeChange={setViewMode}
            compactMode={compactMode}
            onCompactModeChange={setCompactMode}
          />

          <button 
            type="button"
            onClick={() => onViewChange?.('admin-client-ledger')} 
            className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider px-2.5 sm:px-3 h-8 sm:h-8.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-xs flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap border border-slate-200 dark:border-slate-700"
            title="View Client Balances and Statements"
          >
            <svg className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Client Ledger</span>
          </button>

          <button 
            type="button"
            onClick={() => onViewChange?.('admin-invoices')} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold uppercase tracking-wider px-3 sm:px-3.5 h-8 sm:h-8.5 rounded-xl shadow-xs transition-all text-xs flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
            title="Go to Invoices"
          >
            <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span>Invoices</span>
          </button>
        </div>
      </div>

      {/* Main Container: Table or Grid */}
      <div className="relative z-10 flex-1 min-h-0 w-full max-w-full min-w-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden flex flex-col transition-colors">
        {viewMode === 'grid' ? (
          <div className="overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 flex-1 no-scrollbar">
            {filteredPayments.length === 0 ? (
              <div className="col-span-full text-center py-12 text-slate-400 font-bold text-xs uppercase tracking-wider">
                No payments found matching criteria.
              </div>
            ) : (
              paginatedPayments.map((pay, idx) => (
                <div key={pay.id || idx} className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-800/80 hover:border-emerald-300 dark:hover:border-emerald-500/50 transition-all shadow-xs flex flex-col justify-between space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Receipt #{(page - 1) * limit + idx + 1}</div>
                      <h4 className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100 tracking-tight uppercase mt-0.5">
                        {pay.invoiceNo ? `Against ${pay.invoiceNo}` : 'DIRECT RECEIPT'}
                      </h4>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">{formatDate(pay.date)}</p>
                    </div>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      ₹{(pay.amount || 0).toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-slate-50/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {pay.clientTradeName || pay.clientName || '---'}
                    </div>
                    {pay.clientTradeName && pay.clientName && pay.clientTradeName !== pay.clientName && (
                      <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        Legal: {pay.clientName}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                      <span>Ref / UTR:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{pay.chequeNo || pay.referenceNo || '---'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 gap-2">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                      pay.mode === 'UPI' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' :
                      pay.mode === 'Online' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' :
                      pay.mode === 'Cash' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' :
                      'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                    }`}>
                      {pay.mode}
                    </span>

                    <div className="flex items-center gap-1">
                      <button 
                        type="button"
                        onClick={() => handlePrintPayment(pay)} 
                        className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-1 shadow-2xs cursor-pointer text-xs font-medium active:scale-95" 
                        title="View/Print A4 Receipt"
                      >
                        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 12z" />
                        </svg>
                        <span>View</span>
                      </button>
                      <button onClick={() => handleStartEdit(pay)} className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center cursor-pointer shadow-2xs" title="Modify Payment">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button onClick={() => handleDelete(pay.id)} className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center cursor-pointer shadow-2xs" title="Delete Payment">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="w-full overflow-x-auto overflow-y-auto no-scrollbar flex-1 relative h-full">
            <table className={`w-full text-left border-collapse table-auto min-w-[900px] invoices-table gst-portfolio-table ${compactMode ? 'compact-table' : ''}`}>
              <thead className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 shadow-2xs">
                <tr>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-2.5 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 whitespace-nowrap w-12">S.No.</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-2.5 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 whitespace-nowrap min-w-[110px]">Inv. No.</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-2.5 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 min-w-[180px]">Client (Trade/Legal)</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-2.5 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 whitespace-nowrap min-w-[110px]">Amount Received</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-2.5 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 whitespace-nowrap min-w-[100px]">Date</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-2.5 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 text-center min-w-[110px] whitespace-nowrap">Mode</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-2.5 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 whitespace-nowrap min-w-[110px]">Ref / Cheque</th>
                  <th className="sticky top-0 right-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-2.5 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 text-right w-[145px] min-w-[145px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[var(--table-font-size)]">
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-10 text-center text-slate-400 font-bold uppercase tracking-wider text-xs">
                      No payments found matching criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedPayments.map((pay, idx) => (
                    <tr key={pay.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-all group text-[var(--table-font-size)] border-b border-slate-100 dark:border-slate-800/60">
                      <td className="px-2.5 py-2.5 text-slate-400 font-bold whitespace-nowrap">{(page - 1) * limit + idx + 1}</td>
                      <td className="px-2.5 py-2.5 font-bold text-slate-900 dark:text-white uppercase font-mono whitespace-nowrap">
                        {pay.invoiceNo || '---'}
                      </td>
                      <td className="px-2.5 py-2.5 max-w-[240px]">
                        <p className="font-bold text-slate-800 dark:text-slate-200 uppercase leading-snug truncate" title={pay.clientTradeName || pay.clientName}>
                          {pay.clientTradeName || pay.clientName}
                        </p>
                        {pay.clientTradeName && pay.clientName && pay.clientTradeName !== pay.clientName && (
                          <p className="sub-text text-slate-500 dark:text-slate-400 uppercase mt-0.5 text-[calc(var(--table-font-size)-1.5px)] font-medium truncate" title={pay.clientName}>
                            Legal: {pay.clientName}
                          </p>
                        )}
                      </td>
                      <td className="px-2.5 py-2.5 font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap font-mono">₹{(pay.amount || 0).toLocaleString()}</td>
                      <td className="px-2.5 py-2.5 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDate(pay.date)}</td>
                      <td className="px-2.5 py-2.5 text-center whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          pay.mode === 'UPI' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' :
                          pay.mode === 'Online' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' :
                          pay.mode === 'Cash' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' :
                          'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                        }`}>
                          {pay.mode}
                        </span>
                      </td>
                      <td className="px-2.5 py-2.5 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap text-xs">
                        {pay.chequeNo || pay.referenceNo || '---'}
                      </td>
                      <td className="sticky right-0 bg-white/95 dark:bg-slate-900/95 group-hover:bg-indigo-50/40 dark:group-hover:bg-slate-850 backdrop-blur-md z-20 px-2.5 py-2 text-right w-[145px] min-w-[145px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                        <div className="flex items-center justify-end gap-1">
                          <button 
                            type="button"
                            onClick={() => handlePrintPayment(pay)} 
                            className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-1 shadow-2xs cursor-pointer text-xs font-medium active:scale-95" 
                            title="View/Print A4 Receipt"
                          >
                            <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 12z" />
                            </svg>
                            <span>View</span>
                          </button>
                          <button onClick={() => handleStartEdit(pay)} className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-all flex items-center justify-center shadow-2xs cursor-pointer" title="Modify Payment">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <button onClick={() => handleDelete(pay.id)} className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 transition-all flex items-center justify-center shadow-2xs cursor-pointer" title="Delete Payment">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Bottom Pagination Bar */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-850/70 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              Showing <strong className="text-slate-900 dark:text-white font-mono">{filteredPayments.length === 0 ? 0 : (page - 1) * limit + 1}</strong> to <strong className="text-slate-900 dark:text-white font-mono">{Math.min(page * limit, filteredPayments.length)}</strong> of <strong className="text-slate-900 dark:text-white font-mono">{filteredPayments.length}</strong> payments
            </span>
            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-[11px] font-semibold text-slate-400">Per page:</span>
              <select
                value={limit}
                onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(1)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              First
            </button>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Prev
            </button>
            <span className="px-2.5 py-1 font-bold font-mono text-slate-800 dark:text-slate-200">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Last
            </button>
          </div>
        </div>
      </div>

      {/* Modify Payment Modal */}
      {editingPayment && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col p-6 space-y-4 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight">Modify Payment Details</h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">Ref: {editingPayment.invoiceNo || editingPayment.id}</p>
              </div>
              <button 
                onClick={() => setEditingPayment(null)} 
                className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1 block">Amount Received (₹)</label>
              <input 
                type="number" 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                value={editAmount} 
                onChange={e => setEditAmount(Number(e.target.value))} 
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1 block">Payment Date</label>
              <input 
                type="date" 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
                value={editDate} 
                onChange={e => setEditDate(e.target.value)} 
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1 block">Payment Mode</label>
              <select 
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
                value={editMode} 
                onChange={e => setEditMode(e.target.value as any)}
              >
                <option value="Online">Online / NEFT / IMPS</option>
                <option value="UPI">UPI Transfer</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>

            {(editMode === 'Cheque' || editMode === 'Online' || editMode === 'Bank Transfer') && (
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1 block">
                  {editMode === 'Cheque' ? 'Cheque Number' : 'Bank UTR / Transaction Reference'}
                </label>
                <input 
                  type="text" 
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold uppercase outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
                  value={editChequeNo} 
                  onChange={e => setEditChequeNo(e.target.value)} 
                  placeholder="e.g. 000123 / UTR-..." 
                />
              </div>
            )}

            <div className="flex gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button 
                type="button" 
                onClick={() => setEditingPayment(null)} 
                className="flex-1 py-2.5 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-xs border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button" 
                disabled={updatePaymentMutation.isPending} 
                onClick={handleSaveEdit} 
                className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase tracking-wider text-xs py-2.5 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {updatePaymentMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Upgraded Authentic A4 Sheet Payment Receipt Preview & Print Modal */}
      {previewPayment && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <style>{`
              @page {
                size: A4 portrait;
                margin: 6mm 8mm;
              }
              @media print {
                html, body {
                  width: 100% !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  background: #ffffff !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                body * {
                  visibility: hidden !important;
                }
                #printable-receipt, #printable-receipt * {
                  visibility: visible !important;
                }
                #printable-receipt {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  max-width: 194mm !important;
                  min-height: 280mm !important;
                  margin: 0 auto !important;
                  padding: 4mm 6mm !important;
                  box-shadow: none !important;
                  border: none !important;
                  background: white !important;
                  color: #0f172a !important;
                  transform: none !important;
                  page-break-after: avoid !important;
                  page-break-inside: avoid !important;
                }
              }
            `}</style>
          <div className="bg-white dark:bg-slate-900 w-full max-w-6xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh] border border-slate-200 dark:border-slate-800">
            
            {/* Modal Top Action Toolbar */}
            <div className="px-4 sm:px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850 shrink-0 gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/80 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                  🧾
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Payment Receipt</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">&bull; {previewPayment.pay.referenceNo || previewPayment.pay.invoiceNo || 'RCPT'}</span>
                  </h3>
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    A4 Sheet Canvas (210mm &times; 297mm)
                  </span>
                </div>
              </div>

              {/* Middle & Right Controls: Density, Zoom, Actions */}
              <div className="flex items-center gap-2 flex-wrap ml-auto">
                {/* Density Switcher */}
                <div className="flex items-center bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-300/60 dark:border-slate-700">
                  <button 
                    type="button"
                    onClick={() => setIsCompact(true)}
                    className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer ${isCompact ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                    title="Compact view fits standard receipts cleanly on a single A4 page"
                  >
                    Compact A4
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsCompact(false)}
                    className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer ${!isCompact ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                    title="Normal relaxed view"
                  >
                    Normal
                  </button>
                </div>

                {/* Zoom & Fit Toolbar */}
                <div className="flex items-center bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-300/60 dark:border-slate-700 gap-1">
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-all font-black text-sm cursor-pointer"
                    title="Zoom Out"
                  >
                    &minus;
                  </button>
                  <span 
                    onClick={handleResetZoom}
                    className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 cursor-pointer hover:text-emerald-600 select-none"
                    title="Click to reset to 100%"
                  >
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-all font-black text-sm cursor-pointer"
                    title="Zoom In"
                  >
                    +
                  </button>
                  <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />
                  <button
                    type="button"
                    onClick={handleFitPage}
                    className="px-2 py-1 text-[9.5px] font-black uppercase rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-all cursor-pointer whitespace-nowrap"
                    title="Auto-fit complete A4 sheet to viewport height"
                  >
                    Fit Page
                  </button>
                  <button
                    type="button"
                    onClick={handleFitWidth}
                    className="px-2 py-1 text-[9.5px] font-black uppercase rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-all cursor-pointer whitespace-nowrap"
                    title="Fit A4 sheet to viewport width"
                  >
                    Fit Width
                  </button>
                </div>

                <button 
                  onClick={handleDownloadA4PDF} 
                  className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  title="Download high-resolution A4 Receipt PDF"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Download A4</span>
                </button>

                <button 
                  onClick={handlePrint} 
                  className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  title="Print A4 Sheet"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Print A4</span>
                </button>

                <button 
                  onClick={handleWhatsAppShare} 
                  className="h-8 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  title="Share Receipt via WhatsApp"
                >
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.558 0 11.894-5.335 11.897-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                  <span>Share</span>
                </button>

                <button 
                  onClick={() => setPreviewPayment(null)} 
                  className="h-8 w-8 flex items-center justify-center rounded-xl bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  title="Close Preview"
                >
                  ✕
                </button>
              </div>
            </div>
            
            {/* Scrollable Canvas Viewport */}
            <div 
              ref={canvasContainerRef}
              className="flex-1 overflow-auto bg-slate-200/80 dark:bg-slate-950/90 p-3 sm:p-6 flex justify-center items-start no-scrollbar"
            >
              {/* Scalable Container for A4 Sheet */}
              <div 
                style={{ 
                  transform: `scale(${zoomLevel})`, 
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease-out',
                  marginBottom: `${(zoomLevel < 1 ? -(1 - zoomLevel) * 1123 : (zoomLevel - 1) * 1123) * 0.5}px`
                }}
                className="shrink-0"
              >
                {/* Printable A4 Canvas Sheet */}
                {(() => {
                  const totalPaid = previewPayment.pay.amount || 0;
                  const originalBill = previewPayment.inv.totalAmount || 0;
                  const balanceDue = Math.max(0, (previewPayment.inv.balanceDue ?? (originalBill - totalPaid)));

                  return (
                    <div 
                      id="printable-receipt"
                      ref={printRef}
                      style={{ 
                        width: '210mm', 
                        minHeight: '297mm', 
                        margin: '0 auto', 
                        boxSizing: 'border-box' 
                      }}
                      className="w-[210mm] min-h-[297mm] bg-white rounded-none sm:rounded-lg shadow-2xl relative flex flex-col text-slate-800 box-border leading-normal mx-auto p-8 sm:p-10 border border-slate-300/60 print:border-none print:shadow-none"
                    >
                      {/* Watermark */}
                      {settings?.watermark ? (
                        <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none z-0 overflow-hidden">
                          <img src={settings.watermark} alt="Watermark" className="w-[70%] object-contain mix-blend-multiply grayscale" />
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center opacity-[0.035] pointer-events-none z-0 overflow-hidden select-none">
                          <span className="text-5xl sm:text-6xl font-black uppercase tracking-widest text-slate-900 -rotate-30 whitespace-nowrap">
                            {settings?.firmName || 'ADVOCATE PRAKHAR GUPTA'}
                          </span>
                        </div>
                      )}

                      {/* Main Sheet Content - Natural Flow */}
                      <div className="relative z-10 flex-1 flex flex-col">
                        
                        {/* 1. Header: Firm Details on Left, Large RECEIPT on Right */}
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
                              {Boolean(settings?.firmGstin && settings.firmGstin.trim() !== '' && settings.firmGstin.trim().toUpperCase() !== 'N/A') && (
                                <p>GSTIN: <span className="font-mono font-bold text-slate-900">{settings?.firmGstin}</span></p>
                              )}
                            </div>
                          </div>

                          {/* Right RECEIPT Title & Metadata */}
                          <div className="text-right flex flex-col items-end shrink-0">
                            <h2 className="text-5xl sm:text-6xl font-black uppercase tracking-widest text-slate-200/90 leading-none select-none">
                              RECEIPT
                            </h2>
                            <div className="mt-3 space-y-1 text-right text-[11.5px] sm:text-xs font-bold text-slate-800 uppercase">
                              <p>RECEIPT DATE: <span className="font-bold text-slate-900">{formatDate(previewPayment.pay.date)}</span></p>
                              <p>AGAINST BILL: <span className="font-mono font-black text-slate-900">{previewPayment.inv.invoiceNo}</span></p>
                              {previewPayment.pay.referenceNo && (
                                <p>REF / UTR: <span className="font-mono font-bold text-slate-900">{previewPayment.pay.referenceNo}</span></p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 2. Received From Section */}
                        <div className="mt-4 sm:mt-5 p-3.5 sm:p-4 bg-slate-50/80 border border-slate-200/80 rounded-xl">
                          <span className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                            RECEIVED WITH THANKS FROM
                          </span>
                          <h3 className="text-lg sm:text-xl font-black uppercase text-slate-900 tracking-tight leading-snug">
                            {previewPayment.inv.clientTradeName || previewPayment.inv.clientName}
                          </h3>
                          {previewPayment.inv.clientTradeName && previewPayment.inv.clientName && previewPayment.inv.clientTradeName !== previewPayment.inv.clientName && (
                            <p className="text-xs sm:text-[12.5px] font-bold text-slate-600 uppercase mt-0.5">
                              {previewPayment.inv.clientName}
                            </p>
                          )}
                          {previewPayment.inv.clientGstin && (
                            <p className="text-[11.5px] sm:text-xs font-bold text-slate-800 uppercase mt-1">
                              GSTIN: <span className="font-mono font-bold text-slate-900">{previewPayment.inv.clientGstin}</span>
                            </p>
                          )}
                          {previewPayment.inv.miscAddress && (
                            <p className="text-[11px] sm:text-[11.5px] font-medium text-slate-600 uppercase mt-0.5 leading-snug max-w-xl">
                              {previewPayment.inv.miscAddress}
                            </p>
                          )}
                          {previewPayment.inv.miscMobile && (
                            <p className="text-[11.5px] sm:text-xs font-bold text-slate-800 uppercase mt-1">
                              MOBILE: <span className="font-mono font-bold text-slate-900">{previewPayment.inv.miscMobile}</span>
                            </p>
                          )}
                        </div>

                        {/* 3. Particulars of Services Table */}
                        <div className="mt-4 sm:mt-5">
                          <table className="w-full text-left border-collapse table-auto">
                            <thead>
                              <tr className="border-t-2 border-b-2 border-slate-900 text-[11px] sm:text-xs font-black uppercase text-slate-900">
                                <th className="py-2.5 px-2 w-8 text-center">#</th>
                                <th className="py-2.5 px-2 w-32 text-left whitespace-nowrap">PERIOD / AY</th>
                                <th className="py-2.5 px-2 text-left leading-tight">
                                  DESCRIPTION OF COMPLIANCE<br />SERVICE
                                </th>
                                <th className="py-2.5 px-2 w-16 text-center whitespace-nowrap">QTY/M</th>
                                <th className="py-2.5 px-2 w-24 text-right whitespace-nowrap">RATE(/₹)</th>
                                <th className="py-2.5 px-2 w-24 text-right whitespace-nowrap">TOTAL(/₹)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-[11.5px] sm:text-xs text-slate-800">
                              {previewPayment.inv.items && previewPayment.inv.items.length > 0 ? (
                                previewPayment.inv.items.map((item, i) => (
                                  <tr key={item.id || i} className="hover:bg-slate-50/40">
                                    <td className="py-2.5 px-2 text-center font-medium text-slate-900">{i + 1}</td>
                                    <td className="py-2.5 px-2 text-left font-medium text-slate-800 whitespace-nowrap">
                                      {item.month || item.period || '2026-27'}
                                    </td>
                                    <td className="py-2.5 px-2 text-left font-medium text-slate-900 leading-snug">
                                      {item.description}
                                      {item.hsn && item.hsn !== '998231' && (
                                        <span className="text-[9.5px] text-slate-400 font-mono ml-2">(HSN: {item.hsn})</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-2 text-center font-medium text-slate-800 whitespace-nowrap">
                                      {item.quantity !== undefined ? item.quantity : 1}
                                    </td>
                                    <td className="py-2.5 px-2 text-right font-mono font-medium text-slate-800 whitespace-nowrap">
                                      {(item.rate || 0).toLocaleString()}
                                    </td>
                                    <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                      {((item.rate || 0) * (item.quantity !== undefined ? item.quantity : 1)).toLocaleString()}
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td className="py-2.5 px-2 text-center font-medium text-slate-900">{1}</td>
                                  <td className="py-2.5 px-2 text-left font-medium text-slate-800 whitespace-nowrap">2026-27</td>
                                  <td className="py-2.5 px-2 text-left font-medium text-slate-900 leading-snug">Statutory Compliance & Legal Advisory Fee</td>
                                  <td className="py-2.5 px-2 text-center font-medium text-slate-800 whitespace-nowrap">1</td>
                                  <td className="py-2.5 px-2 text-right font-mono font-medium text-slate-800 whitespace-nowrap">{totalPaid.toLocaleString()}</td>
                                  <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">{totalPaid.toLocaleString()}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* 4. Settlement & Bank Information (Left) & Settlement Totals + Authorized Signatory (Right) */}
                        <div className="mt-4 sm:mt-5 flex justify-between items-start gap-4">
                          
                          {/* Left: Enlarged Verified Receipt QR + Settlement & Bank Details */}
                          <div className="flex items-start gap-3.5">
                            {settings?.upiId && (
                              <div className="flex flex-col items-center shrink-0">
                                <div className="p-1 bg-white border border-slate-200 rounded shadow-2xs">
                                  <QRCodeSVG 
                                    value={`upi://pay?pa=${settings.upiId}&pn=${encodeURIComponent(settings.firmName || 'Practice')}&am=${totalPaid}&cu=INR`} 
                                    size={90} 
                                  />
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-800 text-center mt-1.5 leading-tight">
                                  VERIFIED RECEIPT
                                </span>
                              </div>
                            )}

                            {/* Settlement & Bank Details */}
                            <div className="text-[11px] sm:text-[11.5px] space-y-1 text-slate-700 min-w-[190px]">
                              <h4 className="font-black uppercase tracking-wider text-slate-900 text-xs sm:text-sm mb-1 border-b border-slate-200 pb-0.5">
                                SETTLEMENT & BANK DETAILS
                              </h4>
                              <p className="font-bold">MODE: <span className="font-black text-slate-900 uppercase">{previewPayment.pay.mode}</span></p>
                              {(previewPayment.pay.chequeNo || previewPayment.pay.referenceNo) && (
                                <p className="font-bold">REF / UTR: <span className="font-mono font-black text-slate-900">{previewPayment.pay.chequeNo || previewPayment.pay.referenceNo}</span></p>
                              )}
                              <p className="font-bold">BANK: <span className="font-black text-slate-900 uppercase">{settings?.bankName || 'KOTAK MAHINDRA BANK'}</span></p>
                              <p className="font-bold">A/C NO: <span className="font-mono font-black text-slate-900">{settings?.accountNo || '0346884449'}</span></p>
                              <p className="font-bold">IFSC: <span className="font-mono font-black text-slate-900">{settings?.ifsc || 'KKBK0005077'}</span></p>
                            </div>
                          </div>

                          {/* Right: Paid & Remaining Balance + Authorized Signatory directly below */}
                          <div className="w-64 sm:w-72 space-y-3 text-right shrink-0">
                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-xs font-bold text-slate-600 uppercase py-1 border-t border-slate-200">
                                <span>ORIGINAL BILL</span>
                                <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm">₹{originalBill.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center text-[11.5px] font-bold text-emerald-700 uppercase py-0.5">
                                <span>AMOUNT RECEIVED</span>
                                <span className="font-mono font-bold text-emerald-700 text-xs sm:text-sm">₹{totalPaid.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-t-2 border-b-2 border-slate-900 my-1">
                                <span className="text-sm sm:text-base font-black uppercase text-slate-900 tracking-tight">
                                  BALANCE DUE
                                </span>
                                <span className={`text-xl sm:text-2xl font-black font-mono ${balanceDue > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                  ₹{balanceDue.toLocaleString()}
                                </span>
                              </div>
                            </div>

                            {/* Authorized Signatory - Placed just below Balance Due */}
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

                        {/* 5. Terms & Conditions (Left) & WhatsApp US (Right) - In line on the downside */}
                        <div className="mt-auto pt-4 sm:pt-5 border-t border-slate-200 no-break w-full">
                          <div className="flex justify-between items-start gap-4 sm:gap-6">
                            {/* Left: Terms */}
                            <div className="flex-1 text-[8.5px] sm:text-[9px] leading-relaxed text-slate-600 uppercase space-y-1">
                              <h5 className="font-black text-[9.5px] sm:text-[10px] text-slate-900 tracking-wider mb-1">TERMS & CONDITIONS:</h5>
                              <p>1. OFFICIAL COMPUTER-GENERATED RECEIPT FOR PROFESSIONAL LEGAL & COMPLIANCE SERVICES.</p>
                              <p>2. CHEQUE REMITTANCES ARE SUBJECT TO BANK REALIZATION.</p>
                              <p>3. AMOUNT RECEIVED IS ADJUSTED AGAINST THE INDICATED PROFESSIONAL BILL NUMBER.</p>
                            </div>

                            {/* Right: Enlarged WhatsApp US QR Code */}
                            {settings?.whatsappNumber && (
                              <div className="flex flex-col items-center shrink-0 self-start sm:self-center">
                                <div className="p-1 bg-white border border-slate-200 rounded shadow-2xs">
                                  <QRCodeSVG 
                                    value={`https://wa.me/${settings.whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello, regarding payment receipt for invoice ${previewPayment.inv.invoiceNo}`)}`} 
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
                    </div>                  );
                })()}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default PaymentReceived;
