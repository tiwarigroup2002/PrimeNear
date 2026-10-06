const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/respond');
const { getPagination, paginated } = require('../../utils/pagination');
const { generateId } = require('../../utils/ids');
const { fileUrl } = require('../../middleware/upload');
const { Product, Cart, Order, Payment, Review, Invoice, ReturnRequest, Dispute, Seller } = require('../../models');
const { loadCart, setItem } = require('../../services/cart.service');
const { requireLinkedSeller, checkDeliveryArea } = require('../../services/shop-access.service');
const checkout = require('../../services/checkout.service');
const razorpay = require('../../services/razorpay.service');
const { cancelOrder } = require('../../services/order.service');
const { requestReturn, RETURN_WINDOW_DAYS } = require('../../services/return.service');
const { refreshRatings } = require('../../services/rating.service');
const { ensureInvoice, invoicePdf, showGstin } = require('../../services/invoice.service');
const { notifySeller, notifyAdmins } = require('../../services/notification.service');
const { round2 } = require('../../services/metrics');

// ---------- Cart ----------
function cartView(data) {
  const { cart, ...rest } = data;
  return rest;
}

async function getCart(req, res) {
  return ok(res, cartView(await loadCart(req.userId, req.query.deliveryType)));
}

async function addItem(req, res) {
  const product = await Product.findOne({ _id: req.body.productId, isDeleted: false });
  if (!product) throw ApiError.notFound('Product not found');
  await requireLinkedSeller(req.userId, product.sellerId);
  const before = await Cart.findOne({ userId: req.userId });
  const cleared = Boolean(before?.items.length && String(before.sellerId) !== String(product.sellerId));
  await setItem(req.userId, product.sellerId, product, req.body.quantity || 1, { add: true });
  if (String(req.user.currentActiveSellerId) !== String(product.sellerId)) {
    req.user.currentActiveSellerId = product.sellerId;
    await req.user.save();
  }
  const data = await loadCart(req.userId);
  return ok(res, { ...cartView(data), cartCleared: cleared }, cleared ? 'Cart had items from another shop and was cleared' : 'Added to cart');
}

async function updateItem(req, res) {
  const cart = await Cart.findOne({ userId: req.userId });
  if (!cart?.items.some((i) => String(i.productId) === String(req.body.productId))) throw ApiError.notFound('Item not in cart');
  const product = await Product.findById(req.body.productId);
  await setItem(req.userId, cart.sellerId, product, req.body.quantity);
  return ok(res, cartView(await loadCart(req.userId)));
}

async function removeItem(req, res) {
  await Cart.updateOne({ userId: req.userId }, { $pull: { items: { productId: req.params.productId } } });
  return ok(res, cartView(await loadCart(req.userId)), 'Item removed');
}

async function clearCart(req, res) {
  await Cart.updateOne({ userId: req.userId }, { items: [] });
  return ok(res, cartView(await loadCart(req.userId)), 'Cart cleared');
}

// ---------- Checkout & payment ----------
/** POST /orders/check-delivery { addressId } - is this address inside the active cart shop's delivery area? */
async function checkDelivery(req, res) {
  const cart = await Cart.findOne({ userId: req.userId });
  const sellerId = cart?.items.length ? cart.sellerId : req.user.currentActiveSellerId;
  if (!sellerId) throw ApiError.badRequest('Your cart is empty');
  const { seller } = await requireLinkedSeller(req.userId, sellerId);
  const address = req.user.addresses.id(req.body.addressId);
  if (!address) throw ApiError.notFound('Address not found');
  return ok(res, await checkDeliveryArea(seller, address));
}

async function deliveryCodeOf(order) {
  const doc = await Order.findById(order._id).select('+deliveryOtp');
  return doc?.deliveryOtp?.code || null;
}

async function createOrder(req, res) {
  const { order, payment } = await checkout.placeOrder(req.user, { ...req.body, addressId: req.body.addressId || req.body.deliveryAddressId });
  return created(res, { orderId: order._id, order, payment, razorpayOrderId: order.razorpayOrderId }, order.paymentMethod === 'Cash' ? 'Order placed successfully' : 'Complete the payment');
}

