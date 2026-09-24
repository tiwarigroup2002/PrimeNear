const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { generateId } = require('../utils/ids');
const { Order, Payout, Seller } = require('../models');
const { getSettings } = require('./settings.service');
const { notifySeller } = require('./notification.service');
const { REVENUE_MATCH, NET_AMOUNT, round2, addDays } = require('./metrics');

const COMMISSION = { $divide: [{ $multiply: [NET_AMOUNT, { $ifNull: ['$commissionRate', 0] }] }, 100] };

// Money collected by the platform (Razorpay on the user app). Everything else -
// cash, COD and seller bills (POS) paid in cash or directly to the seller's UPI -
// is already with the seller.
const PLATFORM_COLLECTED = { paymentMethod: 'Online', source: { $ne: 'POS' } };
const IS_PLATFORM_COLLECTED = { $and: [{ $eq: ['$paymentMethod', 'Online'] }, { $ne: ['$source', 'POS'] }] };

/**
 * Settlement rules
 *  - Online orders: money is in the admin account. After delivery + payoutDelayDays
 *    the seller gets (order value - refunds - commission).
 *  - Cash orders (seller bill / COD): the seller already has the money. When
 *    "chargeCommissionOnCash" is on, that commission is deducted from the payout.
 *  - seller.pendingDeduction (refunds on already-paid orders) is also deducted.
 */
async function eligibleMatch(extra = {}) {
  const settings = await getSettings();
  const { payoutDelayDays, chargeCommissionOnCash } = settings.commissionSettings;
  const cutoff = addDays(new Date(), -payoutDelayDays);
  const or = [{ ...PLATFORM_COLLECTED, orderStatus: 'Delivered', deliveredAt: { $lte: cutoff } }];
  if (chargeCommissionOnCash) or.push({ paymentMethod: 'Cash' }, { source: 'POS' });
  return { match: { settlementStatus: 'Unsettled', ...REVENUE_MATCH, ...extra, $or: or }, cutoff, payoutDelayDays };
}

function groupStage() {
  const isOnline = IS_PLATFORM_COLLECTED;
  return {
    $group: {
      _id: '$sellerId',
      onlineOrders: { $sum: { $cond: [isOnline, 1, 0] } },
      cashOrders: { $sum: { $cond: [isOnline, 0, 1] } },
      grossAmount: { $sum: { $cond: [isOnline, NET_AMOUNT, 0] } },
      commissionAmount: { $sum: { $cond: [isOnline, COMMISSION, 0] } },
      cashCommission: { $sum: { $cond: [isOnline, 0, COMMISSION] } },
      orderIds: { $push: '$_id' },
    },
  };
}

function shape(row, seller) {
  const pendingDeduction = round2(seller?.pendingDeduction || 0);
  const grossAmount = round2(row.grossAmount);
  const commissionAmount = round2(row.commissionAmount);
  const cashCommission = round2(row.cashCommission);
  return {
    sellerId: row._id,
    onlineOrders: row.onlineOrders,
    cashOrders: row.cashOrders,
    grossAmount,
    commissionAmount,
    cashCommission,
    pendingDeduction,
    netAmount: round2(grossAmount - commissionAmount - cashCommission - pendingDeduction),
    orderIds: row.orderIds,
  };
}

/** Amounts currently due to each seller (optionally a subset). */
async function pendingBySeller(sellerIds) {
  const extra = sellerIds ? { sellerId: { $in: sellerIds.map((id) => new mongoose.Types.ObjectId(String(id))) } } : {};
  const { match } = await eligibleMatch(extra);
  const rows = await Order.aggregate([{ $match: match }, groupStage()]);
  const sellers = await Seller.find({ _id: { $in: rows.map((r) => r._id) } }).select('shopName ownerName mobileNumber bankDetails upiId pendingDeduction status');
  const byId = Object.fromEntries(sellers.map((s) => [String(s._id), s]));
  return rows
    .map((r) => {
      const seller = byId[String(r._id)];
      return {
        ...shape(r, seller),
        seller: seller ? { _id: seller._id, shopName: seller.shopName, ownerName: seller.ownerName, mobileNumber: seller.mobileNumber, status: seller.status, hasBankDetails: Boolean(seller.bankDetails?.accountNumber) || Boolean(seller.upiId) } : null,
      };
    })
    .sort((a, b) => b.netAmount - a.netAmount);
}

