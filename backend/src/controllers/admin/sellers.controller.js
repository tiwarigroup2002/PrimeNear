const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/respond');
const { getPagination, paginated, searchRegex, dateRange } = require('../../utils/pagination');
const { Seller, Tahsil, District, Order, Customer, Product, Payment, Payout } = require('../../models');
const { audit } = require('../../services/audit.service');
const { notifySeller } = require('../../services/notification.service');
const { commissionRateFor } = require('../../services/settings.service');
const { sellerEarnings } = require('../../services/payout.service');
const { REVENUE_MATCH, NET_AMOUNT, round2 } = require('../../services/metrics');
const { fileUrl } = require('../../middleware/upload');
const { effectivePermissions } = require('../../config/permissions');

const oid = (id) => new mongoose.Types.ObjectId(String(id));

async function findSeller(id) {
  const seller = await Seller.findOne({ _id: id, status: { $ne: 'Deleted' } });
  if (!seller) throw ApiError.notFound('Seller not found');
  return seller;
}

/** Aggregated order/customer stats for a set of sellers keyed by sellerId. */
async function statsFor(sellerIds) {
  const [orderStats, customerStats] = await Promise.all([
    Order.aggregate([
      { $match: { sellerId: { $in: sellerIds }, ...REVENUE_MATCH } },
      { $group: { _id: '$sellerId', orders: { $sum: 1 }, revenue: { $sum: NET_AMOUNT } } },
    ]),
    Customer.aggregate([{ $match: { sellerId: { $in: sellerIds } } }, { $group: { _id: '$sellerId', customers: { $sum: 1 } } }]),
  ]);
  const map = {};
  orderStats.forEach((s) => { map[s._id] = { orders: s.orders, revenue: round2(s.revenue) }; });
  customerStats.forEach((s) => { map[s._id] = { ...(map[s._id] || {}), customers: s.customers }; });
  return map;
}

async function validateLocation(tahsilId, districtIds) {
  const tahsil = await Tahsil.findById(tahsilId);
  if (!tahsil) throw ApiError.badRequest('Selected tahsil does not exist');
  let ids = districtIds && districtIds.length ? districtIds : [tahsil.districtId];
  ids = [...new Set(ids.map(String))];
  const count = await District.countDocuments({ _id: { $in: ids } });
  if (count !== ids.length) throw ApiError.badRequest('One or more districts do not exist');
  return { tahsil, districtIds: ids };
}

async function list(req, res) {
  const p = getPagination(req.query);
  const filter = {};
  const { status, search, tahsilId, districtId, sortBy } = req.query;
  if (status && status !== 'all') filter.status = status;
  else filter.status = { $ne: 'Deleted' };
  if (tahsilId) filter.tahsilId = tahsilId;
  if (districtId) filter.districtIds = districtId;
  if (search) {
    const rx = searchRegex(search);
    filter.$or = [{ shopName: rx }, { ownerName: rx }, { mobileNumber: rx }, { email: rx }];
  }
  const sort = { recent: { createdAt: -1 }, oldest: { createdAt: 1 }, name: { shopName: 1 }, rating: { rating: -1 } }[sortBy] || { createdAt: -1 };

  const [sellers, total] = await Promise.all([
    Seller.find(filter).sort(sort).skip(p.skip).limit(p.limit).populate('tahsilId', 'name').populate('districtIds', 'name'),
    Seller.countDocuments(filter),
  ]);
  const stats = await statsFor(sellers.map((s) => s._id));
  const items = sellers.map((s) => ({ ...s.toJSON(), orders: 0, revenue: 0, customers: 0, ...(stats[s._id] || {}) }));
  const totals = await Order.aggregate([{ $match: REVENUE_MATCH }, { $group: { _id: null, revenue: { $sum: NET_AMOUNT } } }]);
  return ok(res, paginated(items, total, p, { totalRevenue: round2(totals[0]?.revenue) }));
}

