import { Client } from '../types';
import { api } from './api';

export interface BirthdaySettings {
  template: string;
  firmName: string;
}

export const BIRTHDAY_SETTINGS_STORAGE_KEY = 'clientify_birthday_settings_v1';

export const DEFAULT_BIRTHDAY_TEMPLATE = 
`🎉 *Warm Birthday Wishes!* 🎂

Dear *{name}*,

On behalf of everyone at *{firmName}*, we wish you a very *Happy Birthday* filled with good health, joy, and abundant prosperity! 🌟

May the coming year bring remarkable success to all your business and personal endeavors.

Warm regards,
*{firmName}*`;

export const PRESET_BIRTHDAY_TEMPLATES = [
  {
    id: 'professional',
    label: 'Tax Practitioner / CA (Professional & Warm)',
    text: `🎉 *Warm Birthday Wishes!* 🎂\n\nDear *{name}*,\n\nOn behalf of everyone at *{firmName}*, we wish you a very *Happy Birthday* filled with good health, joy, and abundant prosperity! 🌟\n\nMay the coming year bring remarkable success to all your business and personal endeavors.\n\nWarm regards,\n*{firmName}*`
  },
  {
    id: 'short',
    label: 'Short & Cheerful',
    text: `🎂 *Happy Birthday, {name}!* 🎉\n\nWishing you a fantastic day filled with joy, and a very prosperous and successful year ahead! ✨\n\nBest regards,\n*{firmName}*`
  },
  {
    id: 'hindi_festive',
    label: 'Hindi / Hinglish Auspicious Greeting',
    text: `🌸 *जन्मदिन की हार्दिक शुभकामनाएँ!* 🎂\n\nआदरणीय *{name}*,\n\nईश्वर से आपके उत्तम स्वास्थ्य, दीर्घायु और व्यवसाय में अपार सफलता एवं समृद्धि की मंगल कामना करते हैं।\n\nWishing you a joyous and blessed Happy Birthday!\n\nBest Wishes,\n*{firmName}*`
  },
  {
    id: 'vip_corporate',
    label: 'VIP Business Client / Corporate',
    text: `🌟 *Exclusive Birthday Greetings* 🎂\n\nDear *{name}*,\n\nIt is our distinct privilege to partner with you and *{tradeName}*. On this special day, we celebrate your achievements and wish you continued leadership, robust health, and grand success!\n\nWarmest regards,\n*{firmName}*`
  }
];

export function parseDateOfBirth(dobStr?: string): { day: number; month: number; year?: number } | null {
  if (!dobStr || typeof dobStr !== 'string') return null;
  const trimmed = dobStr.trim();
  if (!trimmed) return null;

  // Handle YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { day, month, year };
    }
  }

  // Handle DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { day, month, year };
    }
  }

  // Fallback to Date parse
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
  }

  return null;
}

export function getClientDob(client: Client): string {
  if (!client) return '';
  return client.dob || client.itProfile?.dob || client.gstProfile?.dob || '';
}

export interface BirthdayMetrics {
  parsed: { day: number; month: number; year?: number };
  nextBirthday: Date;
  daysUntil: number;
  isToday: boolean;
  isUpcoming7Days: boolean;
  isUpcoming30Days: boolean;
  isThisMonth: boolean;
  turningAge?: number;
  formattedDate: string; // DD/MM/YYYY format
  formattedDateLong?: string;
}

export function getBirthdayMetrics(dobStr?: string, referenceDate: Date = new Date()): BirthdayMetrics | null {
  const parsed = parseDateOfBirth(dobStr);
  if (!parsed) return null;

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  const currentYear = today.getFullYear();
  let nextBirthday = new Date(currentYear, parsed.month - 1, parsed.day);
  nextBirthday.setHours(0, 0, 0, 0);

  // If birthday already passed earlier this year, next birthday is next year
  if (nextBirthday.getTime() < today.getTime()) {
    nextBirthday = new Date(currentYear + 1, parsed.month - 1, parsed.day);
    nextBirthday.setHours(0, 0, 0, 0);
  }

  const diffMs = nextBirthday.getTime() - today.getTime();
  const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const isToday = daysUntil === 0;
  const isUpcoming7Days = daysUntil >= 0 && daysUntil <= 7;
  const isUpcoming30Days = daysUntil >= 0 && daysUntil <= 30;
  const isThisMonth = parsed.month === (today.getMonth() + 1);

  const turningAge = parsed.year ? nextBirthday.getFullYear() - parsed.year : undefined;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const dayStr = String(parsed.day).padStart(2, '0');
  const monthStr = String(parsed.month).padStart(2, '0');
  // Strict DD/MM/YYYY format
  const formattedDate = parsed.year ? `${dayStr}/${monthStr}/${parsed.year}` : `${dayStr}/${monthStr}`;
  const monthName = monthNames[parsed.month - 1];
  const formattedDateLong = parsed.year ? `${dayStr} ${monthName} ${parsed.year}` : `${dayStr} ${monthName}`;

  return {
    parsed,
    nextBirthday,
    daysUntil,
    isToday,
    isUpcoming7Days,
    isUpcoming30Days,
    isThisMonth,
    turningAge,
    formattedDate,
    formattedDateLong
  };
}

