const ApiError = require('../utils/ApiError');
const { Cart, Product, Seller } = require('../models');
const { getSettings } = require('./settings.service');
const { round2 } = require('./metrics');

/** Delivery / payment options for a seller, combining platform and shop settings. */
async function shopOptions(seller) {
  const settings = await getSettings();
  const s = seller.settings || {};
  const delivery = settings.deliverySettings.enableDelivery && !!s.enableDelivery;
  return {
    delivery,
    deliveryCharge: delivery ? Number(s.deliveryCharge ?? settings.deliverySettings.defaultDeliveryCharge ?? 0) : 0,
    freeDeliveryAbove: Number(s.freeDeliveryAbove ?? settings.deliverySettings.freeDeliveryAbove ?? 0),
    cod: settings.paymentSettings.enableCashPayment && s.allowCashOnDelivery !== false,
    online: settings.paymentSettings.enableOnlinePayment,
  };
}

/**
 * Returns the cart with live product data, per-line problems and totals.
 * Lines whose product disappeared are removed silently.
 */
async function loadCart(userId, deliveryType = 'Delivery') {
  const cart = (await Cart.findOne({ userId })) || new Cart({ userId, items: [] });
  if (!cart.items.length) return { cart, sellerId: cart.sellerId, items: [], totals: emptyTotals(), options: null, canCheckout: false };

  const products = await Product.find({ _id: { $in: cart.items.map((i) => i.productId) }, sellerId: cart.sellerId, isDeleted: false });
  const byId = Object.fromEntries(products.map((p) => [String(p._id), p]));
  const before = cart.items.length;
  cart.items = cart.items.filter((i) => byId[String(i.productId)]);
  if (cart.items.length !== before) await cart.save();

  const items = cart.items.map((i) => {
    const p = byId[String(i.productId)];
    const u = p.unit(i.variantId);
    let problem = null;
    if (!u) problem = 'This colour / size is no longer available';
    else if (!u.isActive) problem = 'No longer available';
    else if (u.stock <= 0) problem = 'Out of stock';
    else if (u.stock < i.quantity) problem = `Only ${u.stock} left`;
    const unit = u || { sellingPrice: p.sellingPrice, mrp: p.mrp, gstAmount: p.gstAmount, finalPrice: p.finalPrice, stock: 0, image: p.images?.[0], variantLabel: '' };
    return {
      productId: p._id,
      variantId: i.variantId || null,
      variantLabel: unit.variantLabel || '',
      name: p.name,
      image: unit.image,
      quantity: i.quantity,
      price: unit.sellingPrice,
      mrp: unit.mrp,
      gstRate: p.gstRate,
      gstAmount: round2(unit.gstAmount * i.quantity),
      finalPrice: unit.finalPrice,
      lineTotal: round2(unit.finalPrice * i.quantity),
      stock: unit.stock,
      problem,
    };
  });

  const seller = await Seller.findById(cart.sellerId).select('shopName settings status');
  const options = seller ? await shopOptions(seller) : null;
  const ok = items.filter((i) => !i.problem);
  const subtotal = round2(ok.reduce((s, i) => s + i.price * i.quantity, 0));
  const gst = round2(ok.reduce((s, i) => s + i.gstAmount, 0));
  const itemsTotal = round2(subtotal + gst);
  const useDelivery = deliveryType === 'Delivery' && options?.delivery;
  const deliveryCharge = useDelivery && !(options.freeDeliveryAbove && itemsTotal >= options.freeDeliveryAbove) ? options.deliveryCharge : 0;
  const mrpTotal = round2(ok.reduce((s, i) => s + Math.max(i.mrp || 0, i.finalPrice) * i.quantity, 0));
  return {
    cart,
    sellerId: cart.sellerId,
    shopName: seller?.shopName,
    items,
    options,
    totals: {
      itemCount: ok.reduce((s, i) => s + i.quantity, 0),
      subtotal,
      gst,
      itemsTotal,
      deliveryCharge,
      total: round2(itemsTotal + deliveryCharge),
      savings: round2(Math.max(0, mrpTotal - itemsTotal)),
    },
    canCheckout: ok.length > 0 && ok.length === items.length && seller?.status === 'Active',
  };
}

function emptyTotals() {
  return { itemCount: 0, subtotal: 0, gst: 0, itemsTotal: 0, deliveryCharge: 0, total: 0, savings: 0 };
}

const sameLine = (i, productId, variantId) => String(i.productId) === String(productId) && String(i.variantId || '') === String(variantId || '');

/**
 * Adds or sets the quantity of a product (or one colour / size variant of it).
 * Switching to another shop's product clears the cart.
 */
async function setItem(userId, sellerId, product, quantity, { add = false, variantId = null } = {}) {
  if (!product.isActive || product.isDeleted) throw ApiError.badRequest('This product is not available');
  if (product.variants?.length && !variantId) throw ApiError.badRequest('Choose a colour / size first');
  const u = product.unit(variantId);
  if (!u || !u.isActive) throw ApiError.badRequest('This colour / size is not available');
  const vid = u.variantId;
  let cart = await Cart.findOne({ userId });
  if (!cart) cart = new Cart({ userId, sellerId, items: [] });
  if (cart.sellerId && String(cart.sellerId) !== String(sellerId)) {
    cart.items = [];
  }
  cart.sellerId = sellerId;
  const line = cart.items.find((i) => sameLine(i, product._id, vid));
  const qty = add ? (line?.quantity || 0) + quantity : quantity;
  if (qty > u.stock) throw ApiError.badRequest(u.stock > 0 ? `Only ${u.stock} in stock` : 'Out of stock');
  if (qty <= 0) cart.items = cart.items.filter((i) => !sameLine(i, product._id, vid));
  else if (line) line.quantity = qty;
  else cart.items.push({ productId: product._id, variantId: vid || undefined, quantity: qty });
  await cart.save();
  return cart;
}

module.exports = { loadCart, setItem, shopOptions, sameLine };
