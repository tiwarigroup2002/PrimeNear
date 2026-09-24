const jwt = require('jsonwebtoken');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const { Seller } = require('../models');

/**
 * Seller app tokens
 *  - "seller-owner": proves the mobile number via OTP; only lets the owner pick a shop (10 min)
 *  - "seller":       bound to ONE shop (Seller document); used for every other API
 */
function signOwnerToken(mobileNumber) {
  return jwt.sign({ type: 'seller-owner', mobile: mobileNumber }, config.jwt.secret, { expiresIn: '10m' });
}

function signShopToken(seller) {
  return jwt.sign(
    { type: 'seller', sub: String(seller._id), mobile: seller.mobileNumber, v: seller.tokenVersion || 0 },
    config.jwt.secret,
    { expiresIn: process.env.SELLER_JWT_EXPIRE || '30d' }
  );
}

function verify(req, expectedTypes) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized('Please login');
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch (err) {
    throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'Session expired, please login again' : 'Invalid token');
  }
  if (!expectedTypes.includes(payload.type)) throw ApiError.unauthorized('Invalid token');
  return payload;
}

/** Accepts a shop token or an owner token (for shop listing / selection). */
async function authenticateOwner(req, _res, next) {
  const payload = verify(req, ['seller', 'seller-owner']);
  req.ownerMobile = payload.mobile;
  next();
}

/** Requires a shop token for an active shop. Sets req.seller and req.sellerId. */
async function authenticateSeller(req, _res, next) {
  const payload = verify(req, ['seller']);
  const seller = await Seller.findById(payload.sub);
  if (!seller || seller.status === 'Deleted') throw ApiError.unauthorized('Shop not found');
  if (seller.status === 'Blocked') throw ApiError.forbidden(`Your shop is blocked${seller.blockReason ? `: ${seller.blockReason}` : ''}. Contact support.`);
  if ((seller.tokenVersion || 0) !== (payload.v || 0)) throw ApiError.unauthorized('Session expired, please login again');
  req.seller = seller;
  req.sellerId = seller._id;
  req.ownerMobile = seller.mobileNumber;
  next();
}

module.exports = { signOwnerToken, signShopToken, authenticateOwner, authenticateSeller };
