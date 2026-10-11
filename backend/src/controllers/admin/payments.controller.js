const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { ok } = require('../../utils/respond');
const { getPagination, paginated, searchRegex, dateRange } = require('../../utils/pagination');
const { decrypt } = require('../../utils/crypto');
const { Payment, Payout, Order, Seller } = require('../../models');
const { audit } = require('../../services/audit.service');
const payoutService = require('../../services/payout.service');
const { REVENUE_MATCH, NET_AMOUNT, round2, startOfMonth } = require('../../services/metrics');
const { getSettings } = require('../../services/settings.service');

const oid = (id) => new mongoose.Types.ObjectId(String(id));

async function listPayments(req, res) {
  const p = getPagination(req.query);
  const filter = { ...dateRange(req.query) };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.method) filter.method = req.query.method;
  if (req.query.seller) filter.sellerId = oid(req.query.seller);
  if (req.query.search) {
    const rx = searchRegex(req.query.search);
    const orders = await Order.find({ orderId: rx }).select('_id').limit(100);
    filter.$or = [{ transactionId: rx }, { razorpayPaymentId: rx }, { orderId: { $in: orders.map((o) => o._id) } }];
  }
  const [items, total, sum] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit)
      .populate('orderId', 'orderId')
      .populate('userId', 'name mobileNumber')
      .populate('sellerId', 'shopName'),
    Payment.countDocuments(filter),
    Payment.aggregate([{ $match: { ...filter, status: 'Success' } }, { $group: { _id: null, total: { $sum: { $cond: [{ $eq: ['$type', 'Refund'] }, { $multiply: ['$amount', -1] }, '$amount'] } } } }]),
  ]);
  return ok(res, paginated(items, total, p, { totalAmount: round2(sum[0]?.total) }));
}

