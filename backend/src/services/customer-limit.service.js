const ApiError = require('../utils/ApiError');
const { Customer } = require('../models');

/**
 * Each shop may add only as many customers as the admin allowed (seller.customerLimit).
 * Older shops without a limit (null) are not restricted.
 */
async function customerUsage(seller) {
  const used = await Customer.countDocuments({ sellerId: seller._id });
  const limit = seller.customerLimit ?? null;
  return { used, limit, remaining: limit === null ? null : Math.max(0, limit - used) };
}

/** Throws (code CUSTOMER_LIMIT) when the shop cannot add `count` more customers. */
async function assertCanAddCustomers(seller, count = 1) {
  const { used, limit } = await customerUsage(seller);
  if (limit !== null && used + count > limit) {
    const err = ApiError.forbidden(
      used >= limit
        ? `Customer limit reached: ${seller.shopName} can have ${limit} customers. Ask the admin to increase the limit.`
        : `Only ${limit - used} more customer(s) can be added (limit ${limit}).`
    );
    err.code = 'CUSTOMER_LIMIT';
    throw err;
  }
}

module.exports = { customerUsage, assertCanAddCustomers };
