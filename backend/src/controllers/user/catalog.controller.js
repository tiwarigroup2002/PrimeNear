const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { ok } = require('../../utils/respond');
const { getPagination, paginated, searchRegex } = require('../../utils/pagination');
const { Product, Category, SubCategory, Review, Seller, Wishlist, Cart, Order } = require('../../models');
const { activeSeller, requireLinkedSeller, linkedSellers } = require('../../services/shop-access.service');
const { describeServiceArea } = require('../../services/locations.service');
const { shopOptions } = require('../../services/cart.service');

const PUBLIC_FIELDS = 'name isActive categoryId subCategoryId description images videos mrp sellingPrice gstRate gstAmount finalPrice stock rating ratingCount soldCount sellerId createdAt sku variants';
const oid = (id) => new mongoose.Types.ObjectId(String(id));
const visible = (sellerId) => ({ sellerId: oid(sellerId), isActive: true, isDeleted: false });

function shopCard(s) {
  return { _id: s._id, shopName: s.shopName, ownerName: s.ownerName, shopImage: s.shopImage, shopAddress: s.shopAddress, rating: s.rating, ratingCount: s.ratingCount, tahsil: s.tahsilId?.name, mobileNumber: s.mobileNumber };
}

async function wishIds(userId) {
  const w = await Wishlist.findOne({ userId }).select('items.productId');
  return new Set((w?.items || []).map((i) => String(i.productId)));
}

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

/**
 * Shopper view of a product. Products with colour / size variants get `hasVariants`,
 * the list of colours / sizes, only their active variants, and the first variant photo
 * when the product itself has none.
 */
function decorate(products, wished) {
  return products.map((p) => {
    const o = p.toJSON ? p.toJSON() : p;
    const variants = (o.variants || []).filter((v) => v.isActive).map(({ sku, ...v }) => ({ ...v, label: [v.color, v.size].filter(Boolean).join(' / ') }));
    const images = o.images?.length ? o.images : uniq(variants.flatMap((v) => v.images || [])).slice(0, 6);
    return {
      ...o,
      images,
      variants,
      hasVariants: variants.length > 0,
      colors: uniq(variants.map((v) => v.color)),
      sizes: uniq(variants.map((v) => v.size)),
      inStock: o.stock > 0,
      inWishlist: wished.has(String(o._id)),
      discountPercent: o.mrp && o.mrp > o.finalPrice ? Math.round(((o.mrp - o.finalPrice) / o.mrp) * 100) : 0,
    };
  });
}

/** GET /home */
async function home(req, res) {
  const { seller, sellers } = await activeSeller(req.user);
  const base = visible(seller._id);
  const [featured, newest, catIds, wished, cart, recentOrders, options] = await Promise.all([
    Product.find({ ...base, stock: { $gt: 0 } }).sort({ soldCount: -1, rating: -1 }).limit(10).select(PUBLIC_FIELDS),
    Product.find(base).sort({ createdAt: -1 }).limit(10).select(PUBLIC_FIELDS),
    Product.distinct('categoryId', base),
    wishIds(req.userId),
    Cart.findOne({ userId: req.userId }),
    Order.find({ userId: req.userId, sellerId: seller._id }).sort({ createdAt: -1 }).limit(3).select('orderId finalAmount orderStatus createdAt items'),
    shopOptions(seller),
  ]);
  const categories = await Category.find({ _id: { $in: catIds }, isActive: true }).sort({ sortOrder: 1, name: 1 }).select('name icon');
  return ok(res, {
    seller: { ...shopCard(seller), delivery: options.delivery, deliveryCharge: options.deliveryCharge, freeDeliveryAbove: options.freeDeliveryAbove, cod: options.cod },
    sellers: sellers.map(shopCard),
    categories,
    featured: decorate(featured, wished),
    newArrivals: decorate(newest, wished),
    recentOrders,
    cartCount: cart && String(cart.sellerId) === String(seller._id) ? cart.items.reduce((s, i) => s + i.quantity, 0) : 0,
  });
}

/** GET /sellers - shops that added this customer (shown wherever the customer is) */
async function sellers(req, res) {
  const list = await linkedSellers(req.userId);
  return ok(res, { sellers: list.map(shopCard), activeSellerId: req.user.currentActiveSellerId });
}

