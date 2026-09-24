const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/respond');
const { getPagination, paginated, searchRegex, dateRange } = require('../../utils/pagination');
const { Order, Invoice, Payment, User } = require('../../models');
const { changeStatus, cancelOrder } = require('../../services/order.service');
const { createBill } = require('../../services/billing.service');
const { ensureInvoice, whatsappText, invoicePdf } = require('../../services/invoice.service');
const { sendSms } = require('../../services/sms.service');
const { REVENUE_MATCH, NET_AMOUNT, round2 } = require('../../services/metrics');

const actor = (req) => ({ byType: 'Seller', by: req.sellerId, byName: req.seller.shopName });

async function findOrder(req) {
  const id = req.params.orderId;
  const q = mongoose.isValidObjectId(id) ? { _id: id } : { orderId: id };
  const order = await Order.findOne({ ...q, sellerId: req.sellerId });
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

async function list(req, res) {
  const p = getPagination(req.query);
  const filter = { sellerId: req.sellerId, ...dateRange(req.query) };
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
    Order.aggregate([{ $match: { sellerId: new mongoose.Types.ObjectId(String(req.sellerId)) } }, { $group: { _id: '$orderStatus', count: { $sum: 1 } } }]),
  ]);
  return ok(res, paginated(items, total, p, { totalAmount: round2(sum[0]?.total), statusCounts: Object.fromEntries(counts.map((c) => [c._id, c.count])) }));
}

async function getOne(req, res) {
  const order = await findOrder(req);
  await order.populate([{ path: 'userId', select: 'name mobileNumber email' }, { path: 'invoiceId', select: 'invoiceId invoiceDate' }]);
  const payments = await Payment.find({ orderId: order._id }).sort({ createdAt: 1 });
  return ok(res, { order, payments, refundableAmount: round2(order.finalAmount - (order.refundedAmount || 0)) });
}

/** PUT /orders/:id/status - normal flow only (Pending → Confirmed → Packed → Shipped → Delivered) */
async function updateStatus(req, res) {
  const order = await findOrder(req);
  if (req.body.status === 'Returned') throw ApiError.badRequest('Returns are handled through return requests / support');
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

/** POST /invoices/:id/share { channel: whatsapp|sms } -> link / send, and remember it was shared */
async function share(req, res) {
  const invoice = await findInvoice(req);
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

module.exports = { list, getOne, updateStatus, cancel, addNote, createInvoice, listInvoices, getInvoice, orderInvoice, invoicePdfDownload, share };
