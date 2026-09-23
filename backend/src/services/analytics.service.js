const { Order, User, Seller, Product, Payment, Payout, Dispute, Customer } = require('../models');
const { REVENUE_MATCH, NET_AMOUNT, TZ, round2, startOfDay, startOfMonth, addDays, periodRange } = require('./metrics');
const { COMMISSION } = require('./payout.service');

const DAY_MS = 86400000;

/** Decides daily or monthly buckets for a range. */
function bucketFor(start, end) {
  return (end - start) / DAY_MS > 92 ? { unit: 'month', format: '%Y-%m' } : { unit: 'day', format: '%Y-%m-%d' };
}

/** Builds the full list of bucket labels so charts have no gaps. */
function labels(start, end, unit) {
  const out = [];
  const toIst = (d) => new Date(d.getTime() + 330 * 60000);
  const cursor = toIst(start);
  const last = toIst(end);
  if (unit === 'month') {
    cursor.setUTCDate(1);
    while (cursor <= last) {
      out.push(cursor.toISOString().slice(0, 7));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else {
    while (cursor <= last) {
      out.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return out;
}

function fill(keys, rows, fields) {
  const map = Object.fromEntries(rows.map((r) => [r._id, r]));
  return keys.map((k) => {
    const row = map[k] || {};
    const out = { date: k };
    fields.forEach((f) => { out[f] = round2(row[f] || 0); });
    return out;
  });
}

async function orderSeries(start, end, extraMatch = {}) {
  const { unit, format } = bucketFor(start, end);
  const rows = await Order.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end }, ...extraMatch } },
    {
      $group: {
        _id: { $dateToString: { format, date: '$createdAt', timezone: TZ } },
        orders: { $sum: 1 },
        revenue: { $sum: { $cond: [{ $and: [{ $in: ['$paymentStatus', REVENUE_MATCH.paymentStatus.$in] }, { $ne: ['$orderStatus', 'Cancelled'] }] }, NET_AMOUNT, 0] } },
        commission: { $sum: { $cond: [{ $and: [{ $in: ['$paymentStatus', REVENUE_MATCH.paymentStatus.$in] }, { $ne: ['$orderStatus', 'Cancelled'] }] }, COMMISSION, 0] } },
      },
    },
  ]);
  return fill(labels(start, end, unit), rows, ['orders', 'revenue', 'commission']);
}

async function countSeries(model, start, end, match = {}) {
  const { unit, format } = bucketFor(start, end);
  const rows = await model.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end }, ...match } },
    { $group: { _id: { $dateToString: { format, date: '$createdAt', timezone: TZ } }, count: { $sum: 1 } } },
  ]);
  const base = await model.countDocuments({ createdAt: { $lt: start }, ...match });
  let running = base;
  return fill(labels(start, end, unit), rows, ['count']).map((r) => {
    running += r.count;
    return { ...r, total: running };
  });
}

async function revenueTotals(match) {
  const [row] = await Order.aggregate([
    { $match: { ...REVENUE_MATCH, ...match } },
    { $group: { _id: null, revenue: { $sum: NET_AMOUNT }, orders: { $sum: 1 }, commission: { $sum: COMMISSION } } },
  ]);
  return { revenue: round2(row?.revenue), orders: row?.orders || 0, commission: round2(row?.commission) };
}

async function topSellers(match = {}, limit = 5) {
  const rows = await Order.aggregate([
    { $match: { ...REVENUE_MATCH, ...match } },
    { $group: { _id: '$sellerId', revenue: { $sum: NET_AMOUNT }, orders: { $sum: 1 } } },
    { $sort: { revenue: -1 } },
    { $limit: limit },
    { $lookup: { from: 'sellers', localField: '_id', foreignField: '_id', as: 'seller' } },
    { $unwind: '$seller' },
    { $project: { sellerId: '$_id', _id: 0, name: '$seller.shopName', revenue: 1, orders: 1, rating: '$seller.rating' } },
  ]);
  return rows.map((r) => ({ ...r, revenue: round2(r.revenue) }));
}

