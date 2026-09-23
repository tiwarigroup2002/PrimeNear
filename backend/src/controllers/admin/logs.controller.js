const mongoose = require('mongoose');
const { ok } = require('../../utils/respond');
const { getPagination, paginated, searchRegex, dateRange } = require('../../utils/pagination');
const { AuditLog, SystemLog, LoginHistory, Notification } = require('../../models');

async function auditLogs(req, res) {
  const p = getPagination(req.query);
  const filter = { ...dateRange(req.query) };
  if (req.query.admin) filter.adminId = req.query.admin;
  if (req.query.action) filter.action = req.query.action;
  if (req.query.entityType) filter.entityType = req.query.entityType;
  if (req.query.entityId && mongoose.isValidObjectId(req.query.entityId)) filter.entityId = req.query.entityId;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) filter.details = searchRegex(req.query.search);
  const [items, total, actions, entityTypes] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('adminId', 'fullName email role'),
    AuditLog.countDocuments(filter),
    AuditLog.distinct('action'),
    AuditLog.distinct('entityType'),
  ]);
  return ok(res, paginated(items, total, p, { actions, entityTypes }));
}

async function auditLog(req, res) {
  const item = await AuditLog.findById(req.params.logId).populate('adminId', 'fullName email role');
  return ok(res, item);
}

/** Latest activity for the live activity monitor (polling with ?since=) */
async function activityFeed(req, res) {
  const filter = {};
  if (req.query.since) filter.createdAt = { $gt: new Date(req.query.since) };
  const items = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(50).populate('adminId', 'fullName role').select('-oldValue -newValue');
  return ok(res, items);
}

async function systemLogs(req, res) {
  const p = getPagination(req.query);
  const filter = { ...dateRange(req.query, 'timestamp') };
  if (req.query.level) filter.level = req.query.level;
  if (req.query.search) filter.message = searchRegex(req.query.search);
  const [items, total, errorCount] = await Promise.all([
    SystemLog.find(filter).sort({ timestamp: -1 }).skip(p.skip).limit(p.limit),
    SystemLog.countDocuments(filter),
    SystemLog.countDocuments({ ...filter, level: { $in: ['Error', 'Critical'] } }),
  ]);
  return ok(res, paginated(items, total, p, { errorCount }));
}

async function loginHistory(req, res) {
  const p = getPagination(req.query);
  const filter = { principalType: 'Admin', ...dateRange(req.query, 'loginTime') };
  if (req.query.admin) filter.principalId = req.query.admin;
  if (req.query.status) filter.status = req.query.status;
  // Non-auditors only see their own history
  if (!req.permissions.includes('audit.view')) filter.principalId = req.admin._id;
  const [items, total] = await Promise.all([
    LoginHistory.find(filter).sort({ loginTime: -1 }).skip(p.skip).limit(p.limit).populate('principalId', 'fullName email'),
    LoginHistory.countDocuments(filter),
  ]);
  return ok(res, paginated(items, total, p));
}

// ---- Admin notifications (bell icon) ----

async function notifications(req, res) {
  const p = getPagination(req.query, 15);
  const filter = { recipientType: 'Admin', $or: [{ recipientId: null }, { recipientId: req.admin._id }] };
  if (req.query.unreadOnly === 'true') filter.readBy = { $ne: req.admin._id };
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, readBy: { $ne: req.admin._id } }),
  ]);
  const me = String(req.admin._id);
  const mapped = items.map(({ readBy = [], ...n }) => ({ ...n, isRead: readBy.map(String).includes(me) }));
  return ok(res, paginated(mapped, total, p, { unreadCount }));
}

async function markRead(req, res) {
  await Notification.updateOne({ _id: req.params.notificationId, recipientType: 'Admin' }, { $addToSet: { readBy: req.admin._id } });
  return ok(res, null, 'Marked as read');
}

async function markAllRead(req, res) {
  await Notification.updateMany({ recipientType: 'Admin', $or: [{ recipientId: null }, { recipientId: req.admin._id }] }, { $addToSet: { readBy: req.admin._id } });
  return ok(res, null, 'All marked as read');
}

module.exports = { auditLogs, auditLog, activityFeed, systemLogs, loginHistory, notifications, markRead, markAllRead };
