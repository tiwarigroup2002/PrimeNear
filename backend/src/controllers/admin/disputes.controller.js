const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/respond');
const { getPagination, paginated, searchRegex, dateRange } = require('../../utils/pagination');
const { generateId } = require('../../utils/ids');
const { Dispute, Order, Admin } = require('../../models');
const { audit } = require('../../services/audit.service');
const { refundOrder } = require('../../services/refund.service');
const { notifyUser, notifySeller } = require('../../services/notification.service');
const { fileUrl } = require('../../middleware/upload');

async function findDispute(id) {
  const d = mongoose.isValidObjectId(id) ? await Dispute.findById(id) : await Dispute.findOne({ ticketId: id });
  if (!d) throw ApiError.notFound('Dispute not found');
  return d;
}

function track(d, req, action, note) {
  d.timeline.push({ action, note, by: req.admin._id, byName: req.admin.fullName });
}

async function notifyParties(d, title, message) {
  const targets = [
    [d.reportedBy, d.reportedById],
    [d.againstType, d.againstId],
  ];
  for (const [type, id] of targets) {
    if (!id) continue;
    if (type === 'User') await notifyUser(id, { title, message, type: 'Dispute', data: { disputeId: d._id } });
    if (type === 'Seller') await notifySeller(id, { title, message, type: 'Dispute', data: { disputeId: d._id } });
  }
}