async function findMyOrder(req, id = req.params.orderId) {
  const q = mongoose.isValidObjectId(id) ? { _id: id } : { orderId: id };
  const order = await Order.findOne({ ...q, userId: req.userId });
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

/** POST /orders/verify-payment { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } | { orderId, mock: true } */
async function verifyPayment(req, res) {
  const order = await findMyOrder(req, req.body.orderId);
  if (order.paymentMethod !== 'Online') throw ApiError.badRequest('This order is not an online payment');
  if (req.body.mock) {
    if (!checkout.mockPaymentsAllowed()) throw ApiError.badRequest('Test payments are disabled');
    await checkout.confirmPayment(order, { razorpayPaymentId: `mock_pay_${Date.now()}`, gatewayMethod: 'test' });
  } else {
    if (req.body.razorpayOrderId !== order.razorpayOrderId || !razorpay.verifyPaymentSignature(order.razorpayOrderId, req.body.razorpayPaymentId, req.body.razorpaySignature)) {
      throw ApiError.badRequest('Payment verification failed. If money was deducted it will be refunded automatically.');
    }
    await checkout.confirmPayment(order, { razorpayPaymentId: req.body.razorpayPaymentId, gatewayMethod: req.body.method });
  }
  return ok(res, { orderId: order._id, orderStatus: order.orderStatus, paymentStatus: order.paymentStatus }, 'Payment successful');
}

/** POST /orders/:id/payment-failed - user closed / failed checkout */
async function paymentFailed(req, res) {
  const order = await findMyOrder(req);
  await checkout.failPayment(order, req.body.reason || 'Payment cancelled by user');
  return ok(res, order, 'Payment not completed. The order was cancelled.');
}

/** POST /orders/:id/retry-payment - new Razorpay order while the window is open */
async function retryPayment(req, res) {
  const order = await findMyOrder(req);
  if (order.paymentMethod !== 'Online' || order.paymentStatus !== 'Pending' || order.orderStatus !== 'Pending') throw ApiError.badRequest('Nothing to pay for this order');
  if (order.paymentExpiresAt && order.paymentExpiresAt < new Date()) throw ApiError.badRequest('Payment time is over for this order');
  if (razorpay.isConfigured()) {
    const rz = await razorpay.createOrder(order.finalAmount, order.orderId, { orderId: order.orderId });
    order.razorpayOrderId = rz.id;
    await order.save();
    return ok(res, { gateway: 'razorpay', keyId: razorpay.keyId(), razorpayOrderId: rz.id, amount: Math.round(order.finalAmount * 100), currency: 'INR' });
  }
  return ok(res, { gateway: 'mock', razorpayOrderId: order.razorpayOrderId, amount: Math.round(order.finalAmount * 100), currency: 'INR' });
}

// ---------- Orders ----------
async function listOrders(req, res) {
  const p = getPagination(req.query, 10);
  const filter = { userId: req.userId, source: 'Online' };
  const tab = req.query.status;
  if (tab === 'active') filter.orderStatus = { $in: ['Pending', 'Confirmed', 'Packed', 'Shipped'] };
  else if (tab === 'completed') filter.orderStatus = { $in: ['Delivered', 'Returned'] };
  else if (tab === 'cancelled') filter.orderStatus = 'Cancelled';
  else if (tab === 'store') filter.source = 'POS'; // bills made at the shop counter
  if (req.query.includeStore === 'true') delete filter.source; // counter bills too
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('sellerId', 'shopName shopImage').select('-notes -statusHistory'),
    Order.countDocuments(filter),
  ]);
  return ok(res, paginated(items, total, p));
}

