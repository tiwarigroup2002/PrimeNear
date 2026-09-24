const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/respond');
const { getPagination, paginated } = require('../../utils/pagination');
const { generateId } = require('../../utils/ids');
const { fileUrl } = require('../../middleware/upload');
const { Review, Notification, Dispute, Order } = require('../../models');
const { notifyAdmins, notifyUser } = require('../../services/notification.service');

// ---------- Notifications ----------
async function notifications(req, res) {
  const p = getPagination(req.query, 20);
  const filter = { recipientType: 'Seller', recipientId: req.sellerId };
  if (req.query.unreadOnly === 'true') filter.isRead = false;
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipientType: 'Seller', recipientId: req.sellerId, isRead: false }),
  ]);
  return ok(res, paginated(items, total, p, { unreadCount }));
}

async function markRead(req, res) {
  await Notification.updateOne({ _id: req.params.notificationId, recipientType: 'Seller', recipientId: req.sellerId }, { isRead: true, readAt: new Date() });
  return ok(res, null, 'Marked as read');
}

async function markAllRead(req, res) {
  await Notification.updateMany({ recipientType: 'Seller', recipientId: req.sellerId, isRead: false }, { isRead: true, readAt: new Date() });
  return ok(res, null, 'All marked as read');
}

// ---------- Reviews ----------
async function reviews(req, res) {
  const p = getPagination(req.query);
  const filter = { sellerId: req.sellerId, isHidden: false };
  if (req.query.type) filter.ratingType = req.query.type;
  if (req.query.rating) filter.rating = Number(req.query.rating);
  if (req.query.unanswered === 'true') filter['sellerResponse.text'] = { $in: [null, ''] };
  const [items, total, dist] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('userId', 'name').populate('productId', 'name images').populate('orderId', 'orderId'),
    Review.countDocuments(filter),
    Review.aggregate([{ $match: { sellerId: new mongoose.Types.ObjectId(String(req.sellerId)), isHidden: false } }, { $group: { _id: '$rating', count: { $sum: 1 } } }]),
  ]);
  const distribution = Object.fromEntries([1, 2, 3, 4, 5].map((r) => [r, dist.find((d) => d._id === r)?.count || 0]));
  return ok(res, paginated(items, total, p, { distribution, rating: req.seller.rating, ratingCount: req.seller.ratingCount }));
}

async function respond(req, res) {
  const review = await Review.findOne({ _id: req.params.reviewId, sellerId: req.sellerId });
  if (!review) throw ApiError.notFound('Review not found');
  review.sellerResponse = { text: req.body.text, at: new Date() };
  await review.save();
  await notifyUser(review.userId, { title: `${req.seller.shopName} replied to your review`, message: req.body.text, type: 'Review' });
  return ok(res, review, 'Reply posted');
}

// ---------- Support tickets (disputes) ----------
const mine = (req) => ({ $or: [{ reportedBy: 'Seller', reportedById: req.sellerId }, { againstType: 'Seller', againstId: req.sellerId }] });

async function tickets(req, res) {
  const p = getPagination(req.query);
  const filter = mine(req);
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    Dispute.find(filter).sort({ updatedAt: -1 }).skip(p.skip).limit(p.limit).populate('orderId', 'orderId').select('-comments -timeline'),
    Dispute.countDocuments(filter),
  ]);
  return ok(res, paginated(items, total, p));
}

async function findTicket(req) {
  const t = await Dispute.findOne({ _id: req.params.ticketId, ...mine(req) }).populate('orderId', 'orderId finalAmount orderStatus');
  if (!t) throw ApiError.notFound('Ticket not found');
  return t;
}

async function ticket(req, res) {
  const t = await findTicket(req);
  const data = t.toJSON();
  // Internal admin notes are not shown to sellers
  data.timeline = data.timeline.map(({ by, ...x }) => x);
  return ok(res, data);
}

async function createTicket(req, res) {
  const body = { ...req.body };
  let order = null;
  if (body.orderId) {
    order = await Order.findOne({ sellerId: req.sellerId, ...(mongoose.isValidObjectId(body.orderId) ? { _id: body.orderId } : { orderId: body.orderId }) });
    if (!order) throw ApiError.badRequest('Order not found in your shop');
  }
  const t = await Dispute.create({
    ticketId: await generateId('DIS'),
    orderId: order?._id,
    reportedBy: 'Seller',
    reportedById: req.sellerId,
    againstType: body.againstUser && order?.userId ? 'User' : 'None',
    againstId: body.againstUser && order?.userId ? order.userId : undefined,
    title: body.title,
    description: body.description,
    category: body.category,
    priority: body.category === 'PaymentIssue' || body.category === 'Fraud' ? 'High' : 'Medium',
    images: (req.files || []).map((f) => fileUrl('disputes', f.filename)),
    timeline: [{ action: 'Created', note: 'Raised from seller app', byName: req.seller.shopName }],
  });
  await notifyAdmins({ title: `New ticket from ${req.seller.shopName}`, message: t.title, type: 'Dispute', link: `/disputes/${t._id}` });
  return created(res, t, `Ticket ${t.ticketId} created. Our team will contact you soon.`);
}

async function commentTicket(req, res) {
  const t = await findTicket(req);
  if (t.status === 'Closed') throw ApiError.badRequest('This ticket is closed');
  const attachments = (req.files || []).map((f) => fileUrl('disputes', f.filename));
  if (!req.body.text && !attachments.length) throw ApiError.badRequest('Write a message');
  t.comments.push({ text: req.body.text, attachments, byType: 'Seller', by: req.sellerId, byName: req.seller.shopName });
  await t.save();
  await notifyAdmins({ title: `Reply on ${t.ticketId}`, message: `${req.seller.shopName}: ${req.body.text || 'attachment'}`, type: 'Dispute', link: `/disputes/${t._id}` });
  return ok(res, t.comments, 'Message sent');
}

module.exports = { notifications, markRead, markAllRead, reviews, respond, tickets, ticket, createTicket, commentTicket };

// ---------- Return requests ----------
const { ReturnRequest, Order: OrderModel } = require('../../models');
const returns = require('../../services/return.service');

async function listReturns(req, res) {
  const p = getPagination(req.query);
  const filter = { sellerId: req.sellerId };
  if (req.query.status) filter.status = req.query.status;
  const [items, total, pending] = await Promise.all([
    ReturnRequest.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('orderId', 'orderId finalAmount refundedAmount paymentMethod items deliveredAt').populate('userId', 'name mobileNumber'),
    ReturnRequest.countDocuments(filter),
    ReturnRequest.countDocuments({ sellerId: req.sellerId, status: 'Initiated' }),
  ]);
  return ok(res, paginated(items, total, p, { pendingCount: pending }));
}

async function decideReturn(req, res) {
  const rr = await ReturnRequest.findOne({ _id: req.params.returnId, sellerId: req.sellerId });
  if (!rr) throw ApiError.notFound('Return request not found');
  const order = await OrderModel.findById(rr.orderId);
  const actor = { byType: 'Seller', by: req.sellerId, byName: req.seller.shopName };
  if (req.body.approve) await returns.approveReturn(rr, order, { ...actor, refundAmount: req.body.refundAmount, note: req.body.note });
  else await returns.rejectReturn(rr, order, { ...actor, note: req.body.note });
  return ok(res, rr, req.body.approve ? 'Return approved' : 'Return rejected');
}

module.exports.listReturns = listReturns;
module.exports.decideReturn = decideReturn;
