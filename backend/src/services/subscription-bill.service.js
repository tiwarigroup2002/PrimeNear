const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { Counter, Seller } = require('../models');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Line and bill totals. intra-state -> CGST + SGST (half of the rate each),
 * inter-state -> IGST, none -> no GST.
 */
function computeTotals(inv) {
  const mode = inv.taxMode || 'intra';
  let subtotal = 0;
  let discountTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;
  const items = (inv.items || []).map((raw) => {
    const it = typeof raw.toObject === 'function' ? raw.toObject() : { ...raw };
    const quantity = Number(it.quantity ?? 1);
    const rate = Number(it.rate || 0);
    const discount = Number(it.discount || 0);
    const taxRate = mode === 'none' ? 0 : Number(it.taxRate || 0);
    const taxableValue = r2(Math.max(0, quantity * rate - discount));
    const cgst = mode === 'intra' ? r2((taxableValue * taxRate) / 200) : 0;
    const sgst = mode === 'intra' ? cgst : 0;
    const igst = mode === 'inter' ? r2((taxableValue * taxRate) / 100) : 0;
    subtotal += taxableValue;
    discountTotal += discount;
    cgstTotal += cgst;
    sgstTotal += sgst;
    igstTotal += igst;
    return { ...it, quantity, rate, discount, taxRate, taxableValue, cgst, sgst, igst, amount: r2(taxableValue + cgst + sgst + igst) };
  });
  const exact = r2(subtotal + cgstTotal + sgstTotal + igstTotal);
  const total = Math.round(exact);
  return {
    items,
    subtotal: r2(subtotal),
    discountTotal: r2(discountTotal),
    cgstTotal: r2(cgstTotal),
    sgstTotal: r2(sgstTotal),
    igstTotal: r2(igstTotal),
    roundOff: r2(total - exact),
    total,
    amountInWords: amountInWords(total),
  };
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
}

/** Indian numbering: 1,25,000 -> "Rupees One Lakh Twenty Five Thousand Only" */
function amountInWords(amount) {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  if (!rupees && !paise) return 'Rupees Zero Only';
  const parts = [];
  let n = rupees;
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  let words = `Rupees ${parts.join(' ') || 'Zero'}`;
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}

/** Financial year of a date: April 2026 - March 2027 -> "2026-27" */
function financialYear(d) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

