const jwt = require('jsonwebtoken');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const { Admin } = require('../models');
const { effectivePermissions } = require('../config/permissions');

function signAdminToken(admin, { twoFactorPending = false } = {}) {
  return jwt.sign(
    { sub: String(admin._id), type: twoFactorPending ? 'admin-2fa' : 'admin', role: admin.role, v: admin.tokenVersion },
    config.jwt.secret,
    { expiresIn: twoFactorPending ? '5m' : config.jwt.expire }
  );
}

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

async function loadAdminFromToken(token, expectedType) {
  if (!token) throw ApiError.unauthorized('Authentication required');
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch (err) {
    throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'Session expired, please login again' : 'Invalid token');
  }
  if (payload.type !== expectedType) throw ApiError.unauthorized('Invalid token');
  const admin = await Admin.findById(payload.sub);
  if (!admin || admin.isDeleted) throw ApiError.unauthorized('Account not found');
  if (!admin.isActive) throw ApiError.forbidden('Your account has been deactivated');
  if ((admin.tokenVersion || 0) !== (payload.v || 0)) throw ApiError.unauthorized('Session expired, please login again');
  return admin;
}

/** Requires a fully authenticated admin (password + 2FA if enabled). */
async function authenticateAdmin(req, _res, next) {
  const admin = await loadAdminFromToken(readToken(req), 'admin');
  req.admin = admin;
  req.permissions = effectivePermissions(admin);
  next();
}

/** Used only by /auth/verify-2fa: accepts the short lived "2FA pending" token. */
async function authenticatePending2fa(req, _res, next) {
  req.admin = await loadAdminFromToken(readToken(req), 'admin-2fa');
  next();
}

/** Allows the request when the admin has ANY of the listed permissions. */
function requirePermission(...perms) {
  return (req, _res, next) => {
    if (!req.admin) return next(ApiError.unauthorized());
    if (perms.some((p) => req.permissions.includes(p))) return next();
    return next(ApiError.forbidden());
  };
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (req.admin && roles.includes(req.admin.role)) return next();
    return next(ApiError.forbidden());
  };
}

module.exports = { signAdminToken, authenticateAdmin, authenticatePending2fa, requirePermission, requireRole };
