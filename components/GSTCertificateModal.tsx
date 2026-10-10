import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Client } from '../types';
import { toast } from 'sonner';

interface GSTCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  onUpdateCertificate?: (certificateBase64: string, fileName: string) => void;
}

export const GSTCertificateModal: React.FC<GSTCertificateModalProps> = ({
  isOpen,
  onClose,
  client,
  onUpdateCertificate,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !client || !client.gstProfile) return null;

  const gst = client.gstProfile;
  const gstin = gst.gstin || 'No GSTIN';
  const tradeName = client.tradeName || client.legalName || 'Client';
  const hasCertificate = !!gst.gstCertificate;
  const isPdf = hasCertificate && (gst.gstCertificate!.startsWith('data:application/pdf') || gst.gstCertificateName?.toLowerCase().endsWith('.pdf'));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Certificate file size must be under 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64 && onUpdateCertificate) {
        onUpdateCertificate(base64, file.name);
        toast.success(`Attached official GST Certificate: ${file.name}`);
      }
    };
    reader.readAsDataURL(file);
    // Reset file input so re-uploading same file name works
    e.target.value = '';
  };

  const handleDownloadPDF = () => {
    if (!gst.gstCertificate) {
      toast.error('No GST Certificate uploaded yet.');
      return;
    }
    const link = document.createElement('a');
    link.href = gst.gstCertificate;
    link.download = gst.gstCertificateName || `GST_Certificate_${gstin}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Downloaded uploaded GST Certificate PDF');
  };

  const handleShareCertificate = async () => {
    if (!gst.gstCertificate) {
      toast.error('Please upload the GST Certificate PDF first.');
      return;
    }

    // Try Web Share API with File
    if (navigator.share && typeof navigator.canShare === 'function') {
      try {
        const res = await fetch(gst.gstCertificate);
        const blob = await res.blob();
        const fileName = gst.gstCertificateName || `GST_Certificate_${gstin}.pdf`;
        const file = new File([blob], fileName, { type: blob.type || 'application/pdf' });
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `GST Certificate - ${tradeName}`,
            text: `Official Form GST REG-06 Certificate for ${tradeName} (GSTIN: ${gstin})`,
            files: [file]
          });
          toast.success('GST Certificate PDF shared!');
          return;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.warn('Native share failed, downloading PDF and opening WhatsApp', err);
      }
    }

    // Fallback: Download the PDF to the user's device and open WhatsApp
    handleDownloadPDF();
    const cleanPhone = (client.mobile || '').replace(/\D/g, '');
    const phoneParam = cleanPhone.length >= 10 ? (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone) : '';
    const shareMsg = `*FORM GST REG-06 REGISTRATION CERTIFICATE*\nEntity: ${tradeName}\nGSTIN: ${gstin}\n\n[GST Certificate PDF has been downloaded to device. Please attach to this chat.]`;
    const whatsappUrl = phoneParam
      ? `https://api.whatsapp.com/send?phone=${phoneParam}&text=${encodeURIComponent(shareMsg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(shareMsg)}`;

    window.open(whatsappUrl, '_blank');
    toast.info('Certificate PDF downloaded! Attach it in WhatsApp chat.');
  };

  const handlePrint = () => {
    if (!gst.gstCertificate) return;

    if (isPdf) {
      const printWindow = window.open(gst.gstCertificate, '_blank');
      if (printWindow) {
        printWindow.focus();
      } else {
        handleDownloadPDF();
      }
      return;
    }

    const printWindow = window.open('about:blank', '_blank', 'width=900,height=1000');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>GST Certificate - ${tradeName}</title>
          <style>
            body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #fff; }
            img { max-width: 100%; max-height: 100%; object-fit: contain; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <img src="${gst.gstCertificate}" alt="GST Certificate" />
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleRemoveCertificate = () => {
    if (confirm(`Remove uploaded GST Certificate for "${tradeName}"?`)) {
      if (onUpdateCertificate) {
        onUpdateCertificate('', '');
        toast.success('GST Certificate removed from vault.');
      }
    }
  };

  const modalContent = (
    <div 
      className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 transition-all"
      >
        {/* Hidden File Input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileUpload} 
          accept=".pdf,image/*" 
          className="hidden" 
        />

        {/* Modal Header */}
        <header className="px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-900 dark:bg-slate-950 text-white flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-lg font-black shadow-md shrink-0">
              📜
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold tracking-tight truncate text-white">
                  Form GST REG-06 Certificate
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono font-bold">
                  {gstin}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate">
                {tradeName} {gst.gstCertificateName ? `• ${gst.gstCertificateName}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {hasCertificate ? (
              <>
                {/* Download PDF */}
                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold tracking-wider transition-all flex items-center gap-1.5 shadow-md cursor-pointer active:scale-95"
                  title="Download Certificate PDF"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Download PDF</span>
                </button>

                {/* Share PDF */}
                <button
                  type="button"
                  onClick={handleShareCertificate}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold tracking-wider transition-all flex items-center gap-1.5 shadow-md cursor-pointer active:scale-95"
                  title="Share Official Certificate PDF"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  <span>Share PDF</span>
                </button>

                {/* Print */}
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold tracking-wider transition-all border border-slate-700 hidden sm:flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Print Certificate"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Print</span>
                </button>

                {/* Replace File */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all border border-slate-700 flex items-center gap-1.5 cursor-pointer"
                  title="Upload Replacement PDF"
                >
                  <span>📎</span>
                  <span className="hidden sm:inline">Replace</span>
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={handleRemoveCertificate}
                  className="h-8 w-8 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-400 hover:text-rose-300 flex items-center justify-center transition-colors text-xs cursor-pointer"
                  title="Delete Certificate"
                >
                  🗑️
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold tracking-wider transition-all flex items-center gap-1.5 shadow-md cursor-pointer active:scale-95"
              >
                <span>📤</span>
                <span>Upload PDF</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0 ml-1 active:scale-95 shadow-2xs"
              title="Close (Esc)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Certificate Display Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-950/80 flex flex-col justify-center items-center no-scrollbar min-h-[350px]">
          {hasCertificate ? (
            <div className="w-full h-full flex-1 flex flex-col items-center justify-center min-h-[500px]">
              {isPdf ? (
                <div className="w-full h-full flex-1 flex flex-col min-h-[500px] rounded-2xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <object
                    data={gst.gstCertificate}
                    type="application/pdf"
                    className="w-full h-full flex-1 min-h-[500px] rounded-2xl"
                  >
                    <iframe
                      src={gst.gstCertificate}
                      className="w-full h-full flex-1 min-h-[500px] border-0 rounded-2xl"
                      title="GST Certificate PDF"
                    >
                      <div className="p-8 text-center space-y-3">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          Your browser does not support inline PDF viewing.
                        </p>
                        <button
                          type="button"
                          onClick={handleDownloadPDF}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
                        >
                          Download PDF Document
                        </button>
                      </div>
                    </iframe>
                  </object>
                </div>
              ) : (
                <div className="p-2 sm:p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 flex justify-center max-h-[75vh] overflow-auto">
                  <img
                    src={gst.gstCertificate}
                    alt={`GST Certificate - ${tradeName}`}
                    className="max-w-full max-h-[70vh] object-contain rounded-xl"
                  />
                </div>
              )}
            </div>
          ) : (
            /* Empty State: Only show when user has NOT uploaded */
            <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="h-16 w-16 mx-auto rounded-3xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-center text-3xl shadow-sm">
                📄
              </div>
              <div className="space-y-1.5">
                <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  No GST Certificate Uploaded
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  You have not uploaded the official Government Form GST REG-06 Registration Certificate for <strong>{tradeName}</strong>.
                </p>
                <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                  Please upload the official PDF to view, print, or share it directly from the vault.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Upload Official GST Certificate (PDF)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};

export default GSTCertificateModal;