/** POST /sellers/switch { sellerId } - clears the cart if it holds another shop's products */
async function switchSeller(req, res) {
  const { seller } = await requireLinkedSeller(req.userId, req.body.sellerId);
  req.user.currentActiveSellerId = seller._id;
  await req.user.save();
  const cart = await Cart.findOne({ userId: req.userId });
  let cartCleared = false;
  if (cart?.items.length && String(cart.sellerId) !== String(seller._id)) {
    cart.items = [];
    cart.sellerId = seller._id;
    await cart.save();
    cartCleared = true;
  }
  return ok(res, { activeSeller: shopCard(seller), cartCleared }, `Now shopping at ${seller.shopName}`);
}

/** GET /sellers/:sellerId/profile */
async function sellerProfile(req, res) {
  await requireLinkedSeller(req.userId, req.params.sellerId);
  const seller = await Seller.findById(req.params.sellerId).populate('tahsilId', 'name');
  const [options, productCount, orders, serviceArea] = await Promise.all([
    shopOptions(seller),
    Product.countDocuments(visible(seller._id)),
    Order.countDocuments({ sellerId: seller._id, orderStatus: 'Delivered' }),
    describeServiceArea(seller),
  ]);
  // Where the shop delivers; delivery addresses need a PIN code of these talukas
  const deliveryArea = serviceArea.map((r) => ({ district: r.district, state: r.state, talukas: r.allTalukas ? 'All talukas' : r.talukas.join(', ') }));
  return ok(res, { ...shopCard(seller), pincode: seller.pincode, deliveryArea, productCount, totalOrders: orders, delivery: options.delivery, deliveryCharge: options.deliveryCharge, freeDeliveryAbove: options.freeDeliveryAbove, cod: options.cod, gstNumber: seller.gstNumber });
}

/** GET /sellers/:sellerId/reviews */
async function sellerReviews(req, res) {
  await requireLinkedSeller(req.userId, req.params.sellerId);
  const p = getPagination(req.query, 10);
  const filter = { sellerId: req.params.sellerId, isHidden: false };
  const [items, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('userId', 'name').populate('productId', 'name'),
    Review.countDocuments(filter),
  ]);
  const seller = await Seller.findById(req.params.sellerId).select('rating ratingCount');
  return ok(res, paginated(items, total, p, { averageRating: seller.rating, totalReviews: seller.ratingCount }));
}

/** GET /categories - categories that have products in the active shop (+ sub-categories) */
async function categories(req, res) {
  const { seller } = await activeSeller(req.user);
  const counts = await Product.aggregate([{ $match: visible(seller._id) }, { $group: { _id: '$categoryId', count: { $sum: 1 } } }]);
  const map = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  const [cats, subs] = await Promise.all([
    Category.find({ _id: { $in: counts.map((c) => c._id) }, isActive: true }).sort({ sortOrder: 1, name: 1 }),
    SubCategory.find({ categoryId: { $in: counts.map((c) => c._id) }, isActive: true }).sort({ name: 1 }),
  ]);
  return ok(res, cats.map((c) => ({ _id: c._id, name: c.name, icon: c.icon, productCount: map[String(c._id)], subCategories: subs.filter((s) => String(s.categoryId) === String(c._id)).map((s) => ({ _id: s._id, name: s.name })) })));
}

/** GET /products?search=&category=&subCategory=&priceMin=&priceMax=&rating=&inStock=&sortBy= */
async function products(req, res) {
  const { seller } = await activeSeller(req.user);
  const p = getPagination(req.query, 20);
  const q = req.query;
  const filter = visible(seller._id);
  if (q.search || q.q) {
    const rx = searchRegex(q.search || q.q);
    filter.$or = [{ name: rx }, { description: rx }];
  }
  if (q.category) filter.categoryId = q.category;
  if (q.subCategory) filter.subCategoryId = q.subCategory;
  if (q.priceMin || q.priceMax) {
    filter.finalPrice = {};
    if (q.priceMin) filter.finalPrice.$gte = Number(q.priceMin);
    if (q.priceMax) filter.finalPrice.$lte = Number(q.priceMax);
  }
  if (q.rating) filter.rating = { $gte: Number(q.rating) };
  if (q.inStock === 'true') filter.stock = { $gt: 0 };
  const sort = { price_asc: { finalPrice: 1 }, price_desc: { finalPrice: -1 }, popular: { soldCount: -1 }, rating: { rating: -1, ratingCount: -1 }, new: { createdAt: -1 } }[q.sortBy] || { stock: -1, soldCount: -1 };
  const [items, total, wished, range] = await Promise.all([
    Product.find(filter).sort(sort).skip(p.skip).limit(p.limit).select(PUBLIC_FIELDS).populate('categoryId', 'name'),
    Product.countDocuments(filter),
    wishIds(req.userId),
    Product.aggregate([{ $match: visible(seller._id) }, { $group: { _id: null, min: { $min: '$finalPrice' }, max: { $max: '$finalPrice' } } }]),
  ]);
  return ok(res, paginated(decorate(items, wished), total, p, { priceRange: { min: range[0]?.min || 0, max: range[0]?.max || 0 }, sellerId: seller._id }));
}

