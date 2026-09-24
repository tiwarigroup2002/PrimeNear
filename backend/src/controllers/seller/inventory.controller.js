const { ok } = require('../../utils/respond');
const { getPagination, paginated, dateRange } = require('../../utils/pagination');
const { Product, StockMovement } = require('../../models');
const { adjustStock } = require('../../services/stock.service');
const { round2 } = require('../../services/metrics');

/** GET /inventory */
async function overview(req, res) {
  const base = { sellerId: req.sellerId, isDeleted: false };
  const [agg, lowStock, outOfStock] = await Promise.all([
    Product.aggregate([
      { $match: base },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          inStock: { $sum: { $cond: [{ $gt: ['$stock', '$lowStockThreshold'] }, 1, 0] } },
          lowStock: { $sum: { $cond: [{ $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockThreshold'] }] }, 1, 0] } },
          outOfStock: { $sum: { $cond: [{ $lte: ['$stock', 0] }, 1, 0] } },
          units: { $sum: '$stock' },
          costValue: { $sum: { $multiply: ['$stock', { $ifNull: ['$costPrice', 0] }] } },
          saleValue: { $sum: { $multiply: ['$stock', '$finalPrice'] } },
        },
      },
    ]),
    Product.find({ ...base, $expr: { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockThreshold'] }] } }).sort({ stock: 1 }).select('name sku stock lowStockThreshold images'),
    Product.find({ ...base, stock: { $lte: 0 } }).sort({ name: 1 }).select('name sku stock images isActive'),
  ]);
  const a = agg[0] || { totalProducts: 0, inStock: 0, lowStock: 0, outOfStock: 0, units: 0, costValue: 0, saleValue: 0 };
  return ok(res, { ...a, _id: undefined, costValue: round2(a.costValue), saleValue: round2(a.saleValue), lowStockProducts: lowStock, outOfStockProducts: outOfStock });
}

/** POST /inventory/adjust-stock */
async function adjust(req, res) {
  const product = await adjustStock(req.sellerId, req.body.productId, { ...req.body, by: req.sellerId });
  return ok(res, { newStock: product.stock, product }, 'Stock adjusted');
}

/** GET /inventory/history */
async function history(req, res) {
  const p = getPagination(req.query);
  const filter = { sellerId: req.sellerId, ...dateRange(req.query) };
  if (req.query.productId) filter.productId = req.query.productId;
  if (req.query.reason) filter.reason = req.query.reason;
  const [items, total] = await Promise.all([
    StockMovement.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('productId', 'name sku'),
    StockMovement.countDocuments(filter),
  ]);
  return ok(res, paginated(items, total, p));
}

module.exports = { overview, adjust, history };
