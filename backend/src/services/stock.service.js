const ApiError = require('../utils/ApiError');
const { Product, StockMovement } = require('../models');
const { notifySeller } = require('./notification.service');

/**
 * Atomically takes stock for a list of items. Either every item is reserved or
 * none is (already reserved items are put back on failure) - prevents overselling.
 * items: [{ product, quantity }]
 */
async function takeStock(sellerId, items, { reason, refType, refId, byType = 'Seller', by }) {
  const done = [];
  for (const { product, quantity } of items) {
    const updated = await Product.findOneAndUpdate(
      { _id: product._id, sellerId, stock: { $gte: quantity } },
      { $inc: { stock: -quantity, soldCount: quantity } },
      { returnDocument: 'after' }
    );
    if (!updated) {
      for (const d of done) await Product.updateOne({ _id: d.product._id }, { $inc: { stock: d.quantity, soldCount: -d.quantity } });
      const fresh = await Product.findById(product._id).select('stock name');
      throw ApiError.badRequest(`Only ${fresh?.stock ?? 0} unit(s) of "${product.name}" in stock`);
    }
    done.push({ product: updated, quantity });
  }
  await StockMovement.insertMany(
    done.map(({ product, quantity }) => ({ sellerId, productId: product._id, change: -quantity, balanceAfter: product.stock, reason, refType, refId, byType, by }))
  );
  // Low stock alerts
  for (const { product } of done) {
    if (product.stock <= (product.lowStockThreshold ?? 5)) {
      await notifySeller(sellerId, {
        title: product.stock <= 0 ? 'स्टॉक खत्म' : 'स्टॉक कम हो गया!',
        message: product.stock <= 0 ? `${product.name}: out of stock` : `${product.name}: सिर्फ ${product.stock} बचे`,
        type: 'LowStock',
        link: `/products/${product._id}`,
      });
    }
  }
  return done.map((d) => d.product);
}

/** Records a manual stock change. mode "add" adds `quantity` (can be negative), "set" sets the stock. */
async function adjustStock(sellerId, productId, { quantity, mode = 'add', reason = 'Adjustment', note, by }) {
  const product = await Product.findOne({ _id: productId, sellerId, isDeleted: false });
  if (!product) throw ApiError.notFound('Product not found');
  const change = mode === 'set' ? quantity - product.stock : quantity;
  if (product.stock + change < 0) throw ApiError.badRequest(`Stock cannot go below 0 (current ${product.stock})`);
  if (change === 0) throw ApiError.badRequest('No change in stock');
  const updated = await Product.findOneAndUpdate({ _id: productId, stock: { $gte: -change } }, { $inc: { stock: change } }, { returnDocument: 'after' });
  if (!updated) throw ApiError.conflict('Stock changed meanwhile, please retry');
  await StockMovement.create({ sellerId, productId, change, balanceAfter: updated.stock, reason, note, byType: 'Seller', by });
  return updated;
}

module.exports = { takeStock, adjustStock };
