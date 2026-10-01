const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { generateId } = require('../utils/ids');
const config = require('../config');
const logger = require('../config/logger');
const { Order, Payment, Customer, Cart, Product } = require('../models');
const { loadCart } = require('./cart.service');
const { takeStock } = require('./stock.service');
const { restock } = require('./order.service');
const { commissionRateFor } = require('./settings.service');
const { requireLinkedSeller, assertShopInReach } = require('./shop-access.service');
const { notifySeller, notifyUser } = require('./notification.service');
const razorpay = require('./razorpay.service');
const { round2 } = require('./metrics');

const PAYMENT_WINDOW_MIN = 30;

/** Online orders that are not paid yet are hidden from sellers. */
const VISIBLE_TO_SELLER = { $nor: [{ source: 'Online', paymentMethod: 'Online', paymentStatus: { $in: ['Pending', 'Failed'] } }] };

function mockPaymentsAllowed() {
  return !config.isProd && !razorpay.isConfigured();
}

async function announceNewOrder(order, user) {
  await notifySeller(order.sellerId, {
    title: `New order! ${order.orderId}`,
    message: `₹${order.finalAmount} - ${user.name || user.mobileNumber} (${order.paymentMethod === 'Cash' ? 'Cash on delivery' : 'Paid online'})`,
    type: 'OrderStatus',
    link: `/orders/${order._id}`,
    data: { orderId: order._id },
  });
  await notifyUser(order.userId, {
    title: order.paymentMethod === 'Cash' ? '📦 Order placed!' : '✅ Payment successful!',
    message: `Order ${order.orderId} of ₹${order.finalAmount} placed. The shop will confirm it soon.`,
    type: 'OrderStatus',
    link: `/orders/${order._id}`,
    data: { orderId: order._id },
  });
  await Customer.updateOne({ sellerId: order.sellerId, userId: order.userId }, { $inc: { totalOrders: 1, totalSpent: order.finalAmount }, lastPurchaseDate: new Date() });
}

/**
 * Places an order from the user's cart.
 * Cash (COD): order is visible to the seller immediately.
 * Online: a Razorpay order is created; the order waits for payment (30 min) with stock reserved.
 */
async function placeOrder(user, { addressId, deliveryType = 'Delivery', paymentMethod, notes }) {
  const data = await loadCart(user._id, deliveryType);
  if (!data.items.length) throw ApiError.badRequest('Your cart is empty');
  if (!data.canCheckout) throw ApiError.badRequest('Some items in your cart are not available. Please review your cart.');
  const { seller } = await requireLinkedSeller(user._id, data.sellerId);
  await assertShopInReach(user, seller._id);
  const opts = data.options;

  if (deliveryType === 'Delivery' && !opts.delivery) throw ApiError.badRequest(`${seller.shopName} does not deliver. Choose store pickup.`);
  if (paymentMethod === 'Cash' && !opts.cod) throw ApiError.badRequest('Cash on delivery is not available for this shop');
  if (paymentMethod === 'Online' && !opts.online) throw ApiError.badRequest('Online payment is not available right now');
  if (paymentMethod === 'Online' && !razorpay.isConfigured() && !mockPaymentsAllowed()) throw ApiError.badRequest('Online payment is not configured');

  let address = null;
  if (deliveryType === 'Delivery') {
    address = user.addresses.id(addressId) || (!addressId && user.addresses.find((a) => a.isDefault));
    if (!address) throw ApiError.badRequest('Please select a delivery address');
  }

  const products = await Product.find({ _id: { $in: data.items.map((i) => i.productId) } });
  const lines = data.items.map((i) => ({ productId: i.productId, productName: i.name, image: i.image, quantity: i.quantity, price: i.price, gstRate: i.gstRate, gst: i.gstAmount, subtotal: i.lineTotal }));
  const rate = await commissionRateFor(seller);
  const finalAmount = data.totals.total;
  const link = await Customer.findOne({ sellerId: seller._id, userId: user._id });
  const orderObjectId = new mongoose.Types.ObjectId();

  await takeStock(
    seller._id,
    lines.map((l) => ({ product: products.find((p) => String(p._id) === String(l.productId)), quantity: l.quantity })),
    { reason: 'OnlineOrder', refType: 'Order', refId: orderObjectId, byType: 'System' }
  );

  const order = new Order({
    _id: orderObjectId,
    orderId: await generateId('ORD'),
    source: 'Online',
    sellerId: seller._id,
    userId: user._id,
    customerId: link?._id,
    customerSnapshot: { name: user.name || link?.name, mobileNumber: user.mobileNumber },
    items: lines,
    deliveryType,
    deliveryAddress: address ? { name: address.name || user.name, fullAddress: address.fullAddress, city: address.city, state: address.state, zipCode: address.zipCode, phoneNumber: address.phoneNumber || user.mobileNumber, latitude: address.latitude, longitude: address.longitude } : undefined,
    subtotal: data.totals.subtotal,
    gstAmount: data.totals.gst,
    deliveryCharge: data.totals.deliveryCharge,
    finalAmount,
    paymentMethod,
    paymentStatus: 'Pending',
    orderStatus: 'Pending',
    statusHistory: [{ status: 'Pending', byType: 'User', by: user._id, byName: user.name, note: paymentMethod === 'Cash' ? 'Cash on delivery' : 'Waiting for payment' }],
    customerNote: notes,
    commissionRate: rate,
    commissionAmount: round2((finalAmount * rate) / 100),
    sellerEarning: round2(finalAmount - (finalAmount * rate) / 100),
    settlementStatus: 'Unsettled',
    paymentExpiresAt: paymentMethod === 'Online' ? new Date(Date.now() + PAYMENT_WINDOW_MIN * 60000) : undefined,
  });

  let payment = null;
  if (paymentMethod === 'Online') {
    if (razorpay.isConfigured()) {
      try {
        const rz = await razorpay.createOrder(finalAmount, order.orderId, { orderId: order.orderId });
        order.razorpayOrderId = rz.id;
      } catch (err) {
        await restock({ ...order.toObject(), items: lines }, 'OrderCancelled', { byType: 'System' });
        logger.error(`Razorpay order failed: ${err.message || err.error?.description}`);
        throw ApiError.badRequest('Could not start the payment. Please try again.');
      }
      payment = { gateway: 'razorpay', keyId: razorpay.keyId(), razorpayOrderId: order.razorpayOrderId, amount: Math.round(finalAmount * 100), currency: 'INR' };
    } else {
      order.razorpayOrderId = `mock_${order.orderId}`;
      payment = { gateway: 'mock', razorpayOrderId: order.razorpayOrderId, amount: Math.round(finalAmount * 100), currency: 'INR' };
    }
  }
  await order.save();
  await Cart.updateOne({ userId: user._id }, { items: [] });
  if (paymentMethod === 'Cash') await announceNewOrder(order, user);
  return { order, payment };
}