/** GET /products/:productId - any product of a shop the user is linked to */
async function product(req, res) {
  if (!mongoose.isValidObjectId(req.params.productId)) throw ApiError.notFound('Product not found');
  const prod = await Product.findOne({ _id: req.params.productId, isDeleted: false }).select(PUBLIC_FIELDS).populate('categoryId', 'name').populate('subCategoryId', 'name');
  if (!prod) throw ApiError.notFound('Product not found');
  const { seller } = await requireLinkedSeller(req.userId, prod.sellerId);
  const [reviews, related, wished, cart, isActiveNow] = await Promise.all([
    Review.find({ productId: prod._id, isHidden: false }).sort({ createdAt: -1 }).limit(20).populate('userId', 'name'),
    Product.find({ ...visible(prod.sellerId), categoryId: prod.categoryId._id, _id: { $ne: prod._id } }).sort({ soldCount: -1 }).limit(8).select(PUBLIC_FIELDS),
    wishIds(req.userId),
    Cart.findOne({ userId: req.userId }),
    Product.exists({ _id: prod._id, isActive: true }),
  ]);
  const lines = cart && String(cart.sellerId) === String(prod.sellerId) ? cart.items.filter((i) => String(i.productId) === String(prod._id)) : [];
  const inCart = lines.filter((i) => !i.variantId).reduce((s, i) => s + i.quantity, 0);
  // Quantity in the cart per colour / size variant
  const inCartByVariant = Object.fromEntries(lines.filter((i) => i.variantId).map((i) => [String(i.variantId), i.quantity]));
  const [data] = decorate([prod], wished);
  return ok(res, {
    product: { ...data, available: Boolean(isActiveNow), inCart, inCartByVariant },
    seller: shopCard(seller),
    isActiveShop: String(req.user.currentActiveSellerId) === String(prod.sellerId),
    reviews,
    related: decorate(related, wished),
  });
}

// ---- Wishlist ----
async function wishlist(req, res) {
  const w = await Wishlist.findOne({ userId: req.userId });
  if (!w?.items.length) return ok(res, { items: [] });
  const prods = await Product.find({ _id: { $in: w.items.map((i) => i.productId) }, isDeleted: false }).select(PUBLIC_FIELDS).populate('sellerId', 'shopName status');
  const byId = Object.fromEntries(prods.map((p) => [String(p._id), p]));
  const items = w.items
    .filter((i) => byId[String(i.productId)])
    .map((i) => {
      const p = byId[String(i.productId)];
      return {
        product: { ...p.toJSON(), inStock: p.stock > 0 && p.isActive !== false },
        shopName: p.sellerId?.shopName,
        addedAt: i.addedAt,
        priceAtTime: i.priceAtTime,
        priceDrop: i.priceAtTime && p.finalPrice < i.priceAtTime ? Math.round((i.priceAtTime - p.finalPrice) * 100) / 100 : 0,
      };
    })
    .reverse();
  return ok(res, { items });
}

async function addWishlist(req, res) {
  const prod = await Product.findOne({ _id: req.body.productId, isDeleted: false });
  if (!prod) throw ApiError.notFound('Product not found');
  await requireLinkedSeller(req.userId, prod.sellerId);
  await Wishlist.updateOne(
    { userId: req.userId, 'items.productId': { $ne: prod._id } },
    { $push: { items: { productId: prod._id, sellerId: prod.sellerId, priceAtTime: prod.finalPrice } } },
    { upsert: false }
  );
  if (!(await Wishlist.exists({ userId: req.userId }))) await Wishlist.create({ userId: req.userId, items: [{ productId: prod._id, sellerId: prod.sellerId, priceAtTime: prod.finalPrice }] });
  return ok(res, null, 'Added to wishlist');
}

async function removeWishlist(req, res) {
  await Wishlist.updateOne({ userId: req.userId }, { $pull: { items: { productId: req.params.productId } } });
  return ok(res, null, 'Removed from wishlist');
}

module.exports = { home, sellers, switchSeller, sellerProfile, sellerReviews, categories, products, product, wishlist, addWishlist, removeWishlist };