/** Online, delivered money still inside the holding period. */
async function onHoldAmount(sellerId) {
  const settings = await getSettings();
  const cutoff = addDays(new Date(), -settings.commissionSettings.payoutDelayDays);
  const match = {
    settlementStatus: 'Unsettled',
    ...REVENUE_MATCH,
    ...PLATFORM_COLLECTED,
    $or: [{ orderStatus: { $ne: 'Delivered' } }, { deliveredAt: { $gt: cutoff } }],
  };
  if (sellerId) match.sellerId = new mongoose.Types.ObjectId(String(sellerId));
  const [row] = await Order.aggregate([{ $match: match }, { $group: { _id: null, amount: { $sum: { $subtract: [NET_AMOUNT, COMMISSION] } } } }]);
  return round2(row?.amount);
}

/** Creates one payout per seller for everything currently due. */
async function initiatePayouts({ sellerIds, payoutDate, notes, adminId }) {
  const due = await pendingBySeller(sellerIds && sellerIds.length ? sellerIds : null);
  const created = [];
  const skipped = [];
  for (const row of due) {
    if (!row.seller || row.seller.status === 'Deleted') {
      skipped.push({ sellerId: row.sellerId, reason: 'Seller not found' });
      continue;
    }
    if (row.netAmount <= 0) {
      skipped.push({ sellerId: row.sellerId, shopName: row.seller.shopName, reason: 'Nothing payable after deductions' });
      continue;
    }
    const seller = await Seller.findById(row.sellerId);
    if (!seller.bankDetails?.accountNumber && !seller.upiId) {
      skipped.push({ sellerId: row.sellerId, shopName: seller.shopName, reason: 'Bank details / UPI missing' });
      continue;
    }
    const payout = await Payout.create({
      payoutId: await generateId('PAYOUT'),
      sellerId: seller._id,
      orderIds: row.orderIds,
      grossAmount: row.grossAmount,
      commissionAmount: row.commissionAmount,
      cashCommissionDeducted: row.cashCommission,
      refundDeducted: row.pendingDeduction,
      amount: row.netAmount,
      payoutMethod: seller.bankDetails?.accountNumber ? 'BankTransfer' : 'UPI',
      bankDetails: seller.bankDetails?.toObject ? seller.bankDetails.toObject() : seller.bankDetails,
      upiId: seller.upiId,
      status: 'Pending',
      payoutDate: payoutDate || new Date(),
      initiatedBy: adminId,
      notes,
      statusHistory: [{ status: 'Pending', by: adminId, note: 'Payout initiated' }],
    });
    await Order.updateMany({ _id: { $in: row.orderIds } }, { settlementStatus: 'InPayout', payoutId: payout._id });
    if (row.pendingDeduction) await Seller.updateOne({ _id: seller._id }, { $inc: { pendingDeduction: -row.pendingDeduction } });
    created.push(payout);
  }
  return { created, skipped };
}

/** Releases the orders of a payout so they can be paid again later. */
async function releasePayout(payout) {
  await Order.updateMany({ payoutId: payout._id }, { settlementStatus: 'Unsettled', $unset: { payoutId: 1 } });
  if (payout.refundDeducted) await Seller.updateOne({ _id: payout.sellerId }, { $inc: { pendingDeduction: payout.refundDeducted } });
}

const TRANSITIONS = {
  Pending: ['Processing', 'Completed', 'Failed', 'Rejected'],
  Processing: ['Completed', 'Failed'],
  Failed: ['Pending', 'Rejected'],
  Completed: [],
  Rejected: [],
};