async function getOrder(req, res) {
  const order = await findMyOrder(req);
  await order.populate([{ path: 'sellerId', select: 'shopName shopImage mobileNumber shopAddress' }, { path: 'invoiceId', select: 'invoiceId' }]);
  const [payments, reviews, ret] = await Promise.all([
    Payment.find({ orderId: order._id }).sort({ createdAt: 1 }).select('type amount method gatewayMethod status createdAt transactionId'),
    Review.find({ orderId: order._id, userId: req.userId }),
    ReturnRequest.findOne({ orderId: order._id }).sort({ createdAt: -1 }),
  ]);
  const o = order.toJSON();
  delete o.notes; // internal seller notes
  delete o.commissionRate;
  delete o.commissionAmount;
  delete o.sellerEarning;
  const returnDeadline = order.deliveredAt ? new Date(order.deliveredAt.getTime() + RETURN_WINDOW_DAYS * 86400000) : null;
  return ok(res, {
    order: o,
    payments,
    reviews,
    returnRequest: ret,
    canCancel: ['Pending', 'Confirmed'].includes(order.orderStatus) && !(order.paymentMethod === 'Online' && order.paymentStatus === 'Pending'),
    canPay: order.paymentMethod === 'Online' && order.paymentStatus === 'Pending' && order.orderStatus === 'Pending',
    canReturn: order.orderStatus === 'Delivered' && returnDeadline > new Date() && (!ret || ret.status === 'Rejected'),
    canReview: order.orderStatus === 'Delivered',
    returnDeadline,
    // Shown to the customer only; they read it out to the shop at handover
    deliveryCode: ['Confirmed', 'Packed', 'Shipped'].includes(order.orderStatus) ? await deliveryCodeOf(order) : null,
  });
}

async function cancel(req, res) {
  const order = await findMyOrder(req);
  if (!['Pending', 'Confirmed'].includes(order.orderStatus)) throw ApiError.badRequest('This order can no longer be cancelled. Contact the shop.');
  if (order.paymentMethod === 'Online' && order.paymentStatus === 'Pending') {
    await checkout.failPayment(order, 'Cancelled by customer before payment');
    return ok(res, { order }, 'Order cancelled');
  }
  const result = await cancelOrder(order, { reason: req.body.reason, actor: { byType: 'User', by: req.userId, byName: req.user.name } });
  return ok(res, result, result.refund ? `Order cancelled. ₹${result.refund.amount} will be refunded.` : 'Order cancelled');
}

async function track(req, res) {
  const order = await findMyOrder(req);
  const flow = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered'];
  const timeline = flow.map((s) => {
    const h = [...order.statusHistory].reverse().find((x) => x.status === s);
    return { event: s, done: Boolean(h), at: h?.at, description: h?.note };
  });
  return ok(res, { status: order.orderStatus, timeline, deliveryType: order.deliveryType, deliveredAt: order.deliveredAt });
}

/** POST /orders/:id/reorder - puts the same items (that are still available) in the cart */
async function reorder(req, res) {
  const order = await findMyOrder(req);
  await requireLinkedSeller(req.userId, order.sellerId);
  const skipped = [];
  for (const it of order.items) {
    const p = await Product.findOne({ _id: it.productId, isDeleted: false, isActive: true });
    if (!p || p.stock <= 0) {
      skipped.push(it.productName);
      continue;
    }
    await setItem(req.userId, order.sellerId, p, Math.min(it.quantity, p.stock), { add: true });
  }
  req.user.currentActiveSellerId = order.sellerId;
  await req.user.save();
  return ok(res, { ...cartView(await loadCart(req.userId)), skipped }, skipped.length ? `Added to cart. Not available: ${skipped.join(', ')}` : 'Items added to cart');
}

async function returnRequest(req, res) {
  const order = await findMyOrder(req);
  const images = (req.files || []).map((f) => fileUrl('returns', f.filename));
  const rr = await requestReturn(req.user, order, { ...req.body, images });
  return created(res, { returnId: rr._id, returnRequest: rr }, 'Return request submitted');
}

async function returnStatus(req, res) {
  const order = await findMyOrder(req);
  const rr = await ReturnRequest.findOne({ orderId: order._id }).sort({ createdAt: -1 });
  if (!rr) throw ApiError.notFound('No return request for this order');
  return ok(res, { status: rr.status, refundAmount: rr.refundAmount, refundStatus: rr.refundStatus, notes: rr.approvalNotes, returnRequest: rr });
}

