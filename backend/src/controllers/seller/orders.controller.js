const crypto = require('crypto');
const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/respond');
const { getPagination, paginated, searchRegex, dateRange } = require('../../utils/pagination');
const { Order, Invoice, Payment, User, Customer } = require('../../models');
const { addCustomer } = require('./customers.controller');
const { changeStatus, cancelOrder } = require('../../services/order.service');
const { createBill } = require('../../services/billing.service');
const { ensureInvoice, whatsappText, invoicePdf } = require('../../services/invoice.service');
const { sendSms } = require('../../services/sms.service');
const { notifyUser } = require('../../services/notification.service');
const { REVENUE_MATCH, NET_AMOUNT, round2 } = require('../../services/metrics');
const { VISIBLE_TO_SELLER } = require('../../services/checkout.service');

const actor = (req) => ({ byType: 'Seller', by: req.sellerId, byName: req.seller.shopName });

async function findOrder(req) {
  const id = req.params.orderId;
  const q = mongoose.isValidObjectId(id) ? { _id: id } : { orderId: id };
  const order = await Order.findOne({ ...q, sellerId: req.sellerId, ...VISIBLE_TO_SELLER });
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

async function list(req, res) {
  const p = getPagination(req.query);
  const filter = { sellerId: req.sellerId, ...VISIBLE_TO_SELLER, ...dateRange(req.query) };
  const { status, source, paymentMethod, search, filter: quick } = req.query;
  if (status === 'open') filter.orderStatus = { $in: ['Pending', 'Confirmed', 'Packed', 'Shipped'] };
  else if (status) filter.orderStatus = status;
  if (source) filter.source = source;
  if (paymentMethod) filter.paymentMethod = paymentMethod;
  if (quick === 'today') {
    const { startOfDay } = require('../../services/metrics');
    filter.createdAt = { $gte: startOfDay() };
  }
  if (search) {
    const rx = searchRegex(search);
    const users = await User.find({ $or: [{ name: rx }, { mobileNumber: rx }] }).select('_id').limit(100);
    filter.$or = [{ orderId: rx }, { 'customerSnapshot.name': rx }, { 'customerSnapshot.mobileNumber': rx }, { userId: { $in: users.map((u) => u._id) } }];
  }
  const [items, total, sum, counts] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('userId', 'name mobileNumber').select('-statusHistory -notes'),
    Order.countDocuments(filter),
    Order.aggregate([{ $match: { ...filter, sellerId: new mongoose.Types.ObjectId(String(req.sellerId)), ...REVENUE_MATCH } }, { $group: { _id: null, total: { $sum: NET_AMOUNT } } }]),
    Order.aggregate([{ $match: { sellerId: new mongoose.Types.ObjectId(String(req.sellerId)), ...VISIBLE_TO_SELLER } }, { $group: { _id: '$orderStatus', count: { $sum: 1 } } }]),
  ]);
  return ok(res, paginated(items, total, p, { totalAmount: round2(sum[0]?.total), statusCounts: Object.fromEntries(counts.map((c) => [c._id, c.count])) }));
}

async function getOne(req, res) {
  const order = await findOrder(req);
  await order.populate([{ path: 'userId', select: 'name mobileNumber email' }, { path: 'invoiceId', select: 'invoiceId invoiceDate' }]);
  const [payments, otpDoc] = await Promise.all([Payment.find({ orderId: order._id }).sort({ createdAt: 1 }), Order.findById(order._id).select('+deliveryOtp')]);
  return ok(res, {
    order,
    payments,
    refundableAmount: round2(order.finalAmount - (order.refundedAmount || 0)),
    deliveryOtpRequired: needsDeliveryOtp(order),
    deliveryOtpSentAt: otpDoc?.deliveryOtp?.sentAt || null,
  });
}

// ---------- Delivery OTP ----------
// App orders are marked delivered only after the customer gives the shop a code.
const DELIVERY_OTP_MAX_ATTEMPTS = 5;
const needsDeliveryOtp = (order) => order.source === 'Online' && Boolean(order.userId);

