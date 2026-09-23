const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/respond');
const { getPagination, paginated, searchRegex, escapeRegex } = require('../../utils/pagination');
const { Category, SubCategory, Product, Order, Review } = require('../../models');
const { audit } = require('../../services/audit.service');
const { notifySeller } = require('../../services/notification.service');
const { fileUrl } = require('../../middleware/upload');
const { round2 } = require('../../services/metrics');
const { getSettings } = require('../../services/settings.service');

const ciExact = (name) => new RegExp(`^${escapeRegex(name.trim())}$`, 'i');

// ---------- Categories ----------

async function listCategories(req, res) {
  const filter = {};
  if (req.query.search) filter.name = searchRegex(req.query.search);
  if (req.query.status === 'active') filter.isActive = true;
  if (req.query.status === 'inactive') filter.isActive = false;
  const categories = await Category.find(filter).sort({ sortOrder: 1, name: 1 });
  const ids = categories.map((c) => c._id);
  const [subCounts, productCounts] = await Promise.all([
    SubCategory.aggregate([{ $match: { categoryId: { $in: ids } } }, { $group: { _id: '$categoryId', count: { $sum: 1 } } }]),
    Product.aggregate([{ $match: { categoryId: { $in: ids }, isDeleted: false } }, { $group: { _id: '$categoryId', count: { $sum: 1 } } }]),
  ]);
  const sub = Object.fromEntries(subCounts.map((s) => [String(s._id), s.count]));
  const prod = Object.fromEntries(productCounts.map((s) => [String(s._id), s.count]));
  return ok(res, categories.map((c) => ({ ...c.toJSON(), subCategoryCount: sub[String(c._id)] || 0, productCount: prod[String(c._id)] || 0 })));
}

async function createCategory(req, res) {
  if (await Category.exists({ name: ciExact(req.body.name) })) throw ApiError.conflict('Category already exists');
  const body = { ...req.body };
  if (req.file) body.icon = fileUrl('categories', req.file.filename);
  const category = await Category.create(body);
  await audit(req, { action: 'Created', entityType: 'Category', entityId: category._id, newValue: category });
  return created(res, category, 'Category created');
}

async function updateCategory(req, res) {
  const category = await Category.findById(req.params.categoryId);
  if (!category) throw ApiError.notFound('Category not found');
  if (req.body.name && (await Category.exists({ name: ciExact(req.body.name), _id: { $ne: category._id } }))) {
    throw ApiError.conflict('Category already exists');
  }
  const before = category.toJSON();
  Object.assign(category, req.body);
  if (req.file) category.icon = fileUrl('categories', req.file.filename);
  await category.save();
  await audit(req, { action: 'Updated', entityType: 'Category', entityId: category._id, oldValue: before, newValue: category });
  return ok(res, category, 'Category updated');
}

async function deleteCategory(req, res) {
  const category = await Category.findById(req.params.categoryId);
  if (!category) throw ApiError.notFound('Category not found');
  const products = await Product.countDocuments({ categoryId: category._id, isDeleted: false });
  if (products) throw ApiError.badRequest(`${products} product(s) use this category. Deactivate it instead, or move the products first.`);
  await SubCategory.deleteMany({ categoryId: category._id });
  await category.deleteOne();
  await audit(req, { action: 'Deleted', entityType: 'Category', entityId: category._id, oldValue: category });
  return ok(res, null, 'Category deleted');
}

// ---------- Sub-categories ----------

