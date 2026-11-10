/**
 * Statutory Compliance Due Date Utilities
 * Extracted pure date calculation logic to decouple heavy UI components from low-level services.
 */

export const calculateDefaultDueDate = (moduleId: string, yearStr: string, period: string): string => {
  const startYear = parseInt(yearStr.split('-')[0], 10) || 2024;
  const endYear = startYear + 1;

  // Monthly GST
  if (moduleId === 'monthly_r1' || moduleId === 'monthly_r3b') {
    const dueDay = moduleId === 'monthly_r1' ? '11' : '20';
    const monthMap: Record<string, { year: number; dueMonth: string }> = {
      April: { year: startYear, dueMonth: '05' },
      May: { year: startYear, dueMonth: '06' },
      June: { year: startYear, dueMonth: '07' },
      July: { year: startYear, dueMonth: '08' },
      August: { year: startYear, dueMonth: '09' },
      September: { year: startYear, dueMonth: '10' },
      October: { year: startYear, dueMonth: '11' },
      November: { year: startYear, dueMonth: '12' },
      December: { year: endYear, dueMonth: '01' },
      January: { year: endYear, dueMonth: '02' },
      February: { year: endYear, dueMonth: '03' },
      March: { year: endYear, dueMonth: '04' },
    };
    const info = monthMap[period];
    if (info) return `${info.year}-${info.dueMonth}-${dueDay}`;
  }

  // Monthly TDS Challan
  if (moduleId === 'tds_challan') {
    const monthMap: Record<string, { year: number; dueMonth: string; dueDay: string }> = {
      April: { year: startYear, dueMonth: '05', dueDay: '07' },
      May: { year: startYear, dueMonth: '06', dueDay: '07' },
      June: { year: startYear, dueMonth: '07', dueDay: '07' },
      July: { year: startYear, dueMonth: '08', dueDay: '07' },
      August: { year: startYear, dueMonth: '09', dueDay: '07' },
      September: { year: startYear, dueMonth: '10', dueDay: '07' },
      October: { year: startYear, dueMonth: '11', dueDay: '07' },
      November: { year: startYear, dueMonth: '12', dueDay: '07' },
      December: { year: endYear, dueMonth: '01', dueDay: '07' },
      January: { year: endYear, dueMonth: '02', dueDay: '07' },
      February: { year: endYear, dueMonth: '03', dueDay: '07' },
      March: { year: endYear, dueMonth: '04', dueDay: '30' },
    };
    const info = monthMap[period];
    if (info) return `${info.year}-${info.dueMonth}-${info.dueDay}`;
  }

  // Quarterly GST & Composition
  if (moduleId === 'quarterly_iff' || moduleId === 'quarterly_r3b') {
    const isIff = moduleId === 'quarterly_iff';
    const day = isIff ? '13' : '22';
    if (period.includes('Q1')) return `${startYear}-07-${day}`;
    if (period.includes('Q2')) return `${startYear}-10-${day}`;
    if (period.includes('Q3')) return `${endYear}-01-${day}`;
    if (period.includes('Q4')) return `${endYear}-04-${day}`;
  }

  if (moduleId === 'composition_cmp08') {
    if (period.includes('Q1')) return `${startYear}-07-18`;
    if (period.includes('Q2')) return `${startYear}-10-18`;
    if (period.includes('Q3')) return `${endYear}-01-18`;
    if (period.includes('Q4')) return `${endYear}-04-18`;
  }

  // Quarterly TDS Returns
  if (moduleId === 'tds_quarterly') {
    if (period.includes('Q1')) return `${startYear}-07-31`;
    if (period.includes('Q2')) return `${startYear}-10-31`;
    if (period.includes('Q3')) return `${endYear}-01-31`;
    if (period.includes('Q4')) return `${endYear}-05-31`;
  }

  // Advance Tax
  if (moduleId === 'adv_tax_q1') return `${startYear}-06-15`;
  if (moduleId === 'adv_tax_q2') return `${startYear}-09-15`;
  if (moduleId === 'adv_tax_q3') return `${startYear}-12-15`;
  if (moduleId === 'adv_tax_q4') return `${endYear}-03-15`;

  // ROC & MCA
  if (moduleId === 'roc_dpt3') return `${endYear}-06-30`;
  if (moduleId === 'roc_dir3_kyc') return `${endYear}-09-30`;
  if (moduleId === 'roc_aoc4') return `${endYear}-10-29`;
  if (moduleId === 'roc_mgt7') return `${endYear}-11-28`;
  if (moduleId === 'roc_llp11') return `${endYear}-05-30`;
  if (moduleId === 'roc_llp8') return `${endYear}-10-30`;

  // Income Tax & Audit
  if (moduleId === 'audit_bs') return `${endYear}-09-15`;
  if (moduleId === 'audit_tax') return `${endYear}-09-30`;
  if (moduleId === 'itr_return') return `${endYear}-07-31`;
  if (moduleId === 'itr_audit') return `${endYear}-10-31`;
  if (moduleId === 'annual_gstr4') return `${endYear}-04-30`;
  if (moduleId === 'annual_gstr9') return `${endYear}-12-31`;
  if (moduleId === 'annual_gstr9c') return `${endYear}-12-31`;

  return '';
};