/** POST /orders/:id/delivery-otp - creates a code and sends it to the customer (SMS + app) */
async function sendDeliveryOtp(req, res) {
  const order = await findOrder(req);
  if (!needsDeliveryOtp(order)) throw ApiError.badRequest('This order does not need a delivery OTP');
  if (!['Confirmed', 'Packed', 'Shipped'].includes(order.orderStatus)) throw ApiError.badRequest(`Order is ${order.orderStatus}`);
  const current = (await Order.findById(order._id).select('+deliveryOtp')).deliveryOtp;
  if (current?.sentAt && Date.now() - current.sentAt.getTime() < 30000) throw new ApiError(429, 'Please wait 30 seconds before sending the OTP again');
  const code = String(crypto.randomInt(1000, 10000));
  await Order.updateOne({ _id: order._id }, { deliveryOtp: { code, sentAt: new Date(), attempts: 0 } });
  const user = await User.findById(order.userId).select('mobileNumber');
  if (user?.mobileNumber) await sendSms(user.mobileNumber, `${code} is the delivery code for order ${order.orderId} from ${req.seller.shopName}. Share it only when you receive your items.`);
  await notifyUser(order.userId, { title: `Delivery code: ${code}`, message: `Share this code with ${req.seller.shopName} when you receive order ${order.orderId}.`, type: 'OrderStatus', link: `/orders/${order._id}`, data: { orderId: order._id } });
  return ok(res, { sentTo: user?.mobileNumber ? `******${user.mobileNumber.slice(-4)}` : null }, 'OTP sent to the customer');
}

async function checkDeliveryOtp(order, otp) {
  const doc = await Order.findById(order._id).select('+deliveryOtp');
  const saved = doc.deliveryOtp;
  if (!saved?.code) throw ApiError.badRequest('Send the delivery OTP to the customer first');
  if (!otp) throw ApiError.badRequest('Enter the OTP the customer received');
  if (saved.attempts >= DELIVERY_OTP_MAX_ATTEMPTS) throw new ApiError(429, 'Too many wrong attempts. Send a new OTP.');
  if (String(otp).trim() !== saved.code) {
    await Order.updateOne({ _id: order._id }, { $inc: { 'deliveryOtp.attempts': 1 } });
    throw ApiError.badRequest(`Wrong OTP. ${DELIVERY_OTP_MAX_ATTEMPTS - saved.attempts - 1} attempt(s) left.`);
  }
  await Order.updateOne({ _id: order._id }, { $unset: { deliveryOtp: 1 } });
}

/** PUT /orders/:id/status - normal flow only (Pending → Confirmed → Packed → Shipped → Delivered) */
async function updateStatus(req, res) {
  const order = await findOrder(req);
  if (req.body.status === 'Returned') throw ApiError.badRequest('Returns are handled through return requests / support');
  if (req.body.status === 'Delivered' && needsDeliveryOtp(order)) await checkDeliveryOtp(order, req.body.otp);
  await changeStatus(order, { status: req.body.status, note: req.body.note, actor: actor(req) });
  if (order.orderStatus === 'Delivered') await ensureInvoice(order);
  return ok(res, order, `Order marked ${order.orderStatus}`);
}

async function cancel(req, res) {
  const order = await findOrder(req);
  const result = await cancelOrder(order, { reason: req.body.reason, actor: actor(req), refund: true });
  return ok(res, result, 'Order cancelled');
}

async function addNote(req, res) {
  const order = await findOrder(req);
  order.notes.push({ text: req.body.note, ...actor(req) });
  await order.save();
  return ok(res, order.notes, 'Note added');
}

// ---------- Counter bills & invoices ----------

/** POST /invoices - create a counter bill (POS order + invoice) */
async function createInvoice(req, res) {
  const { order, invoice } = await createBill(req.seller, req.body);
  return created(res, { orderId: order._id, invoiceId: invoice._id, order, invoice }, `Bill ${invoice.invoiceId} created`);
}

