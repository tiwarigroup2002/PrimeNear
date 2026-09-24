const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const config = require('../config');
const { Order, User, Seller, Product, Dispute, Payout, Report, Customer } = require('../models');
const { periodRange, round2, TZ, REVENUE_MATCH, NET_AMOUNT } = require('./metrics');
const { COMMISSION } = require('./payout.service');
const { getSettings } = require('./settings.service');

const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }) : '');
const MAX_ROWS = 50000;

/** Each builder returns { columns: [{ key, header, width }], rows: [] } */
const builders = {
  async Revenue({ start, end, filters }) {
    const match = { ...REVENUE_MATCH, createdAt: { $gte: start, $lte: end } };
    if (filters.sellerId) match.sellerId = new (require('mongoose').Types.ObjectId)(String(filters.sellerId));
    const rows = await Order.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, orders: { $sum: 1 }, revenue: { $sum: NET_AMOUNT }, commission: { $sum: COMMISSION }, online: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'Online'] }, NET_AMOUNT, 0] } }, cash: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'Cash'] }, NET_AMOUNT, 0] } } } },
      { $sort: { _id: 1 } },
    ]);
    return {
      columns: [
        { key: 'date', header: 'Date', width: 14 },
        { key: 'orders', header: 'Orders', width: 10 },
        { key: 'online', header: 'Online (₹)', width: 14 },
        { key: 'cash', header: 'Cash (₹)', width: 14 },
        { key: 'revenue', header: 'Revenue (₹)', width: 14 },
        { key: 'commission', header: 'Commission (₹)', width: 14 },
      ],
      rows: rows.map((r) => ({ date: r._id, orders: r.orders, online: round2(r.online), cash: round2(r.cash), revenue: round2(r.revenue), commission: round2(r.commission) })),
    };
  },

  async Orders({ start, end, filters }) {
    const match = { createdAt: { $gte: start, $lte: end } };
    if (filters.status) match.orderStatus = filters.status;
    if (filters.sellerId) match.sellerId = filters.sellerId;
    if (filters.paymentMethod) match.paymentMethod = filters.paymentMethod;
    const orders = await Order.find(match).sort({ createdAt: -1 }).limit(MAX_ROWS).populate('sellerId', 'shopName').populate('userId', 'name mobileNumber').lean();
    return {
      columns: [
        { key: 'orderId', header: 'Order ID', width: 24 },
        { key: 'date', header: 'Date', width: 20 },
        { key: 'seller', header: 'Seller', width: 22 },
        { key: 'customer', header: 'Customer', width: 20 },
        { key: 'mobile', header: 'Mobile', width: 13 },
        { key: 'items', header: 'Items', width: 7 },
        { key: 'amount', header: 'Amount (₹)', width: 12 },
        { key: 'refunded', header: 'Refunded (₹)', width: 12 },
        { key: 'method', header: 'Payment', width: 9 },
        { key: 'paymentStatus', header: 'Payment Status', width: 15 },
        { key: 'status', header: 'Order Status', width: 12 },
      ],
      rows: orders.map((o) => ({
        orderId: o.orderId,
        date: fmtDate(o.createdAt),
        seller: o.sellerId?.shopName || '',
        customer: o.userId?.name || o.customerSnapshot?.name || '',
        mobile: o.userId?.mobileNumber || o.customerSnapshot?.mobileNumber || '',
        items: o.items.reduce((s, i) => s + i.quantity, 0),
        amount: o.finalAmount,
        refunded: o.refundedAmount || 0,
        method: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        status: o.orderStatus,
      })),
    };
  },

  async Users({ start, end }) {
    const users = await User.find({ createdAt: { $gte: start, $lte: end }, status: { $ne: 'Deleted' } }).sort({ createdAt: -1 }).limit(MAX_ROWS).populate('tahsilId', 'name').lean();
    const links = await Customer.aggregate([{ $match: { userId: { $in: users.map((u) => u._id) } } }, { $group: { _id: '$userId', count: { $sum: 1 } } }]);
    const map = Object.fromEntries(links.map((l) => [String(l._id), l.count]));
    return {
      columns: [
        { key: 'mobile', header: 'Mobile', width: 13 },
        { key: 'name', header: 'Name', width: 22 },
        { key: 'email', header: 'Email', width: 26 },
        { key: 'tahsil', header: 'Tahsil', width: 16 },
        { key: 'sellers', header: 'Linked Sellers', width: 14 },
        { key: 'status', header: 'Status', width: 10 },
        { key: 'joined', header: 'Joined', width: 20 },
      ],
      rows: users.map((u) => ({ mobile: u.mobileNumber, name: u.name || '', email: u.email || '', tahsil: u.tahsilId?.name || '', sellers: map[String(u._id)] || 0, status: u.status, joined: fmtDate(u.createdAt) })),
    };
  },

  async Sellers({ start, end }) {
    const settings = await getSettings();
    const sellers = await Seller.find({ status: { $ne: 'Deleted' } }).sort({ shopName: 1 }).limit(MAX_ROWS).populate('tahsilId', 'name').lean();
    const stats = await Order.aggregate([
      { $match: { ...REVENUE_MATCH, createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: '$sellerId', orders: { $sum: 1 }, revenue: { $sum: NET_AMOUNT }, commission: { $sum: COMMISSION } } },
    ]);
    const map = Object.fromEntries(stats.map((s) => [String(s._id), s]));
    return {
      columns: [
        { key: 'shop', header: 'Shop', width: 24 },
        { key: 'owner', header: 'Owner', width: 20 },
        { key: 'mobile', header: 'Mobile', width: 13 },
        { key: 'tahsil', header: 'Tahsil', width: 15 },
        { key: 'status', header: 'Status', width: 10 },
        { key: 'commissionRate', header: 'Commission %', width: 13 },
        { key: 'orders', header: 'Orders', width: 9 },
        { key: 'revenue', header: 'Revenue (₹)', width: 13 },
        { key: 'commission', header: 'Commission (₹)', width: 14 },
        { key: 'rating', header: 'Rating', width: 8 },
      ],
      rows: sellers.map((s) => {
        const st = map[String(s._id)] || {};
        return {
          shop: s.shopName,
          owner: s.ownerName,
          mobile: s.mobileNumber,
          tahsil: s.tahsilId?.name || '',
          status: s.status,
          commissionRate: s.commissionRate ?? settings.commissionSettings.defaultCommission,
          orders: st.orders || 0,
          revenue: round2(st.revenue),
          commission: round2(st.commission),
          rating: s.rating || 0,
        };
      }),
    };
  },

  async Products({ filters }) {
    const match = { isDeleted: false };
    if (filters.sellerId) match.sellerId = filters.sellerId;
    if (filters.categoryId) match.categoryId = filters.categoryId;
    const products = await Product.find(match).sort({ soldCount: -1 }).limit(MAX_ROWS).populate('sellerId', 'shopName').populate('categoryId', 'name').lean();
    return {
      columns: [
        { key: 'name', header: 'Product', width: 28 },
        { key: 'sku', header: 'SKU', width: 16 },
        { key: 'seller', header: 'Seller', width: 22 },
        { key: 'category', header: 'Category', width: 15 },
        { key: 'price', header: 'Final Price (₹)', width: 14 },
        { key: 'stock', header: 'Stock', width: 8 },
        { key: 'sold', header: 'Sold', width: 8 },
        { key: 'status', header: 'Status', width: 10 },
      ],
      rows: products.map((p) => ({ name: p.name, sku: p.sku || '', seller: p.sellerId?.shopName || '', category: p.categoryId?.name || '', price: p.finalPrice, stock: p.stock, sold: p.soldCount || 0, status: p.isActive ? 'Active' : 'Inactive' })),
    };
  },

  async Disputes({ start, end, filters }) {
    const match = { createdAt: { $gte: start, $lte: end } };
    if (filters.status) match.status = filters.status;
    const list = await Dispute.find(match).sort({ createdAt: -1 }).limit(MAX_ROWS).populate('assignedToAdmin', 'fullName').populate('orderId', 'orderId').lean();
    return {
      columns: [
        { key: 'ticketId', header: 'Ticket', width: 24 },
        { key: 'title', header: 'Title', width: 30 },
        { key: 'category', header: 'Category', width: 15 },
        { key: 'priority', header: 'Priority', width: 10 },
        { key: 'status', header: 'Status', width: 11 },
        { key: 'order', header: 'Order', width: 24 },
        { key: 'assigned', header: 'Assigned To', width: 18 },
        { key: 'refund', header: 'Refund (₹)', width: 11 },
        { key: 'created', header: 'Created', width: 20 },
        { key: 'resolved', header: 'Resolved', width: 20 },
      ],
      rows: list.map((d) => ({ ticketId: d.ticketId, title: d.title, category: d.category, priority: d.priority, status: d.status, order: d.orderId?.orderId || '', assigned: d.assignedToAdmin?.fullName || '', refund: d.refundAmount || 0, created: fmtDate(d.createdAt), resolved: fmtDate(d.resolvedAt) })),
    };
  },

  async Payouts({ start, end, filters }) {
    const match = { createdAt: { $gte: start, $lte: end } };
    if (filters.status) match.status = filters.status;
    const list = await Payout.find(match).sort({ createdAt: -1 }).limit(MAX_ROWS).populate('sellerId', 'shopName').lean();
    return {
      columns: [
        { key: 'payoutId', header: 'Payout ID', width: 26 },
        { key: 'seller', header: 'Seller', width: 22 },
        { key: 'gross', header: 'Gross (₹)', width: 12 },
        { key: 'commission', header: 'Commission (₹)', width: 14 },
        { key: 'deductions', header: 'Deductions (₹)', width: 14 },
        { key: 'amount', header: 'Net (₹)', width: 12 },
        { key: 'status', header: 'Status', width: 11 },
        { key: 'ref', header: 'UTR / Ref', width: 18 },
        { key: 'created', header: 'Created', width: 20 },
        { key: 'completed', header: 'Completed', width: 20 },
      ],
      rows: list.map((p) => ({ payoutId: p.payoutId, seller: p.sellerId?.shopName || '', gross: p.grossAmount, commission: p.commissionAmount, deductions: round2((p.cashCommissionDeducted || 0) + (p.refundDeducted || 0)), amount: p.amount, status: p.status, ref: p.transactionRef || '', created: fmtDate(p.createdAt), completed: fmtDate(p.completedAt) })),
    };
  },
};

