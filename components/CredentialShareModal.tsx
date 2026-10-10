import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Client } from '../types';
import { toast } from 'sonner';

interface CredentialShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  mode?: 'gst' | 'it';
}

export const CredentialShareModal: React.FC<CredentialShareModalProps> = ({
  isOpen,
  onClose,
  client,
  mode = 'gst',
}) => {
  const [customNote, setCustomNote] = useState('');
  const [targetPhone, setTargetPhone] = useState('');

  // Selective credential options
  const [shareGst, setShareGst] = useState(true);
  const [shareEway, setShareEway] = useState(false);
  const [shareGstat, setShareGstat] = useState(false);
  const [shareIt, setShareIt] = useState(true);

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && client) {
      setShareGst(true);
      setShareEway(false);
      setShareGstat(false);
      setShareIt(true);
      setTargetPhone(client.mobile || '');
    }
  }, [isOpen, client]);

  if (!isOpen || !client) return null;

  const isGstMode = mode === 'it' ? false : (mode === 'gst' || (!!client.gstProfile && !client.itProfile));
  const gst = client.gstProfile;
  const it = client.itProfile;

  const defaultPhone = targetPhone || client.mobile || '';

  // Generate customized text based on selected options
  const generateFullText = () => {
    let lines: string[] = [];
    lines.push(`🔒 *CLIENTIFY VAULT: AUTHORIZED CREDENTIAL SLIP*`);
    lines.push(`----------------------------------------`);
    lines.push(`*Entity:* ${client.tradeName || client.legalName}`);
    if (client.legalName && client.tradeName && client.legalName !== client.tradeName) {
      lines.push(`*Legal Name:* ${client.legalName}`);
    }
    if (client.mobile) lines.push(`*Registered Mobile:* ${client.mobile}`);

    let hasAnyCredential = false;

    if (isGstMode && gst) {
      // 1. GST Portal
      if (shareGst) {
        hasAnyCredential = true;
        lines.push(``);
        lines.push(`*--- GST PORTAL CREDENTIALS ---*`);
        lines.push(`*GSTIN:* ${gst.gstin || 'N/A'}`);
        lines.push(`*GST User ID:* ${gst.username || gst.gstin || '---'}`);
        lines.push(`*GST Password:* ${gst.password || '---'}`);
        lines.push(`*Portal URL:* https://services.gst.gov.in/services/login`);
        lines.push(`*Scheme:* ${gst.regType || 'Regular'} (${gst.filingFreq || 'Monthly'})`);
      }

      // 2. E-Way Bill Portal
      if (shareEway) {
        hasAnyCredential = true;
        lines.push(``);
        lines.push(`*--- E-WAY BILL PORTAL ---*`);
        lines.push(`*E-Way Bill User ID:* ${gst.ewayBillId || '---'}`);
        lines.push(`*E-Way Bill Password:* ${gst.ewayBillPass || '---'}`);
        lines.push(`*Portal URL:* https://ewaybillgst.gov.in/login.aspx`);
      }

      // 3. GSTAT Portal
      if (shareGstat) {
        hasAnyCredential = true;
        lines.push(``);
        lines.push(`*--- GSTAT APPELLATE TRIBUNAL ---*`);
        lines.push(`*GSTAT User ID:* ${gst.gstatId || '---'}`);
        lines.push(`*GSTAT Password:* ${gst.gstatPass || '---'}`);
        lines.push(`*Portal URL:* https://efiling.gstat.gov.in/`);
      }
    } else if (it && shareIt) {
      hasAnyCredential = true;
      lines.push(``);
      lines.push(`*--- INCOME TAX E-FILING CREDENTIALS ---*`);
      lines.push(`*PAN:* ${it.pan || 'N/A'}`);
      lines.push(`*IT User ID:* ${it.username || it.pan || '---'}`);
      lines.push(`*IT Password:* ${it.password || '---'}`);
      lines.push(`*Portal URL:* https://eportal.incometax.gov.in`);
    }

    if (!hasAnyCredential) {
      return `⚠️ No portal credentials selected. Please check at least one credential option above.`;
    }

    if (customNote.trim()) {
      lines.push(``);
      lines.push(`*Note from Office:*`);
      lines.push(`${customNote.trim()}`);
    }

    lines.push(`----------------------------------------`);
    lines.push(`_Shared securely via Clientify Practice OS_`);
    return lines.join('\n');
  };

  const generateCompactText = () => {
    let chunks: string[] = [];
    if (isGstMode && gst) {
      if (shareGst) {
        chunks.push(`*GST Login*\nEntity: ${client.tradeName || client.legalName}\nGSTIN: ${gst.gstin || 'N/A'}\nUser ID: ${gst.username || gst.gstin || '---'}\nPassword: ${gst.password || '---'}\nURL: https://services.gst.gov.in/services/login`);
      }
      if (shareEway) {
        chunks.push(`*E-Way Bill Login*\nUser ID: ${gst.ewayBillId || '---'}\nPassword: ${gst.ewayBillPass || '---'}\nURL: https://ewaybillgst.gov.in/login.aspx`);
      }
      if (shareGstat) {
        chunks.push(`*GSTAT Login*\nUser ID: ${gst.gstatId || '---'}\nPassword: ${gst.gstatPass || '---'}\nURL: https://efiling.gstat.gov.in/`);
      }
    } else if (it && shareIt) {
      chunks.push(`*Income Tax Login*\nPAN: ${it.pan || 'N/A'}\nUser ID: ${it.username || it.pan || '---'}\nPassword: ${it.password || '---'}`);
    }
    return chunks.join('\n\n');
  };

  const handleCopyFull = () => {
    const text = generateFullText();
    if (!text || text.startsWith('⚠️')) {
      toast.error('Please select at least one portal credential.');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Selected Credential Slip copied to clipboard!');
    });
  };

  const handleCopyCompact = () => {
    const text = generateCompactText();
    if (!text) {
      toast.error('Please select at least one portal credential.');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Selected User ID & Password copied!');
    });
  };

  const handleWhatsAppShare = () => {
    const text = generateFullText();
    if (!text || text.startsWith('⚠️')) {
      toast.error('Please select at least one portal credential.');
      return;
    }
    const cleanPhone = defaultPhone.replace(/\D/g, '');
    const phoneParam = cleanPhone.length >= 10 ? (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone) : '';
    
    const url = phoneParam 
      ? `https://api.whatsapp.com/send?phone=${phoneParam}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    
    window.open(url, '_blank');
    toast.success('Opening WhatsApp with selected credentials...');
  };

  const handlePrintSlip = () => {
    const text = generateFullText();
    if (!text || text.startsWith('⚠️')) {
      toast.error('Please select at least one portal credential.');
      return;
    }
    const printWindow = window.open('about:blank', '_blank', 'width=600,height=700');
    if (printWindow) {
      const formattedHtml = text.replace(/\n/g, '<br/>').replace(/\*(.*?)\*/g, '<strong>$1</strong>');
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Credential Slip - ${client.tradeName || client.legalName}</title>
          <style>
            @page { margin: 15mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; line-height: 1.6; color: #1e293b; padding: 20px; }
            .card { border: 2px solid #0f172a; border-radius: 12px; padding: 20px; max-width: 500px; margin: 0 auto; }
            h2 { margin-top: 0; font-size: 16px; text-transform: uppercase; border-bottom: 2px solid #0f172a; padding-bottom: 8px; }
            .mono { font-family: monospace; font-size: 14px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="card">
            <h2>Authorized Credential Slip</h2>
            <div class="mono">${formattedHtml}</div>
          </div>
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const modalContent = (
    <div 
      className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 overflow-hidden"
      onClick={onClose}
    >
      <div 
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] font-sans transition-all"
      >
        {/* Header */}
        <header className="px-5 py-4 sm:px-6 bg-slate-900 dark:bg-slate-950 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white text-lg font-black shadow-md shrink-0">
              🔑
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold uppercase tracking-tight text-white truncate">
                Share Login Credentials
              </h3>
              <p className="text-[11px] text-slate-400 font-medium truncate">
                {client.tradeName || client.legalName} {client.gstProfile?.gstin ? `• ${client.gstProfile.gstin}` : ''}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="h-8 w-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-sm cursor-pointer shrink-0 ml-2"
            title="Close (Esc)"
          >
            ✕
          </button>
        </header>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 flex-1 no-scrollbar bg-slate-50/40 dark:bg-slate-900/40">
          
          {/* Selective Credential Options (GST, E-Way Bill, GSTAT) */}
          {isGstMode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Select Portals to Share
                </label>
                <div className="flex items-center gap-2 text-[10px]">
                  <button
                    type="button"
                    onClick={() => { setShareGst(true); setShareEway(true); setShareGstat(true); }}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <button
                    type="button"
                    onClick={() => { setShareGst(true); setShareEway(false); setShareGstat(false); }}
                    className="text-slate-500 hover:underline font-semibold cursor-pointer"
                  >
                    GST Only
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* 1. GST Portal */}
                <label 
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                    shareGst 
                      ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 ring-2 ring-indigo-500/20 shadow-xs' 
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🔐</span>
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">GST Portal</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                          {gst?.username ? `ID: ${gst.username}` : (gst?.gstin ? `ID: ${gst.gstin}` : 'No ID')}
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={shareGst}
                      onChange={e => setShareGst(e.target.checked)}
                      className="h-4 w-4 rounded accent-indigo-600 cursor-pointer mt-0.5"
                    />
                  </div>
                  <div className="mt-2 pt-1 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between text-[10px]">
                    <span className="text-slate-500 dark:text-slate-400 font-mono">Pass:</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                      {gst?.password ? '••••••••' : 'None'}
                    </span>
                  </div>
                </label>

                {/* 2. E-Way Bill */}
                <label 
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                    shareEway 
                      ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 ring-2 ring-emerald-500/20 shadow-xs' 
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🚚</span>
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">E-Way Bill</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                          {gst?.ewayBillId ? `ID: ${gst.ewayBillId}` : 'Not configured'}
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={shareEway}
                      onChange={e => setShareEway(e.target.checked)}
                      className="h-4 w-4 rounded accent-emerald-600 cursor-pointer mt-0.5"
                    />
                  </div>
                  <div className="mt-2 pt-1 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between text-[10px]">
                    <span className="text-slate-500 dark:text-slate-400 font-mono">Pass:</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                      {gst?.ewayBillPass ? '••••••••' : 'None'}
                    </span>
                  </div>
                </label>

                {/* 3. GSTAT Portal */}
                <label 
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                    shareGstat 
                      ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 ring-2 ring-amber-500/20 shadow-xs' 
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">⚖️</span>
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">GSTAT Portal</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                          {gst?.gstatId ? `ID: ${gst.gstatId}` : 'Not configured'}
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={shareGstat}
                      onChange={e => setShareGstat(e.target.checked)}
                      className="h-4 w-4 rounded accent-amber-600 cursor-pointer mt-0.5"
                    />
                  </div>
                  <div className="mt-2 pt-1 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between text-[10px]">
                    <span className="text-slate-500 dark:text-slate-400 font-mono">Pass:</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                      {gst?.gstatPass ? '••••••••' : 'None'}
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Selective Credential Options (IT Mode) */}
          {!isGstMode && it && (
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Income Tax Credentials
              </label>
              <label 
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                  shareIt 
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 ring-2 ring-indigo-500/20 shadow-xs' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">🏛️</span>
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">IT e-Filing Portal</span>
                      <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold block">
                        PAN: {it.pan || '---'}
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={shareIt}
                    onChange={e => setShareIt(e.target.checked)}
                    className="h-4 w-4 rounded accent-indigo-600 cursor-pointer mt-0.5"
                  />
                </div>
                <div className="mt-2.5 pt-2 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400 font-mono">Password:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {it.password || '••••••••'}
                  </span>
                </div>
              </label>
            </div>
          )}

          {/* Target Mobile (Optional for WhatsApp Direct) */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
              Send to WhatsApp Mobile (Optional)
            </label>
            <div className="flex items-center gap-2">
              <span className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300">
                🇮🇳 +91
              </span>
              <input
                type="text"
                value={defaultPhone}
                onChange={e => setTargetPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="Client WhatsApp Mobile No."
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:border-indigo-600 outline-none"
              />
            </div>
          </div>

          {/* Custom Note input */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
              Custom Office Note / Instructions
            </label>
            <textarea
              value={customNote}
              onChange={e => setCustomNote(e.target.value)}
              placeholder="e.g. Please verify OTP when logging in. Keep passwords confidential."
              rows={2}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-indigo-600 outline-none resize-none"
            />
          </div>

          {/* Live Preview Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                Live Formatted Preview
              </label>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                Formatted for WhatsApp
              </span>
            </div>
            <div className="bg-slate-900 text-emerald-400 p-4 rounded-2xl font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-48 border border-slate-800 leading-relaxed selection:bg-emerald-500 selection:text-slate-950">
              {generateFullText()}
            </div>
          </div>

        </div>

        {/* Modal Action Footer */}
        <footer className="p-4 sm:p-5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-emerald-600/20 active:scale-95 cursor-pointer"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.558 0 11.894-5.335 11.897-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              <span>Share to WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handleCopyFull}
              className="py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-indigo-600/20 active:scale-95 cursor-pointer"
            >
              <span>📋</span>
              <span>Copy Selected Slip</span>
            </button>

            <button
              type="button"
              onClick={handleCopyCompact}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 active:scale-95 cursor-pointer"
            >
              <span>🔑</span>
              <span>Copy ID & Pass Only</span>
            </button>

            <button
              type="button"
              onClick={handlePrintSlip}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 active:scale-95 cursor-pointer"
            >
              <span>🖨️</span>
              <span>Print Paper Slip</span>
            </button>
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

export default CredentialShareModal;
