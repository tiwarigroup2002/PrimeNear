/**
 * Same totals as the backend (services/subscription-bill.service.js) so the bill
 * preview updates while typing. The backend recalculates on save.
 */
export interface BillItem { description: string; hsn?: string; quantity: number; rate: number; discount?: number; taxRate: number; taxableValue?: number; cgst?: number; sgst?: number; igst?: number; amount?: number }
export type TaxMode = 'intra' | 'inter' | 'none';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function computeTotals(items: BillItem[], mode: TaxMode) {
  let subtotal = 0, discountTotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0;
  const lines = items.map((it) => {
    const quantity = Number(it.quantity ?? 1);
    const rate = Number(it.rate || 0);
    const discount = Number(it.discount || 0);
    const taxRate = mode === 'none' ? 0 : Number(it.taxRate || 0);
    const taxableValue = r2(Math.max(0, quantity * rate - discount));
    const cgst = mode === 'intra' ? r2((taxableValue * taxRate) / 200) : 0;
    const sgst = mode === 'intra' ? cgst : 0;
    const igst = mode === 'inter' ? r2((taxableValue * taxRate) / 100) : 0;
    subtotal += taxableValue; discountTotal += discount; cgstTotal += cgst; sgstTotal += sgst; igstTotal += igst;
    return { ...it, quantity, rate, discount, taxRate, taxableValue, cgst, sgst, igst, amount: r2(taxableValue + cgst + sgst + igst) };
  });
  const exact = r2(subtotal + cgstTotal + sgstTotal + igstTotal);
  const total = Math.round(exact);
  return { items: lines, subtotal: r2(subtotal), discountTotal: r2(discountTotal), cgstTotal: r2(cgstTotal), sgstTotal: r2(sgstTotal), igstTotal: r2(igstTotal), roundOff: r2(total - exact), total, amountInWords: amountInWords(total) };
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`);
const three = (n: number) => [Math.floor(n / 100) ? `${ONES[Math.floor(n / 100)]} Hundred` : '', n % 100 ? two(n % 100) : ''].filter(Boolean).join(' ');

/** Indian numbering words, e.g. "Rupees One Lakh Twenty Five Thousand Only" */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  if (!rupees && !paise) return 'Rupees Zero Only';
  let n = rupees;
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  return `Rupees ${parts.join(' ') || 'Zero'}${paise ? ` and ${two(paise)} Paise` : ''} Only`;
}

/** Preview of the next number for a format like "PN/{FY}/{SEQ}" */
export function sampleNumber(format: string, padding = 4, d = new Date()): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const fy = `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  const seq = '1'.padStart(padding, '0');
  const base = (format || '').replace(/\{FY\}/g, fy).replace(/\{YYYY\}/g, String(d.getFullYear())).replace(/\{MM\}/g, String(d.getMonth() + 1).padStart(2, '0'));
  return base.includes('{SEQ}') ? base.replace(/\{SEQ\}/g, seq) : base + seq;
}