async function getOne(req, res) {
  const seller = await Seller.findById(req.params.sellerId)
    .populate({ path: 'tahsilId', select: 'name districtId', populate: { path: 'districtId', select: 'name' } })
    .populate('districtIds', 'name')
    .populate('createdBy', 'fullName');
  if (!seller) throw ApiError.notFound('Seller not found');
  const sid = seller._id;

  const [stats, topProducts, recentOrders, productCounts, earnings, commissionRate] = await Promise.all([
    statsFor([sid]),
    Order.aggregate([
      { $match: { sellerId: sid, ...REVENUE_MATCH } },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', name: { $first: '$items.productName' }, quantity: { $sum: '$items.quantity' }, revenue: { $sum: '$items.subtotal' } } },
      { $sort: { quantity: -1 } },
      { $limit: 5 },
    ]),
    Order.find({ sellerId: sid }).sort({ createdAt: -1 }).limit(10).select('orderId finalAmount orderStatus paymentStatus paymentMethod source createdAt customerSnapshot'),
    Product.aggregate([
      { $match: { sellerId: sid, isDeleted: false } },
      { $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } }, outOfStock: { $sum: { $cond: [{ $lte: ['$stock', 0] }, 1, 0] } } } },
    ]),
    sellerEarnings(sid),
    commissionRateFor(seller),
  ]);

  const s = stats[sid] || {};
  const data = seller.toJSON();
  // Full bank account number only for admins who handle payouts
  if (effectivePermissions(req.admin).includes('payouts.manage')) data.bankDetails = seller.getBankDetails();

  return ok(res, {
    seller: { ...data, effectiveCommissionRate: commissionRate },
    analytics: {
      totalOrders: s.orders || 0,
      totalRevenue: s.revenue || 0,
      averageOrderValue: s.orders ? round2(s.revenue / s.orders) : 0,
      totalCustomers: s.customers || 0,
      rating: seller.rating,
      ratingCount: seller.ratingCount,
      products: productCounts[0] || { total: 0, active: 0, outOfStock: 0 },
      topProducts,
    },
    earnings,
    recentOrders,
  });
}

/** The shop's PIN code is added to its tahsil, so addresses with that PIN are inside the delivery area. */
async function attachPincode(pincode, tahsilId) {
  if (!pincode) return;
  const owner = await Tahsil.findOne({ pincodes: pincode }).select('name');
  if (owner && String(owner._id) !== String(tahsilId)) throw ApiError.badRequest(`PIN code ${pincode} belongs to tahsil ${owner.name}. Pick that tahsil or fix the PIN code.`);
  if (!owner) await Tahsil.updateOne({ _id: tahsilId }, { $addToSet: { pincodes: pincode } });
}