// ---------- Reviews ----------
/** POST /reviews { orderId, seller: {rating, reviewText}, products: [{productId, rating, reviewText}] } */
async function submitReviews(req, res) {
  const order = await findMyOrder(req, req.body.orderId);
  if (order.orderStatus !== 'Delivered') throw ApiError.badRequest('You can rate after the order is delivered');
  const images = (req.files || []).map((f) => fileUrl('reviews', f.filename));
  const saved = [];
  const upsert = async (filter, data) => {
    const r = await Review.findOneAndUpdate(filter, { $set: data, $setOnInsert: { userId: req.userId, orderId: order._id, sellerId: order.sellerId } }, { upsert: true, returnDocument: 'after' });
    saved.push(r);
  };
  const body = typeof req.body.payload === 'string' ? JSON.parse(req.body.payload) : req.body;
  if (body.seller?.rating) {
    await upsert({ orderId: order._id, userId: req.userId, ratingType: 'Seller' }, { ratingType: 'Seller', rating: body.seller.rating, reviewText: body.seller.reviewText, images });
  }
  const orderProducts = new Set(order.items.map((i) => String(i.productId)));
  for (const pr of body.products || []) {
    if (!pr.rating || !orderProducts.has(String(pr.productId))) continue;
    await upsert({ orderId: order._id, userId: req.userId, ratingType: 'Product', productId: pr.productId }, { ratingType: 'Product', productId: pr.productId, rating: pr.rating, reviewText: pr.reviewText });
    await refreshRatings({ productId: pr.productId });
  }
  if (!saved.length) throw ApiError.badRequest('Give at least one star rating');
  await refreshRatings({ sellerId: order.sellerId });
  order.isRated = true;
  await order.save();
  await notifySeller(order.sellerId, { title: 'New review ⭐', message: `${req.user.name || 'A customer'} rated order ${order.orderId}`, type: 'Review', link: '/reviews' });
  return created(res, { reviews: saved }, 'Thanks for your review!');
}

async function orderReviews(req, res) {
  const order = await findMyOrder(req);
  return ok(res, await Review.find({ orderId: order._id, userId: req.userId }));
}

// ---------- Invoices ----------
async function invoices(req, res) {
  const p = getPagination(req.query, 10);
  const filter = { userId: req.userId };
  const [items, total] = await Promise.all([
    Invoice.find(filter).sort({ invoiceDate: -1 }).skip(p.skip).limit(p.limit).populate('sellerId', 'shopName').populate('orderId', 'orderId'),
    Invoice.countDocuments(filter),
  ]);
  return ok(res, paginated(items, total, p));
}

async function findMyInvoice(req) {
  const inv = await Invoice.findOne({ _id: req.params.invoiceId, userId: req.userId }).populate('orderId', 'orderId');
  if (!inv) throw ApiError.notFound('Invoice not found');
  return inv;
}

async function invoice(req, res) {
  const inv = await findMyInvoice(req);
  const seller = await Seller.findById(inv.sellerId).select('shopName shopAddress mobileNumber gstNumber settings.showGstOnInvoice');
  const s = seller.toJSON();
  if (!showGstin(seller)) delete s.gstNumber;
  delete s.settings;
  return ok(res, { invoice: inv, seller: s });
}

async function invoiceDownload(req, res) {
  const inv = await findMyInvoice(req);
  const seller = await Seller.findById(inv.sellerId);
  invoicePdf(inv, seller, res);
}

/** GET /orders/:id/invoice - available once the order is delivered */
async function orderInvoice(req, res) {
  const order = await findMyOrder(req);
  if (order.orderStatus !== 'Delivered' && order.orderStatus !== 'Returned') throw ApiError.badRequest('Invoice is available after delivery');
  const inv = await ensureInvoice(order);
  return ok(res, { invoiceId: inv._id });
}

// ---------- Support ----------
const mine = (req) => ({ reportedBy: 'User', reportedById: req.userId });

async function tickets(req, res) {
  const p = getPagination(req.query, 10);
  const [items, total] = await Promise.all([
    Dispute.find(mine(req)).sort({ updatedAt: -1 }).skip(p.skip).limit(p.limit).populate('orderId', 'orderId').select('-comments -timeline'),
    Dispute.countDocuments(mine(req)),
  ]);
  return ok(res, paginated(items, total, p));
}

