const { AuditLog } = require('../models');
const logger = require('../config/logger');

/** Strips secrets & mongoose internals before storing values in the audit log. */
function clean(value) {
  if (!value) return value;
  const obj = typeof value.toJSON === 'function' ? value.toJSON() : JSON.parse(JSON.stringify(value));
  ['password', 'twoFactorSecret', 'passwordResetToken', '__v'].forEach((k) => delete obj[k]);
  return obj;
}

/**
 * Records an admin action. Never throws: auditing must not break the request.
 */
async function audit(req, { action, entityType, entityId, oldValue, newValue, details, status = 'Success' }) {
  try {
    await AuditLog.create({
      adminId: req.admin?._id,
      action,
      entityType,
      entityId,
      oldValue: clean(oldValue),
      newValue: clean(newValue),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status,
      details,
    });
  } catch (err) {
    logger.warn(`Audit log failed: ${err.message}`);
  }
}

module.exports = { audit };
