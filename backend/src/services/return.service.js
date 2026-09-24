const ApiError = require('../utils/ApiError');
const { generateId } = require('../utils/ids');
const { ReturnRequest } = require('../models');
const { refundOrder } = require('./refund.service');
const { changeStatus } = require('./order.service');
const { notifySeller, notifyUser } = require('./notification.service');
const { round2 } = require('./metrics');

const RETURN_WINDOW_DAYS = 7;

async function requestReturn(user, order, { reason, description, images = [] }) {
  if (order.orderStatus !== 'Delivered') throw ApiError.badRequest('Only delivered orders can be returned');
  if (!order.deliveredAt || Date.now() - order.deliveredAt.getTime() > RETURN_WINDOW_DAYS * 86400000) {
    throw ApiError.badRequest(`Returns are allowed within ${RETURN_WINDOW_DAYS} days of delivery`);
  }
  if (await ReturnRequest.exists({ orderId: order._id, status: { $in: ['Initiated', 'Approved'] } })) throw ApiError.conflict('A return request is already open for this order');
  const rr = await ReturnRequest.create({
    returnId: await generateId('RET'),
    orderId: order._id,
    userId: user._id,
    sellerId: order.sellerId,
    reason,
    description,
    images,
    refundAmount: round2(order.finalAmount - (order.refundedAmount || 0)),
  });
  await notifySeller(order.sellerId, { title: 'Return requested', message: `${order.orderId}: ${reason}`, type: 'Return', link: `/returns`, data: { orderId: order._id, returnId: rr._id } });
  return rr;
}

/** Seller (or admin) approves: refund + mark returned + restock. */
async function approveReturn(rr, order, { refundAmount, note, byType, by, byName, adminId }) {
  if (rr.status !== 'Initiated') throw ApiError.badRequest(`Return is already ${rr.status}`);
  const max = round2(order.finalAmount - (order.refundedAmount || 0));
  const amount = refundAmount === undefined || refundAmount === null ? max : round2(refundAmount);
  if (amount < 0 || amount > max) throw ApiError.badRequest(`Refund must be between 0 and ₹${max}`);
  await changeStatus(order, { status: 'Returned', note: note || rr.reason, actor: { byType, by, byName } });
  if (amount > 0 && ['Completed', 'PartiallyRefunded'].includes(order.paymentStatus)) {
    await refundOrder(order, { amount, reason: `Return ${rr.returnId}: ${rr.reason}`, adminId });
  }
  Object.assign(rr, { status: 'Completed', refundAmount: amount, refundStatus: 'Processed', decidedByType: byType, decidedBy: by, approvalNotes: note, approvedAt: new Date(), completedAt: new Date() });
  await rr.save();
  await notifyUser(rr.userId, { title: 'Return approved', message: `Return for ${order.orderId} approved.${amount ? ` ₹${amount} will be refunded.` : ''}`, type: 'Return', link: `/orders/${order._id}` });
  return rr;
}

async function rejectReturn(rr, order, { note, byType, by }) {
  if (rr.status !== 'Initiated') throw ApiError.badRequest(`Return is already ${rr.status}`);
  Object.assign(rr, { status: 'Rejected', decidedByType: byType, decidedBy: by, approvalNotes: note, approvedAt: new Date() });
  await rr.save();
  await notifyUser(rr.userId, { title: 'Return request declined', message: `${order.orderId}: ${note}`, type: 'Return', link: `/orders/${order._id}` });
  return rr;
}

module.exports = { requestReturn, approveReturn, rejectReturn, RETURN_WINDOW_DAYS };
