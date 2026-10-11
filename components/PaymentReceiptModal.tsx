import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PaymentRecord, InvoiceRecord, InvoiceSettings } from '../types.ts';
import html2pdf from 'html2pdf.js';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { formatDate } from '../dateUtils.ts';

// Convert numbers to Indian Rupees in words
export const numberToWords = (num: number): string => {
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

export interface PaymentReceiptModalProps {
  payment: PaymentRecord;
  invoice: InvoiceRecord;
  settings?: InvoiceSettings;
  allPayments?: PaymentRecord[];
  onClose: () => void;
}

export const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
  payment: initialPayment,
  invoice,
  settings,
  allPayments = [],
  onClose,
}) => {
  const [activePayment, setActivePayment] = useState<PaymentRecord>(initialPayment);
  const printRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(0.85);
  const [isCompact, setIsCompact] = useState<boolean>(true);

  // Sync if initialPayment changes
  useEffect(() => {
    setActivePayment(initialPayment);
  }, [initialPayment]);

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
    const timer = setTimeout(() => {
      handleFitPage();
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  const handleDownloadA4PDF = async () => {
    if (!printRef.current) return;
    const filename = `Receipt_${(activePayment.referenceNo || activePayment.chequeNo || invoice.invoiceNo || 'Payment').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    
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
    if (!printContent) return;
    const printWindow = window.open('about:blank', '_blank', 'width=900,height=1100');
    if (printWindow) {
      const pageStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
        .map(el => el.outerHTML)
        .join('\n');

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Receipt - ${activePayment.referenceNo || invoice.invoiceNo}</title>
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

  const totalPaid = activePayment.amount || 0;
  const originalBill = invoice.totalAmount || 0;
  const discountAmt = Math.max(0, Number(invoice.discount) || Number(activePayment.discount) || 0);
  // Compute balance due as invoice.balanceDue if available, or remaining after total payments and discount
  const allPaidForInv = allPayments.length > 0 
    ? allPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
    : (invoice.amountPaid || totalPaid);
  const balanceDue = Math.max(0, invoice.balanceDue !== undefined ? invoice.balanceDue : (originalBill - allPaidForInv - discountAmt));

  const handleWhatsAppShare = async () => {
    if (!printRef.current) return;
    const filename = `PaymentReceipt_${(invoice.invoiceNo || 'RCPT').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    const modeStr = activePayment.mode === 'Cheque' && activePayment.chequeNo ? `Cheque (${activePayment.chequeNo})` : activePayment.mode;
    const discountStr = discountAmt > 0 ? `\nSettlement Discount / Waiver: ₹${discountAmt.toLocaleString()}` : '';
    const balanceStr = balanceDue > 0 ? `\nBalance Due: ₹${balanceDue.toLocaleString()}` : '\nBalance Due: ₹0 (Settled)';
    const text = `*Official Payment Receipt from ${settings?.firmName || 'Our Firm'}*\n\nReceipt For Inv: ${invoice.invoiceNo}\nAmount Received: ₹${(activePayment.amount || 0).toLocaleString()} (${numberToWords(activePayment.amount)})${discountStr}${balanceStr}\nPayment Mode: ${modeStr}\nDate: ${formatDate(activePayment.date)}\n\nThank you for your prompt remittance!`;

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
      const phone = (invoice.miscMobile || '').replace(/\D/g, '');
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

  return createPortal(
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
                <span className="font-mono text-emerald-600 dark:text-emerald-400">&bull; {activePayment.referenceNo || activePayment.chequeNo || invoice.invoiceNo || 'RCPT'}</span>
              </h3>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                <span>A4 Sheet Canvas (210mm &times; 297mm)</span>
                {balanceDue > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400 font-extrabold bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-800">
                    Partial Payment (Due: ₹{balanceDue.toLocaleString()})
                  </span>
                ) : discountAmt > 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-extrabold bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-200 dark:border-emerald-800">
                    Full Settlement (₹{discountAmt.toLocaleString()} Waived/Discount)
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-extrabold bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-200 dark:border-emerald-800">
                    Fully Settled
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Multiple payments selector if more than 1 payment */}
          {allPayments.length > 1 && (
            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-400 px-1 uppercase">Payments:</span>
              {allPayments.map((p, idx) => (
                <button
                  key={p.id || idx}
                  type="button"
                  onClick={() => setActivePayment(p)}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                    activePayment.id === p.id 
                      ? 'bg-emerald-600 text-white shadow-2xs' 
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  #{idx + 1} (₹{p.amount.toLocaleString()})
                </button>
              ))}
            </div>
          )}

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
              type="button"
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
              type="button"
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
              type="button"
              onClick={handleWhatsAppShare} 
              className="h-8 px-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              title="Share Receipt on WhatsApp"
            >
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.558 0 11.894-5.335 11.897-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              <span>WhatsApp</span>
            </button>

            <button 
              type="button"
              onClick={onClose} 
              className="h-8 w-8 flex items-center justify-center rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-all font-bold cursor-pointer ml-1"
              title="Close Preview"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Scrollable Canvas Viewport */}
        <div 
          ref={canvasContainerRef} 
          className="flex-1 overflow-auto bg-slate-100/90 dark:bg-slate-950/90 p-4 sm:p-8 flex justify-center items-start relative select-none scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700"
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

              {/* Main Sheet Content */}
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
                      <p>RECEIPT DATE: <span className="font-bold text-slate-900">{formatDate(activePayment.date)}</span></p>
                      <p>AGAINST BILL: <span className="font-mono font-black text-slate-900">{invoice.invoiceNo}</span></p>
                      {(activePayment.referenceNo || activePayment.chequeNo) && (
                        <p>REF / UTR: <span className="font-mono font-bold text-slate-900">{activePayment.referenceNo || activePayment.chequeNo}</span></p>
                      )}
                      <p className="text-emerald-700 font-extrabold">
                        STATUS: {balanceDue <= 0 
                          ? (discountAmt > 0 ? `FULL SETTLEMENT (₹${discountAmt.toLocaleString()} DISCOUNT)` : 'FULL SETTLEMENT') 
                          : `PARTIAL PAYMENT (DUE: ₹${balanceDue.toLocaleString()})`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Received From Section */}
                <div className="mt-4 sm:mt-5 p-3.5 sm:p-4 bg-slate-50/80 border border-slate-200/80 rounded-xl">
                  <span className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    RECEIVED WITH THANKS FROM
                  </span>
                  <h3 className="text-lg sm:text-xl font-black uppercase text-slate-900 tracking-tight leading-snug">
                    {invoice.clientTradeName || invoice.clientName}
                  </h3>
                  {invoice.clientTradeName && invoice.clientName && invoice.clientTradeName !== invoice.clientName && (
                    <p className="text-xs sm:text-[12.5px] font-bold text-slate-600 uppercase mt-0.5">
                      {invoice.clientName}
                    </p>
                  )}
                  {invoice.clientGstin && (
                    <p className="text-[11.5px] sm:text-xs font-bold text-slate-800 uppercase mt-1">
                      GSTIN: <span className="font-mono font-bold text-slate-900">{invoice.clientGstin}</span>
                    </p>
                  )}
                  {invoice.miscAddress && (
                    <p className="text-[11px] sm:text-[11.5px] font-medium text-slate-600 uppercase mt-0.5 leading-snug max-w-xl">
                      {invoice.miscAddress}
                    </p>
                  )}
                  {invoice.miscMobile && (
                    <p className="text-[11.5px] sm:text-xs font-bold text-slate-800 uppercase mt-1">
                      MOBILE: <span className="font-mono font-bold text-slate-900">{invoice.miscMobile}</span>
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
                      {invoice.items && invoice.items.length > 0 ? (
                        invoice.items.map((item: any, i: number) => (
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
                      <p className="font-bold">MODE: <span className="font-black text-slate-900 uppercase">{activePayment.mode}</span></p>
                      {(activePayment.chequeNo || activePayment.referenceNo) && (
                        <p className="font-bold">REF / UTR: <span className="font-mono font-black text-slate-900">{activePayment.chequeNo || activePayment.referenceNo}</span></p>
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
                        <span>AMOUNT RECEIVED (THIS RECEIPT)</span>
                        <span className="font-mono font-bold text-emerald-700 text-xs sm:text-sm">₹{totalPaid.toLocaleString()}</span>
                      </div>
                      {allPayments.length > 1 && (
                        <div className="flex justify-between items-center text-[11px] font-semibold text-slate-600 uppercase py-0.5">
                          <span>TOTAL REMITTED TO DATE</span>
                          <span className="font-mono font-bold text-slate-800 text-xs">₹{allPaidForInv.toLocaleString()}</span>
                        </div>
                      )}
                      {discountAmt > 0 && (
                        <div className="flex justify-between items-center text-[11px] font-bold text-indigo-700 uppercase py-0.5">
                          <span>DISCOUNT / SETTLEMENT WAIVER</span>
                          <span className="font-mono font-bold text-indigo-700 text-xs">₹{discountAmt.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center py-2 border-t-2 border-b-2 border-slate-900 my-1">
                        <span className="text-sm sm:text-base font-black uppercase text-slate-900 tracking-tight">
                          BALANCE DUE
                        </span>
                        <span className={`text-xl sm:text-2xl font-black font-mono ${balanceDue > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          ₹{balanceDue.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Authorized Signatory */}
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

                {/* 5. Terms & Conditions (Left) & WhatsApp US (Right) */}
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
                            value={`https://wa.me/${settings.whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello, regarding payment receipt for invoice ${invoice.invoiceNo}`)}`} 
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
        </div>
      </div>
    </div>,
    document.body
  );
};