function toCsv({ columns, rows }) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Neutralise spreadsheet formula injection
    const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return `﻿${[columns.map((c) => esc(c.header)).join(','), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(','))].join('\n')}\n`;
}

async function toExcel(data, title, file) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PrimeNear Admin';
  const ws = wb.addWorksheet(title.slice(0, 31));
  ws.columns = data.columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 15 }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  data.rows.forEach((r) => ws.addRow(r));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  await wb.xlsx.writeFile(file);
}

function toPdf(data, title, subtitle, file) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    const stream = fs.createWriteStream(file);
    doc.pipe(stream);
    // Built-in PDF fonts cannot render the rupee sign
    const txt = (v) => String(v ?? '').replace(/₹/g, 'Rs.');
    doc.fontSize(16).text(txt(title));
    doc.fontSize(9).fillColor('#555').text(txt(subtitle)).moveDown(0.5).fillColor('#000');

    const usable = doc.page.width - 60;
    const totalW = data.columns.reduce((s, c) => s + (c.width || 15), 0);
    const widths = data.columns.map((c) => ((c.width || 15) / totalW) * usable);
    const drawRow = (cells, bold) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5);
      let x = 30;
      let h = 0;
      cells.forEach((cell, i) => {
        const text = txt(cell);
        doc.text(text, x + 2, y + 2, { width: widths[i] - 4, height: 22, ellipsis: true });
        h = Math.max(h, Math.min(doc.heightOfString(text, { width: widths[i] - 4 }), 22));
        x += widths[i];
      });
      doc.y = y + h + 5;
      doc.moveTo(30, doc.y - 1).lineTo(30 + usable, doc.y - 1).strokeColor('#dddddd').stroke();
      if (doc.y > doc.page.height - 50) {
        doc.addPage();
        drawRow(data.columns.map((c) => c.header), true);
      }
    };
    drawRow(data.columns.map((c) => c.header), true);
    data.rows.slice(0, 5000).forEach((r) => drawRow(data.columns.map((c) => r[c.key])));
    if (data.rows.length > 5000) doc.moveDown().text(`Showing first 5000 of ${data.rows.length} rows. Use Excel/CSV for the full data.`);
    if (!data.rows.length) doc.moveDown().fontSize(10).text('No data for the selected period.');
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

