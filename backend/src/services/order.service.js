const ApiError = require('../utils/ApiError');
const { Product, StockMovement } = require('../models');
const { ORDER_STATUS } = require('../models/constants');
const { refundOrder } = require('./refund.service');
const { notifyUser, notifySeller } = require('./notification.service');

const OPEN_STATUSES = ['Pending', 'Confirmed', 'Packed', 'Shipped'];

/** Puts the items of an order back into stock and logs stock movements. */
async function restock(order, reason, actor) {
  for (const item of order.items) {
    if (!item.productId) continue;
    const product = await Product.findByIdAndUpdate(
      item.productId,
      { $inc: { stock: item.quantity, soldCount: -item.quantity } },
      { returnDocument: 'after' }
    );
    if (product) {
      await StockMovement.create({
        sellerId: order.sellerId,
        productId: product._id,
        change: item.quantity,
        balanceAfter: product.stock,
        reason,
        refType: 'Order',
        refId: order._id,
        byType: actor.byType,
        by: actor.by,
      });
    }
  }
}

function pushHistory(order, status, actor, note) {
  order.statusHistory.push({ status, note, byType: actor.byType, by: actor.by, byName: actor.byName });
}

/**
 * Cancels an open order: restocks items and refunds any money collected.
 */
async function cancelOrder(order, { reason, actor, refund = true, adminId }) {
  if (!OPEN_STATUSES.includes(order.orderStatus)) {
    throw ApiError.badRequest(`Order in "${order.orderStatus}" status cannot be cancelled`);
  }
  order.orderStatus = 'Cancelled';
  order.cancelReason = reason;
  pushHistory(order, 'Cancelled', actor, reason);
  await order.save();
  await restock(order, 'OrderCancelled', actor);

  let refundDoc = null;
  if (refund && ['Completed', 'PartiallyRefunded'].includes(order.paymentStatus)) {
    refundDoc = await refundOrder(order, { reason: `Order cancelled: ${reason}`, adminId });
  } else if (order.paymentStatus === 'Pending') {
    order.paymentStatus = 'Failed';
    await order.save();
  }
  if (order.settlementStatus === 'Unsettled') {
    order.settlementStatus = 'NotApplicable';
    await order.save();
  }

  const msg = `Order ${order.orderId} has been cancelled. Reason: ${reason}`;
  if (order.userId) await notifyUser(order.userId, { title: 'Order cancelled', message: msg, type: 'OrderStatus', data: { orderId: order._id } });
  await notifySeller(order.sellerId, { title: 'Order cancelled', message: msg, type: 'OrderStatus', data: { orderId: order._id } });
  return { order, refund: refundDoc };
}

/**
 * Changes order status. Admins may "force" any transition (except into
 * Cancelled, which must go through cancelOrder so money & stock are handled).
 */
async function changeStatus(order, { status, note, actor, force = false }) {
  if (!ORDER_STATUS.includes(status)) throw ApiError.badRequest('Invalid status');
  if (status === order.orderStatus) throw ApiError.badRequest(`Order is already ${status}`);
  if (status === 'Cancelled') throw ApiError.badRequest('Use the cancel action to cancel an order');
  if (order.orderStatus === 'Cancelled') throw ApiError.badRequest('Cancelled orders cannot be changed');

  const { ORDER_FLOW } = require('../models/constants');
  if (!force && !ORDER_FLOW[order.orderStatus].includes(status)) {
    throw ApiError.badRequest(`Cannot move order from ${order.orderStatus} to ${status}`);
  }

  const previous = order.orderStatus;
  order.orderStatus = status;
  pushHistory(order, status, actor, note);
  if (status === 'Delivered') {
    order.deliveredAt = new Date();
    // Cash on delivery is collected at delivery time
    if (order.paymentMethod === 'Cash' && order.paymentStatus === 'Pending') order.paymentStatus = 'Completed';
  }
  if (status === 'Returned') {
    order.returnReason = note;
    await restock(order, 'Return', actor);
  }
  await order.save();

  const msg = `Order ${order.orderId} status changed from ${previous} to ${status}.`;
  if (order.userId) await notifyUser(order.userId, { title: `Order ${status}`, message: msg, type: 'OrderStatus', data: { orderId: order._id } });
  await notifySeller(order.sellerId, { title: `Order ${status}`, message: msg, type: 'OrderStatus', data: { orderId: order._id } });
  return order;
}

module.exports = { cancelOrder, changeStatus, restock, OPEN_STATUSES };
