const { parse } = require('csv-parse/sync');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/respond');
const { getPagination, paginated, searchRegex } = require('../../utils/pagination');
const { Customer, User, Order } = require('../../models');
const { REVENUE_MATCH, NET_AMOUNT, round2 } = require('../../services/metrics');
const { assertCanAddCustomers, customerUsage } = require('../../services/customer-limit.service');

const MOBILE_RX = /^[6-9]\d{9}$/;
const normalise = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  return d;
};

async function findCustomer(req) {
  const c = await Customer.findOne({ _id: req.params.customerId, sellerId: req.sellerId });
  if (!c) throw ApiError.notFound('Customer not found');
  return c;
}

/**
 * Adds a customer to the shop. This is what lets the person log in to the user app
 * and see this shop's products.
 */
async function addCustomer(seller, { mobileNumber, name, email, address }) {
  let user = await User.findOne({ mobileNumber });
  if (user?.status === 'Blocked') throw ApiError.badRequest('This number is blocked on the platform. Contact support.');
  if (user && (await Customer.exists({ sellerId: seller._id, userId: user._id }))) throw ApiError.conflict('This customer is already added to your shop');
  await assertCanAddCustomers(seller);
  if (!user) user = await User.create({ mobileNumber, name: name || undefined, email: email || undefined });
  else if (user.status === 'Deleted') {
    user.status = 'Active';
    await user.save();
  }
  if (!user.name && name) {
    user.name = name;
    await user.save();
  }
  if (await Customer.exists({ sellerId: seller._id, userId: user._id })) throw ApiError.conflict('This customer is already added to your shop');
  return Customer.create({ sellerId: seller._id, userId: user._id, mobileNumber, name: name || user.name, email, address, customerType: 'Retail', linkedBy: 'Seller' });
}

async function list(req, res) {
  const p = getPagination(req.query);
  const filter = { sellerId: req.sellerId };
  if (req.query.search) {
    const rx = searchRegex(req.query.search);
    filter.$or = [{ name: rx }, { mobileNumber: rx }];
  }
  if (req.query.customerType) filter.customerType = req.query.customerType;
  const sort = { spent: { totalSpent: -1 }, recent: { lastPurchaseDate: -1 }, name: { name: 1 } }[req.query.sortBy] || { createdAt: -1 };
  const [items, total, usage] = await Promise.all([Customer.find(filter).sort(sort).skip(p.skip).limit(p.limit), Customer.countDocuments(filter), customerUsage(req.seller)]);
  // customerLimit / customerCount: how many customers the admin allows and how many are added
  return ok(res, paginated(items, total, p, { customerCount: usage.used, customerLimit: usage.limit, customersLeft: usage.remaining }));
}

/** GET /customers/search?q= - quick picker for billing */
async function quickSearch(req, res) {
  const filter = { sellerId: req.sellerId };
  if (req.query.q) {
    const rx = searchRegex(req.query.q);
    filter.$or = [{ name: rx }, { mobileNumber: rx }];
  }
  const items = await Customer.find(filter).sort({ lastPurchaseDate: -1 }).limit(10).select('name mobileNumber customerType');
  return ok(res, items);
}

async function create(req, res) {
  const customer = await addCustomer(req.seller, req.body);
  return created(res, customer, 'Customer added successfully');
}

async function getOne(req, res) {
  const customer = await findCustomer(req);
  const [orders, stats] = await Promise.all([
    Order.find({ sellerId: req.sellerId, $and: [{ $or: [{ customerId: customer._id }, { userId: customer.userId }] }, { $nor: [{ source: 'Online', paymentMethod: 'Online', paymentStatus: { $in: ['Pending', 'Failed'] } }] }] }).sort({ createdAt: -1 }).limit(50).select('orderId finalAmount refundedAmount orderStatus paymentStatus paymentMethod source createdAt'),
    Order.aggregate([
      { $match: { sellerId: req.sellerId, ...REVENUE_MATCH, $or: [{ customerId: customer._id }, { userId: customer.userId }] } },
      { $group: { _id: null, count: { $sum: 1 }, spent: { $sum: NET_AMOUNT } } },
    ]),
  ]);
  const s = stats[0] || { count: 0, spent: 0 };
  return ok(res, { customer, orders, stats: { totalOrders: s.count, totalSpent: round2(s.spent), averageOrderValue: s.count ? round2(s.spent / s.count) : 0 } });
}

/**
 * A new phone number moves this shop link to the account of that number (created if needed).
 * The old number loses access to this shop; its account and other shops are not touched.
 */
async function changeMobile(seller, customer, mobileNumber) {
  if (mobileNumber === customer.mobileNumber) return;
  let user = await User.findOne({ mobileNumber });
  if (user?.status === 'Blocked') throw ApiError.badRequest('This number is blocked on the platform. Contact support.');
  if (user && (await Customer.exists({ sellerId: seller._id, userId: user._id, _id: { $ne: customer._id } }))) {
    throw ApiError.conflict('Another customer of your shop already uses this number');
  }
  if (!user) user = await User.create({ mobileNumber, name: customer.name || undefined, email: customer.email || undefined });
  else if (user.status === 'Deleted') {
    user.status = 'Active';
    await user.save();
  }
  const oldUserId = customer.userId;
  customer.userId = user._id;
  customer.mobileNumber = mobileNumber;
  await User.updateOne({ _id: oldUserId, currentActiveSellerId: seller._id }, { $unset: { currentActiveSellerId: 1 } });
}

async function update(req, res) {
  const customer = await findCustomer(req);
  const body = { ...req.body };
  delete body.customerType;
  if (body.mobileNumber) await changeMobile(req.seller, customer, body.mobileNumber);
  delete body.mobileNumber;
  Object.assign(customer, body);
  customer.customerType = 'Retail';
  await customer.save();
  return ok(res, customer, 'Customer updated');
}

/** DELETE - removes the customer from this shop (user account stays) */
async function remove(req, res) {
  const customer = await findCustomer(req);
  await customer.deleteOne();
  await User.updateOne({ _id: customer.userId, currentActiveSellerId: req.sellerId }, { $unset: { currentActiveSellerId: 1 } });
  return ok(res, null, 'Customer removed from your shop');
}

/** POST /customers/bulk-link (csvFile) columns: mobileNumber, name, customerType */
async function bulkLink(req, res) {
  if (!req.file) throw ApiError.badRequest('Please upload a CSV file');
  let rows;
  try {
    rows = parse(req.file.buffer.toString('utf8').replace(/^﻿/, ''), { columns: (h) => h.map((c) => c.trim().toLowerCase()), skip_empty_lines: true, trim: true });
  } catch (err) {
    throw ApiError.badRequest(`Could not read CSV: ${err.message}`);
  }
  if (rows.length > 2000) throw ApiError.badRequest('Maximum 2000 rows per upload');
  let linkedCount = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const mobileNumber = normalise(r.mobilenumber || r.mobile || r.phone);
    try {
      if (!MOBILE_RX.test(mobileNumber)) throw new Error('Invalid mobile number');
      await addCustomer(req.seller, { mobileNumber, name: r.name });
      linkedCount += 1;
    } catch (err) {
      errors.push({ row: i + 2, mobileNumber, message: err.message });
    }
  }
  return ok(res, { linkedCount, failedCount: errors.length, errors }, `${linkedCount} customer(s) added`);
}

module.exports = { list, quickSearch, create, getOne, update, remove, bulkLink, addCustomer };