async function updatePayoutStatus(payout, { status, notes, transactionRef, failureReason, adminId }) {
  if (!TRANSITIONS[payout.status].includes(status)) {
    throw ApiError.badRequest(`Cannot change payout from ${payout.status} to ${status}`);
  }
  if (status === 'Completed' && !transactionRef && !payout.transactionRef) {
    throw ApiError.badRequest('Transaction reference (UTR) is required to mark a payout completed');
  }
  payout.status = status;
  if (transactionRef) payout.transactionRef = transactionRef;
  if (notes) payout.notes = notes;
  if (status === 'Failed') payout.failureReason = failureReason || notes;
  if (status === 'Completed') payout.completedAt = new Date();
  payout.statusHistory.push({ status, by: adminId, note: notes || failureReason });
  await payout.save();

  if (status === 'Completed') {
    await Order.updateMany({ payoutId: payout._id }, { settlementStatus: 'Settled' });
    await notifySeller(payout.sellerId, { title: 'Payout completed', message: `₹${payout.amount} has been transferred to your account (Ref: ${payout.transactionRef}).`, type: 'Payout', data: { payoutId: payout._id } });
  }
  if (status === 'Rejected') await releasePayout(payout);
  if (status === 'Failed') {
    await notifySeller(payout.sellerId, { title: 'Payout failed', message: `Payout ${payout.payoutId} of ₹${payout.amount} failed. We will retry soon.`, type: 'Payout', data: { payoutId: payout._id } });
  }
  return payout;
}

async function retryPayout(payout, adminId) {
  if (payout.status !== 'Failed') throw ApiError.badRequest('Only failed payouts can be retried');
  payout.status = 'Pending';
  payout.retryCount += 1;
  payout.failureReason = undefined;
  payout.statusHistory.push({ status: 'Pending', by: adminId, note: `Retry #${payout.retryCount}` });
  await payout.save();
  return payout;
}

/** Earnings overview for one seller. */
async function sellerEarnings(sellerId, { from, to } = {}) {
  const sid = new mongoose.Types.ObjectId(String(sellerId));
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  const dateMatch = Object.keys(range).length ? { createdAt: range } : {};

  const [totals, monthly, paid, inPayout, due, onHold, seller] = await Promise.all([
    Order.aggregate([
      { $match: { sellerId: sid, ...REVENUE_MATCH, ...dateMatch } },
      { $group: { _id: null, earnings: { $sum: NET_AMOUNT }, commission: { $sum: COMMISSION } } },
    ]),
    Order.aggregate([
      { $match: { sellerId: sid, ...REVENUE_MATCH, ...dateMatch } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'Asia/Kolkata' } }, amount: { $sum: NET_AMOUNT }, commission: { $sum: COMMISSION } } },
      { $sort: { _id: 1 } },
    ]),
    Payout.aggregate([{ $match: { sellerId: sid, status: 'Completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Payout.aggregate([{ $match: { sellerId: sid, status: { $in: ['Pending', 'Processing', 'Failed'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    pendingBySeller([sid]),
    onHoldAmount(sid),
    Seller.findById(sid).select('pendingDeduction'),
  ]);

  return {
    totalEarnings: round2(totals[0]?.earnings),
    totalCommission: round2(totals[0]?.commission),
    totalPaid: round2(paid[0]?.total),
    totalPending: round2(inPayout[0]?.total), // payouts created but not completed
    pendingAmount: round2(due[0]?.netAmount), // due now, payout not created yet
    onHoldAmount: onHold, // online orders still inside the holding period
    pendingDeduction: round2(seller?.pendingDeduction),
    eachMonthEarnings: monthly.map((m) => ({ month: m._id, amount: round2(m.amount), commission: round2(m.commission) })),
  };
}

module.exports = { PLATFORM_COLLECTED, pendingBySeller, onHoldAmount, initiatePayouts, updatePayoutStatus, retryPayout, sellerEarnings, COMMISSION };
