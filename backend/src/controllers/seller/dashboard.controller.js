const { ok } = require('../../utils/respond');
const { Order, Product, Customer } = require('../../models');
const { REVENUE_MATCH, NET_AMOUNT, round2, startOfDay, startOfMonth } = require('../../services/metrics');
const { sellerEarnings } = require('../../services/payout.service');
const { VISIBLE_TO_SELLER } = require('../../services/checkout.service');

async function totals(sellerId, from) {
  const [row] = await Order.aggregate([
    { $match: { sellerId, ...REVENUE_MATCH, createdAt: { $gte: from } } },
    { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: NET_AMOUNT } } },
  ]);
  return { orders: row?.orders || 0, revenue: round2(row?.revenue) };
}

/** GET /dashboard */
async function dashboard(req, res) {
  const sellerId = req.sellerId;
  const today = startOfDay();
  const month = startOfMonth();
  const [t, m, statusToday, openCounts, products, lowStock, recentOrders, customers, earnings] = await Promise.all([
    totals(sellerId, today),
    totals(sellerId, month),
    Order.aggregate([{ $match: { sellerId, ...VISIBLE_TO_SELLER, createdAt: { $gte: today } } }, { $group: { _id: '$orderStatus', count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { sellerId, ...VISIBLE_TO_SELLER, orderStatus: { $in: ['Pending', 'Confirmed', 'Packed', 'Shipped'] } } }, { $group: { _id: '$orderStatus', count: { $sum: 1 } } }]),
    Product.aggregate([
      { $match: { sellerId, isDeleted: false } },
      { $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } }, outOfStock: { $sum: { $cond: [{ $lte: ['$stock', 0] }, 1, 0] } }, value: { $sum: { $multiply: ['$stock', { $ifNull: ['$costPrice', '$sellingPrice'] }] } } } },
    ]),
    Product.find({ sellerId, isDeleted: false, isActive: true, $expr: { $lte: ['$stock', '$lowStockThreshold'] } }).sort({ stock: 1 }).limit(8).select('name stock lowStockThreshold images'),
    Order.find({ sellerId, ...VISIBLE_TO_SELLER }).sort({ createdAt: -1 }).limit(6).select('orderId finalAmount orderStatus paymentMethod paymentStatus source createdAt customerSnapshot').populate('userId', 'name mobileNumber'),
    Customer.countDocuments({ sellerId }),
    sellerEarnings(sellerId),
  ]);
  const todayStatus = Object.fromEntries(statusToday.map((s) => [s._id, s.count]));
  const open = Object.fromEntries(openCounts.map((s) => [s._id, s.count]));
  return ok(res, {
    today: { ...t, delivered: todayStatus.Delivered || 0, cancelled: todayStatus.Cancelled || 0 },
    month: { ...m, averageOrderValue: m.orders ? round2(m.revenue / m.orders) : 0 },
    openOrders: { pending: open.Pending || 0, confirmed: open.Confirmed || 0, packed: open.Packed || 0, shipped: open.Shipped || 0, total: Object.values(open).reduce((a, b) => a + b, 0) },
    products: { total: 0, active: 0, outOfStock: 0, ...(products[0] || {}), value: round2(products[0]?.value) },
    lowStock,
    recentOrders,
    customers,
    earnings: { pendingAmount: earnings.pendingAmount, onHoldAmount: earnings.onHoldAmount, totalPaid: earnings.totalPaid, totalPending: earnings.totalPending },
  });
}

module.exports = { dashboard };