/** Next bill number from the template format, e.g. "PN/{FY}/{SEQ}" -> "PN/2026-27/0001". */
async function nextInvoiceNumber(template, date = new Date()) {
  const format = template.numberFormat || 'PN/{FY}/{SEQ}';
  const base = format
    .replace(/\{FY\}/g, financialYear(date))
    .replace(/\{YYYY\}/g, String(date.getFullYear()))
    .replace(/\{MM\}/g, String(date.getMonth() + 1).padStart(2, '0'));
  // One running number per resolved prefix (so {FY} restarts every financial year)
  const counter = await Counter.findOneAndUpdate({ _id: `SUBINV:${base}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  const seq = String(counter.seq).padStart(template.seqPadding || 4, '0');
  return base.includes('{SEQ}') ? base.replace(/\{SEQ\}/g, seq) : `${base}${seq}`;
}

/** Seller details printed in "Bill to", plus the GST mode suggested from the two states. */
async function sellerBillTo(sellerId, template) {
  const seller = await Seller.findById(sellerId).populate({ path: 'tahsilId', select: 'name districtId', populate: { path: 'districtId', select: 'name state' } });
  if (!seller) return null;
  const state = seller.tahsilId?.districtId?.state || '';
  const address = [seller.shopAddress, seller.tahsilId?.name, seller.tahsilId?.districtId?.name, state].filter(Boolean).join(', ') + (seller.pincode ? ` - ${seller.pincode}` : '');
  const companyState = template?.company?.state || '';
  const sameState = !state || !companyState || state.toLowerCase() === companyState.toLowerCase();
  return {
    seller,
    billTo: { name: seller.shopName, ownerName: seller.ownerName, address, state, gstin: seller.gstNumber || '', phone: seller.mobileNumber, email: seller.email || '' },
    taxMode: sameState ? 'intra' : 'inter',
    placeOfSupply: state || companyState,
  };
}

// ---------- PDF ----------
const fmt = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');

function localFile(url) {
  if (!url || !url.startsWith('/uploads/')) return null;
  const p = path.join(config.uploadDir, url.replace('/uploads/', ''));
  return fs.existsSync(p) && /\.(png|jpe?g)$/i.test(p) ? p : null;
}

/**
 * Streams the bill as PDF using the bill design (issued bills use the design frozen at issue).
 * Tax rows (CGST / SGST / IGST) are printed only when they have a value.
 */
function billPdf(inv, template, res) {
  const t = template;
  const s = t.show || {};
  const L = t.labels || {};
  const accent = t.layout?.accentColor || '#d70f64';
  const base = t.layout?.fontSize || 10;
  const compact = t.layout?.style === 'compact';
  const modern = t.layout?.style === 'modern';
  const doc = new PDFDocument({ size: t.layout?.paperSize || 'A4', margin: compact ? 30 : 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${(inv.invoiceNumber || 'draft-bill').replace(/[^\w.-]+/g, '_')}.pdf"`);
  doc.pipe(res);
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  // Header
  if (modern) doc.rect(0, 0, doc.page.width, 8).fill(accent).fillColor('#000');
  const logo = s.logo && localFile(t.company?.logo);
  const top = doc.y + (modern ? 6 : 0);
  const pos = t.layout?.logoPosition || 'left';
  const logoW = 60;
  if (logo) {
    const x = pos === 'right' ? left + width - logoW : pos === 'center' ? left + (width - logoW) / 2 : left;
    doc.image(logo, x, top, { fit: [logoW, logoW] });
  }
  const textX = logo && pos === 'left' ? left + logoW + 12 : left;
  const textW = logo && pos !== 'center' ? width - logoW - 12 : width;
  const align = pos === 'center' ? 'center' : pos === 'right' && logo ? 'left' : 'left';
  doc.y = logo && pos === 'center' ? top + logoW + 6 : top;
  doc.fillColor(accent).font('Helvetica-Bold').fontSize(base + 6).text(t.company?.name || '', textX, doc.y, { width: textW, align });
  doc.fillColor('#333').font('Helvetica').fontSize(base - 1);
  if (t.company?.address) doc.text(t.company.address, textX, doc.y, { width: textW, align });
  const contact = [];
  if (s.companyContact) [t.company?.phone, t.company?.email, t.company?.website].filter(Boolean).forEach((c) => contact.push(c));
  if (contact.length) doc.text(contact.join('  |  '), textX, doc.y, { width: textW, align });
  const ids = [];
  if (s.companyGstin && t.company?.gstin) ids.push(`GSTIN: ${t.company.gstin}`);
  if (s.companyPan && t.company?.pan) ids.push(`PAN: ${t.company.pan}`);
  (t.customFields || []).filter((f) => f.label && f.value).forEach((f) => ids.push(`${f.label}: ${f.value}`));
  if (ids.length) doc.text(ids.join('  |  '), textX, doc.y, { width: textW, align });
  doc.y = Math.max(doc.y, logo ? top + logoW : doc.y) + 10;

  doc.fillColor(accent).font('Helvetica-Bold').fontSize(base + 4).text((t.title || 'Tax Invoice').toUpperCase(), left, doc.y, { width, align: 'center' });
  if (inv.status === 'Draft') doc.fillColor('#b45309').fontSize(base).text('DRAFT - not issued', { align: 'center' });
  if (inv.status === 'Cancelled') doc.fillColor('#b91c1c').fontSize(base).text('CANCELLED', { align: 'center' });
  if (inv.status === 'Paid' && s.paidStamp) doc.fillColor('#15803d').fontSize(base).text(`PAID${inv.paidAt ? ` on ${date(inv.paidAt)}` : ''}`, { align: 'center' });
  doc.moveDown(0.6);

  // Bill to + invoice meta
  const boxTop = doc.y;
  const colW = width / 2 - 6;
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(base).text(L.billTo || 'Bill to', left, boxTop);
  doc.font('Helvetica').fontSize(base - 0.5);
  const b = inv.billTo || {};
  [b.name, b.ownerName, b.address, s.sellerGstin && b.gstin ? `GSTIN: ${b.gstin}` : '', s.sellerContact ? [b.phone, b.email].filter(Boolean).join(' | ') : '']
    .filter(Boolean)
    .forEach((line) => doc.text(line, left, doc.y, { width: colW }));
  const leftEnd = doc.y;
  const meta = [[L.invoiceNo || 'Invoice no.', inv.invoiceNumber || 'Draft'], [L.invoiceDate || 'Invoice date', date(inv.invoiceDate)]];
  if (s.dueDate && inv.dueDate) meta.push([L.dueDate || 'Due date', date(inv.dueDate)]);
  if (s.period && (inv.periodFrom || inv.periodTo)) meta.push([L.period || 'Period', `${date(inv.periodFrom)} - ${date(inv.periodTo)}`]);
  if (s.placeOfSupply && inv.placeOfSupply) meta.push(['Place of supply', inv.placeOfSupply]);
  (inv.customFields || []).filter((f) => f.label && f.value).forEach((f) => meta.push([f.label, f.value]));
  let my = boxTop;
  meta.forEach(([k, v]) => {
    doc.font('Helvetica-Bold').text(k, left + colW + 12, my, { width: colW / 2 });
    doc.font('Helvetica').text(v, left + colW + 12 + colW / 2, my, { width: colW / 2, align: 'right' });
    my = doc.y + 1;
  });
  doc.y = Math.max(leftEnd, my) + 12;

  // Items table
  const cols = [{ key: 'sr', label: '#', w: 22, align: 'left' }, { key: 'description', label: L.description || 'Description', w: 0, align: 'left' }];
  if (s.hsn) cols.push({ key: 'hsn', label: L.hsn || 'HSN/SAC', w: 58, align: 'left' });
  if (s.quantity) cols.push({ key: 'quantity', label: L.quantity || 'Qty', w: 34, align: 'right' });
  cols.push({ key: 'rate', label: L.rate || 'Rate', w: 72, align: 'right' });
  if (s.discount) cols.push({ key: 'discount', label: L.discount || 'Discount', w: 62, align: 'right' });
  if (s.taxRateColumn && inv.taxMode !== 'none') cols.push({ key: 'taxRate', label: 'GST %', w: 40, align: 'right' });
  cols.push({ key: 'taxableValue', label: L.amount || 'Amount', w: 80, align: 'right' });
  const fixed = cols.reduce((sum, c) => sum + c.w, 0);
  cols.find((c) => c.key === 'description').w = Math.max(120, width - fixed);
  const rowH = compact ? 16 : 20;
  let y = doc.y;
  doc.rect(left, y, width, rowH).fill(modern ? accent : '#f1f5f9');
  let x = left;
  doc.fillColor(modern ? '#fff' : '#111').font('Helvetica-Bold').fontSize(base - 1);
  cols.forEach((c) => {
    doc.text(c.label, x + 4, y + (rowH - base) / 2, { width: c.w - 8, align: c.align });
    x += c.w;
  });
  y += rowH;
  doc.font('Helvetica').fillColor('#111');
  (inv.items || []).forEach((it, i) => {
    const cells = { sr: String(i + 1), description: it.description, hsn: it.hsn || '', quantity: String(it.quantity), rate: fmt(it.rate), discount: it.discount ? fmt(it.discount) : '-', taxRate: `${it.taxRate}%`, taxableValue: fmt(it.taxableValue) };
    const h = Math.max(rowH, doc.heightOfString(cells.description, { width: cols[1].w - 8 }) + 8);
    x = left;
    cols.forEach((c) => {
      doc.text(cells[c.key], x + 4, y + 4, { width: c.w - 8, align: c.align });
      x += c.w;
    });
    y += h;
    doc.moveTo(left, y).lineTo(left + width, y).strokeColor('#e2e8f0').stroke();
  });

  // Totals (tax rows only when they have a value)
  y += 8;
  const tx = left + width - 230;
  const line = (label, value, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? base + 1 : base).fillColor('#111');
    doc.text(label, tx, y, { width: 130 });
    doc.text(value, tx + 130, y, { width: 100, align: 'right' });
    y = doc.y + 3;
  };
  line(L.subtotal || 'Taxable value', fmt(inv.subtotal));
  const rateOf = (k) => {
    const rates = [...new Set((inv.items || []).filter((it) => it[k] > 0).map((it) => (k === 'igst' ? it.taxRate : it.taxRate / 2)))];
    return rates.length === 1 ? ` @ ${rates[0]}%` : '';
  };
  if (inv.cgstTotal > 0) line(`CGST${rateOf('cgst')}`, fmt(inv.cgstTotal));
  if (inv.sgstTotal > 0) line(`SGST${rateOf('sgst')}`, fmt(inv.sgstTotal));
  if (inv.igstTotal > 0) line(`IGST${rateOf('igst')}`, fmt(inv.igstTotal));
  if (inv.roundOff) line('Round off', `${inv.roundOff > 0 ? '+' : ''}${fmt(inv.roundOff)}`);
  doc.moveTo(tx, y).lineTo(left + width, y).strokeColor(accent).stroke();
  y += 4;
  line(L.total || 'Total', fmt(inv.total), true);
  doc.y = y + 6;
  if (s.amountInWords && inv.amountInWords) doc.font('Helvetica-Oblique').fontSize(base - 1).text(inv.amountInWords, left, doc.y, { width });
  doc.moveDown(0.8);

  // Bank, notes, terms, signature
  const bank = t.bank || {};
  if (s.bankDetails && (bank.accountNumber || bank.upi)) {
    doc.font('Helvetica-Bold').fontSize(base).text('Bank details', left);
    doc.font('Helvetica').fontSize(base - 1);
    [bank.accountName && `Account name: ${bank.accountName}`, bank.accountNumber && `Account no.: ${bank.accountNumber}`, bank.ifsc && `IFSC: ${bank.ifsc}`, [bank.bankName, bank.branch].filter(Boolean).join(', '), bank.upi && `UPI: ${bank.upi}`]
      .filter(Boolean)
      .forEach((l) => doc.text(l));
    doc.moveDown(0.5);
  }
  if (s.notes && inv.notes) doc.font('Helvetica-Bold').fontSize(base).text('Notes', left).font('Helvetica').fontSize(base - 1).text(inv.notes).moveDown(0.5);
  if (s.terms && inv.terms) doc.font('Helvetica-Bold').fontSize(base).text('Terms', left).font('Helvetica').fontSize(base - 1).text(inv.terms).moveDown(0.5);
  if (s.signature) {
    const sig = localFile(t.signatureImage);
    const sy = doc.y + 10;
    if (sig) doc.image(sig, left + width - 140, sy, { fit: [120, 45] });
    doc.font('Helvetica').fontSize(base - 1).text(`For ${t.company?.name || ''}`, left + width - 180, sig ? sy + 48 : sy + 30, { width: 180, align: 'right' });
    doc.text(t.signatureLabel || 'Authorised signatory', { width: 180, align: 'right' });
  }
  if (t.footer) doc.moveDown(1).fontSize(base - 2).fillColor('#666').text(t.footer, left, doc.y, { width, align: 'center' });
  doc.end();
}

module.exports = { computeTotals, amountInWords, financialYear, nextInvoiceNumber, sellerBillTo, billPdf };