async function listSubCategories(req, res) {
  const filter = {};
  if (req.params.categoryId) filter.categoryId = req.params.categoryId;
  else if (req.query.categoryId) filter.categoryId = req.query.categoryId;
  if (req.query.search) filter.name = searchRegex(req.query.search);
  const subs = await SubCategory.find(filter).sort({ name: 1 }).populate('categoryId', 'name');
  const counts = await Product.aggregate([
    { $match: { subCategoryId: { $in: subs.map((s) => s._id) }, isDeleted: false } },
    { $group: { _id: '$subCategoryId', count: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  return ok(res, subs.map((s) => ({ ...s.toJSON(), productCount: map[String(s._id)] || 0 })));
}

async function createSubCategory(req, res) {
  const category = await Category.findById(req.params.categoryId);
  if (!category) throw ApiError.notFound('Category not found');
  if (await SubCategory.exists({ categoryId: category._id, name: ciExact(req.body.name) })) throw ApiError.conflict('Sub-category already exists');
  const body = { ...req.body, categoryId: category._id };
  if (req.file) body.icon = fileUrl('categories', req.file.filename);
  const sub = await SubCategory.create(body);
  await audit(req, { action: 'Created', entityType: 'SubCategory', entityId: sub._id, newValue: sub });
  return created(res, sub, 'Sub-category created');
}

async function updateSubCategory(req, res) {
  const sub = await SubCategory.findById(req.params.subCategoryId);
  if (!sub) throw ApiError.notFound('Sub-category not found');
  if (req.body.name && (await SubCategory.exists({ categoryId: sub.categoryId, name: ciExact(req.body.name), _id: { $ne: sub._id } }))) {
    throw ApiError.conflict('Sub-category already exists');
  }
  const before = sub.toJSON();
  Object.assign(sub, req.body);
  if (req.file) sub.icon = fileUrl('categories', req.file.filename);
  await sub.save();
  await audit(req, { action: 'Updated', entityType: 'SubCategory', entityId: sub._id, oldValue: before, newValue: sub });
  return ok(res, sub, 'Sub-category updated');
}

async function deleteSubCategory(req, res) {
  const sub = await SubCategory.findById(req.params.subCategoryId);
  if (!sub) throw ApiError.notFound('Sub-category not found');
  const products = await Product.countDocuments({ subCategoryId: sub._id, isDeleted: false });
  if (products) throw ApiError.badRequest(`${products} product(s) use this sub-category`);
  await sub.deleteOne();
  await audit(req, { action: 'Deleted', entityType: 'SubCategory', entityId: sub._id, oldValue: sub });
  return ok(res, null, 'Deleted');
}

// ---------- Products (platform wide) ----------

async function listProducts(req, res) {
  const p = getPagination(req.query);
  const filter = { isDeleted: false };
  const { seller, category, status, search } = req.query;
  if (seller) filter.sellerId = seller;
  if (category) filter.categoryId = category;
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  if (status === 'disabledByAdmin') filter.disabledByAdmin = true;
  if (status === 'outOfStock') filter.stock = { $lte: 0 };
  if (status === 'lowStock') filter.$expr = { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockThreshold'] }] };
  if (search) {
    const rx = searchRegex(search);
    filter.$or = [{ name: rx }, { sku: rx }];
  }
  const sort = { price: { finalPrice: 1 }, stock: { stock: 1 }, sales: { soldCount: -1 }, rating: { rating: -1 } }[req.query.sortBy] || { createdAt: -1 };
  const [items, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(p.skip).limit(p.limit)
      .populate('sellerId', 'shopName')
      .populate('categoryId', 'name')
      .populate('subCategoryId', 'name'),
    Product.countDocuments(filter),
  ]);
  return ok(res, paginated(items, total, p));
}

async function getProduct(req, res) {
  const product = await Product.findById(req.params.productId)
    .populate('sellerId', 'shopName ownerName mobileNumber')
    .populate('categoryId', 'name')
    .populate('subCategoryId', 'name');
  if (!product) throw ApiError.notFound('Product not found');
  const [sales, reviews] = await Promise.all([
    Order.aggregate([
      { $match: { 'items.productId': product._id, paymentStatus: { $in: ['Completed', 'PartiallyRefunded'] }, orderStatus: { $ne: 'Cancelled' } } },
      { $unwind: '$items' },
      { $match: { 'items.productId': product._id } },
      { $group: { _id: null, quantity: { $sum: '$items.quantity' }, revenue: { $sum: '$items.subtotal' }, orders: { $sum: 1 } } },
    ]),
    Review.find({ productId: product._id }).sort({ createdAt: -1 }).limit(20).populate('userId', 'name'),
  ]);
  const s = sales[0] || { quantity: 0, revenue: 0, orders: 0 };
  return ok(res, { product, sales: { quantity: s.quantity, revenue: round2(s.revenue), orders: s.orders }, reviews });
}

async function updateProduct(req, res) {
  const product = await Product.findById(req.params.productId);
  if (!product || product.isDeleted) throw ApiError.notFound('Product not found');
  const before = product.toJSON();
  if (req.body.gstRate !== undefined) {
    const slabs = (await getSettings()).gstSettings.slabs.map((sl) => sl.percentage);
    if (!slabs.includes(req.body.gstRate)) throw ApiError.badRequest(`GST rate must be one of: ${slabs.join(', ')}`);
  }
  if (req.body.subCategoryId || req.body.categoryId) {
    const catId = req.body.categoryId || product.categoryId;
    if (req.body.subCategoryId && !(await SubCategory.exists({ _id: req.body.subCategoryId, categoryId: catId }))) {
      throw ApiError.badRequest('Sub-category does not belong to the selected category');
    }
  }
  Object.assign(product, req.body);
  await product.save();
  await audit(req, { action: 'Updated', entityType: 'Product', entityId: product._id, oldValue: before, newValue: product });
  return ok(res, product, 'Product updated');
}

async function toggleProduct(req, res) {
  const product = await Product.findById(req.params.productId);
  if (!product || product.isDeleted) throw ApiError.notFound('Product not found');
  product.isActive = req.body.isActive;
  product.disabledByAdmin = !req.body.isActive;
  product.adminNote = req.body.isActive ? undefined : req.body.reason;
  await product.save();
  if (!req.body.isActive) {
    await notifySeller(product.sellerId, { title: 'Product disabled by admin', message: `"${product.name}" was disabled. ${req.body.reason || ''}`.trim(), type: 'Product', data: { productId: product._id } });
  }
  await audit(req, { action: req.body.isActive ? 'Enabled' : 'Disabled', entityType: 'Product', entityId: product._id, details: req.body.reason });
  return ok(res, product, 'Product status updated');
}

/** Hides / shows a review (moderation) */
async function moderateReview(req, res) {
  if (!mongoose.isValidObjectId(req.params.reviewId)) throw ApiError.badRequest('Invalid review id');
  const review = await Review.findByIdAndUpdate(req.params.reviewId, { isHidden: req.body.isHidden }, { returnDocument: 'after' });
  if (!review) throw ApiError.notFound('Review not found');
  await audit(req, { action: req.body.isHidden ? 'Hidden' : 'Unhidden', entityType: 'Review', entityId: review._id });
  return ok(res, review, 'Review updated');
}

module.exports = {
  listCategories, createCategory, updateCategory, deleteCategory,
  listSubCategories, createSubCategory, updateSubCategory, deleteSubCategory,
  listProducts, getProduct, updateProduct, toggleProduct, moderateReview,
};
