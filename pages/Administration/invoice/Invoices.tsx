import { useQueryClient } from '@tanstack/react-query';
import { useModuleData } from '../../../hooks/useModuleData.ts';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { InvoiceRecord, Client, InvoiceSettings } from '../../../types';
import { api } from '../../../services/api.ts';
import Loader from '../../../components/Loader';
import { QRCodeSVG } from 'qrcode.react';
import html2pdf from 'html2pdf.js';
import { TableFilter } from '../../../components/TableFilter';
import { formatDate } from '../../../dateUtils.ts';
import { ViewControl } from '../../../components/ViewControl';
import { toast } from 'sonner';
import {
  usePaginatedCategory,
  useUpdateInvoiceMutation,
  useDeleteInvoiceMutation,
  useSettleInvoiceMutation
} from '../../../hooks/usePaginatedData';

interface InvoicesProps {
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

// Safe invoice record normalizer
const normalizeInvoice = (raw: any): InvoiceRecord => {
  if (!raw) return raw;
  if (raw.data && typeof raw.data === 'object' && !raw.invoiceNo) {
    return {
      ...raw.data,
      id: raw._id || raw.id || raw.data.id || raw.data._id,
      _id: raw._id || raw.id || raw.data.id || raw.data._id,
      createdAt: raw.createdAt || raw.data.createdAt,
      updatedAt: raw.updatedAt || raw.data.updatedAt,
    };
  }
  return {
    ...raw,
    id: raw.id || raw._id,
    _id: raw._id || raw.id
  };
};

// Formats WhatsApp notification text including firm, invoice details, dues and payment coordinates
const buildInvoiceWhatsAppMessage = (
  inv: InvoiceRecord, 
  settings: InvoiceSettings | undefined, 
  prevDues: number,
  clientObj?: Client
): string => {
  const isBillOfSupply = inv.invoiceType === 'Bill of Supply';
  const firmName = settings?.firmName || 'Our Firm';
  const clientName = inv.clientTradeName || inv.clientName || clientObj?.tradeName || clientObj?.legalName || 'Valued Client';
  const hasFirmGstin = Boolean(settings?.firmGstin && settings.firmGstin.trim() !== '' && settings.firmGstin.toUpperCase() !== 'N/A');
  const shouldAddTax = Boolean(hasFirmGstin && settings?.isGstEnabled && !isBillOfSupply);
  
  const subTotal = (inv.items || []).reduce((sum, item) => sum + ((item.rate || 0) * (inv.showQuantity !== false ? (item.quantity !== undefined ? item.quantity : 1) : 1)), 0) || inv.subTotal || (inv.totalAmount || 0);
  const taxAmount = shouldAddTax ? (inv.totalTax || Math.round(subTotal * 0.18)) : 0;
  const currentInvAmt = subTotal + taxAmount;
  const totalWithPrev = currentInvAmt + prevDues;

  return `*${isBillOfSupply ? '📄 BILL OF SUPPLY' : '🧾 TAX INVOICE'}*
*${firmName}*
${hasFirmGstin ? `GSTIN: ${settings.firmGstin}\n` : ''}${!shouldAddTax && hasFirmGstin ? '⚡ *RCM APPLICABLE*\n' : ''}━━━━━━━━━━━━━━━━━━━━━━
📄 *Invoice No:* ${inv.invoiceNo}
📅 *Invoice Date:* ${formatDate(inv.date)}
⏳ *Due Date:* ${formatDate(inv.dueDate)}
👤 *Billed To:* ${clientName}
${inv.clientGstin ? `🏛 *Client GSTIN:* ${inv.clientGstin}\n` : ''}━━━━━━━━━━━━━━━━━━━━━━
💰 *Current Invoice:* ₹${currentInvAmt.toLocaleString()}
${prevDues > 0 ? `⚠️ *Previous Unpaid Dues:* ₹${prevDues.toLocaleString()}\n` : ''}🧾 *Total Payable:* ₹${totalWithPrev.toLocaleString()}
_${numberToWords(totalWithPrev)}_
━━━━━━━━━━━━━━━━━━━━━━
${settings?.upiId ? `📲 *Pay via UPI:* \`${settings.upiId}\`\n` : ''}${settings?.accountNo ? `🏦 *Bank Transfer Details:*
• A/C No: *${settings.accountNo}*
• IFSC: *${settings.ifsc}*
• Bank: ${settings.bankName}
• Beneficiary: ${settings.accountName || firmName}\n` : ''}━━━━━━━━━━━━━━━━━━━━━━
📎 *Single-page A4 PDF invoice is attached.*
Kindly arrange the remittance at your earliest convenience. Thank you for your business!`;
};

// Reusable A4 Sheet Component for screen preview and high-resolution PDF generation
interface InvoiceA4SheetProps {
  invoice: InvoiceRecord;
  settings?: InvoiceSettings;
  isCompact?: boolean;
  previousDues?: InvoiceRecord[];
  totalPreviousDues?: number;
  getOutstandingBalance?: (inv: InvoiceRecord) => number;
}

const InvoiceA4Sheet = React.forwardRef<HTMLDivElement, InvoiceA4SheetProps>(
  ({ invoice, settings, isCompact = false, previousDues = [], totalPreviousDues = 0, getOutstandingBalance }, ref) => {
    const hasFirmGstin = Boolean(
      settings?.firmGstin && 
      settings.firmGstin.trim() !== '' && 
      settings.firmGstin.trim().toUpperCase() !== 'N/A'
    );
    const shouldAddTax = Boolean(
      hasFirmGstin && 
      settings?.isGstEnabled && 
      invoice.invoiceType !== 'Bill of Supply'
    );
    const isRcmApplicable = Boolean(
      hasFirmGstin && 
      !shouldAddTax
    );

    const itemsSub = (invoice.items || []).reduce((sum, item) => {
      const qty = invoice.showQuantity !== false ? (item.quantity !== undefined ? item.quantity : 1) : 1;
      return sum + ((item.rate || 0) * qty);
    }, 0);
    const subTotal = itemsSub > 0 ? itemsSub : (invoice.subTotal || invoice.totalAmount || 0);

    let taxAmount = 0;
    if (shouldAddTax) {
      if (invoice.totalTax && invoice.totalTax > 0) {
        taxAmount = invoice.totalTax;
      } else if (invoice.items && invoice.items.length > 0) {
        taxAmount = invoice.items.reduce((sum, item) => {
          const qty = invoice.showQuantity !== false ? (item.quantity !== undefined ? item.quantity : 1) : 1;
          const rate = item.taxRate !== undefined && item.taxRate !== null && item.taxRate > 0 ? item.taxRate : 18;
          return sum + (((item.rate || 0) * qty) * (rate / 100));
        }, 0);
      } else {
        taxAmount = Math.round(subTotal * 0.18);
      }
    }

    const currentInvAmt = subTotal + (shouldAddTax ? taxAmount : 0);
    const grandTotal = currentInvAmt + totalPreviousDues;

    return (
      <div 
        id="invoice-a4-sheet"
        ref={ref}
        style={{ 
          width: '210mm', 
          minHeight: '297mm',
          margin: '0 auto', 
          boxSizing: 'border-box' 
        }}
        className="w-[210mm] min-h-[297mm] bg-white rounded-none sm:rounded-lg shadow-2xl relative flex flex-col text-slate-800 box-border leading-normal mx-auto p-6 sm:p-8 border border-slate-300/60 print:border-none print:shadow-none"
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
          {/* 1. Header */}
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
                {hasFirmGstin && (
                  <p>GSTIN: <span className="font-mono font-bold text-slate-900">{settings.firmGstin}</span></p>
                )}
              </div>
            </div>

            {/* Right INVOICE watermark & metadata */}
            <div className="text-right flex flex-col items-end shrink-0">
              <h2 className="text-5xl sm:text-6xl font-black uppercase tracking-widest text-slate-200/90 leading-none select-none">
                INVOICE
              </h2>
              <div className="mt-3 space-y-1 text-right text-[11.5px] sm:text-xs font-bold text-slate-800 uppercase">
                <p>INVOICE NO: <span className="font-mono font-black text-slate-900">{invoice.invoiceNo}</span></p>
                <p>DATE: <span className="font-bold text-slate-900">{formatDate(invoice.date)}</span></p>
                <p>DUE DATE: <span className="font-bold text-slate-900">{formatDate(invoice.dueDate)}</span></p>
                {isRcmApplicable && (
                  <p className="pt-0.5">
                    <span className="inline-block bg-slate-900 text-white text-[10px] sm:text-[10.5px] font-black px-2 py-0.5 rounded tracking-wider">
                      RCM APPLICABLE
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 2. BILL TO Section */}
          <div className="mt-4 sm:mt-5 p-3.5 sm:p-4 bg-slate-50/80 border border-slate-200/80 rounded-xl">
            <span className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">
              BILL TO
            </span>
            <h3 className="text-lg sm:text-xl font-black uppercase text-slate-900 tracking-tight leading-snug">
              {invoice.clientTradeName || invoice.clientName}
            </h3>
            {invoice.clientTradeName && invoice.clientName && invoice.clientTradeName !== invoice.clientName && (
              <p className="text-xs sm:text-[12.5px] font-bold text-slate-600 uppercase mt-0.5">
                {invoice.clientName}
              </p>
            )}
            {invoice.clientGstin && invoice.clientGstin !== 'N/A' && (
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

          {/* 3. Services Table */}
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
                {(invoice.items || []).map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50/40">
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
                      {invoice.showQuantity === false 
                        ? (item.month ? '1M' : '1') 
                        : (item.quantity !== undefined ? item.quantity : 1)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-medium text-slate-800 whitespace-nowrap">
                      {(item.rate || 0).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                      {((item.rate || 0) * (invoice.showQuantity !== false ? (item.quantity !== undefined ? item.quantity : 1) : 1)).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {previousDues.map((prevInv) => {
                  const outstanding = getOutstandingBalance 
                    ? getOutstandingBalance(prevInv) 
                    : Math.max(0, (prevInv.balanceDue !== undefined ? prevInv.balanceDue : (prevInv.totalAmount || 0) - (prevInv.amountPaid || 0)));
                  if (outstanding <= 0) return null;
                  return (
                    <tr key={`prev-${prevInv.id}`} className="bg-rose-50/40 border-t border-rose-200">
                      <td className="py-2 px-2 text-center font-bold text-rose-600">P</td>
                      <td className="py-2 px-2 text-left font-medium text-rose-700 whitespace-nowrap">
                        {formatDate(prevInv.date)}
                      </td>
                      <td className="py-2 px-2 text-left font-medium text-rose-800 leading-snug">
                        Previous Unpaid Dues &bull; Inv #{prevInv.invoiceNo}
                      </td>
                      <td className="py-2 px-2 text-center font-medium text-rose-700 whitespace-nowrap">1</td>
                      <td className="py-2 px-2 text-right font-mono font-medium text-rose-700 whitespace-nowrap">
                        ₹{outstanding.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-rose-700 whitespace-nowrap">
                        ₹{outstanding.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 4. Bank Information & Scan to Pay QR (Left) & Totals + Authorized Signatory (Right) */}
          <div className="mt-4 sm:mt-5 flex justify-between items-start gap-4">
            {/* Left: QR + Bank Details */}
            <div className="flex items-start gap-3.5">
              {settings?.upiId && (
                <div className="flex flex-col items-center shrink-0">
                  <div className="p-1 bg-white border border-slate-200 rounded shadow-2xs">
                    <QRCodeSVG 
                      value={`upi://pay?pa=${settings.upiId}&pn=${encodeURIComponent(settings.firmName || 'Firm')}&am=${grandTotal}&cu=INR&tn=Invoice ${invoice.invoiceNo}`} 
                      size={90} 
                    />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-800 text-center mt-1.5 leading-tight">
                    SCAN TO PAY
                  </span>
                </div>
              )}

              {/* Bank Details */}
              <div className="text-[11px] sm:text-[11.5px] space-y-1 text-slate-700 min-w-[190px]">
                <h4 className="font-black uppercase tracking-wider text-slate-900 text-xs sm:text-sm mb-1 border-b border-slate-200 pb-0.5">
                  BANK DETAILS
                </h4>
                <p className="font-bold">A/C NAME: <span className="font-bold text-slate-900 uppercase">{settings?.accountName || settings?.firmName || 'PRAKHAR GUPTA'}</span></p>
                <p className="font-bold">BANK: <span className="font-bold text-slate-900 uppercase">{settings?.bankName || 'KOTAK MAHINDRA BANK'}</span></p>
                <p className="font-bold">A/C NO: <span className="font-mono font-bold text-slate-900">{settings?.accountNo || '0346884449'}</span></p>
                <p className="font-bold">IFSC: <span className="font-mono font-bold text-slate-900">{settings?.ifsc || 'KKBK0005077'}</span></p>
              </div>
            </div>

            {/* Right: Sub Total, Grand Total & Authorized Signatory directly below */}
            <div className="w-64 sm:w-72 space-y-3 text-right shrink-0">
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs font-bold text-slate-600 uppercase py-1 border-t border-slate-200">
                  <span>SUB TOTAL</span>
                  <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm">₹{subTotal.toLocaleString()}</span>
                </div>
                {shouldAddTax && (
                  <div className="flex justify-between items-center text-[11.5px] font-bold text-slate-600 uppercase py-0.5">
                    <span>GST</span>
                    <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm">₹{taxAmount.toLocaleString()}</span>
                  </div>
                )}
                {isRcmApplicable && (
                  <div className="flex justify-between items-center text-[11px] font-bold text-slate-700 uppercase py-0.5">
                    <span>GST / TAX</span>
                    <span className="font-black text-slate-900 text-[10.5px] bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded">
                      RCM APPLICABLE
                    </span>
                  </div>
                )}
                {totalPreviousDues > 0 && (
                  <div className="flex justify-between items-center text-[11.5px] font-bold text-rose-600 uppercase py-0.5">
                    <span>PREVIOUS DUES</span>
                    <span className="font-mono font-bold text-rose-700 text-xs sm:text-sm">₹{totalPreviousDues.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 border-t-2 border-b-2 border-slate-900 my-1">
                  <span className="text-sm sm:text-base font-black uppercase text-slate-900 tracking-tight">
                    GRAND TOTAL
                  </span>
                  <span className="text-xl sm:text-2xl font-black font-mono text-slate-900">
                    ₹{grandTotal.toLocaleString()}
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
              {/* Left: Terms & Conditions */}
              <div className="flex-1 text-[8.5px] sm:text-[9px] leading-relaxed text-slate-600 uppercase space-y-1">
                <h5 className="font-black text-[9.5px] sm:text-[10px] text-slate-900 tracking-wider mb-1">TERMS & CONDITIONS:</h5>
                <p>1. SCOPE OF WORK: THIS INVOICE IS RAISED STRICTLY FOR THE COMPLIANCE SERVICES LISTED ABOVE. ANY ADDITIONAL ASSIGNMENTS, HANDLING OF DEPARTMENT SCRUTINY NOTICES, OR FILING APPEALS BEFORE APPELLATE AUTHORITIES WILL BE BILLED SEPARATELY.</p>
                <p>2. PAYMENT TIMELINE: PAYMENT IS DUE ON OR BEFORE THE SPECIFIED DUE DATE. DELAYED PAYMENTS WILL ATTRACT AN INTEREST PENALTY OF 18% P.A. CALCULATED FROM THE DUE DATE UNTIL FULL REALIZATION.</p>
                <p>3. DATA ACCURACY & LIABILITY: THE CLIENT BEARS SOLE RESPONSIBILITY FOR PROVIDING COMPLETE, ACCURATE, AND TIMELY FINANCIAL INPUTS/BOOKS OF ACCOUNTS. THE ADVOCATE SHALL NOT BE HELD LIABLE FOR ANY INTEREST, DEPARTMENTAL PENALTIES, OR LATE FEES ARISING OUT OF DELAYED OR INACCURATE DATA TRANSMISSION BY THE CLIENT.</p>
                <p>4. OUT-OF-POCKET EXPENSES: GOVERNMENT PORTAL FEES, LATE FEE PAYMENTS MADE ON BEHALF OF THE CLIENT, PRINTING, DOCUMENTATION, AND ACTUAL TRAVEL EXPENDITURES ARE NOT INCLUDED IN THIS FEE AND WILL BE REIMBURSED AT ACTUALS.</p>
                <p>5. JURISDICTION: ALL LEGAL DISPUTES ARISING OUT OF THIS TRANSACTION ARE SUBJECT TO THE EXCLUSIVE JURISDICTION OF THE COURTS AT PRAYAGRAJ.</p>
              </div>

              {/* Right: Enlarged WhatsApp US QR Code */}
              {settings?.whatsappNumber && (
                <div className="flex flex-col items-center shrink-0 self-start sm:self-center">
                  <div className="p-1 bg-white border border-slate-200 rounded shadow-2xs">
                    <QRCodeSVG 
                      value={`https://wa.me/${settings.whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello, regarding invoice ${invoice.invoiceNo}`)}`} 
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
    );
  }
);

InvoiceA4Sheet.displayName = 'InvoiceA4Sheet';

const Invoices: React.FC<InvoicesProps> = ({ onViewChange }) => {
  const queryClient = useQueryClient();
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Draft' | 'Sent' | 'Partial' | 'Paid' | 'Cancelled'>('Active');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [compactMode, setCompactMode] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const { data: moduleInvoices = [], isLoading: isModuleLoading, refetch: refetchModule } = useModuleData<InvoiceRecord[]>('invoices');
  const { data: paginatedData, isLoading: isQueryLoading, isFetching, refetch: refetchPaginated } = usePaginatedCategory<InvoiceRecord>('invoice', page, limit, search);

  const updateInvoiceMutation = useUpdateInvoiceMutation();
  const deleteInvoiceMutation = useDeleteInvoiceMutation();
  const settleInvoiceMutation = useSettleInvoiceMutation();

  const { data: settings } = useModuleData<InvoiceSettings>('invoice_settings');
  const { data: clients = [] } = useModuleData<Client[]>('clients');

  const [sharingInvoice, setSharingInvoice] = useState<InvoiceRecord | null>(null);
  const shareSheetRef = useRef<HTMLDivElement>(null);

  const [settlingInvoice, setSettlingInvoice] = useState<InvoiceRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payMode, setPayMode] = useState<'Cash' | 'Online' | 'Cheque' | 'UPI'>('Online');
  const [chequeNo, setChequeNo] = useState('');
  const [payAmount, setPayAmount] = useState<number | ''>('');

  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRecord | null>(null);
  const [activeStatusRowId, setActiveStatusRowId] = useState<string | null>(null);

  const getStatusDot = (st: string) => {
    switch (st) {
      case 'Paid': return 'bg-emerald-500';
      case 'Partial': return 'bg-amber-500';
      case 'Sent': return 'bg-blue-500';
      case 'Draft': return 'bg-slate-400';
      case 'Cancelled': return 'bg-rose-500';
      default: return 'bg-slate-400';
    }
  };

  const getStatusBadgeClass = (st: string) => {
    switch (st) {
      case 'Paid': return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'Partial': return 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'Sent': return 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'Cancelled': return 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      default: return 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };
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

    // Standard A4 pixel dimensions at 96 DPI: 794px width x 1123px height
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
    if (previewInvoice) {
      const timer = setTimeout(() => {
        handleFitPage();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [previewInvoice?.id]);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
      if (activeStatusRowId) {
        setActiveStatusRowId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [activeStatusRowId]);

  const getOutstandingBalance = (inv: InvoiceRecord) => {
    if (!inv) return 0;
    if (inv.status === 'Paid') return 0;
    if (inv.status === 'Partial' && inv.balanceDue !== undefined) {
      return inv.balanceDue || 0;
    }
    const paid = inv.amountPaid || 0;
    const total = inv.totalAmount || 0;
    return Math.max(0, total - paid);
  };

  const getPreviousDuesFor = (targetInv: InvoiceRecord | null) => {
    if (!targetInv) return [];
    return invoices.filter(i => {
      if (!i) return false;
      const isClientMatch = (i.clientId && targetInv.clientId && i.clientId === targetInv.clientId && i.clientId !== 'misc') ||
                            (i.clientName && targetInv.clientName && (i.clientName || '').trim().toLowerCase() === (targetInv.clientName || '').trim().toLowerCase()) ||
                            (i.clientTradeName && targetInv.clientTradeName && (i.clientTradeName || '').trim().toLowerCase() === (targetInv.clientTradeName || '').trim().toLowerCase());
      
      const isPrior = new Date(i.date || 0).getTime() < new Date(targetInv.date || 0).getTime() || 
                      (new Date(i.date || 0).getTime() === new Date(targetInv.date || 0).getTime() && (i.invoiceNo || '') < (targetInv.invoiceNo || ''));

      return isClientMatch && i.id !== targetInv.id && i.status !== 'Paid' && i.status !== 'Cancelled' && i.status !== 'Draft' && isPrior;
    });
  };

  const getTotalPreviousDuesFor = (targetInv: InvoiceRecord | null) => {
    return getPreviousDuesFor(targetInv).reduce((sum, inv) => sum + getOutstandingBalance(inv), 0);
  };

  const previousDues = useMemo(() => getPreviousDuesFor(previewInvoice), [previewInvoice, invoices]);
  const totalPreviousDues = useMemo(() => getTotalPreviousDuesFor(previewInvoice), [previewInvoice, invoices]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (moduleInvoices && moduleInvoices.length > 0) {
      setInvoices(moduleInvoices.filter(Boolean).map(normalizeInvoice));
      setIsLoading(false);
    } else if (paginatedData?.items && paginatedData.items.length > 0) {
      setInvoices(paginatedData.items.filter(Boolean).map(normalizeInvoice));
      setIsLoading(false);
    } else if (!isQueryLoading && !isModuleLoading) {
      setInvoices(paginatedData?.items ? paginatedData.items.filter(Boolean).map(normalizeInvoice) : []);
      setIsLoading(false);
    }
  }, [moduleInvoices, paginatedData, isQueryLoading, isModuleLoading]);

  const filteredInvoices = useMemo(() => {
    const s = search.toLowerCase().trim();
    let list = invoices.filter(i => {
      if (!i) return false;
      const invNo = (i.invoiceNo || '').toLowerCase();
      const cliName = (i.clientName || '').toLowerCase();
      const tradeName = (i.clientTradeName || '').toLowerCase();
      const gstin = (i.clientGstin || '').toLowerCase();
      return invNo.includes(s) || cliName.includes(s) || tradeName.includes(s) || gstin.includes(s);
    }).sort((a, b) => {
      if (!a || !b) return 0;
      // Latest date first
      const timeA = new Date(a.date || 0).getTime();
      const timeB = new Date(b.date || 0).getTime();
      if (timeB !== timeA) return timeB - timeA;
      
      // Extract numeric part from invoice number if present (e.g. INV/26-27/02 -> 2)
      const numA = parseInt((a.invoiceNo || '').replace(/\D/g, '')) || 0;
      const numB = parseInt((b.invoiceNo || '').replace(/\D/g, '')) || 0;
      if (numB !== numA) return numB - numA;

      return (b.invoiceNo || '').localeCompare(a.invoiceNo || '', undefined, { numeric: true });
    });

    if (statusFilter === 'Active') {
      list = list.filter(i => i && i.status !== 'Paid' && i.status !== 'Cancelled');
    } else if (statusFilter !== 'All') {
      list = list.filter(i => i && i.status === statusFilter);
    }
    return list;
  }, [invoices, search, statusFilter]);

  const handleReceiveConfirm = async () => {
    if (!settlingInvoice || isSaving) return;
    setIsSaving(true);
    settleInvoiceMutation.mutate(
      {
        id: settlingInvoice.id,
        paymentData: {
          date: payDate,
          mode: payMode,
          chequeNo: payMode === 'Cheque' ? chequeNo : undefined,
          amount: Number(payAmount)
        }
      },
      {
        onSettled: () => {
          setSettlingInvoice(null);
          setIsSaving(false);
          toast.success('Payment recorded successfully!');
        }
      }
    );
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this invoice? This will remove it from the vault.')) {
      deleteInvoiceMutation.mutate(id);
      toast.success('Invoice deleted');
    }
  };

  const handleEdit = (invoice: InvoiceRecord) => {
     onViewChange?.('admin-add-invoice', invoice);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    api.invalidateCache();
    await Promise.all([refetchModule(), refetchPaginated()]);
    setTimeout(() => setIsRefreshing(false), 500);
    toast.success('Invoices synced with vault');
  };

  const resolveClientPhone = (inv: InvoiceRecord): string => {
    let phone = (inv.miscMobile || '').replace(/\D/g, '');
    if (!phone && inv.clientId && inv.clientId !== 'misc') {
      const matchedClient = clients.find(c => c.id === inv.clientId);
      if (matchedClient?.mobile) {
        phone = matchedClient.mobile.replace(/\D/g, '');
      }
    }
    if (!phone) {
      const tradeNameLower = (inv.clientTradeName || '').trim().toLowerCase();
      const clientNameLower = (inv.clientName || '').trim().toLowerCase();
      const gstinLower = (inv.clientGstin || '').trim().toLowerCase();

      const matchedClient = clients.find(c => {
        const cTrade = (c.tradeName || '').trim().toLowerCase();
        const cLegal = (c.legalName || '').trim().toLowerCase();
        const cGstin = (c.gstProfile?.gstin || '').trim().toLowerCase();
        return (
          (tradeNameLower && cTrade && cTrade === tradeNameLower) ||
          (clientNameLower && cLegal && cLegal === clientNameLower) ||
          (tradeNameLower && cLegal && cLegal === tradeNameLower) ||
          (gstinLower && cGstin && cGstin === gstinLower)
        );
      });
      if (matchedClient?.mobile) {
        phone = matchedClient.mobile.replace(/\D/g, '');
      }
    }
    if (phone.length === 10) {
      phone = '91' + phone;
    }
    return phone;
  };

  const handleWhatsApp = (inv: InvoiceRecord) => {
    const prevDues = getTotalPreviousDuesFor(inv);
    const messageText = buildInvoiceWhatsAppMessage(inv, settings, prevDues);
    const phone = resolveClientPhone(inv);

    const waUrl = phone 
      ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(messageText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(messageText)}`;

    // Open WhatsApp directly during click gesture so browser popup blockers NEVER block it!
    const win = window.open(waUrl, '_blank');
    if (!win) {
      window.location.href = waUrl;
    }

    toast.success('Opening WhatsApp with invoice details!');

    // Also trigger single-page A4 PDF download in background
    setSharingInvoice(inv);
  };

  useEffect(() => {
    if (!sharingInvoice) return;

    let isCancelled = false;
    const generateAndDownloadPDF = async () => {
      try {
        const inv = sharingInvoice;
        // Wait for offscreen DOM & QR to render
        await new Promise(r => setTimeout(r, 150));
        if (isCancelled) return;

        const sheetEl = shareSheetRef.current;
        if (!sheetEl) return;

        const isBillOfSupply = inv.invoiceType === 'Bill of Supply';
        const docType = isBillOfSupply ? 'Bill_of_Supply' : 'Tax_Invoice';
        const filename = `${docType}_${(inv.invoiceNo || 'INV').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

        // Offscreen container clone for single-page A4 PDF export
        const clone = sheetEl.cloneNode(true) as HTMLElement;
        clone.id = 'invoice-a4-pdf-share-clone';
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

          const pdfBlob: Blob = await html2pdf().from(clone).set(opt).output('blob');
          const url = window.URL.createObjectURL(pdfBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          window.URL.revokeObjectURL(url);
          toast.success('A4 PDF Invoice downloaded! You can attach it in WhatsApp.');
        } finally {
          if (document.body.contains(container)) {
            document.body.removeChild(container);
          }
        }
      } catch (err) {
        console.warn('PDF generation in background failed or dismissed:', err);
      } finally {
        setSharingInvoice(null);
      }
    };

    generateAndDownloadPDF();

    return () => {
      isCancelled = true;
    };
  }, [sharingInvoice]);

  const handleSwitchInvoiceType = async (type: 'Tax Invoice' | 'Bill of Supply') => {
    if (!previewInvoice) return;
    let updated: InvoiceRecord = { ...previewInvoice, invoiceType: type };
    const hasFirmGstin = Boolean(
      settings?.firmGstin && 
      settings.firmGstin.trim() !== '' && 
      settings.firmGstin.trim().toUpperCase() !== 'N/A'
    );
    const shouldAddTax = Boolean(
      hasFirmGstin && 
      settings?.isGstEnabled && 
      type !== 'Bill of Supply'
    );

    const sub = updated.subTotal || (updated.items || []).reduce((sum, it) => sum + (it.rate || 0) * (it.quantity || 1), 0);
    if (!shouldAddTax) {
      updated = {
        ...updated,
        totalTax: 0,
        totalAmount: sub,
        balanceDue: updated.status === 'Paid' ? 0 : Math.max(0, sub - (updated.amountPaid || 0))
      };
    } else {
      const tax = (updated.items || []).reduce((sum, it) => {
        const rate = it.taxRate !== undefined && it.taxRate > 0 ? it.taxRate : 18;
        return sum + ((it.rate || 0) * (it.quantity || 1) * rate) / 100;
      }, 0) || Math.round(sub * 0.18);
      const tot = sub + tax;
      updated = {
        ...updated,
        subTotal: sub,
        totalTax: tax,
        totalAmount: tot,
        balanceDue: updated.status === 'Paid' ? 0 : Math.max(0, tot - (updated.amountPaid || 0))
      };
    }
    setPreviewInvoice(updated);
    setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
    try {
      await api.saveInvoice(updated);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['category_items', 'invoice'] });
      toast.success(`Switched document to ${type}`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to update document type in vault');
    }
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const printWindow = window.open('about:blank', '_blank', 'width=950,height=1150');
    if (printWindow) {
      const pageStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
        .map(el => el.outerHTML)
        .join('\n');

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${previewInvoice?.invoiceType || 'Tax Invoice'} - ${previewInvoice?.invoiceNo}</title>
          ${pageStyles}
          <style>
            @page {
              size: A4 portrait;
              margin: 6mm 8mm;
            }
            * {
              box-sizing: border-box !important;
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
            #invoice-a4-sheet {
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
            thead {
              display: table-header-group;
            }
            tfoot {
              display: table-footer-group;
            }
            .no-break {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
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

  const handleDownloadA4PDF = async () => {
    if (!previewInvoice || !printRef.current) return;
    const isBillOfSupply = previewInvoice.invoiceType === 'Bill of Supply';
    const docType = isBillOfSupply ? 'Bill_of_Supply' : 'Tax_Invoice';
    const filename = `${docType}_${previewInvoice.invoiceNo.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    
    toast.info(`Generating single-page A4 PDF...`);

    const original = printRef.current;
    const clone = original.cloneNode(true) as HTMLElement;

    // Remove screen-only shadow, borders, rounded corners, and force exact A4 printable dimensions
    clone.id = 'invoice-a4-pdf-clone';
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

    // Mount off-screen with positive layout coordinates so html2canvas computes perfect layout
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
      toast.success('A4 PDF Invoice downloaded successfully (1 Page)!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate PDF');
    } finally {
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    }
  };

  const handleWhatsAppShare = () => {
    if (!previewInvoice) return;
    handleWhatsApp(previewInvoice);
  };

  // Comprehensive Invoice Statistics & Financial Metrics
  const invoiceStats = useMemo(() => {
    const total = invoices.length;
    const active = invoices.filter(i => i.status !== 'Paid' && i.status !== 'Cancelled').length;
    const sent = invoices.filter(i => i.status === 'Sent').length;
    const partial = invoices.filter(i => i.status === 'Partial').length;
    const paid = invoices.filter(i => i.status === 'Paid').length;
    const draft = invoices.filter(i => i.status === 'Draft').length;
    const cancelled = invoices.filter(i => i.status === 'Cancelled').length;

    const totalBilled = invoices.reduce((sum, i) => sum + (i.totalAmount || 0), 0);
    const totalCollected = invoices.reduce((sum, i) => sum + (i.amountPaid || (i.status === 'Paid' ? (i.totalAmount || 0) : 0)), 0);
    const totalOutstanding = invoices.reduce((sum, i) => {
      if (i.status === 'Paid' || i.status === 'Cancelled') return sum;
      if (i.status === 'Partial' && i.balanceDue !== undefined) return sum + (i.balanceDue || 0);
      return sum + Math.max(0, (i.totalAmount || 0) - (i.amountPaid || 0));
    }, 0);

    return {
      total,
      active,
      sent,
      partial,
      paid,
      draft,
      cancelled,
      totalBilled,
      totalCollected,
      totalOutstanding
    };
  }, [invoices]);

  const activeFilterCount = useMemo(() => {
    switch (statusFilter) {
      case 'All': return invoiceStats.total;
      case 'Active': return invoiceStats.active;
      case 'Sent': return invoiceStats.sent;
      case 'Partial': return invoiceStats.partial;
      case 'Paid': return invoiceStats.paid;
      case 'Draft': return invoiceStats.draft;
      case 'Cancelled': return invoiceStats.cancelled;
      default: return invoiceStats.total;
    }
  }, [statusFilter, invoiceStats]);

  const paginatedInvoices = useMemo(() => {
    const startIndex = (page - 1) * limit;
    return filteredInvoices.slice(startIndex, startIndex + limit);
  }, [filteredInvoices, page, limit]);

  const totalPages = Math.ceil(filteredInvoices.length / limit) || 1;

  if (isLoading) return <Loader />;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col h-full space-y-2 pb-1 overflow-hidden animate-in fade-in duration-300">
      
      {/* Modern Unified Single-Line Toolbar: Search First, Count Badge Second */}
      <div className="relative z-50 flex flex-wrap items-center justify-between gap-2 sm:gap-2.5 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl p-2 sm:p-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs shrink-0 w-full max-w-full min-w-0 transition-colors">
        
        {/* Left Side: Search Bar & Count Badge Dropdown */}
        <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-2xl">
          {/* 1. Search input FIRST */}
          <div className="relative flex-1 min-w-[180px] max-w-md group">
            <input 
              type="text" 
              placeholder="Search by Invoice No, Client or GSTIN..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl py-1.5 pl-8 pr-16 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none" 
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {search && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-400 bg-slate-200/70 dark:bg-slate-700/70 px-1.5 py-0.5 rounded-md">
                  {filteredInvoices.length}/{invoices.length}
                </span>
                <button 
                  onClick={() => setSearch('')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}
          </div>

          {/* 2. Filter Count Badge Dropdown - Shifted directly after Search Bar */}
          <div className="relative shrink-0" ref={filterDropdownRef}>
            <button
              type="button"
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
              className={`h-8 sm:h-8.5 px-3 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-2xs whitespace-nowrap ${
                isFilterDropdownOpen
                  ? 'bg-slate-900 text-white dark:bg-indigo-600 border-slate-900 dark:border-indigo-600'
                  : statusFilter !== 'All'
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                    : 'bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-slate-700/80'
              }`}
              title="Click to filter by invoice status"
            >
              <svg className={`h-3.5 w-3.5 shrink-0 transition-colors ${statusFilter !== 'All' ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${getStatusDot(statusFilter)}`}></span>
                <span className="capitalize">{statusFilter === 'All' ? 'All Invoices' : statusFilter}</span>
              </span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                isFilterDropdownOpen
                  ? 'bg-white/20 text-white'
                  : 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300'
              }`}>
                {activeFilterCount}
              </span>
              <svg className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${isFilterDropdownOpen ? 'rotate-180 text-white' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {isFilterDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-72 bg-white dark:bg-slate-850 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-700/90 p-2 z-[999] animate-in fade-in zoom-in-95 duration-150">
                {/* Financial Snapshot Inside Dropdown */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-750 mb-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <span>Revenue Snapshot</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">₹{invoiceStats.totalBilled.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                      Paid: ₹{invoiceStats.totalCollected.toLocaleString()}
                    </span>
                    <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                      Due: ₹{invoiceStats.totalOutstanding.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">Filter Invoices</div>
                <div className="space-y-0.5">
                  {[
                    { id: 'All', label: 'All Invoices', count: invoiceStats.total, color: 'bg-slate-500', badgeClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200' },
                    { id: 'Active', label: 'Active (Unpaid)', count: invoiceStats.active, color: 'bg-amber-500', badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' },
                    { id: 'Sent', label: 'Sent (Pending)', count: invoiceStats.sent, color: 'bg-blue-500', badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' },
                    { id: 'Partial', label: 'Partially Paid', count: invoiceStats.partial, color: 'bg-amber-600', badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' },
                    { id: 'Paid', label: 'Fully Paid', count: invoiceStats.paid, color: 'bg-emerald-500', badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' },
                    { id: 'Draft', label: 'Drafts', count: invoiceStats.draft, color: 'bg-slate-400', badgeClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
                    { id: 'Cancelled', label: 'Cancelled', count: invoiceStats.cancelled, color: 'bg-rose-500', badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300' },
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { setStatusFilter(item.id as any); setIsFilterDropdownOpen(false); }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        statusFilter === item.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold'
                          : 'hover:bg-slate-100/80 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${item.color}`}></span>
                        <span>{item.label}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.badgeClass}`}>
                        {item.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: View Controls & Primary Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0 flex-nowrap overflow-x-auto no-scrollbar max-w-full justify-start sm:justify-end py-0.5">
          <ViewControl 
            viewMode={viewMode} 
            onViewChange={setViewMode} 
            compactMode={compactMode} 
            onCompactToggle={() => setCompactMode(!compactMode)} 
          />

          <button 
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-8 sm:h-8.5 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all text-xs flex items-center gap-1 cursor-pointer"
            title="Refresh Invoices from Vault"
          >
            <svg className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <button 
            type="button"
            onClick={() => onViewChange?.('admin-client-ledger', 'admin-invoices')} 
            className="bg-purple-600 text-white font-bold uppercase tracking-wider px-2.5 sm:px-3 h-8 sm:h-8.5 rounded-xl hover:bg-purple-700 transition-all text-xs flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer whitespace-nowrap"
            title="View Client Ledger Accounts"
          >
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Ledger</span>
          </button>

          <button 
            type="button"
            onClick={() => onViewChange?.('admin-invoicesetting')} 
            className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider px-2.5 sm:px-3 h-8 sm:h-8.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-xs flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap border border-slate-200 dark:border-slate-700"
            title="Configure Invoice Prefix, Bank Info & Terms"
          >
            <svg className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Settings</span>
          </button>

          <button 
            type="button"
            onClick={() => onViewChange?.('admin-add-invoice')} 
            className="bg-indigo-600 text-white font-bold uppercase tracking-wider px-3 sm:px-4 h-8 sm:h-8.5 rounded-xl shadow-xs hover:bg-indigo-700 transition-all text-xs flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
          >
            <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
            </svg>
            <span>Create Invoice</span>
          </button>
        </div>
      </div>

      {/* Main Container: Table or Grid with Dedicated Pagination Controls */}
      <div className="relative z-10 flex-1 min-h-0 w-full max-w-full min-w-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden flex flex-col transition-colors">
        {viewMode === 'grid' ? (
          <div className="overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 flex-1 no-scrollbar">
            {filteredInvoices.length === 0 ? (
              <div className="col-span-full text-center py-12 text-slate-400 font-bold text-xs uppercase tracking-wider">
                No invoices found matching criteria.
              </div>
            ) : (
              paginatedInvoices.map((inv, idx) => (
                <div key={inv.id || idx} className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-800/80 hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-all shadow-xs flex flex-col justify-between space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Invoice #{(page - 1) * limit + idx + 1}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <h4 className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100 tracking-tight uppercase">{inv.invoiceNo || 'INV-DRAFT'}</h4>
                        {inv.invoiceType === 'Bill of Supply' ? (
                          <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            BOS
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            TAX
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">{formatDate(inv.date)}</p>
                    </div>
                    <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                      ₹{(inv.totalAmount || 0).toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-slate-50/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {inv.clientTradeName || inv.clientName || '---'}
                    </div>
                    {inv.clientTradeName && inv.clientName && inv.clientTradeName !== inv.clientName && (
                      <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        Legal: {inv.clientName}
                      </div>
                    )}
                    {inv.clientGstin && (
                      <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                        GSTIN: {inv.clientGstin}
                      </div>
                    )}
                    {inv.status === 'Partial' && inv.balanceDue && (
                      <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">Due: ₹{inv.balanceDue.toLocaleString()}</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 gap-2">
                    <select
                      value={inv.status}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'Paid' || val === 'Partial') {
                          setSettlingInvoice(inv);
                          setPayAmount((inv.totalAmount || 0) - (inv.amountPaid || 0));
                        } else {
                          const updated = { ...inv, status: val as any };
                          updateInvoiceMutation.mutate(updated);
                        }
                      }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border outline-none cursor-pointer ${
                        inv.status === 'Sent' ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' : 
                        inv.status === 'Partial' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' : 
                        inv.status === 'Paid' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 
                        'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <option value="Draft">Draft</option>
                      <option value="Sent">Sent</option>
                      <option value="Partial">Partial</option>
                      <option value="Paid">Paid</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>

                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEdit(inv)} className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center cursor-pointer shadow-2xs" title="Edit">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button 
                        type="button"
                        onClick={() => setPreviewInvoice(inv)} 
                        className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-1 shadow-2xs cursor-pointer text-xs font-medium active:scale-95" 
                        title="View Invoice (A4 Sheet)"
                      >
                        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 12z" />
                        </svg>
                        <span>View</span>
                      </button>
                      <button onClick={() => handleWhatsApp(inv)} className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center justify-center cursor-pointer shadow-2xs" title="WhatsApp">
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.558 0 11.894-5.335 11.897-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                      </button>
                      <button onClick={() => handleDelete(inv.id)} className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center cursor-pointer shadow-2xs" title="Delete">
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
            <table className={`w-full text-left border-collapse table-auto min-w-[950px] invoices-table gst-portfolio-table compact-table ${compactMode ? 'compact-mode' : ''}`}>
              <thead className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 shadow-2xs">
                <tr>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-2.5 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 whitespace-nowrap w-12">S.No.</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-2.5 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 whitespace-nowrap min-w-[110px]">Inv. No.</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-2.5 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 whitespace-nowrap min-w-[95px]">Date</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-2.5 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 min-w-[200px]">Client (Trade / Legal Name)</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-2.5 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 whitespace-nowrap min-w-[120px]">Amount (₹)</th>
                  <th className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-2.5 py-2 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 text-center min-w-[120px] whitespace-nowrap">
                    <div className="flex justify-center items-center">
                      <TableFilter label="Status" isActive={statusFilter !== 'All'} onClear={() => setStatusFilter('All')}>
                        <div className="w-48 p-1.5 space-y-0.5">
                          <div className="px-2 py-1 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 mb-1">
                            Filter By Status
                          </div>
                          {[
                            { id: 'All', label: 'All Invoices', count: invoiceStats.total },
                            { id: 'Active', label: 'Active (Unpaid)', count: invoiceStats.active },
                            { id: 'Sent', label: 'Sent (Pending)', count: invoiceStats.sent },
                            { id: 'Partial', label: 'Partially Paid', count: invoiceStats.partial },
                            { id: 'Paid', label: 'Fully Paid', count: invoiceStats.paid },
                            { id: 'Draft', label: 'Drafts', count: invoiceStats.draft },
                            { id: 'Cancelled', label: 'Cancelled', count: invoiceStats.cancelled }
                          ].map(item => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setStatusFilter(item.id as any)}
                              className={`w-full flex items-center justify-between px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                statusFilter === item.id
                                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold'
                                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full ${getStatusDot(item.id)}`} />
                                <span>{item.label}</span>
                              </div>
                              <span className="text-[10px] font-bold text-slate-400">
                                {item.count}
                              </span>
                            </button>
                          ))}
                        </div>
                      </TableFilter>
                    </div>
                  </th>
                  <th className="sticky top-0 right-0 z-30 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md px-2.5 py-2.5 text-[var(--table-header-font-size)] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200/90 dark:border-slate-700/90 text-right w-[168px] min-w-[168px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[var(--table-font-size)]">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-10 text-center text-slate-400 font-bold uppercase tracking-wider text-xs">
                      No invoices found matching criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedInvoices.map((inv, idx) => (
                    <tr key={inv.id || idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-all group text-[var(--table-font-size)] border-b border-slate-100 dark:border-slate-800/60">
                      <td className="px-2.5 py-2.5 text-slate-400 font-bold whitespace-nowrap">{(page - 1) * limit + idx + 1}</td>
                      <td className="px-2.5 py-2.5 font-bold text-indigo-700 dark:text-indigo-400 uppercase font-mono whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{inv.invoiceNo || 'INV-DRAFT'}</span>
                          {inv.invoiceType === 'Bill of Supply' ? (
                            <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800" title="Bill of Supply (Composition / Exempt Supply)">
                              BOS
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700" title="Tax Invoice (Section 31)">
                              TAX
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDate(inv.date)}</td>
                      <td className="px-2.5 py-2.5 max-w-[280px]">
                        <p className="font-bold text-slate-800 dark:text-slate-200 uppercase leading-snug text-[var(--table-font-size)]" title={inv.clientTradeName || inv.clientName}>
                          {inv.clientTradeName || inv.clientName || '---'}
                        </p>
                        {inv.clientTradeName && inv.clientName && inv.clientTradeName !== inv.clientName && (
                          <p className="sub-text text-slate-500 dark:text-slate-400 uppercase mt-0.5 text-[calc(var(--table-font-size)-1.5px)] font-medium" title={inv.clientName}>
                            Legal: {inv.clientName}
                          </p>
                        )}
                        {inv.clientGstin && (
                          <p className="sub-text text-slate-500 dark:text-slate-400 uppercase mt-0.5 text-[calc(var(--table-font-size)-1.5px)] font-mono">
                            GSTIN: {inv.clientGstin}
                          </p>
                        )}
                      </td>
                      <td className="px-2.5 py-2.5 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        <div>₹{(inv.totalAmount || 0).toLocaleString()}</div>
                        {inv.status === 'Partial' && inv.balanceDue !== undefined && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">Due: ₹{(inv.balanceDue || 0).toLocaleString()}</div>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-center relative overflow-visible whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveStatusRowId(activeStatusRowId === inv.id ? null : inv.id);
                          }}
                          className={`inline-flex items-center justify-between gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-tight border transition-all cursor-pointer active:scale-95 shadow-2xs ${getStatusBadgeClass(inv.status)}`}
                          title="Click to update status"
                        >
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${getStatusDot(inv.status)}`} />
                          <span>{inv.status || 'Draft'}</span>
                          <svg className="h-2.5 w-2.5 opacity-60 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {activeStatusRowId === inv.id && (
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-full mt-1 z-50 left-1/2 -translate-x-1/2 w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-1 animate-in fade-in zoom-in-95 duration-100 text-left flex flex-col gap-0.5 ring-1 ring-black/5"
                          >
                            <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 mb-0.5">
                              Update Status
                            </div>
                            {(['Draft', 'Sent', 'Partial', 'Paid', 'Cancelled'] as const).map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => {
                                  setActiveStatusRowId(null);
                                  if (st === 'Paid' || st === 'Partial') {
                                    setSettlingInvoice(inv);
                                    setPayAmount((inv.totalAmount || 0) - (inv.amountPaid || 0));
                                  } else {
                                    const updated = { ...inv, status: st };
                                    updateInvoiceMutation.mutate(updated);
                                  }
                                }}
                                className={`w-full text-left px-2 py-1 text-xs font-semibold rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                                  inv.status === st
                                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold'
                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className={`h-1.5 w-1.5 rounded-full ${getStatusDot(st)}`} />
                                  <span>{st}</span>
                                </div>
                                {inv.status === st && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="sticky right-0 bg-white/95 dark:bg-slate-900/95 group-hover:bg-indigo-50/40 dark:group-hover:bg-slate-850 backdrop-blur-md z-20 px-2.5 py-2 text-right w-[168px] min-w-[168px] whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleEdit(inv)} className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 transition-all flex items-center justify-center shadow-2xs cursor-pointer" title="Edit Invoice">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button 
                            type="button"
                            onClick={() => setPreviewInvoice(inv)} 
                            className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-1 shadow-2xs cursor-pointer text-xs font-medium active:scale-95" 
                            title="View Invoice (A4 Sheet)"
                          >
                            <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 12z" />
                            </svg>
                            <span>View</span>
                          </button>
                          <button onClick={() => handleWhatsApp(inv)} className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-200 transition-all flex items-center justify-center shadow-2xs cursor-pointer" title="Share on WhatsApp">
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.558 0 11.894-5.335 11.897-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                          </button>
                          <button onClick={() => handleDelete(inv.id)} className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 transition-all flex items-center justify-center shadow-2xs cursor-pointer" title="Delete Invoice">
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
              Showing <strong className="text-slate-900 dark:text-white font-mono">{filteredInvoices.length === 0 ? 0 : (page - 1) * limit + 1}</strong> to <strong className="text-slate-900 dark:text-white font-mono">{Math.min(page * limit, filteredInvoices.length)}</strong> of <strong className="text-slate-900 dark:text-white font-mono">{filteredInvoices.length}</strong> invoices
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

      {/* Settle Payment Modal */}
      {settlingInvoice && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col p-6 space-y-4 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-tight">Record Payment</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">Inv: {settlingInvoice.invoiceNo}</p>
                </div>
                <button 
                  onClick={() => setSettlingInvoice(null)} 
                  className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
              
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1 block">Amount Received (₹)</label>
                <input 
                  type="number" 
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  value={payAmount} 
                  onChange={e => setPayAmount(Number(e.target.value))} 
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1 block">Payment Date</label>
                <input 
                  type="date" 
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
                  value={payDate} 
                  onChange={e => setPayDate(e.target.value)} 
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1 block">Payment Mode</label>
                <select 
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
                  value={payMode} 
                  onChange={e => setPayMode(e.target.value as any)}
                >
                  <option value="Online">Online / NEFT / IMPS</option>
                  <option value="UPI">UPI Transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>

              {payMode === 'Cheque' && (
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1 block">Cheque / Reference No</label>
                  <input 
                    type="text" 
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold uppercase outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
                    value={chequeNo} 
                    onChange={e => setChequeNo(e.target.value)} 
                    placeholder="000000" 
                  />
                </div>
              )}

              <div className="flex gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setSettlingInvoice(null)} className="flex-1 py-2.5 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-xs border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer">
                  Cancel
                </button>
                <button type="button" disabled={isSaving} onClick={handleReceiveConfirm} className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase tracking-wider text-xs py-2.5 rounded-xl shadow-xs transition-all cursor-pointer">
                  Confirm Settle
                </button>
              </div>
           </div>
        </div>,
        document.body
      )}

      {/* Upgraded Authentic A4 Sheet Invoice Preview & Print Modal */}
      {previewInvoice && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
           
           {/* Direct High-Fidelity Print Stylesheet */}
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
                #invoice-a4-sheet, #invoice-a4-sheet * {
                  visibility: visible !important;
                }
                #invoice-a4-sheet {
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
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                  page-break-after: avoid !important;
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                }
              }
            `}</style>

           <div className="bg-white dark:bg-slate-900 w-full max-w-6xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[96vh] border border-slate-200 dark:border-slate-800">
              
              {/* Modal Top Action Toolbar */}
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850 shrink-0 gap-2 flex-wrap">
                 <div className="flex items-center gap-2.5">
                   <div className="h-8 w-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm shrink-0">
                     {previewInvoice.invoiceType === 'Bill of Supply' ? '📦' : '📄'}
                   </div>
                   <div>
                     <h3 className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                       <span>{previewInvoice.invoiceType === 'Bill of Supply' ? 'Bill of Supply' : 'Standard Tax Invoice'}</span>
                       <span className="font-mono text-indigo-600 dark:text-indigo-400">&bull; {previewInvoice.invoiceNo}</span>
                     </h3>
                     <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1.5">
                       <span>A4 Standard (210 &times; 297 mm)</span>
                       <span className="text-slate-300 dark:text-slate-700">&bull;</span>
                       <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{isCompact ? 'Compact 1-Page' : 'Standard'}</span>
                     </span>
                   </div>
                 </div>

                 <div className="flex items-center gap-2 flex-wrap">
                    {/* Document Type Switcher: Tax Invoice vs Bill of Supply */}
                    <div className="flex items-center bg-slate-200/80 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-300 dark:border-slate-700">
                      <button 
                        type="button"
                        onClick={() => handleSwitchInvoiceType('Tax Invoice')}
                        className={`px-2.5 py-1 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer ${
                          (previewInvoice.invoiceType || 'Tax Invoice') === 'Tax Invoice'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                        title="Set Document Type: Tax Invoice (GST Section 31)"
                      >
                        Tax Inv
                      </button>
                      <button 
                        type="button"
                        onClick={() => handleSwitchInvoiceType('Bill of Supply')}
                        className={`px-2.5 py-1 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer ${
                          previewInvoice.invoiceType === 'Bill of Supply'
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                        title="Set Document Type: Bill of Supply (Composition/Exempt Supply Section 31(3)(c))"
                      >
                        Bill Supply
                      </button>
                    </div>

                    {/* Density Toggle: Compact A4 vs Comfortable */}
                    <div className="flex items-center bg-slate-200/80 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-300 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => setIsCompact(true)}
                        className={`px-2.5 py-1 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                          isCompact
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                        title="Compact density: fine-tuned spacing to guarantee a single A4 page fit"
                      >
                        <span>Compact</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCompact(false)}
                        className={`px-2.5 py-1 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                          !isCompact
                            ? 'bg-slate-700 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                        title="Comfortable density: relaxed margins and spacing"
                      >
                        <span>Normal</span>
                      </button>
                    </div>

                    {/* Resize & Zoom Toolbar */}
                    <div className="flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-1 py-0.5">
                      <button
                        type="button"
                        onClick={handleZoomOut}
                        className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer"
                        title="Zoom Out (-10%)"
                      >
                        &minus;
                      </button>
                      <button
                        type="button"
                        onClick={handleResetZoom}
                        className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-600 min-w-[42px] text-center cursor-pointer"
                        title="Click to reset to 100%"
                      >
                        {Math.round(zoomLevel * 100)}%
                      </button>
                      <button
                        type="button"
                        onClick={handleZoomIn}
                        className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer"
                        title="Zoom In (+10%)"
                      >
                        &#43;
                      </button>
                      <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />
                      <button
                        type="button"
                        onClick={handleFitPage}
                        className="px-2 py-1 text-[10px] font-bold uppercase rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 cursor-pointer"
                        title="Auto Resize: Fit entire A4 sheet to screen"
                      >
                        Fit Page
                      </button>
                      <button
                        type="button"
                        onClick={handleFitWidth}
                        className="px-2 py-1 text-[10px] font-bold uppercase rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 cursor-pointer"
                        title="Fit Width"
                      >
                        Fit Width
                      </button>
                    </div>

                    <button 
                      onClick={handleDownloadA4PDF} 
                      className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      title="Download high-resolution A4 PDF"
                    >
                       <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                       </svg>
                       <span>PDF</span>
                    </button>

                    <button 
                      onClick={handlePrint} 
                      className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      title="Print A4 Paper directly"
                    >
                       <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                       </svg>
                       <span>Print A4</span>
                    </button>

                    <button 
                      onClick={handleWhatsAppShare} 
                      className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      title="Send Invoice PDF & Message to Client on WhatsApp"
                    >
                       <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.558 0 11.894-5.335 11.897-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                       <span>Share</span>
                    </button>

                    <button 
                      onClick={() => setPreviewInvoice(null)} 
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
                className="flex-1 overflow-auto bg-slate-200/70 dark:bg-slate-950/90 p-3 sm:p-6 flex justify-center items-start no-scrollbar"
              >
                  {/* Resizable Transform Wrapper for exact A4 Scale */}
                  <div 
                    style={{
                      transform: `scale(${zoomLevel})`,
                      transformOrigin: 'top center',
                      width: '210mm',
                      minHeight: '297mm',
                      marginBottom: `${Math.max(0, (297 * (zoomLevel - 1)) + 15)}mm`
                    }}
                    className="shrink-0 transition-transform duration-100 ease-out"
                  >
                    {/* Printable A4 Canvas Sheet */}
                    <InvoiceA4Sheet
                      ref={printRef}
                      invoice={previewInvoice}
                      settings={settings}
                      isCompact={isCompact}
                      previousDues={previousDues}
                      totalPreviousDues={totalPreviousDues}
                      getOutstandingBalance={getOutstandingBalance}
                    />
                  </div>
              </div>
           </div>
        </div>,
        document.body
      )}
      {/* Offscreen Sheet for Instant Single-Page A4 PDF Generation & WhatsApp Attachment */}
      {sharingInvoice && (
        <div style={{ position: 'fixed', left: -9999, top: 0, opacity: 0, pointerEvents: 'none', zIndex: -100 }}>
          <InvoiceA4Sheet
            ref={shareSheetRef}
            invoice={sharingInvoice}
            settings={settings}
            isCompact={true}
            previousDues={getPreviousDuesFor(sharingInvoice)}
            totalPreviousDues={getTotalPreviousDuesFor(sharingInvoice)}
            getOutstandingBalance={getOutstandingBalance}
          />
        </div>
      )}
    </div>
  );
};

export default Invoices;