const EXT = { CSV: 'csv', Excel: 'xlsx', PDF: 'pdf' };
const MIME = { CSV: 'text/csv', Excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', PDF: 'application/pdf' };

/** Builds a report file on disk. Returns { filePath, fileName, rowCount, start, end }. */
async function buildReportFile({ reportType, format, period = 'month', from, to, filters = {}, title }) {
  const { start, end } = periodRange({ period, from, to });
  const data = await builders[reportType]({ start, end, filters });
  fs.mkdirSync(config.reportDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `${reportType.toLowerCase()}-report-${stamp}.${EXT[format]}`;
  const filePath = path.join(config.reportDir, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${EXT[format]}`);
  const heading = title || `${reportType} Report`;
  const subtitle = `Period: ${fmtDate(start)} to ${fmtDate(end)} · Generated ${fmtDate(new Date())} · ${data.rows.length} rows`;

  if (format === 'CSV') fs.writeFileSync(filePath, toCsv(data));
  else if (format === 'Excel') await toExcel(data, heading, filePath);
  else await toPdf(data, heading, subtitle, filePath);
  return { filePath, fileName, rowCount: data.rows.length, start, end };
}

/** Generates a report file and stores its metadata (admin reports). */
async function generateReport({ reportType, format, period = 'month', from, to, filters = {}, adminId, scheduleId }) {
  const file = await buildReportFile({ reportType, format, period, from, to, filters });
  return Report.create({
    reportType,
    format,
    period,
    from: file.start,
    to: file.end,
    filters,
    fileName: file.fileName,
    filePath: file.filePath,
    fileSize: fs.statSync(file.filePath).size,
    rowCount: file.rowCount,
    generatedBy: adminId,
    scheduleId,
  });
}

module.exports = { generateReport, buildReportFile, MIME, builders };
