const PDFDocument = require('pdfkit');
const { generateId } = require('../utils/ids');
const { Invoice, Order } = require('../models');
const { round2 } = require('./metrics');

/** Returns the invoice of an order, creating it on first use. */
async function ensureInvoice(order) {
  if (order.invoiceId) {
    const existing = await Invoice.findById(order.invoiceId);
    if (existing) return existing;
  }
  const invoice = await Invoice.create({
    invoiceId: await generateId('INV'),
    sellerId: order.sellerId,
    orderId: order._id,
    userId: order.userId,
    customerId: order.customerId,
    customerSnapshot: order.customerSnapshot,
    items: order.items.map((i) => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, price: i.price, gstRate: i.gstRate, gst: i.gst, subtotal: i.subtotal })),
    subtotal: order.subtotal,
    totalGst: order.gstAmount,
    deliveryCharge: order.deliveryCharge,
    discount: order.discount,
    totalAmount: order.finalAmount,
    paymentMethod: order.paymentMethod,
    invoiceDate: order.createdAt || new Date(),
    notes: order.customerNote,
  });
  await Order.updateOne({ _id: order._id }, { invoiceId: invoice._id });
  order.invoiceId = invoice._id;
  return invoice;
}

const fmtDate = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
const rs = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Hindi WhatsApp text for sharing an invoice (as in the product spec). */
function whatsappText(invoice, seller) {
  const lines = [
    '🛍️ *अपना बिल यहाँ है*',
    '',
    `नमस्ते ${invoice.customerSnapshot?.name || 'ग्राहक'}! 👋`,
    '',
    `📝 बिल नंबर: ${invoice.invoiceId}`,
    `📅 तारीख: ${new Date(invoice.invoiceDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    '',
    '🛒 आपकी खरीद:',
    ...invoice.items.map((i) => `• ${i.productName} × ${i.quantity} - ₹${round2(i.subtotal).toLocaleString('en-IN')}`),
    '',
  ];
  if (invoice.discount) lines.push(`🏷️ छूट: ₹${invoice.discount.toLocaleString('en-IN')}`);
  lines.push(`💰 कुल राशि: ₹${round2(invoice.totalAmount).toLocaleString('en-IN')}`, '', `धन्यवाद ${seller.shopName} से खरीदारी करने के लिए! 😊`);
  return lines.join('\n');
}

/** Streams an A4 PDF invoice. Built-in PDF fonts are Latin only, so names in Hindi may not render. */
function invoicePdf(invoice, seller, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${invoice.invoiceId}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).font('Helvetica-Bold').text(seller.shopName, { align: 'center' });
  doc.fontSize(9).font('Helvetica').fillColor('#444')
    .text(seller.shopAddress || '', { align: 'center' })
    .text(`Mobile: ${seller.mobileNumber}${seller.gstNumber ? `   GSTIN: ${seller.gstNumber}` : ''}`, { align: 'center' });
  doc.moveDown(0.8).fillColor('#000').fontSize(13).font('Helvetica-Bold').text('TAX INVOICE', { align: 'center' });
  doc.moveDown(0.5).fontSize(9).font('Helvetica');
  const top = doc.y;
  doc.text(`Invoice: ${invoice.invoiceId}`, 40, top).text(`Date: ${fmtDate(invoice.invoiceDate)}`).text(`Payment: ${invoice.paymentMethod}`);
  doc.text(`Customer: ${invoice.customerSnapshot?.name || 'Walk-in customer'}`, 320, top).text(`Mobile: ${invoice.customerSnapshot?.mobileNumber || '-'}`, 320);
  doc.moveDown(1.2);

  const cols = [
    { h: '#', w: 25, a: 'left' },
    { h: 'Item', w: 205, a: 'left' },
    { h: 'Qty', w: 40, a: 'right' },
    { h: 'Rate', w: 75, a: 'right' },
    { h: 'GST', w: 80, a: 'right' },
    { h: 'Amount', w: 90, a: 'right' },
  ];
  const row = (cells, bold) => {
    const y = doc.y;
    let x = 40;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
    cells.forEach((c, i) => {
      doc.text(String(c), x, y, { width: cols[i].w - 6, align: cols[i].a });
      x += cols[i].w;
    });
    doc.y = Math.max(doc.y, y + 14) + 2;
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#ddd').stroke();
    doc.y += 4;
  };
  row(cols.map((c) => c.h), true);
  invoice.items.forEach((it, i) => row([i + 1, it.productName, it.quantity, rs(it.price), `${rs(it.gst)} (${it.gstRate}%)`, rs(it.subtotal)]));

  const totals = [
    ['Subtotal', invoice.subtotal],
    ['GST', invoice.totalGst],
    ...(invoice.deliveryCharge ? [['Delivery', invoice.deliveryCharge]] : []),
    ...(invoice.discount ? [['Discount', -invoice.discount]] : []),
  ];
  doc.moveDown(0.5);
  totals.forEach(([k, v]) => doc.font('Helvetica').text(`${k}: ${rs(v)}`, 340, doc.y, { width: 215, align: 'right' }));
  doc.font('Helvetica-Bold').fontSize(12).text(`TOTAL: ${rs(invoice.totalAmount)}`, 340, doc.y + 4, { width: 215, align: 'right' });
  doc.moveDown(2).fontSize(9).font('Helvetica').fillColor('#555').text('Thank you for shopping with us!', 40, doc.y, { align: 'center', width: 515 });
  doc.end();
}

module.exports = { ensureInvoice, whatsappText, invoicePdf };