async function ticket(req, res) {
  const t = await Dispute.findOne({ _id: req.params.ticketId, ...mine(req) }).populate('orderId', 'orderId finalAmount orderStatus');
  if (!t) throw ApiError.notFound('Ticket not found');
  const data = t.toJSON();
  data.timeline = data.timeline.map(({ by, ...x }) => x);
  return ok(res, data);
}

async function createTicket(req, res) {
  let order = null;
  if (req.body.orderId) {
    order = await Order.findOne({ userId: req.userId, ...(mongoose.isValidObjectId(req.body.orderId) ? { _id: req.body.orderId } : { orderId: req.body.orderId }) });
    if (!order) throw ApiError.badRequest('Order not found');
  }
  const t = await Dispute.create({
    ticketId: await generateId('DIS'),
    orderId: order?._id,
    reportedBy: 'User',
    reportedById: req.userId,
    againstType: order ? 'Seller' : 'None',
    againstId: order?.sellerId,
    title: req.body.title,
    description: req.body.description,
    category: req.body.category,
    priority: ['PaymentIssue', 'Fraud'].includes(req.body.category) ? 'High' : 'Medium',
    images: (req.files || []).map((f) => fileUrl('disputes', f.filename)),
    timeline: [{ action: 'Created', note: 'Raised from user app', byName: req.user.name }],
  });
  await notifyAdmins({ title: 'New customer complaint', message: `${t.ticketId}: ${t.title}`, type: 'Dispute', link: `/disputes/${t._id}` });
  return created(res, t, `Ticket ${t.ticketId} created. We will get back to you soon.`);
}

async function commentTicket(req, res) {
  const t = await Dispute.findOne({ _id: req.params.ticketId, ...mine(req) });
  if (!t) throw ApiError.notFound('Ticket not found');
  if (t.status === 'Closed') throw ApiError.badRequest('This ticket is closed');
  const attachments = (req.files || []).map((f) => fileUrl('disputes', f.filename));
  if (!req.body.text && !attachments.length) throw ApiError.badRequest('Write a message');
  t.comments.push({ text: req.body.text, attachments, byType: 'User', by: req.userId, byName: req.user.name || req.user.mobileNumber });
  await t.save();
  await notifyAdmins({ title: `Reply on ${t.ticketId}`, message: req.body.text || 'attachment', type: 'Dispute', link: `/disputes/${t._id}` });
  return ok(res, t.comments, 'Message sent');
}

// ---------- Dashboard (account summary) ----------
async function dashboard(req, res) {
  const [stats, recentOrders] = await Promise.all([
    Order.aggregate([
      { $match: { userId: req.userId, paymentStatus: { $in: ['Completed', 'PartiallyRefunded'] }, orderStatus: { $ne: 'Cancelled' } } },
      { $group: { _id: null, totalOrders: { $sum: 1 }, totalSpent: { $sum: { $subtract: ['$finalAmount', { $ifNull: ['$refundedAmount', 0] }] } } } },
    ]),
    Order.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(5).populate('sellerId', 'shopName').select('orderId finalAmount orderStatus createdAt sellerId'),
  ]);
  const s = stats[0] || { totalOrders: 0, totalSpent: 0 };
  return ok(res, { stats: { totalOrders: s.totalOrders, totalSpent: round2(s.totalSpent), averageOrderValue: s.totalOrders ? round2(s.totalSpent / s.totalOrders) : 0 }, recentOrders, recentAddresses: req.user.addresses.slice(0, 3) });
}

module.exports = {
  getCart, addItem, updateItem, removeItem, clearCart,
  checkDelivery, createOrder, verifyPayment, paymentFailed, retryPayment,
  listOrders, getOrder, cancel, track, reorder, returnRequest, returnStatus,
  submitReviews, orderReviews, invoices, invoice, invoiceDownload, orderInvoice,
  tickets, ticket, createTicket, commentTicket, dashboard,
};