async function topProducts(match = {}, limit = 5) {
  const rows = await Order.aggregate([
    { $match: { ...REVENUE_MATCH, ...match } },
    { $unwind: '$items' },
    { $group: { _id: '$items.productId', name: { $first: '$items.productName' }, sales: { $sum: '$items.quantity' }, revenue: { $sum: '$items.subtotal' }, sellerId: { $first: '$sellerId' } } },
    { $sort: { sales: -1 } },
    { $limit: limit },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'p' } },
    { $lookup: { from: 'sellers', localField: 'sellerId', foreignField: '_id', as: 's' } },
    { $project: { productId: '$_id', _id: 0, name: 1, sales: 1, revenue: 1, rating: { $first: '$p.rating' }, seller: { $first: '$s.shopName' } } },
  ]);
  return rows.map((r) => ({ ...r, revenue: round2(r.revenue) }));
}

function growth(current, previous) {
  if (!previous) return current ? 100 : 0;
  return round2(((current - previous) / previous) * 100);
}

async function alerts() {
  const since = addDays(new Date(), -1);
  const [failedPayments, lowStock, outOfStock, criticalDisputes, openDisputes, failedPayouts, sellersNoBank, pendingOld] = await Promise.all([
    Payment.countDocuments({ status: 'Failed', type: 'Payment', createdAt: { $gte: since } }),
    Product.countDocuments({ isDeleted: false, isActive: true, $expr: { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockThreshold'] }] } }),
    Product.countDocuments({ isDeleted: false, isActive: true, stock: { $lte: 0 } }),
    Dispute.countDocuments({ status: { $in: ['Open', 'InProgress'] }, priority: { $in: ['High', 'Critical'] } }),
    Dispute.countDocuments({ status: 'Open' }),
    Payout.countDocuments({ status: 'Failed' }),
    Seller.countDocuments({ status: 'Active', 'bankDetails.accountNumber': { $in: [null, ''] }, upiId: { $in: [null, ''] } }),
    Order.countDocuments({ orderStatus: 'Pending', paymentStatus: 'Completed', createdAt: { $lte: addDays(new Date(), -1) } }),
  ]);
  const list = [];
  if (failedPayments) list.push({ level: 'critical', type: 'payment', message: `${failedPayments} payment(s) failed in the last 24 hours`, link: '/payments/transactions?status=Failed', count: failedPayments });
  if (criticalDisputes) list.push({ level: 'critical', type: 'dispute', message: `${criticalDisputes} high / critical dispute(s) need attention`, link: '/disputes?priority=Critical', count: criticalDisputes });
  if (failedPayouts) list.push({ level: 'critical', type: 'payout', message: `${failedPayouts} seller payout(s) failed`, link: '/payments/payouts?status=Failed', count: failedPayouts });
  if (pendingOld) list.push({ level: 'warning', type: 'order', message: `${pendingOld} paid order(s) not confirmed by seller for over 24 hours`, link: '/orders?status=Pending', count: pendingOld });
  if (openDisputes) list.push({ level: 'warning', type: 'dispute', message: `${openDisputes} new dispute ticket(s)`, link: '/disputes?status=Open', count: openDisputes });
  if (lowStock) list.push({ level: 'warning', type: 'stock', message: `${lowStock} product(s) are low on stock`, link: '/products?status=lowStock', count: lowStock });
  if (outOfStock) list.push({ level: 'info', type: 'stock', message: `${outOfStock} active product(s) are out of stock`, link: '/products?status=outOfStock', count: outOfStock });
  if (sellersNoBank) list.push({ level: 'warning', type: 'seller', message: `${sellersNoBank} seller(s) have no bank / UPI details (payouts blocked)`, link: '/sellers', count: sellersNoBank });
  return list;
}

async function dashboard({ from, to } = {}) {
  const now = new Date();
  const today = startOfDay(now);
  const range = from ? periodRange({ period: 'custom', from, to }) : { start: startOfDay(addDays(now, -29)), end: now };
  const prevStart = new Date(range.start.getTime() - (range.end - range.start));
  const activeSince = addDays(now, -30);

  const [all, current, previous, todayTotals, totalUsers, totalSellers, activeSellers, activeUserIds, newUsersToday, newSellersToday,
    revenueSeries, userGrowth, sellerGrowth, recentOrders, sellers, products, alertList, pendingPayouts] = await Promise.all([
    revenueTotals({}),
    revenueTotals({ createdAt: { $gte: range.start, $lte: range.end } }),
    revenueTotals({ createdAt: { $gte: prevStart, $lt: range.start } }),
    revenueTotals({ createdAt: { $gte: today } }),
    User.countDocuments({ status: { $ne: 'Deleted' } }),
    Seller.countDocuments({ status: { $ne: 'Deleted' } }),
    Seller.countDocuments({ status: 'Active' }),
    Order.distinct('userId', { createdAt: { $gte: activeSince }, userId: { $ne: null } }),
    User.countDocuments({ createdAt: { $gte: today } }),
    Seller.countDocuments({ createdAt: { $gte: today } }),
    orderSeries(range.start, range.end),
    countSeries(User, range.start, range.end, { status: { $ne: 'Deleted' } }),
    countSeries(Seller, range.start, range.end, { status: { $ne: 'Deleted' } }),
    Order.find().sort({ createdAt: -1 }).limit(8).populate('sellerId', 'shopName').populate('userId', 'name mobileNumber').select('orderId sellerId userId customerSnapshot finalAmount orderStatus paymentStatus createdAt'),
    topSellers({ createdAt: { $gte: range.start, $lte: range.end } }),
    topProducts({ createdAt: { $gte: range.start, $lte: range.end } }),
    alerts(),
    Payout.aggregate([{ $match: { status: { $in: ['Pending', 'Processing', 'Failed'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);

  return {
    stats: {
      totalRevenue: all.revenue,
      totalOrders: all.orders,
      totalCommission: all.commission,
      totalUsers,
      totalSellers,
      activeSellers,
      activeUsers: activeUserIds.length,
      avgOrderValue: all.orders ? round2(all.revenue / all.orders) : 0,
      periodRevenue: current.revenue,
      periodOrders: current.orders,
      revenueGrowth: growth(current.revenue, previous.revenue),
      orderGrowth: growth(current.orders, previous.orders),
      pendingPayouts: round2(pendingPayouts[0]?.total),
    },
    today: {
      orders: todayTotals.orders,
      revenue: todayTotals.revenue,
      newUsers: newUsersToday,
      newSellers: newSellersToday,
    },
    charts: {
      revenueData: revenueSeries.map(({ date, revenue }) => ({ date, value: revenue })),
      orderData: revenueSeries.map(({ date, orders }) => ({ date, value: orders })),
      userGrowth: userGrowth.map(({ date, count, total }) => ({ date, value: count, total })),
      sellerGrowth: sellerGrowth.map(({ date, count, total }) => ({ date, value: count, total })),
    },
    recentOrders,
    topSellers: sellers,
    topProducts: products,
    alerts: alertList,
    range,
  };
}

async function revenue(query) {
  const { start, end } = periodRange(query);
  const match = { createdAt: { $gte: start, $lte: end } };
  if (query.seller) match.sellerId = new (require('mongoose').Types.ObjectId)(String(query.seller));
  if (query.paymentMethod) match.paymentMethod = query.paymentMethod;
  const [totals, series, byMethod, byCategory, sellers] = await Promise.all([
    revenueTotals(match),
    orderSeries(start, end, (({ createdAt, ...rest }) => rest)(match)),
    Order.aggregate([{ $match: { ...REVENUE_MATCH, ...match } }, { $group: { _id: '$paymentMethod', amount: { $sum: NET_AMOUNT }, count: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { ...REVENUE_MATCH, ...match } },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'p' } },
      { $lookup: { from: 'categories', localField: 'p.categoryId', foreignField: '_id', as: 'c' } },
      { $group: { _id: { $ifNull: [{ $first: '$c.name' }, 'Uncategorised'] }, amount: { $sum: '$items.subtotal' } } },
      { $sort: { amount: -1 } },
    ]),
    topSellers(match, 10),
  ]);
  return {
    period: { start, end },
    totalRevenue: totals.revenue,
    totalCommission: totals.commission,
    totalOrders: totals.orders,
    averageOrderValue: totals.orders ? round2(totals.revenue / totals.orders) : 0,
    series,
    revenueByPaymentMethod: Object.fromEntries(byMethod.map((m) => [m._id, { amount: round2(m.amount), count: m.count }])),
    revenueByCategory: byCategory.map((c) => ({ category: c._id, amount: round2(c.amount) })),
    topSellers: sellers,
  };
}

async function orders(query) {
  const { start, end } = periodRange(query);
  const match = { createdAt: { $gte: start, $lte: end } };
  const [statusRows, series, totals, bySeller, bySource] = await Promise.all([
    Order.aggregate([{ $match: match }, { $group: { _id: '$orderStatus', count: { $sum: 1 } } }]),
    orderSeries(start, end),
    revenueTotals(match),
    Order.aggregate([
      { $match: match },
      { $group: { _id: '$sellerId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'sellers', localField: '_id', foreignField: '_id', as: 's' } },
      { $project: { _id: 0, sellerId: '$_id', name: { $first: '$s.shopName' }, count: 1 } },
    ]),
    Order.aggregate([{ $match: match }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
  ]);
  const breakdown = Object.fromEntries(statusRows.map((s) => [s._id, s.count]));
  const total = statusRows.reduce((s, r) => s + r.count, 0);
  return {
    period: { start, end },
    totalOrders: total,
    successfulOrders: breakdown.Delivered || 0,
    cancelledOrders: breakdown.Cancelled || 0,
    returnedOrders: breakdown.Returned || 0,
    pendingOrders: (breakdown.Pending || 0) + (breakdown.Confirmed || 0) + (breakdown.Packed || 0) + (breakdown.Shipped || 0),
    orderStatusBreakdown: breakdown,
    orderSourceBreakdown: Object.fromEntries(bySource.map((s) => [s._id, s.count])),
    orderTrend: series.map(({ date, orders: count, revenue: rev }) => ({ date, count, averageOrderValue: count ? round2(rev / count) : 0 })),
    averageOrderValue: totals.orders ? round2(totals.revenue / totals.orders) : 0,
    ordersBySeller: bySeller,
  };
}

async function users(query) {
  const { start, end } = periodRange(query);
  const [totalUsers, newUsers, activeIds, buyers, series, byTahsil, linked] = await Promise.all([
    User.countDocuments({ status: { $ne: 'Deleted' } }),
    User.countDocuments({ createdAt: { $gte: start, $lte: end }, status: { $ne: 'Deleted' } }),
    Order.distinct('userId', { createdAt: { $gte: start, $lte: end }, userId: { $ne: null } }),
    Order.aggregate([{ $match: { userId: { $ne: null }, ...REVENUE_MATCH } }, { $group: { _id: '$userId', orders: { $sum: 1 } } }, { $group: { _id: null, buyers: { $sum: 1 }, repeat: { $sum: { $cond: [{ $gt: ['$orders', 1] }, 1, 0] } } } }]),
    countSeries(User, start, end, { status: { $ne: 'Deleted' } }),
    User.aggregate([
      { $match: { status: { $ne: 'Deleted' } } },
      { $group: { _id: '$tahsilId', count: { $sum: 1 } } },
      { $lookup: { from: 'tahsils', localField: '_id', foreignField: '_id', as: 't' } },
      { $project: { _id: 0, tahsil: { $ifNull: [{ $first: '$t.name' }, 'Unknown'] }, count: 1 } },
      { $sort: { count: -1 } },
    ]),
    Customer.distinct('userId'),
  ]);
  const b = buyers[0] || { buyers: 0, repeat: 0 };
  return {
    period: { start, end },
    totalUsers,
    newUsers,
    activeUsers: activeIds.length,
    linkedUsers: linked.length,
    buyers: b.buyers,
    repeatBuyers: b.repeat,
    userRetention: b.buyers ? round2((b.repeat / b.buyers) * 100) : 0,
    userGrowthTrend: series,
    usersByTahsil: byTahsil,
  };
}

async function sellers(query) {
  const { start, end } = periodRange(query);
  const [totalSellers, activeSellers, blocked, newSellers, totals, performance, series] = await Promise.all([
    Seller.countDocuments({ status: { $ne: 'Deleted' } }),
    Seller.countDocuments({ status: 'Active' }),
    Seller.countDocuments({ status: 'Blocked' }),
    Seller.countDocuments({ createdAt: { $gte: start, $lte: end }, status: { $ne: 'Deleted' } }),
    revenueTotals({ createdAt: { $gte: start, $lte: end } }),
    Order.aggregate([
      { $match: { ...REVENUE_MATCH, createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: '$sellerId', revenue: { $sum: NET_AMOUNT }, orders: { $sum: 1 }, customers: { $addToSet: '$userId' } } },
      { $sort: { revenue: -1 } },
      { $lookup: { from: 'sellers', localField: '_id', foreignField: '_id', as: 's' } },
      { $project: { _id: 0, sellerId: '$_id', name: { $first: '$s.shopName' }, rating: { $first: '$s.rating' }, revenue: 1, orders: 1, customers: { $size: '$customers' } } },
    ]),
    countSeries(Seller, start, end, { status: { $ne: 'Deleted' } }),
  ]);
  const withSales = performance.length;
  return {
    period: { start, end },
    totalSellers,
    activeSellers,
    blockedSellers: blocked,
    newSellersThisPeriod: newSellers,
    sellersWithSales: withSales,
    totalSellerRevenue: totals.revenue,
    averageSellerRevenue: withSales ? round2(totals.revenue / withSales) : 0,
    topSellers: performance.slice(0, 10).map((p) => ({ ...p, revenue: round2(p.revenue) })),
    sellerPerformance: performance.map((p) => ({ ...p, revenue: round2(p.revenue), averageOrderValue: p.orders ? round2(p.revenue / p.orders) : 0 })),
    sellerGrowthTrend: series,
  };
}

async function products(query) {
  const { start, end } = periodRange(query);
  const base = { isDeleted: false };
  const [total, active, outOfStock, lowStock, top, byCategory, bySeller] = await Promise.all([
    Product.countDocuments(base),
    Product.countDocuments({ ...base, isActive: true }),
    Product.countDocuments({ ...base, stock: { $lte: 0 } }),
    Product.countDocuments({ ...base, $expr: { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockThreshold'] }] } }),
    topProducts({ createdAt: { $gte: start, $lte: end } }, 10),
    Product.aggregate([
      { $match: base },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'c' } },
      { $project: { _id: 0, category: { $ifNull: [{ $first: '$c.name' }, 'Uncategorised'] }, count: 1 } },
      { $sort: { count: -1 } },
    ]),
    Product.aggregate([
      { $match: base },
      { $group: { _id: '$sellerId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'sellers', localField: '_id', foreignField: '_id', as: 's' } },
      { $project: { _id: 0, seller: { $first: '$s.shopName' }, count: 1 } },
    ]),
  ]);
  return { period: { start, end }, totalProducts: total, activeProducts: active, outOfStockProducts: outOfStock, lowStockProducts: lowStock, topProducts: top, byCategory, bySeller };
}

async function payments(query) {
  const { start, end } = periodRange(query);
  const match = { createdAt: { $gte: start, $lte: end } };
  const [rows, byGateway, series] = await Promise.all([
    Payment.aggregate([{ $match: match }, { $group: { _id: { type: '$type', method: '$method', status: '$status' }, count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    Payment.aggregate([{ $match: { ...match, type: 'Payment', status: 'Success' } }, { $group: { _id: { $ifNull: ['$gatewayMethod', '$method'] }, count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    (async () => {
      const { unit, format } = bucketFor(start, end);
      const r = await Payment.aggregate([
        { $match: { ...match, status: 'Success' } },
        { $group: { _id: { $dateToString: { format, date: '$createdAt', timezone: TZ } }, payments: { $sum: { $cond: [{ $eq: ['$type', 'Payment'] }, '$amount', 0] } }, refunds: { $sum: { $cond: [{ $eq: ['$type', 'Refund'] }, '$amount', 0] } } } },
      ]);
      return fill(labels(start, end, unit), r, ['payments', 'refunds']);
    })(),
  ]);
  const sum = (pred) => rows.filter(({ _id }) => pred(_id)).reduce((a, r) => ({ count: a.count + r.count, amount: round2(a.amount + r.amount) }), { count: 0, amount: 0 });
  const ok = sum((i) => i.type === 'Payment' && i.status === 'Success');
  return {
    period: { start, end },
    totalTransactions: rows.reduce((s, r) => s + r.count, 0),
    totalAmount: ok.amount,
    onlinePayments: sum((i) => i.type === 'Payment' && i.status === 'Success' && i.method === 'Online'),
    cashPayments: sum((i) => i.type === 'Payment' && i.status === 'Success' && i.method === 'Cash'),
    failedPayments: sum((i) => i.status === 'Failed'),
    pendingPayments: sum((i) => i.status === 'Pending'),
    refunds: sum((i) => i.type === 'Refund' && i.status === 'Success'),
    paymentMethodBreakdown: byGateway.map((g) => ({ method: g._id, count: g.count, amount: round2(g.amount) })),
    series,
  };
}

module.exports = { dashboard, revenue, orders, users, sellers, products, payments, alerts, startOfMonth };