async function listInvoices(req, res) {
  const p = getPagination(req.query);
  const filter = { sellerId: req.sellerId, ...dateRange(req.query, 'invoiceDate') };
  if (req.query.search) {
    const rx = searchRegex(req.query.search);
    filter.$or = [{ invoiceId: rx }, { 'customerSnapshot.name': rx }, { 'customerSnapshot.mobileNumber': rx }];
  }
  if (req.query.paymentMethod) filter.paymentMethod = req.query.paymentMethod;
  const [items, total, sum] = await Promise.all([
    Invoice.find(filter).sort({ invoiceDate: -1 }).skip(p.skip).limit(p.limit).populate('orderId', 'orderId source orderStatus'),
    Invoice.countDocuments(filter),
    Invoice.aggregate([{ $match: { ...filter, sellerId: new mongoose.Types.ObjectId(String(req.sellerId)) } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
  ]);
  return ok(res, paginated(items, total, p, { totalAmount: round2(sum[0]?.total) }));
}

async function findInvoice(req) {
  const id = req.params.invoiceId;
  const q = mongoose.isValidObjectId(id) ? { _id: id } : { invoiceId: id };
  const invoice = await Invoice.findOne({ ...q, sellerId: req.sellerId }).populate('orderId', 'orderId source orderStatus refundedAmount');
  if (!invoice) throw ApiError.notFound('Invoice not found');
  return invoice;
}

async function getInvoice(req, res) {
  const invoice = await findInvoice(req);
  return ok(res, { invoice, whatsappText: whatsappText(invoice, req.seller) });
}

/** GET /orders/:id/invoice - invoice for an online order (created on demand) */
async function orderInvoice(req, res) {
  const order = await findOrder(req);
  if (['Cancelled'].includes(order.orderStatus)) throw ApiError.badRequest('Cancelled orders have no invoice');
  const invoice = await ensureInvoice(order);
  return ok(res, { invoice, whatsappText: whatsappText(invoice, req.seller) });
}

async function invoicePdfDownload(req, res) {
  const invoice = await findInvoice(req);
  invoicePdf(invoice, req.seller, res);
}

/** Sending a bill adds that mobile to the shop's customers, which is what unlocks the user app. */
async function linkCustomerFromBill(seller, invoice) {
  const mobile = String(invoice.customerSnapshot?.mobileNumber || '').replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(mobile)) return;
  let customer = await Customer.findOne({ sellerId: seller._id, mobileNumber: mobile });
  if (!customer) {
    try {
      customer = await addCustomer(seller, { mobileNumber: mobile, name: invoice.customerSnapshot?.name });
    } catch (err) {
      // Customer limit reached: the bill is still shared, the number just is not added
      if (err.code === 'CUSTOMER_LIMIT') return;
      if (err.statusCode !== 409) throw err;
      customer = await Customer.findOne({ sellerId: seller._id, mobileNumber: mobile });
    }
  }
  if (customer && !invoice.customerId) {
    invoice.customerId = customer._id;
    invoice.userId = customer.userId;
    await Order.updateOne({ _id: invoice.orderId?._id || invoice.orderId }, { customerId: customer._id, userId: customer.userId });
  }
}

/** POST /invoices/:id/share { channel: whatsapp|sms } -> link / send, and remember it was shared */
async function share(req, res) {
  const invoice = await findInvoice(req);
  await linkCustomerFromBill(req.seller, invoice);
  const text = whatsappText(invoice, req.seller);
  const mobile = invoice.customerSnapshot?.mobileNumber;
  let url = null;
  if (req.body.channel === 'whatsapp') {
    url = `https://wa.me/${mobile ? `91${mobile}` : ''}?text=${encodeURIComponent(text)}`;
  } else {
    if (!mobile) throw ApiError.badRequest('Customer mobile number is not available');
    await sendSms(mobile, `${req.seller.shopName}: Bill ${invoice.invoiceId} for Rs.${invoice.totalAmount}. Thank you!`);
  }
  invoice.sharedVia.push({ channel: req.body.channel, at: new Date() });
  await invoice.save();
  return ok(res, { url, text }, req.body.channel === 'whatsapp' ? 'Opening WhatsApp' : 'SMS sent');
}

module.exports = { list, getOne, updateStatus, sendDeliveryOtp, cancel, addNote, createInvoice, listInvoices, getInvoice, orderInvoice, invoicePdfDownload, share };
