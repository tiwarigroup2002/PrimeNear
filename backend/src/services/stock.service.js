const ApiError = require('../utils/ApiError');
const { Product, StockMovement } = require('../models');
const { notifySeller } = require('./notification.service');

const labelOf = (product, variantId) => {
  const v = variantId && product.variants?.id(variantId);
  return v ? Product.variantLabel(v) : '';
};
const nameOf = (product, variantId) => {
  const l = labelOf(product, variantId);
  return l ? `${product.name} (${l})` : product.name;
};

/**
 * Changes stock of a product or one of its variants atomically.
 * For a variant both the variant stock and the product total move together.
 * Returns the updated product, or null when there is not enough stock.
 */
async function incStock(productId, variantId, change, { sellerId, sold = false } = {}) {
  const filter = { _id: productId, ...(sellerId ? { sellerId } : {}) };
  const inc = { stock: change, ...(sold ? { soldCount: -change } : {}) };
  if (variantId) {
    filter.variants = { $elemMatch: { _id: variantId, ...(change < 0 ? { stock: { $gte: -change } } : {}) } };
    inc['variants.$.stock'] = change;
  } else if (change < 0) {
    filter.stock = { $gte: -change };
  }
  return Product.findOneAndUpdate(filter, { $inc: inc }, { returnDocument: 'after' });
}

/**
 * Atomically takes stock for a list of items. Either every item is reserved or
 * none is (already reserved items are put back on failure) - prevents overselling.
 * items: [{ product, quantity, variantId? }]
 */
async function takeStock(sellerId, items, { reason, refType, refId, byType = 'Seller', by }) {
  const done = [];
  for (const { product, quantity, variantId } of items) {
    if (product.variants?.length && !variantId) throw ApiError.badRequest(`Choose a colour / size for "${product.name}"`);
    const updated = await incStock(product._id, variantId, -quantity, { sellerId, sold: true });
    if (!updated) {
      for (const d of done) await incStock(d.product._id, d.variantId, d.quantity, { sold: true });
      const fresh = await Product.findById(product._id);
      const left = variantId ? fresh?.variants.id(variantId)?.stock ?? 0 : fresh?.stock ?? 0;
      throw ApiError.badRequest(`Only ${left} unit(s) of "${nameOf(product, variantId)}" in stock`);
    }
    done.push({ product: updated, quantity, variantId });
  }
  await StockMovement.insertMany(
    done.map(({ product, quantity, variantId }) => ({
      sellerId,
      productId: product._id,
      variantId: variantId || undefined,
      variantLabel: labelOf(product, variantId) || undefined,
      change: -quantity,
      balanceAfter: variantId ? product.variants.id(variantId).stock : product.stock,
      reason,
      refType,
      refId,
      byType,
      by,
    }))
  );
  // Low stock alerts
  for (const { product, variantId } of done) {
    const left = variantId ? product.variants.id(variantId).stock : product.stock;
    if (left <= (product.lowStockThreshold ?? 5)) {
      await notifySeller(sellerId, {
        title: left <= 0 ? 'Out of stock' : 'Low stock',
        message: left <= 0 ? `${nameOf(product, variantId)}: out of stock` : `${nameOf(product, variantId)}: only ${left} left`,
        type: 'LowStock',
        link: `/products/${product._id}`,
      });
    }
  }
  return done.map((d) => d.product);
}

/** Puts stock back (cancel / return). items: [{ productId, variantId?, quantity }] */
async function putBackStock(sellerId, items, { reason, refType, refId, byType, by }) {
  for (const item of items) {
    if (!item.productId) continue;
    const product = await incStock(item.productId, item.variantId, item.quantity, { sold: true });
    if (!product) continue;
    await StockMovement.create({
      sellerId,
      productId: product._id,
      variantId: item.variantId || undefined,
      variantLabel: labelOf(product, item.variantId) || undefined,
      change: item.quantity,
      balanceAfter: item.variantId ? product.variants.id(item.variantId)?.stock : product.stock,
      reason,
      refType,
      refId,
      byType,
      by,
    });
  }
}

/** Records a manual stock change. mode "add" adds `quantity` (can be negative), "set" sets the stock. */
async function adjustStock(sellerId, productId, { quantity, mode = 'add', reason = 'Adjustment', note, by, variantId }) {
  const product = await Product.findOne({ _id: productId, sellerId, isDeleted: false });
  if (!product) throw ApiError.notFound('Product not found');
  if (product.variants?.length && !variantId) throw ApiError.badRequest('Choose the colour / size to adjust');
  const variant = variantId ? product.variants.id(variantId) : null;
  if (variantId && !variant) throw ApiError.notFound('Variant not found');
  const current = variant ? variant.stock : product.stock;
  const change = mode === 'set' ? quantity - current : quantity;
  if (current + change < 0) throw ApiError.badRequest(`Stock cannot go below 0 (current ${current})`);
  if (change === 0) throw ApiError.badRequest('No change in stock');
  const updated = await incStock(productId, variantId, change);
  if (!updated) throw ApiError.conflict('Stock changed meanwhile, please retry');
  const balance = variant ? updated.variants.id(variantId).stock : updated.stock;
  await StockMovement.create({ sellerId, productId, variantId: variantId || undefined, variantLabel: variant ? Product.variantLabel(variant) : undefined, change, balanceAfter: balance, reason, note, byType: 'Seller', by });
  return updated;
}

module.exports = { takeStock, putBackStock, adjustStock, incStock };
