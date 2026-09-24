const jwt = require('jsonwebtoken');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const { User } = require('../models');

function signUserToken(user) {
  return jwt.sign({ type: 'user', sub: String(user._id), v: user.tokenVersion || 0 }, config.jwt.secret, {
    expiresIn: process.env.USER_JWT_EXPIRE || '60d',
  });
}

async function authenticateUser(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized('Please login');
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch (err) {
    throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'Session expired, please login again' : 'Invalid token');
  }
  if (payload.type !== 'user') throw ApiError.unauthorized('Invalid token');
  const user = await User.findById(payload.sub);
  if (!user || user.status === 'Deleted') throw ApiError.unauthorized('Account not found');
  if (user.status === 'Blocked') throw ApiError.forbidden('Your account is blocked. Please contact support.');
  if ((user.tokenVersion || 0) !== (payload.v || 0)) throw ApiError.unauthorized('Session expired, please login again');
  req.user = user;
  req.userId = user._id;
  next();
}

module.exports = { signUserToken, authenticateUser };
