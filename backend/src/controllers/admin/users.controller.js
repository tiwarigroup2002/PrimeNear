const mongoose = require('mongoose');
const { parse } = require('csv-parse/sync');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/respond');
const { getPagination, paginated, searchRegex, escapeRegex } = require('../../utils/pagination');
const { User, Customer, Seller, Order } = require('../../models');
const { audit } = require('../../services/audit.service');
const { REVENUE_MATCH, NET_AMOUNT, round2 } = require('../../services/metrics');

const MOBILE_RX = /^[6-9]\d{9}$/;

function normaliseMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');
  // Accept +91 / 0 prefixes
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

async function findUser(id) {
  const user = await User.findOne({ _id: id, status: { $ne: 'Deleted' } });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

async function orderStatsFor(userIds) {
  const rows = await Order.aggregate([
    { $match: { userId: { $in: userIds }, ...REVENUE_MATCH } },
    { $group: { _id: '$userId', totalOrders: { $sum: 1 }, totalSpent: { $sum: NET_AMOUNT }, lastPurchase: { $max: '$createdAt' } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), { totalOrders: r.totalOrders, totalSpent: round2(r.totalSpent), lastPurchase: r.lastPurchase }]));
}

/** Creates the Customer link (idempotent). Returns { link, created }. */
async function linkUserToSeller(user, seller, { name, customerType, linkedBy = 'Admin', adminId } = {}) {
  const existing = await Customer.findOne({ sellerId: seller._id, userId: user._id });
  if (existing) return { link: existing, created: false };
  const link = await Customer.create({
    sellerId: seller._id,
    userId: user._id,
    mobileNumber: user.mobileNumber,
    name: name || user.name,
    customerType: 'Retail',
    linkedBy,
    linkedByAdmin: adminId,
  });
  return { link, created: true };
}

async function list(req, res) {
  const p = getPagination(req.query);
  const filter = {};
  const { status, search, tahsilId, sellerId, linked } = req.query;
  filter.status = status && status !== 'all' ? status : { $ne: 'Deleted' };
  if (tahsilId) filter.tahsilId = tahsilId;
  if (search) {
    const rx = searchRegex(search);
    filter.$or = [{ name: rx }, { mobileNumber: rx }, { email: rx }];
  }
  if (sellerId) {
    filter._id = { $in: await Customer.distinct('userId', { sellerId }) };
  } else if (linked === 'none') {
    filter._id = { $nin: await Customer.distinct('userId') };
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('tahsilId', 'name'),
    User.countDocuments(filter),
  ]);
  const ids = users.map((u) => u._id);
  const [stats, links] = await Promise.all([
    orderStatsFor(ids),
    Customer.aggregate([{ $match: { userId: { $in: ids } } }, { $group: { _id: '$userId', count: { $sum: 1 } } }]),
  ]);
  const linkCount = Object.fromEntries(links.map((l) => [String(l._id), l.count]));
  const items = users.map((u) => ({
    ...u.toJSON(),
    linkedSellersCount: linkCount[String(u._id)] || 0,
    totalOrders: 0,
    totalSpent: 0,
    lastPurchase: null,
    ...(stats[String(u._id)] || {}),
  }));
  return ok(res, paginated(items, total, p));
}

async function getOne(req, res) {
  const user = await User.findById(req.params.userId).populate('tahsilId', 'name').populate('currentActiveSellerId', 'shopName');
  if (!user) throw ApiError.notFound('User not found');
  const [stats, links, recentOrders] = await Promise.all([
    orderStatsFor([user._id]),
    Customer.find({ userId: user._id }).populate('sellerId', 'shopName ownerName mobileNumber status').sort({ createdAt: -1 }),
    Order.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10).populate('sellerId', 'shopName').select('orderId sellerId finalAmount orderStatus paymentStatus createdAt'),
  ]);
  const s = stats[String(user._id)] || { totalOrders: 0, totalSpent: 0, lastPurchase: null };
  return ok(res, {
    user,
    analytics: { ...s, averageOrderValue: s.totalOrders ? round2(s.totalSpent / s.totalOrders) : 0 },
    linkedSellers: links.map((l) => ({ linkId: l._id, seller: l.sellerId, customerType: l.customerType, linkedBy: l.linkedBy, linkedAt: l.createdAt, totalOrders: l.totalOrders, totalSpent: l.totalSpent })),
    recentOrders,
    addresses: user.addresses,
    wishlist: [],
  });
}

