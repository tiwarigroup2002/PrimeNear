const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { ok } = require('../../utils/respond');
const { getPagination, paginated, searchRegex, dateRange } = require('../../utils/pagination');
const { Order, Payment, Dispute, Refund, User } = require('../../models');
const { audit } = require('../../services/audit.service');
const { cancelOrder, changeStatus } = require('../../services/order.service');
const { refundOrder } = require('../../services/refund.service');
const { REVENUE_MATCH, NET_AMOUNT, round2 } = require('../../services/metrics');

const oid = (id) => new mongoose.Types.ObjectId(String(id));

function actorOf(req) {
  return { byType: 'Admin', by: req.admin._id, byName: req.admin.fullName };
}

async function findOrder(id) {
  // Accept either Mongo _id or readable ORD-... id
  const order = mongoose.isValidObjectId(id) ? await Order.findById(id) : await Order.findOne({ orderId: id });
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

async function buildFilter(q) {
  const filter = { ...dateRange(q) };
  if (q.status) filter.orderStatus = q.status;
  if (q.paymentStatus) filter.paymentStatus = q.paymentStatus;
  if (q.paymentMethod) filter.paymentMethod = q.paymentMethod;
  if (q.source) filter.source = q.source;
  if (q.seller) filter.sellerId = oid(q.seller);
  if (q.user) filter.userId = oid(q.user);
  if (q.search) {
    const rx = searchRegex(q.search);
    const users = await User.find({ $or: [{ name: rx }, { mobileNumber: rx }] }).select('_id').limit(200);
    filter.$or = [{ orderId: rx }, { 'customerSnapshot.name': rx }, { 'customerSnapshot.mobileNumber': rx }, { userId: { $in: users.map((u) => u._id) } }];
  }
  return filter;
}

async function list(req, res) {
  const p = getPagination(req.query);
  const filter = await buildFilter(req.query);
  const sortField = { amount: 'finalAmount', date: 'createdAt', status: 'orderStatus' }[req.query.sortBy] || 'createdAt';
  const sort = { [sortField]: req.query.sortDir === 'asc' ? 1 : -1 };
  const [items, total, revenue] = await Promise.all([
    Order.find(filter).sort(sort).skip(p.skip).limit(p.limit)
      .populate('sellerId', 'shopName mobileNumber')
      .populate('userId', 'name mobileNumber')
      .select('-statusHistory -notes'),
    Order.countDocuments(filter),
    Order.aggregate([{ $match: { ...filter, ...REVENUE_MATCH } }, { $group: { _id: null, total: { $sum: NET_AMOUNT } } }]),
  ]);
  return ok(res, paginated(items, total, p, { totalRevenue: round2(revenue[0]?.total) }));
}

async function getOne(req, res) {
  const order = await findOrder(req.params.orderId);
  await order.populate([
    { path: 'sellerId', select: 'shopName ownerName mobileNumber email shopAddress' },
    { path: 'userId', select: 'name mobileNumber email' },
    { path: 'invoiceId', select: 'invoiceId invoiceDate totalAmount' },
    { path: 'payoutId', select: 'payoutId status amount' },
  ]);
  const [payments, disputes, refunds] = await Promise.all([
    Payment.find({ orderId: order._id }).sort({ createdAt: 1 }),
    Dispute.find({ orderId: order._id }).select('ticketId title status priority createdAt'),
    Refund.find({ orderId: order._id }).sort({ createdAt: -1 }).populate('initiatedBy', 'fullName'),
  ]);
  return ok(res, { order, payments, disputes, refunds, refundableAmount: round2(order.finalAmount - (order.refundedAmount || 0)) });
}

async function updateStatus(req, res) {
  const order = await findOrder(req.params.orderId);
  const before = order.orderStatus;
  if (req.body.status === 'Cancelled') {
    const result = await cancelOrder(order, { reason: req.body.notes || 'Cancelled by admin', actor: actorOf(req), adminId: req.admin._id });
    await audit(req, { action: 'Cancelled', entityType: 'Order', entityId: order._id, oldValue: { orderStatus: before }, newValue: { orderStatus: 'Cancelled' } });
    return ok(res, result.order, 'Order cancelled');
  }
  await changeStatus(order, { status: req.body.status, note: req.body.notes, actor: actorOf(req), force: true });
  await audit(req, { action: 'StatusChanged', entityType: 'Order', entityId: order._id, oldValue: { orderStatus: before }, newValue: { orderStatus: order.orderStatus }, details: req.body.notes });
  return ok(res, order, 'Order status updated');
}

async function refund(req, res) {
  const order = await findOrder(req.params.orderId);
  const doc = await refundOrder(order, { amount: req.body.amount, reason: req.body.reason, adminId: req.admin._id });
  await audit(req, { action: 'Refunded', entityType: 'Order', entityId: order._id, newValue: { amount: doc.amount, refundId: doc.refundId, method: doc.method }, details: req.body.reason });
  return ok(res, { refundId: doc._id, refund: doc, order }, 'Refund initiated');
}

async function cancel(req, res) {
  const order = await findOrder(req.params.orderId);
  const result = await cancelOrder(order, { reason: req.body.reason, actor: actorOf(req), refund: req.body.refund !== false, adminId: req.admin._id });
  await audit(req, { action: 'Cancelled', entityType: 'Order', entityId: order._id, details: req.body.reason });
  return ok(res, result, 'Order cancelled');
}

async function addNote(req, res) {
  const order = await findOrder(req.params.orderId);
  order.notes.push({ text: req.body.note, ...actorOf(req) });
  await order.save();
  return ok(res, order.notes, 'Note added');
}

async function disputes(req, res) {
  const order = await findOrder(req.params.orderId);
  const items = await Dispute.find({ orderId: order._id }).sort({ createdAt: -1 });
  return ok(res, items);
}

module.exports = { list, getOne, updateStatus, refund, cancel, addNote, disputes, buildFilter };
