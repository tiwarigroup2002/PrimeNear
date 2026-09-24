const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { parse } = require('csv-parse/sync');
const config = require('../../config');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/respond');
const { getPagination, paginated, searchRegex, escapeRegex } = require('../../utils/pagination');
const { fileUrl } = require('../../middleware/upload');
const { Product, Category, SubCategory, Counter, Customer, Notification, StockMovement } = require('../../models');
const { getSettings } = require('../../services/settings.service');

const MAX_IMAGES = 6;

async function findProduct(req) {
  const product = await Product.findOne({ _id: req.params.productId, sellerId: req.sellerId, isDeleted: false });
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}

async function validateCatalog({ categoryId, subCategoryId, gstRate }) {
  if (categoryId) {
    const cat = await Category.findOne({ _id: categoryId, isActive: true });
    if (!cat) throw ApiError.badRequest('Select a valid category');
    if (subCategoryId && !(await SubCategory.exists({ _id: subCategoryId, categoryId, isActive: true }))) {
      throw ApiError.badRequest('Sub-category does not belong to the selected category');
    }
  }
  if (gstRate !== undefined) {
    const slabs = (await getSettings()).gstSettings.slabs.map((s) => s.percentage);
    if (!slabs.includes(Number(gstRate))) throw ApiError.badRequest(`GST rate must be one of: ${slabs.join(', ')}%`);
  }
}

