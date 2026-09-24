const fs = require('fs');
const mongoose = require('mongoose');
const { ok } = require('../../utils/respond');
const { getPagination, paginated } = require('../../utils/pagination');
const { Order, Customer, Payout } = require('../../models');
const { REVENUE_MATCH, NET_AMOUNT, TZ, round2, periodRange, addDays, startOfDay } = require('../../services/metrics');
const { sellerEarnings, COMMISSION } = require('../../services/payout.service');
const { buildReportFile, MIME } = require('../../services/report.service');

const sid = (req) => new mongoose.Types.ObjectId(String(req.sellerId));

/** GET /analytics/summary?period= */
async function summary(req, res) {
  const { start, end } = periodRange(req.query);
  const match = { sellerId: sid(req), ...REVENUE_MATCH, createdAt: { $gte: start, $lte: end } };
  const [totals, profit, customers, byMethod, bySource, cancelled] = await Promise.all([
    Order.aggregate([{ $match: match }, { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: NET_AMOUNT }, commission: { $sum: COMMISSION }, gst: { $sum: '$gstAmount' } } }]),
    // Estimated profit = (selling price - current cost price) × qty
    Order.aggregate([
      { $match: match },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'p' } },
      { $group: { _id: null, profit: { $sum: { $multiply: [{ $subtract: ['$items.price', { $ifNull: [{ $first: '$p.costPrice' }, '$items.price'] }] }, '$items.quantity'] } } } },
    ]),
    Order.distinct('userId', { ...match, userId: { $ne: null } }),
    Order.aggregate([{ $match: match }, { $group: { _id: '$paymentMethod', amount: { $sum: NET_AMOUNT }, count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: match }, { $group: { _id: '$source', amount: { $sum: NET_AMOUNT }, count: { $sum: 1 } } }]),
    Order.countDocuments({ sellerId: sid(req), orderStatus: 'Cancelled', createdAt: { $gte: start, $lte: end } }),
  ]);
  const t = totals[0] || { orders: 0, revenue: 0, commission: 0, gst: 0 };
  return ok(res, {
    period: { start, end },
    orders: t.orders,
    revenue: round2(t.revenue),
    commission: round2(t.commission),
    gstCollected: round2(t.gst),
    estimatedProfit: round2((profit[0]?.profit || 0) - t.commission),
    averageOrderValue: t.orders ? round2(t.revenue / t.orders) : 0,
    customers: customers.length,
    cancelledOrders: cancelled,
    paymentMethods: Object.fromEntries(byMethod.map((m) => [m._id, { amount: round2(m.amount), count: m.count }])),
    sources: Object.fromEntries(bySource.map((m) => [m._id, { amount: round2(m.amount), count: m.count }])),
  });
}

/** GET /analytics/sales-trend?days=30 */
async function salesTrend(req, res) {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
  const start = startOfDay(addDays(new Date(), -(days - 1)));
  const rows = await Order.aggregate([
    { $match: { sellerId: sid(req), ...REVENUE_MATCH, createdAt: { $gte: start } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, sales: { $sum: NET_AMOUNT }, orders: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(rows.map((r) => [r._id, r]));
  const dates = [];
  const cursor = new Date(start.getTime() + 330 * 60000);
  for (let i = 0; i < days; i += 1) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const best = rows.reduce((b, r) => (!b || r.sales > b.sales ? r : b), null);
  return ok(res, { dates, sales: dates.map((d) => round2(map[d]?.sales)), orders: dates.map((d) => map[d]?.orders || 0), bestDay: best ? { date: best._id, sales: round2(best.sales) } : null });
}

/** GET /analytics/best-selling?limit=10&period= */
async function bestSelling(req, res) {
  const { start, end } = periodRange(req.query);
  const rows = await Order.aggregate([
    { $match: { sellerId: sid(req), ...REVENUE_MATCH, createdAt: { $gte: start, $lte: end } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.productId', name: { $first: '$items.productName' }, quantity: { $sum: '$items.quantity' }, revenue: { $sum: '$items.subtotal' } } },
    { $sort: { quantity: -1 } },
    { $limit: Math.min(parseInt(req.query.limit, 10) || 10, 50) },
  ]);
  return ok(res, { products: rows.map((r) => ({ productId: r._id, name: r.name, quantity: r.quantity, revenue: round2(r.revenue) })) });
}

/** GET /analytics/customer-analysis */
async function customerAnalysis(req, res) {
  const monthStart = startOfDay(addDays(new Date(), -29));
  const [total, newThisMonth, buyers, top] = await Promise.all([
    Customer.countDocuments({ sellerId: req.sellerId }),
    Customer.countDocuments({ sellerId: req.sellerId, createdAt: { $gte: monthStart } }),
    Order.aggregate([
      { $match: { sellerId: sid(req), ...REVENUE_MATCH, userId: { $ne: null } } },
      { $group: { _id: '$userId', orders: { $sum: 1 }, spent: { $sum: NET_AMOUNT } } },
      { $group: { _id: null, buyers: { $sum: 1 }, repeat: { $sum: { $cond: [{ $gt: ['$orders', 1] }, 1, 0] } }, spent: { $sum: '$spent' }, orders: { $sum: '$orders' } } },
    ]),
    Customer.find({ sellerId: req.sellerId }).sort({ totalSpent: -1 }).limit(5).select('name mobileNumber totalSpent totalOrders'),
  ]);
  const b = buyers[0] || { buyers: 0, repeat: 0, spent: 0, orders: 0 };
  return ok(res, { totalCustomers: total, newThisMonth, buyers: b.buyers, repeatCustomers: b.repeat, averageOrderValue: b.orders ? round2(b.spent / b.orders) : 0, topCustomers: top });
}

/** POST /analytics/export-report { type: Orders|Revenue|Products, format, period, from, to } -> file */
async function exportReport(req, res) {
  const { type, format, period, from, to } = req.body;
  const file = await buildReportFile({ reportType: type, format, period, from, to, filters: { sellerId: String(req.sellerId) }, title: `${req.seller.shopName} - ${type}` });
  res.setHeader('Content-Type', MIME[format]);
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  const stream = fs.createReadStream(file.filePath);
  stream.pipe(res);
  stream.on('close', () => fs.rm(file.filePath, { force: true }, () => {}));
}

/** GET /earnings */
async function earnings(req, res) {
  return ok(res, await sellerEarnings(req.sellerId, req.query));
}

/** GET /payouts */
async function payouts(req, res) {
  const p = getPagination(req.query);
  const filter = { sellerId: req.sellerId };
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    Payout.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).select('-bankDetails.accountNumber -initiatedBy -statusHistory.by'),
    Payout.countDocuments(filter),
  ]);
  return ok(res, paginated(items, total, p));
}

async function payout(req, res) {
  const item = await Payout.findOne({ _id: req.params.payoutId, sellerId: req.sellerId }).select('-bankDetails.accountNumber -initiatedBy').populate('orderIds', 'orderId finalAmount refundedAmount commissionRate paymentMethod deliveredAt');
  if (!item) throw require('../../utils/ApiError').notFound('Payout not found');
  return ok(res, item);
}

module.exports = { summary, salesTrend, bestSelling, customerAnalysis, exportReport, earnings, payouts, payout };