async function create(req, res) {
  const body = { ...req.body };
  const { districtIds, tahsil } = await validateLocation(body.tahsilId, body.districtIds);
  body.districtIds = districtIds;
  if (body.pincode) await attachPincode(body.pincode, tahsil._id);
  else delete body.pincode;
  if (await Seller.exists({ shopName: new RegExp(`^${body.shopName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })) {
    throw ApiError.conflict('A shop with this name already exists');
  }
  body.sellsAcrossDistricts = Boolean(body.sellsAcrossDistricts) || districtIds.some((id) => String(id) !== String(tahsil.districtId));
  const seller = await Seller.create({ ...body, createdBy: req.admin._id });
  await audit(req, { action: 'Created', entityType: 'Seller', entityId: seller._id, newValue: seller });
  return created(res, seller, 'Seller created');
}

async function update(req, res) {
  const seller = await findSeller(req.params.sellerId);
  const before = seller.toJSON();
  const body = { ...req.body };
  if (body.tahsilId || body.districtIds) {
    const loc = await validateLocation(body.tahsilId || seller.tahsilId, body.districtIds || seller.districtIds);
    body.districtIds = loc.districtIds;
    const homeDistrict = String(loc.tahsil.districtId);
    if (body.districtIds.some((id) => String(id) !== homeDistrict)) body.sellsAcrossDistricts = true;
  }
  if (body.pincode) await attachPincode(body.pincode, body.tahsilId || seller.tahsilId);
  else if (body.pincode === '') body.pincode = undefined;
  if ('commissionRate' in body && !effectivePermissions(req.admin).includes('sellers.commission')) {
    throw ApiError.forbidden('You cannot change seller commission');
  }
  if (body.bankDetails) {
    const current = seller.getBankDetails();
    // Keep the existing account number when the form sends it back masked/empty
    if (!body.bankDetails.accountNumber || /X/.test(body.bankDetails.accountNumber)) body.bankDetails.accountNumber = current.accountNumber;
    seller.bankDetails = body.bankDetails;
    delete body.bankDetails;
  }
  if (body.settings) {
    seller.settings = { ...(seller.settings?.toObject?.() || {}), ...body.settings };
    delete body.settings;
  }
  Object.assign(seller, body);
  await seller.save();
  await audit(req, { action: 'Updated', entityType: 'Seller', entityId: seller._id, oldValue: before, newValue: seller });
  return ok(res, seller, 'Seller updated');
}

async function uploadImage(req, res) {
  const seller = await findSeller(req.params.sellerId);
  if (!req.file) throw ApiError.badRequest('Please choose an image');
  seller.shopImage = fileUrl('sellers', req.file.filename);
  await seller.save();
  await audit(req, { action: 'Updated', entityType: 'Seller', entityId: seller._id, details: 'Shop image changed' });
  return ok(res, { shopImage: seller.shopImage }, 'Shop image updated');
}

async function block(req, res) {
  const seller = await findSeller(req.params.sellerId);
  if (seller.status === 'Blocked') throw ApiError.badRequest('Seller is already blocked');
  seller.status = 'Blocked';
  seller.blockReason = req.body.reason;
  seller.tokenVersion += 1;
  await seller.save();
  await notifySeller(seller._id, { title: 'Shop blocked', message: `Your shop has been blocked. Reason: ${req.body.reason}`, type: 'Account' });
  await audit(req, { action: 'Blocked', entityType: 'Seller', entityId: seller._id, details: req.body.reason });
  return ok(res, { seller, notificationSent: true }, 'Seller blocked');
}

async function unblock(req, res) {
  const seller = await findSeller(req.params.sellerId);
  if (seller.status !== 'Blocked') throw ApiError.badRequest('Seller is not blocked');
  seller.status = 'Active';
  seller.blockReason = undefined;
  await seller.save();
  await notifySeller(seller._id, { title: 'Shop unblocked', message: 'Your shop is active again.', type: 'Account' });
  await audit(req, { action: 'Unblocked', entityType: 'Seller', entityId: seller._id });
  return ok(res, seller, 'Seller unblocked');
}

async function remove(req, res) {
  const seller = await findSeller(req.params.sellerId);
  const openOrders = await Order.countDocuments({ sellerId: seller._id, orderStatus: { $in: ['Pending', 'Confirmed', 'Packed', 'Shipped'] } });
  if (openOrders) throw ApiError.badRequest(`Seller has ${openOrders} open order(s). Complete or cancel them first.`);
  seller.status = 'Deleted';
  seller.deletedAt = new Date();
  seller.deleteReason = req.body?.reason;
  seller.tokenVersion += 1;
  await seller.save();
  await Product.updateMany({ sellerId: seller._id }, { isActive: false });
  await audit(req, { action: 'Deleted', entityType: 'Seller', entityId: seller._id, details: req.body?.reason });
  return ok(res, null, 'Seller deleted');
}

async function updateCommission(req, res) {
  const seller = await findSeller(req.params.sellerId);
  const old = seller.commissionRate;
  seller.commissionRate = 0;
  await seller.save();
  await audit(req, { action: 'CommissionChanged', entityType: 'Seller', entityId: seller._id, oldValue: { commissionRate: old }, newValue: { commissionRate: 0 }, details: 'Platform does not take a cut' });
  return ok(res, { newRate: 0, commissionRate: 0 }, 'The shop keeps the full amount. The platform does not take a commission.');
}

async function assignDistricts(req, res) {
  const seller = await findSeller(req.params.sellerId);
  const { districtIds } = await validateLocation(seller.tahsilId, req.body.districtIds);
  const old = seller.districtIds;
  seller.districtIds = districtIds;
  seller.sellsAcrossDistricts = true;
  await seller.save();
  await seller.populate('districtIds', 'name');
  await audit(req, { action: 'DistrictsAssigned', entityType: 'Seller', entityId: seller._id, oldValue: { districtIds: old }, newValue: { districtIds } });
  return ok(res, { districts: seller.districtIds }, 'Districts assigned');
}

async function products(req, res) {
  const p = getPagination(req.query);
  const filter = { sellerId: req.params.sellerId, isDeleted: false };
  if (req.query.status === 'active') filter.isActive = true;
  if (req.query.status === 'inactive') filter.isActive = false;
  if (req.query.status === 'outOfStock') filter.stock = { $lte: 0 };
  if (req.query.search) filter.name = searchRegex(req.query.search);
  const [items, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('categoryId', 'name').populate('subCategoryId', 'name'),
    Product.countDocuments(filter),
  ]);
  return ok(res, paginated(items, total, p));
}

async function orders(req, res) {
  const p = getPagination(req.query);
  const filter = { sellerId: oid(req.params.sellerId), ...dateRange(req.query) };
  if (req.query.status) filter.orderStatus = req.query.status;
  const [items, total, revenue] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('userId', 'name mobileNumber'),
    Order.countDocuments(filter),
    Order.aggregate([{ $match: { ...filter, ...REVENUE_MATCH } }, { $group: { _id: null, total: { $sum: NET_AMOUNT } } }]),
  ]);
  return ok(res, paginated(items, total, p, { totalRevenue: round2(revenue[0]?.total) }));
}

async function customers(req, res) {
  const p = getPagination(req.query);
  const filter = { sellerId: req.params.sellerId };
  if (req.query.search) {
    const rx = searchRegex(req.query.search);
    filter.$or = [{ name: rx }, { mobileNumber: rx }];
  }
  const [items, total] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('userId', 'name mobileNumber status'),
    Customer.countDocuments(filter),
  ]);
  return ok(res, paginated(items, total, p));
}

async function payments(req, res) {
  const p = getPagination(req.query);
  const filter = { sellerId: oid(req.params.sellerId), ...dateRange(req.query) };
  const [items, total, sum, payouts] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('orderId', 'orderId'),
    Payment.countDocuments(filter),
    Payment.aggregate([{ $match: { ...filter, status: 'Success' } }, { $group: { _id: '$type', total: { $sum: '$amount' } } }]),
    Payout.find({ sellerId: req.params.sellerId }).sort({ createdAt: -1 }).limit(20),
  ]);
  const totals = Object.fromEntries(sum.map((s) => [s._id, round2(s.total)]));
  return ok(res, paginated(items, total, p, { totalAmount: totals.Payment || 0, totalRefunds: totals.Refund || 0, payouts }));
}

/** GET /sellers/lookup?search= - lightweight list for dropdowns */
async function lookup(req, res) {
  const filter = { status: 'Active' };
  if (req.query.search) filter.shopName = searchRegex(req.query.search);
  const items = await Seller.find(filter).sort({ shopName: 1 }).limit(50).select('shopName ownerName mobileNumber tahsilId');
  return ok(res, items);
}

module.exports = {
  list, getOne, create, update, uploadImage, block, unblock, remove,
  updateCommission, assignDistricts, products, orders, customers, payments, lookup,
};
