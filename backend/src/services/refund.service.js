const ApiError = require('../utils/ApiError');
const { generateId } = require('../utils/ids');
const { Refund, Payment, Seller } = require('../models');
const razorpay = require('./razorpay.service');
const { notifyUser, notifySeller } = require('./notification.service');
const { round2 } = require('./metrics');
const logger = require('../config/logger');

/**
 * Refunds money on an order.
 *  - Online orders with a Razorpay payment are refunded through Razorpay when keys are configured.
 *  - Everything else (cash / no gateway) is recorded as a manual refund.
 * If the seller was already paid for this order, the seller share is recovered from the next payout.
 */
async function refundOrder(order, { amount, reason, adminId, disputeId }) {
  if (!['Completed', 'PartiallyRefunded'].includes(order.paymentStatus)) {
    throw ApiError.badRequest('Only paid orders can be refunded');
  }
  const refundable = round2(order.finalAmount - (order.refundedAmount || 0));
  const value = round2(amount === undefined || amount === null ? refundable : amount);
  if (value <= 0) throw ApiError.badRequest('Refund amount must be greater than 0');
  if (value > refundable) throw ApiError.badRequest(`Maximum refundable amount is ₹${refundable}`);

  const refund = new Refund({
    refundId: await generateId('RFD'),
    orderId: order._id,
    sellerId: order.sellerId,
    userId: order.userId,
    disputeId,
    amount: value,
    reason,
    initiatedBy: adminId,
    method: 'Manual',
    status: 'Processed',
    processedAt: new Date(),
  });

  if (order.paymentMethod === 'Online' && order.source !== 'POS' && order.razorpayPaymentId && razorpay.isConfigured()) {
    refund.method = 'Razorpay';
    try {
      const rp = await razorpay.refundPayment(order.razorpayPaymentId, value, { orderId: order.orderId, reason });
      refund.razorpayRefundId = rp.id;
      refund.status = rp.status === 'processed' ? 'Processed' : 'Pending';
    } catch (err) {
      logger.error(`Razorpay refund failed for ${order.orderId}: ${err.message || err.error?.description}`);
      refund.status = 'Failed';
      refund.failureReason = err.error?.description || err.message;
      await refund.save();
      throw ApiError.badRequest(`Refund failed at payment gateway: ${refund.failureReason}`);
    }
  }
  await refund.save();

  await Payment.create({
    transactionId: await generateId('TXN'),
    orderId: order._id,
    userId: order.userId,
    sellerId: order.sellerId,
    type: 'Refund',
    amount: value,
    method: order.paymentMethod,
    gateway: refund.method === 'Razorpay' ? 'Razorpay' : 'Manual',
    status: refund.status === 'Failed' ? 'Failed' : 'Success',
    paidAt: new Date(),
  });

  order.refundedAmount = round2((order.refundedAmount || 0) + value);
  order.paymentStatus = order.refundedAmount >= order.finalAmount ? 'Refunded' : 'PartiallyRefunded';

  if (['Settled', 'InPayout'].includes(order.settlementStatus)) {
    // Seller already received (or is about to receive) their share; recover it next time.
    const sellerShare = round2(value * (1 - (order.commissionRate || 0) / 100));
    await Seller.updateOne({ _id: order.sellerId }, { $inc: { pendingDeduction: sellerShare } });
  }
  await order.save();

  if (order.userId) {
    await notifyUser(order.userId, { title: 'Refund initiated', message: `₹${value} refund for order ${order.orderId} has been initiated.`, type: 'Refund', data: { orderId: order._id } });
  }
  await notifySeller(order.sellerId, { title: 'Refund on your order', message: `₹${value} refunded on order ${order.orderId}. Reason: ${reason || '-'}`, type: 'Refund', data: { orderId: order._id } });

  return refund;
}

module.exports = { refundOrder };