export function formatWhatsAppPhone(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length >= 11) return digits;
  return digits;
}

export function generateBirthdayWish(
  template: string, 
  client: Client, 
  firmName?: string, 
  turningAge?: number,
  recipientName?: string
): string {
  const cName = recipientName || client.legalName || client.tradeName || 'Valued Client';
  const tName = client.tradeName || client.legalName || cName;
  const fName = firmName || 'Clientify CA Practice';
  const ageStr = turningAge ? `${turningAge}th` : '';

  return (template || DEFAULT_BIRTHDAY_TEMPLATE)
    .replace(/{name}/g, cName)
    .replace(/{clientName}/g, cName)
    .replace(/{tradeName}/g, tName)
    .replace(/{firmName}/g, fName)
    .replace(/{age}/g, ageStr);
}

export function openWhatsAppWish(phone: string, message: string): boolean {
  const formattedPhone = formatWhatsAppPhone(phone);
  const encodedText = encodeURIComponent(message);
  const url = formattedPhone 
    ? `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodedText}`
    : `https://api.whatsapp.com/send?text=${encodedText}`;
  window.open(url, '_blank');
  return true;
}

export async function getBirthdaySettings(): Promise<BirthdaySettings> {
  try {
    const remote = await api.getAppData(BIRTHDAY_SETTINGS_STORAGE_KEY).catch(() => null);
    if (remote && remote.template) {
      return remote;
    }
  } catch (e) {
    console.warn('Failed to load birthday settings from API:', e);
  }

  try {
    const local = localStorage.getItem(BIRTHDAY_SETTINGS_STORAGE_KEY);
    if (local) {
      const parsed = JSON.parse(local);
      if (parsed && parsed.template) return parsed;
    }
  } catch (e) {}

  let firmName = '';
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const u = JSON.parse(userStr);
      firmName = u.firm_name || '';
    }
  } catch (e) {}

  return {
    template: DEFAULT_BIRTHDAY_TEMPLATE,
    firmName: firmName || 'Chartered Accountants & Tax Consultants'
  };
}

export async function saveBirthdaySettings(settings: BirthdaySettings): Promise<void> {
  try {
    localStorage.setItem(BIRTHDAY_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    await api.saveAppData(BIRTHDAY_SETTINGS_STORAGE_KEY, settings).catch(() => {});
  } catch (e) {
    console.error('Failed to save birthday settings:', e);
  }
}

export interface BirthdayTarget {
  id: string;
  name: string;
  recipientName: string;
  parentName: string;
  mobile?: string;
  dob: string;
  isStakeholder: boolean;
  designation?: string;
  clientId: string;
}

export function extractAllBirthdayTargets(client: Client): BirthdayTarget[] {
  const targets: BirthdayTarget[] = [];
  if (!client) return targets;

  const parentName = client.tradeName || client.legalName || 'Client';

  // 1. Primary entity DOB
  const primaryDob = getClientDob(client);
  if (primaryDob) {
    targets.push({
      id: `client_${client.id}`,
      name: parentName,
      recipientName: client.legalName || parentName,
      parentName,
      mobile: client.mobile,
      dob: primaryDob,
      isStakeholder: false,
      clientId: client.id
    });
  }

  // 2. Stakeholders / Partners / Directors / Karta
  const gstSh = Array.isArray(client.gstProfile?.stakeholders) ? client.gstProfile!.stakeholders : [];
  const itSh = Array.isArray(client.itProfile?.stakeholders) ? client.itProfile!.stakeholders : [];

  const seenKeys = new Set<string>();
  const allSh = [...gstSh];
  itSh.forEach(s => {
    if (!s) return;
    const key = (s.pan ? s.pan.trim().toUpperCase() : '') || `${(s.name || '').trim().toLowerCase()}_${(s.mobile || '').trim()}`;
    if (!allSh.some(ex => {
      const exKey = (ex.pan ? ex.pan.trim().toUpperCase() : '') || `${(ex.name || '').trim().toLowerCase()}_${(ex.mobile || '').trim()}`;
      return Boolean(key && exKey === key);
    })) {
      allSh.push(s);
    }
  });

  allSh.forEach((sh, idx) => {
    if (!sh || !sh.dob) return;
    const shName = sh.name?.trim() || `Partner ${idx + 1}`;
    const shKey = `${shName}_${sh.dob}`;
    if (seenKeys.has(shKey)) return;
    seenKeys.add(shKey);

    const designation = sh.designation || 'Partner';
    targets.push({
      id: `sh_${client.id}_${sh.id || idx}`,
      name: `${shName} (${designation} - ${parentName})`,
      recipientName: shName,
      parentName,
      mobile: sh.mobile || client.mobile,
      dob: sh.dob,
      isStakeholder: true,
      designation,
      clientId: client.id
    });
  });

  return targets;
}