async function list(req, res) {
  const p = getPagination(req.query);
  const filter = { ...dateRange(req.query) };
  const { status, priority, assignedTo, category, search } = req.query;
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (category) filter.category = category;
  if (assignedTo === 'me') filter.assignedToAdmin = req.admin._id;
  else if (assignedTo === 'unassigned') filter.assignedToAdmin = null;
  else if (assignedTo) filter.assignedToAdmin = assignedTo;
  if (search) {
    const rx = searchRegex(search);
    filter.$or = [{ ticketId: rx }, { title: rx }];
  }
  const priorityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const [items, total, counts] = await Promise.all([
    Dispute.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit)
      .populate('assignedToAdmin', 'fullName')
      .populate('reportedById', 'name shopName mobileNumber')
      .populate('againstId', 'name shopName mobileNumber')
      .populate('orderId', 'orderId')
      .select('-comments -timeline'),
    Dispute.countDocuments(filter),
    Dispute.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const c = Object.fromEntries(counts.map((x) => [x._id, x.count]));
  if (req.query.sortBy === 'priority') items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  return ok(res, paginated(items, total, p, { openCount: c.Open || 0, pendingCount: c.InProgress || 0, resolvedCount: c.Resolved || 0, closedCount: c.Closed || 0 }));
}

async function getOne(req, res) {
  const d = await findDispute(req.params.ticketId);
  await d.populate([
    { path: 'assignedToAdmin', select: 'fullName email' },
    { path: 'reportedById', select: 'name shopName ownerName mobileNumber email' },
    { path: 'againstId', select: 'name shopName ownerName mobileNumber email' },
    { path: 'orderId', select: 'orderId finalAmount refundedAmount paymentStatus paymentMethod orderStatus createdAt items sellerId userId' },
    { path: 'refundId' },
  ]);
  return ok(res, { dispute: d, attachments: [...d.images, ...d.comments.flatMap((c) => c.attachments)] });
}

/** Admins can open a ticket on behalf of a user/seller (e.g. after a phone call). */
async function create(req, res) {
  const body = { ...req.body };
  if (body.orderId) {
    const order = mongoose.isValidObjectId(body.orderId) ? await Order.findById(body.orderId) : await Order.findOne({ orderId: body.orderId });
    if (!order) throw ApiError.badRequest('Order not found');
    body.orderId = order._id;
    // Default parties from the order
    if (!body.reportedById && body.reportedBy === 'User') body.reportedById = order.userId;
    if (!body.reportedById && body.reportedBy === 'Seller') body.reportedById = order.sellerId;
    if (!body.againstId && body.againstType === 'Seller') body.againstId = order.sellerId;
    if (!body.againstId && body.againstType === 'User') body.againstId = order.userId;
  }
  if (body.reportedBy === 'Admin') body.reportedById = req.admin._id;
  const d = new Dispute({ ...body, ticketId: await generateId('DIS') });
  track(d, req, 'Created', 'Ticket created by admin');
  await d.save();
  await audit(req, { action: 'Created', entityType: 'Dispute', entityId: d._id, newValue: d });
  return created(res, d, 'Dispute created');
}

async function update(req, res) {
  const d = await findDispute(req.params.ticketId);
  if (d.status === 'Closed') throw ApiError.badRequest('Closed disputes cannot be edited');
  const before = { status: d.status, priority: d.priority, assignedToAdmin: d.assignedToAdmin };
  const { notes, ...changes } = req.body;
  if (changes.assignedToAdmin && !(await Admin.exists({ _id: changes.assignedToAdmin, isActive: true, isDeleted: false }))) {
    throw ApiError.badRequest('Admin not found');
  }
  Object.entries(changes).forEach(([k, v]) => {
    if (String(d[k]) !== String(v)) track(d, req, `${k} changed`, `${d[k] ?? '-'} → ${v}`);
  });
  Object.assign(d, changes);
  if (notes) d.comments.push({ text: notes, byType: 'Admin', by: req.admin._id, byName: req.admin.fullName });
  await d.save();
  await audit(req, { action: 'Updated', entityType: 'Dispute', entityId: d._id, oldValue: before, newValue: changes });
  return ok(res, d, 'Dispute updated');
}

async function assign(req, res) {
  const d = await findDispute(req.params.ticketId);
  const admin = await Admin.findOne({ _id: req.body.adminId, isActive: true, isDeleted: false });
  if (!admin) throw ApiError.badRequest('Admin not found');
  d.assignedToAdmin = admin._id;
  if (d.status === 'Open') d.status = 'InProgress';
  track(d, req, 'Assigned', `Assigned to ${admin.fullName}`);
  await d.save();
  await audit(req, { action: 'Assigned', entityType: 'Dispute', entityId: d._id, details: admin.fullName });
  return ok(res, d, 'Dispute assigned');
}

async function comment(req, res) {
  const d = await findDispute(req.params.ticketId);
  const attachments = (req.files || []).map((f) => fileUrl('disputes', f.filename));
  if (!req.body.text && !attachments.length) throw ApiError.badRequest('Write a comment or attach a file');
  d.comments.push({ text: req.body.text, attachments, byType: 'Admin', by: req.admin._id, byName: req.admin.fullName });
  if (d.status === 'Open') {
    d.status = 'InProgress';
    track(d, req, 'status changed', 'Open → InProgress');
  }
  await d.save();
  return ok(res, d.comments, 'Comment added');
}

async function resolve(req, res) {
  const d = await findDispute(req.params.ticketId);
  if (['Resolved', 'Closed'].includes(d.status)) throw ApiError.badRequest(`Dispute is already ${d.status}`);
  const { resolution, refundAmount, refundTo, notes } = req.body;
  let refund = null;
  if (refundAmount && refundAmount > 0 && refundTo !== 'None') {
    if (!req.permissions.includes('orders.refund')) throw ApiError.forbidden('You are not allowed to issue refunds');
    if (!d.orderId) throw ApiError.badRequest('This dispute is not linked to an order, refund not possible');
    const order = await Order.findById(d.orderId);
    refund = await refundOrder(order, { amount: refundAmount, reason: `Dispute ${d.ticketId}: ${resolution}`, adminId: req.admin._id, disputeId: d._id });
    d.refundId = refund._id;
  }
  d.status = 'Resolved';
  d.resolution = resolution;
  d.resolutionNotes = notes;
  d.refundAmount = refundAmount || 0;
  d.refundTo = refundTo || 'None';
  d.resolvedAt = new Date();
  track(d, req, 'Resolved', resolution);
  await d.save();
  await notifyParties(d, `Dispute ${d.ticketId} resolved`, resolution);
  await audit(req, { action: 'Resolved', entityType: 'Dispute', entityId: d._id, details: resolution, newValue: { refundAmount: d.refundAmount } });
  return ok(res, { dispute: d, refundInitiated: Boolean(refund), refundId: refund?._id }, 'Dispute resolved');
}

async function close(req, res) {
  const d = await findDispute(req.params.ticketId);
  if (d.status === 'Closed') throw ApiError.badRequest('Dispute is already closed');
  d.status = 'Closed';
  d.closedAt = new Date();
  track(d, req, 'Closed', req.body?.note);
  await d.save();
  await audit(req, { action: 'Closed', entityType: 'Dispute', entityId: d._id });
  return ok(res, d, 'Dispute closed');
}

async function reopen(req, res) {
  const d = await findDispute(req.params.ticketId);
  if (!['Resolved', 'Closed'].includes(d.status)) throw ApiError.badRequest('Only resolved or closed disputes can be reopened');
  d.status = 'InProgress';
  track(d, req, 'Reopened', req.body?.note);
  await d.save();
  await audit(req, { action: 'Reopened', entityType: 'Dispute', entityId: d._id });
  return ok(res, d, 'Dispute reopened');
}

module.exports = { list, getOne, create, update, assign, comment, resolve, close, reopen };