async function dashboard(_req, res) {
  const monthStart = startOfMonth();
  const [revenue, monthRevenue, paidOut, inPayout, due, onHold, methods, recent, failed, settings] = await Promise.all([
    Order.aggregate([{ $match: REVENUE_MATCH }, { $group: { _id: null, total: { $sum: NET_AMOUNT }, commission: { $sum: payoutService.COMMISSION } } }]),
    Order.aggregate([{ $match: { ...REVENUE_MATCH, createdAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: NET_AMOUNT } } }]),
    Payout.aggregate([{ $match: { status: 'Completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Payout.aggregate([{ $match: { status: { $in: ['Pending', 'Processing', 'Failed'] } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    payoutService.pendingBySeller(),
    payoutService.onHoldAmount(),
    Order.aggregate([{ $match: REVENUE_MATCH }, { $group: { _id: '$paymentMethod', amount: { $sum: NET_AMOUNT }, count: { $sum: 1 } } }]),
    Payment.find().sort({ createdAt: -1 }).limit(10).populate('orderId', 'orderId').populate('sellerId', 'shopName'),
    Payment.countDocuments({ status: 'Failed', createdAt: { $gte: monthStart } }),
    getSettings(),
  ]);
  const dueTotal = round2(due.reduce((s, r) => s + Math.max(r.netAmount, 0), 0));
  const { payoutFrequency } = settings.commissionSettings;
  const next = new Date();
  if (payoutFrequency === 'Daily') next.setDate(next.getDate() + 1);
  else if (payoutFrequency === 'Weekly') next.setDate(next.getDate() + ((8 - next.getDay()) % 7 || 7)); // next Monday
  else next.setMonth(next.getMonth() + 1, 1);

  return ok(res, {
    totalRevenue: round2(revenue[0]?.total),
    totalCommission: round2(revenue[0]?.commission),
    thisMonthRevenue: round2(monthRevenue[0]?.total),
    totalPayoutsGiven: round2(paidOut[0]?.total),
    payoutsInProgress: round2(inPayout[0]?.total),
    payoutsInProgressCount: inPayout[0]?.count || 0,
    dueForPayout: dueTotal,
    sellersDue: due.filter((r) => r.netAmount > 0).length,
    onHoldAmount: onHold,
    pendingPayouts: round2(dueTotal + (inPayout[0]?.total || 0)),
    failedPaymentsThisMonth: failed,
    nextPayoutDate: next,
    payoutFrequency,
    payoutDelayDays: settings.commissionSettings.payoutDelayDays,
    paymentMethodBreakdown: Object.fromEntries(methods.map((m) => [m._id, { amount: round2(m.amount), count: m.count }])),
    recentTransactions: recent,
  });
}

async function listPayouts(req, res) {
  const p = getPagination(req.query);
  const filter = { ...dateRange(req.query) };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.seller) filter.sellerId = oid(req.query.seller);
  if (req.query.search) filter.payoutId = searchRegex(req.query.search);
  const [items, total, sum] = await Promise.all([
    Payout.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('sellerId', 'shopName ownerName').populate('initiatedBy', 'fullName').select('-orderIds -bankDetails.accountNumber'),
    Payout.countDocuments(filter),
    Payout.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);
  return ok(res, paginated(items, total, p, { totalAmount: round2(sum[0]?.total) }));
}

async function pendingPayouts(_req, res) {
  const [rows, settings] = await Promise.all([payoutService.pendingBySeller(), getSettings()]);
  return ok(res, {
    sellers: rows.map(({ orderIds, ...r }) => ({ ...r, orderCount: orderIds.length })),
    totalAmount: round2(rows.reduce((s, r) => s + Math.max(r.netAmount, 0), 0)),
    payoutDelayDays: settings.commissionSettings.payoutDelayDays,
    chargeCommissionOnCash: settings.commissionSettings.chargeCommissionOnCash,
  });
}

async function initiate(req, res) {
  const { created, skipped } = await payoutService.initiatePayouts({ ...req.body, adminId: req.admin._id });
  const totalAmount = round2(created.reduce((s, p) => s + p.amount, 0));
  await audit(req, { action: 'PayoutsInitiated', entityType: 'Payout', details: `${created.length} payouts, ₹${totalAmount}`, newValue: { payoutIds: created.map((p) => p.payoutId) } });
  return ok(res, { payoutIds: created.map((p) => p._id), payouts: created, totalAmount, sellerCount: created.length, skipped }, created.length ? 'Payouts initiated' : 'No payouts created');
}

async function findPayout(id) {
  const payout = mongoose.isValidObjectId(id) ? await Payout.findById(id) : await Payout.findOne({ payoutId: id });
  if (!payout) throw ApiError.notFound('Payout not found');
  return payout;
}

async function getPayout(req, res) {
  const payout = await findPayout(req.params.payoutId);
  await payout.populate([
    { path: 'sellerId', select: 'shopName ownerName mobileNumber email' },
    { path: 'initiatedBy', select: 'fullName' },
    { path: 'orderIds', select: 'orderId finalAmount refundedAmount commissionRate paymentMethod createdAt deliveredAt' },
  ]);
  const data = payout.toJSON();
  if (data.bankDetails?.accountNumber) data.bankDetails.accountNumber = decrypt(data.bankDetails.accountNumber);
  return ok(res, data);
}

async function updatePayoutStatus(req, res) {
  const payout = await findPayout(req.params.payoutId);
  const before = payout.status;
  await payoutService.updatePayoutStatus(payout, { ...req.body, adminId: req.admin._id });
  await audit(req, { action: 'PayoutStatusChanged', entityType: 'Payout', entityId: payout._id, oldValue: { status: before }, newValue: { status: payout.status, transactionRef: payout.transactionRef } });
  return ok(res, payout, 'Payout status updated');
}

async function retry(req, res) {
  const payout = await findPayout(req.params.payoutId);
  await payoutService.retryPayout(payout, req.admin._id);
  await audit(req, { action: 'PayoutRetried', entityType: 'Payout', entityId: payout._id });
  return ok(res, payout, 'Payout retry initiated');
}

async function sellerEarnings(req, res) {
  if (!(await Seller.exists({ _id: req.params.sellerId }))) throw ApiError.notFound('Seller not found');
  return ok(res, await payoutService.sellerEarnings(req.params.sellerId, req.query));
}

/** GET /payouts/on-hold - paid online orders still inside the holding period, per seller */
async function onHoldPayouts(_req, res) {
  return ok(res, await payoutService.onHoldBySeller());
}

module.exports = { listPayments, dashboard, listPayouts, pendingPayouts, onHoldPayouts, initiate, getPayout, updatePayoutStatus, retry, sellerEarnings };