/** POST /users - create a user by mobile number and link to a seller */
async function create(req, res) {
  const { mobileNumber, name, email, sellerId, customerType } = req.body;
  const seller = await Seller.findOne({ _id: sellerId, status: 'Active' });
  if (!seller) throw ApiError.badRequest('Seller not found or not active');
  let user = await User.findOne({ mobileNumber });
  let isNew = false;
  if (user && user.status === 'Deleted') {
    user.status = 'Active';
    if (name) user.name = name;
    await user.save();
  }
  if (!user) {
    user = await User.create({ mobileNumber, name, email });
    isNew = true;
  }
  const { created: linked } = await linkUserToSeller(user, seller, { name, customerType, adminId: req.admin._id });
  await audit(req, { action: isNew ? 'Created' : 'Linked', entityType: 'User', entityId: user._id, details: `Linked to ${seller.shopName}` });
  return created(res, { user, linked, isNewUser: isNew }, linked ? `User linked to ${seller.shopName}` : `User was already linked to ${seller.shopName}`);
}

async function update(req, res) {
  const user = await findUser(req.params.userId);
  const before = user.toJSON();
  if (req.body.mobileNumber && req.body.mobileNumber !== user.mobileNumber) {
    if (await User.exists({ mobileNumber: req.body.mobileNumber })) throw ApiError.conflict('Another user already uses this mobile number');
    await Customer.updateMany({ userId: user._id }, { mobileNumber: req.body.mobileNumber });
    user.tokenVersion += 1;
  }
  Object.assign(user, req.body);
  await user.save();
  await audit(req, { action: 'Updated', entityType: 'User', entityId: user._id, oldValue: before, newValue: user });
  return ok(res, user, 'User updated');
}

async function linkSeller(req, res) {
  const user = await findUser(req.params.userId);
  const seller = await Seller.findOne({ _id: req.body.sellerId, status: 'Active' });
  if (!seller) throw ApiError.badRequest('Seller not found or not active');
  const { created: isNew } = await linkUserToSeller(user, seller, { customerType: req.body.customerType, adminId: req.admin._id });
  if (!isNew) throw ApiError.conflict('User is already linked to this seller');
  await audit(req, { action: 'Linked', entityType: 'User', entityId: user._id, newValue: { sellerId: seller._id, shopName: seller.shopName } });
  return ok(res, null, 'User linked to seller');
}

async function unlinkSeller(req, res) {
  const user = await findUser(req.params.userId);
  const link = await Customer.findOneAndDelete({ userId: user._id, sellerId: req.body.sellerId });
  if (!link) throw ApiError.notFound('User is not linked to this seller');
  if (String(user.currentActiveSellerId) === String(req.body.sellerId)) {
    user.currentActiveSellerId = undefined;
    await user.save();
  }
  await audit(req, { action: 'Unlinked', entityType: 'User', entityId: user._id, oldValue: { sellerId: req.body.sellerId } });
  return ok(res, null, 'User unlinked from seller');
}

/**
 * POST /users/bulk-link (multipart csvFile)
 * CSV columns: mobileNumber, name, sellerName (shop name) [, customerType]
 * Send dryRun=true to only validate and preview.
 */