/** SKU like BHAG-FOO-0007 (shop prefix, category prefix, running number per shop). */
async function nextSku(seller, categoryId) {
  const cat = await Category.findById(categoryId).select('name');
  const clean = (s, n) => (s || 'X').replace(/[^A-Za-z0-9]/g, '').slice(0, n).toUpperCase() || 'X';
  const counter = await Counter.findOneAndUpdate({ _id: `SKU-${seller._id}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return `${clean(seller.shopName, 4)}-${clean(cat?.name, 3)}-${String(counter.seq).padStart(4, '0')}`;
}

function removeFiles(urls) {
  urls.filter((u) => u?.startsWith('/uploads/products/')).forEach((u) => fs.rm(path.join(config.uploadDir, u.replace('/uploads/', '')), { force: true }, () => {}));
}

/** Tells linked customers about a new product (spec: users are notified only for new products). */
async function announceNewProduct(seller, product) {
  const userIds = await Customer.distinct('userId', { sellerId: seller._id });
  if (!userIds.length) return;
  await Notification.insertMany(
    userIds.map((id) => ({
      recipientType: 'User',
      recipientId: id,
      title: `🆕 नया उत्पाद: ${product.name} ₹${product.finalPrice}`,
      message: `${seller.shopName} से`,
      type: 'NewProduct',
      link: `/products/${product._id}`,
      data: { productId: product._id, sellerId: seller._id },
    }))
  );
}

async function list(req, res) {
  const p = getPagination(req.query);
  const filter = { sellerId: req.sellerId, isDeleted: false };
  const { search, status, category } = req.query;
  if (search) {
    const rx = searchRegex(search);
    filter.$or = [{ name: rx }, { sku: rx }, { barcode: search.trim() }];
  }
  if (category) filter.categoryId = category;
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  if (status === 'outOfStock') filter.stock = { $lte: 0 };
  if (status === 'lowStock') filter.$expr = { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockThreshold'] }] };
  const sort = { name: { name: 1 }, stock: { stock: 1 }, price: { finalPrice: 1 }, sales: { soldCount: -1 } }[req.query.sortBy] || { createdAt: -1 };
  const [items, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(p.skip).limit(p.limit).populate('categoryId', 'name').populate('subCategoryId', 'name'),
    Product.countDocuments(filter),
  ]);
  return ok(res, paginated(items, total, p));
}

/** GET /products/search?q= - quick lookup for billing (name, SKU or barcode) */
async function quickSearch(req, res) {
  const q = String(req.query.q || '').trim();
  const filter = { sellerId: req.sellerId, isDeleted: false, isActive: true };
  if (q) filter.$or = [{ sku: new RegExp(`^${escapeRegex(q)}$`, 'i') }, { barcode: q }, { name: searchRegex(q) }];
  const items = await Product.find(filter).sort({ soldCount: -1 }).limit(15).select('name sku barcode sellingPrice gstRate gstAmount finalPrice stock images');
  return ok(res, items);
}

async function getOne(req, res) {
  const product = await findProduct(req);
  await product.populate([{ path: 'categoryId', select: 'name' }, { path: 'subCategoryId', select: 'name' }]);
  const movements = await StockMovement.find({ productId: product._id }).sort({ createdAt: -1 }).limit(20);
  return ok(res, { product, movements });
}

async function create(req, res) {
  const body = { ...req.body };
  await validateCatalog(body);
  if (!body.sku) body.sku = await nextSku(req.seller, body.categoryId);
  else if (await Product.exists({ sellerId: req.sellerId, sku: body.sku, isDeleted: false })) throw ApiError.conflict('SKU already used by another product');
  const images = (req.files || []).slice(0, MAX_IMAGES).map((f) => fileUrl('products', f.filename));
  const product = new Product({ ...body, images, sellerId: req.sellerId, barcode: body.barcode || body.sku });
  await product.save();
  if (body.stock > 0) {
    await StockMovement.create({ sellerId: req.sellerId, productId: product._id, change: product.stock, balanceAfter: product.stock, reason: 'Added', note: 'Opening stock', byType: 'Seller', by: req.sellerId });
  }
  if (product.isActive) await announceNewProduct(req.seller, product);
  return created(res, product, 'Product added successfully');
}

async function update(req, res) {
  const product = await findProduct(req);
  const body = { ...req.body };
  await validateCatalog({ categoryId: body.categoryId || (body.subCategoryId ? product.categoryId : undefined), subCategoryId: body.subCategoryId, gstRate: body.gstRate });
  if (body.sku && body.sku !== product.sku && (await Product.exists({ sellerId: req.sellerId, sku: body.sku, isDeleted: false, _id: { $ne: product._id } }))) {
    throw ApiError.conflict('SKU already used by another product');
  }
  if (body.isActive && product.disabledByAdmin) throw ApiError.forbidden(`This product was disabled by the admin${product.adminNote ? `: ${product.adminNote}` : ''}`);
  // Stock is changed only through inventory adjustments so every change is logged
  delete body.stock;

  // Images: keep the ones listed in keepImages (JSON array), then append new uploads
  if (body.keepImages !== undefined || req.files?.length) {
    const keep = body.keepImages !== undefined ? JSON.parse(body.keepImages || '[]').filter((u) => product.images.includes(u)) : product.images;
    removeFiles(product.images.filter((u) => !keep.includes(u)));
    const added = (req.files || []).map((f) => fileUrl('products', f.filename));
    product.images = [...keep, ...added].slice(0, MAX_IMAGES);
  }
  delete body.keepImages;
  Object.assign(product, body);
  await product.save();
  return ok(res, product, 'Product updated');
}

async function remove(req, res) {
  const product = await findProduct(req);
  product.isDeleted = true;
  product.isActive = false;
  await product.save();
  return ok(res, null, 'Product deleted');
}

async function toggle(req, res) {
  const product = await findProduct(req);
  if (req.body.isActive && product.disabledByAdmin) throw ApiError.forbidden(`This product was disabled by the admin${product.adminNote ? `: ${product.adminNote}` : ''}`);
  product.isActive = req.body.isActive;
  await product.save();
  return ok(res, product, product.isActive ? 'Product is now visible to customers' : 'Product hidden from customers');
}

/** POST /products/bulk { ids, action: activate|deactivate|delete|price, percent } */
async function bulk(req, res) {
  const { ids, action, percent } = req.body;
  const filter = { _id: { $in: ids }, sellerId: req.sellerId, isDeleted: false };
  let modified = 0;
  if (action === 'activate') modified = (await Product.updateMany({ ...filter, disabledByAdmin: { $ne: true } }, { isActive: true })).modifiedCount;
  else if (action === 'deactivate') modified = (await Product.updateMany(filter, { isActive: false })).modifiedCount;
  else if (action === 'delete') modified = (await Product.updateMany(filter, { isDeleted: true, isActive: false })).modifiedCount;
  else if (action === 'price') {
    const products = await Product.find(filter);
    for (const p of products) {
      p.sellingPrice = Math.max(0, Math.round(p.sellingPrice * (1 + percent / 100) * 100) / 100);
      await p.save(); // recomputes GST & final price
      modified += 1;
    }
  }
  return ok(res, { modified }, `${modified} product(s) updated`);
}

/** GET /products/:id/barcode - QR code (PNG data URL) that encodes the SKU */
async function barcode(req, res) {
  const product = await findProduct(req);
  if (!product.sku) {
    product.sku = await nextSku(req.seller, product.categoryId);
    product.barcode = product.sku;
    await product.save();
  }
  const qr = await QRCode.toDataURL(product.barcode || product.sku, { width: 320, margin: 1 });
  return ok(res, { barcode: product.barcode || product.sku, sku: product.sku, qrCode: qr, name: product.name, price: product.finalPrice });
}

/**
 * POST /products/bulk-upload (csvFile)
 * Columns: name, category, subCategory, sellingPrice, mrp, costPrice, gstRate, stock, sku, description, lowStockThreshold
 */
async function bulkUpload(req, res) {
  if (!req.file) throw ApiError.badRequest('Please upload a CSV file');
  let rows;
  try {
    rows = parse(req.file.buffer.toString('utf8').replace(/^﻿/, ''), { columns: (h) => h.map((c) => c.trim().toLowerCase()), skip_empty_lines: true, trim: true });
  } catch (err) {
    throw ApiError.badRequest(`Could not read CSV: ${err.message}`);
  }
  if (!rows.length) throw ApiError.badRequest('CSV file is empty');
  if (rows.length > 1000) throw ApiError.badRequest('Maximum 1000 products per upload');

  const slabs = (await getSettings()).gstSettings.slabs.map((s) => s.percentage);
  const categories = await Category.find({ isActive: true });
  const subs = await SubCategory.find({ isActive: true });
  const errors = [];
  let uploadedCount = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const rowNo = i + 2;
    try {
      const name = r.name?.trim();
      if (!name) throw new Error('Name is required');
      const cat = categories.find((c) => c.name.toLowerCase() === String(r.category || '').trim().toLowerCase());
      if (!cat) throw new Error(`Unknown category "${r.category || ''}"`);
      const sub = r.subcategory ? subs.find((s) => String(s.categoryId) === String(cat._id) && s.name.toLowerCase() === r.subcategory.trim().toLowerCase()) : null;
      if (r.subcategory && !sub) throw new Error(`Unknown sub-category "${r.subcategory}"`);
      const sellingPrice = Number(r.sellingprice);
      if (!(sellingPrice >= 0) || r.sellingprice === '') throw new Error('Invalid sellingPrice');
      const gstRate = r.gstrate === undefined || r.gstrate === '' ? 0 : Number(r.gstrate);
      if (!slabs.includes(gstRate)) throw new Error(`GST must be one of ${slabs.join('/')}`);
      const stock = r.stock ? parseInt(r.stock, 10) : 0;
      if (!(stock >= 0)) throw new Error('Invalid stock');
      let sku = r.sku?.trim();
      if (sku && (await Product.exists({ sellerId: req.sellerId, sku, isDeleted: false }))) throw new Error(`SKU ${sku} already exists`);
      if (!sku) sku = await nextSku(req.seller, cat._id);
      const product = await Product.create({
        sellerId: req.sellerId, name, categoryId: cat._id, subCategoryId: sub?._id, description: r.description,
        sellingPrice, mrp: r.mrp ? Number(r.mrp) : undefined, costPrice: r.costprice ? Number(r.costprice) : undefined,
        gstRate, stock, sku, barcode: sku, lowStockThreshold: r.lowstockthreshold ? parseInt(r.lowstockthreshold, 10) : 5,
      });
      if (stock > 0) await StockMovement.create({ sellerId: req.sellerId, productId: product._id, change: stock, balanceAfter: stock, reason: 'Added', note: 'Bulk upload', byType: 'Seller', by: req.sellerId });
      uploadedCount += 1;
    } catch (err) {
      errors.push({ row: rowNo, name: r.name, message: err.message });
    }
  }
  return ok(res, { uploadedCount, failedCount: errors.length, errors }, `${uploadedCount} product(s) added`);
}

async function csvTemplate(_req, res) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="products-template.csv"');
  res.send('name,category,subCategory,sellingPrice,mrp,costPrice,gstRate,stock,sku,description,lowStockThreshold\nRed Casual Shoes,Footwear,Casual Shoes,500,600,300,18,10,,Comfortable red shoes,5\n');
}

/** GET /categories (+ sub-categories) for product forms */
async function categories(_req, res) {
  const [cats, subs] = await Promise.all([Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }), SubCategory.find({ isActive: true }).sort({ name: 1 })]);
  return ok(res, cats.map((c) => ({ _id: c._id, name: c.name, icon: c.icon, subCategories: subs.filter((s) => String(s.categoryId) === String(c._id)).map((s) => ({ _id: s._id, name: s.name })) })));
}

module.exports = { list, quickSearch, getOne, create, update, remove, toggle, bulk, barcode, bulkUpload, csvTemplate, categories };