/** Marks an online order as paid (from Checkout callback or webhook). Idempotent. */
async function confirmPayment(order, { razorpayPaymentId, gatewayMethod }) {
  if (order.paymentStatus === 'Completed') return order;
  if (order.orderStatus === 'Cancelled') throw ApiError.badRequest('This order was cancelled because payment was not completed in time. Any amount deducted will be refunded.');
  order.paymentStatus = 'Completed';
  order.razorpayPaymentId = razorpayPaymentId;
  order.paymentExpiresAt = undefined;
  order.statusHistory.push({ status: 'Pending', byType: 'System', note: 'Payment received' });
  await order.save();
  await Payment.create({
    transactionId: await generateId('TXN'),
    orderId: order._id,
    userId: order.userId,
    sellerId: order.sellerId,
    type: 'Payment',
    amount: order.finalAmount,
    method: 'Online',
    gateway: razorpayPaymentId?.startsWith('mock_') ? 'Mock' : 'Razorpay',
    gatewayMethod,
    razorpayOrderId: order.razorpayOrderId,
    razorpayPaymentId,
    status: 'Success',
    paidAt: new Date(),
  });
  const user = await require('../models').User.findById(order.userId);
  await announceNewOrder(order, user);
  return order;
}

/** Payment failed / abandoned: release stock and cancel. */
async function failPayment(order, reason = 'Payment failed') {
  if (order.paymentStatus !== 'Pending' || order.orderStatus === 'Cancelled') return order;
  order.paymentStatus = 'Failed';
  order.orderStatus = 'Cancelled';
  order.cancelReason = reason;
  order.settlementStatus = 'NotApplicable';
  order.statusHistory.push({ status: 'Cancelled', byType: 'System', note: reason });
  await order.save();
  await restock(order, 'OrderCancelled', { byType: 'System' });
  await Payment.create({ transactionId: await generateId('TXN'), orderId: order._id, userId: order.userId, sellerId: order.sellerId, type: 'Payment', amount: order.finalAmount, method: 'Online', status: 'Failed', failureReason: reason, razorpayOrderId: order.razorpayOrderId });
  return order;
}

/** Scheduler: cancels online orders whose payment window has passed. */
async function expireUnpaidOrders() {
  const stale = await Order.find({ source: 'Online', paymentMethod: 'Online', paymentStatus: 'Pending', orderStatus: 'Pending', paymentExpiresAt: { $lte: new Date() } }).limit(200);
  for (const o of stale) await failPayment(o, 'Payment not completed in time');
  return stale.length;
}

module.exports = { placeOrder, confirmPayment, failPayment, expireUnpaidOrders, mockPaymentsAllowed, VISIBLE_TO_SELLER, PAYMENT_WINDOW_MIN };