async function bulkLink(req, res) {
  if (!req.file) throw ApiError.badRequest('Please upload a CSV file');
  const dryRun = String(req.body.dryRun) === 'true';
  let rows;
  try {
    rows = parse(req.file.buffer.toString('utf8').replace(/^﻿/, ''), { columns: (h) => h.map((c) => c.trim().toLowerCase()), skip_empty_lines: true, trim: true });
  } catch (err) {
    throw ApiError.badRequest(`Could not read CSV: ${err.message}`);
  }
  if (!rows.length) throw ApiError.badRequest('CSV file is empty');
  if (rows.length > 5000) throw ApiError.badRequest('Maximum 5000 rows per upload');

  const sellerCache = {};
  const results = [];
  let linkedCount = 0;
  let alreadyLinked = 0;
  let newUsers = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const rowNo = i + 2; // header is row 1
    const mobileNumber = normaliseMobile(r.mobilenumber || r.mobile || r.phone);
    const name = r.name || '';
    const shopName = (r.sellername || r.shopname || r.seller || '').trim();
    const customerType = 'Retail';
    const out = { row: rowNo, mobileNumber, name, sellerName: shopName };

    if (!MOBILE_RX.test(mobileNumber)) {
      results.push({ ...out, status: 'error', message: 'Invalid mobile number' });
      continue;
    }
    if (!shopName) {
      results.push({ ...out, status: 'error', message: 'Seller name missing' });
      continue;
    }
    const key = shopName.toLowerCase();
    if (!(key in sellerCache)) {
      sellerCache[key] = await Seller.findOne({ shopName: new RegExp(`^${escapeRegex(shopName)}$`, 'i'), status: 'Active' });
    }
    const seller = sellerCache[key];
    if (!seller) {
      results.push({ ...out, status: 'error', message: `Seller "${shopName}" not found or inactive` });
      continue;
    }

    let user = await User.findOne({ mobileNumber });
    if (user && user.status === 'Blocked') {
      results.push({ ...out, status: 'error', message: 'User is blocked' });
      continue;
    }
    if (dryRun) {
      const exists = user && (await Customer.exists({ userId: user._id, sellerId: seller._id }));
      results.push({ ...out, status: exists ? 'skipped' : 'ok', message: exists ? 'Already linked' : user ? 'Will link existing user' : 'Will create user and link' });
      continue;
    }
    if (!user) {
      user = await User.create({ mobileNumber, name: name || undefined });
      newUsers += 1;
    } else if (user.status === 'Deleted') {
      user.status = 'Active';
      await user.save();
    }
    const { created: isNew } = await linkUserToSeller(user, seller, { name, customerType, linkedBy: 'Bulk', adminId: req.admin._id });
    if (isNew) linkedCount += 1;
    else alreadyLinked += 1;
    results.push({ ...out, status: isNew ? 'ok' : 'skipped', message: isNew ? 'Linked' : 'Already linked' });
  }

  const errors = results.filter((r) => r.status === 'error');
  if (!dryRun) {
    await audit(req, { action: 'BulkLinked', entityType: 'User', details: `${linkedCount} linked, ${newUsers} new users, ${errors.length} failed (${req.file.originalname})` });
  }
  return ok(res, {
    dryRun,
    totalRows: rows.length,
    linkedCount,
    alreadyLinked,
    newUsers,
    failedCount: errors.length,
    errors,
    results: results.slice(0, 1000),
  });
}

async function block(req, res) {
  const user = await findUser(req.params.userId);
  if (user.status === 'Blocked') throw ApiError.badRequest('User is already blocked');
  user.status = 'Blocked';
  user.blockReason = req.body.reason;
  user.tokenVersion += 1;
  await user.save();
  await audit(req, { action: 'Blocked', entityType: 'User', entityId: user._id, details: req.body.reason });
  return ok(res, user, 'User blocked');
}

async function unblock(req, res) {
  const user = await findUser(req.params.userId);
  if (user.status !== 'Blocked') throw ApiError.badRequest('User is not blocked');
  user.status = 'Active';
  user.blockReason = undefined;
  await user.save();
  await audit(req, { action: 'Unblocked', entityType: 'User', entityId: user._id });
  return ok(res, user, 'User unblocked');
}

async function remove(req, res) {
  const user = await findUser(req.params.userId);
  const open = await Order.countDocuments({ userId: user._id, orderStatus: { $in: ['Pending', 'Confirmed', 'Packed', 'Shipped'] } });
  if (open) throw ApiError.badRequest(`User has ${open} open order(s)`);
  user.status = 'Deleted';
  user.tokenVersion += 1;
  await user.save();
  await Customer.deleteMany({ userId: user._id });
  await audit(req, { action: 'Deleted', entityType: 'User', entityId: user._id });
  return ok(res, null, 'User deleted');
}

async function orders(req, res) {
  const p = getPagination(req.query);
  const filter = { userId: new mongoose.Types.ObjectId(String(req.params.userId)) };
  if (req.query.status) filter.orderStatus = req.query.status;
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('sellerId', 'shopName'),
    Order.countDocuments(filter),
  ]);
  return ok(res, paginated(items, total, p));
}

/** GET /users/lookup?search= - for dropdowns */
async function lookup(req, res) {
  const filter = { status: 'Active' };
  if (req.query.search) {
    const rx = searchRegex(req.query.search);
    filter.$or = [{ name: rx }, { mobileNumber: rx }];
  }
  const items = await User.find(filter).sort({ createdAt: -1 }).limit(20).select('name mobileNumber');
  return ok(res, items);
}

module.exports = { list, getOne, create, update, linkSeller, unlinkSeller, bulkLink, block, unblock, remove, orders, lookup, linkUserToSeller };
