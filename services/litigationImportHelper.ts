/**
 * Litigation Suite Helper
 * Handles robust CSV line parsing (quotes, commas), deduplication by referenceNo,
 * and universal WhatsApp direct link dispatch with phone prefill.
 */

import { LitigationRecord } from '../types';

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      if (inQuotes && line[i + 1] === ch) {
        current += ch;
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ''));
  return result;
}

export function openWhatsAppShare(message: string, phone?: string): void {
  const digits = (phone || '').replace(/\D/g, '');
  let formattedPhone = '';
  if (digits.length === 10) {
    formattedPhone = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    formattedPhone = `91${digits.slice(1)}`;
  } else if (digits.length >= 11) {
    formattedPhone = digits;
  }

  const encoded = encodeURIComponent(message);
  const url = formattedPhone
    ? `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encoded}`
    : `https://api.whatsapp.com/send?text=${encoded}`;

  window.open(url, '_blank');
}

export function findExistingLitigationRecord(
  records: LitigationRecord[],
  referenceNo?: string
): LitigationRecord | undefined {
  if (!referenceNo || !records || records.length === 0) return undefined;
  const cleanRef = referenceNo.trim().toLowerCase();
  if (!cleanRef) return undefined;
  return records.find(r => r.referenceNo && r.referenceNo.trim().toLowerCase() === cleanRef);
}

