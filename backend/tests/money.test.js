const { describe, test, before: beforeAll, after: afterAll } = require('node:test');
const expect = require('./expect');
const { connect, disconnect, login, api } = require('./setup');
const { makeLocation, makeCatalog, makeProduct, makeUser, makeOrder } = require('./helpers');
const { Seller, Product, Order, Payout, Refund, PlatformSettings, StockMovement } = require('../src/models');
const { invalidate } = require('../src/services/settings.service');

let token;
let seller;
let seller2;
let product;
let user;

beforeAll(async () => {
  await connect();
  token = await login();
  const { tahsil } = await makeLocation();
  const { category } = await makeCatalog();
  seller = await Seller.create({ shopName: 'Shop A', ownerName: 'A', mobileNumber: '9876500001', tahsilId: tahsil._id, shopAddress: 'Addr A', bankDetails: { accountNumber: '111122223333', ifscCode: 'SBIN0001234' } });
  seller2 = await Seller.create({ shopName: 'Shop B', ownerName: 'B', mobileNumber: '9876500002', tahsilId: tahsil._id, shopAddress: 'Addr B' });
  product = await makeProduct(seller._id, category._id); // 500 + 18% = 590
  user = await makeUser();
});
afterAll(disconnect);

describe('Orders', () => {
  test('lists and searches orders', async () => {
    const o = await makeOrder({ seller, user, product, orderStatus: 'Pending' });
    const res = await api(token).get(`/orders?search=${o.orderId}`).expect(200);
    expect(res.body.data.totalCount).toBe(1);
    const detail = await api(token).get(`/orders/${o.orderId}`).expect(200);
    expect(detail.body.data.refundableAmount).toBe(590);
  });

  test('status update follows rules and cancel restocks + refunds', async () => {
    const o = await makeOrder({ seller, user, product, qty: 2, orderStatus: 'Confirmed' });
    const stockBefore = (await Product.findById(product._id)).stock;
    await api(token).put(`/orders/${o._id}/status`).send({ status: 'Packed', notes: 'packed by admin' }).expect(200);
    await api(token).post(`/orders/${o._id}/notes`).send({ note: 'Call customer' }).expect(200);
    const res = await api(token).post(`/orders/${o._id}/cancel`).send({ reason: 'Out of area' }).expect(200);
    expect(res.body.data.order.orderStatus).toBe('Cancelled');
    expect(res.body.data.refund.amount).toBe(1180);
    expect((await Product.findById(product._id)).stock).toBe(stockBefore + 2);
    expect(await StockMovement.countDocuments({ refId: o._id, reason: 'OrderCancelled' })).toBe(1);
    const after = await Order.findById(o._id);
    expect(after.paymentStatus).toBe('Refunded');
    await api(token).post(`/orders/${o._id}/cancel`).send({ reason: 'again' }).expect(400);
  });

  test('partial refunds cannot exceed order value', async () => {
    const o = await makeOrder({ seller, user, product });
    await api(token).post(`/orders/${o._id}/refund`).send({ amount: 100, reason: 'Damaged box' }).expect(200);
    await api(token).post(`/orders/${o._id}/refund`).send({ amount: 500, reason: 'Too much' }).expect(400);
    const r = await api(token).post(`/orders/${o._id}/refund`).send({ amount: 490, reason: 'Rest' }).expect(200);
    expect(r.body.data.order.paymentStatus).toBe('Refunded');
    expect(await Refund.countDocuments({ orderId: o._id })).toBe(2);
  });
});

describe('Payouts', () => {
  beforeAll(async () => {
    await Order.deleteMany({});
    // Eligible: delivered 10 days ago (delay is 7)
    await makeOrder({ seller, user, product, deliveredDaysAgo: 10 });
    await makeOrder({ seller, user, product, qty: 2, deliveredDaysAgo: 8 });
    // Not yet eligible: delivered 2 days ago
    await makeOrder({ seller, user, product, deliveredDaysAgo: 2 });
    // Cash order: ignored unless chargeCommissionOnCash
    await makeOrder({ seller, user, product, paymentMethod: 'Cash', deliveredDaysAgo: 20 });
    // Seller B has no bank details
    await makeOrder({ seller: seller2, user, product, deliveredDaysAgo: 15 });
  });

  test('computes pending amounts per seller', async () => {
    const res = await api(token).get('/payouts/pending').expect(200);
    const a = res.body.data.sellers.find((s) => s.seller.shopName === 'Shop A');
    expect(a.onlineOrders).toBe(2);
    expect(a.grossAmount).toBe(1770); // 590 + 1180
    expect(a.commissionAmount).toBe(88.5); // 5%
    expect(a.netAmount).toBe(1681.5);
  });

  test('initiates payouts, skips sellers without bank details, completes with UTR', async () => {
    const res = await api(token).post('/payouts/initiate').send({}).expect(200);
    expect(res.body.data.sellerCount).toBe(1);
    expect(res.body.data.skipped[0].reason).toMatch(/Bank details/);
    const payoutId = res.body.data.payoutIds[0];
    expect(await Order.countDocuments({ payoutId, settlementStatus: 'InPayout' })).toBe(2);

    // Nothing more due for seller A now
    const again = await api(token).post('/payouts/initiate').send({ sellerIds: [String(seller._id)] }).expect(200);
    expect(again.body.data.sellerCount).toBe(0);

    await api(token).put(`/payouts/${payoutId}/status`).send({ status: 'Completed' }).expect(400); // UTR required
    await api(token).put(`/payouts/${payoutId}/status`).send({ status: 'Processing' }).expect(200);
    await api(token).put(`/payouts/${payoutId}/status`).send({ status: 'Completed', transactionRef: 'UTR123' }).expect(200);
    expect(await Order.countDocuments({ payoutId, settlementStatus: 'Settled' })).toBe(2);
    const detail = await api(token).get(`/payouts/${payoutId}`).expect(200);
    expect(detail.body.data.bankDetails.accountNumber).toBe('111122223333');
  });

  test('refund on a settled order is recovered from the next payout', async () => {
    const settled = await Order.findOne({ settlementStatus: 'Settled' });
    await api(token).post(`/orders/${settled._id}/refund`).send({ amount: 100, reason: 'Late complaint' }).expect(200);
    const s = await Seller.findById(seller._id);
    expect(s.pendingDeduction).toBe(95); // seller share 95%
    const earnings = await api(token).get(`/sellers/${seller._id}/earnings`).expect(200);
    expect(earnings.body.data.pendingDeduction).toBe(95);
    expect(earnings.body.data.totalPaid).toBe(1681.5);
  });

  test('cash commission is deducted when enabled; failed payouts can be retried or rejected', async () => {
    await PlatformSettings.updateOne({}, { 'commissionSettings.chargeCommissionOnCash': true, 'commissionSettings.payoutDelayDays': 0 });
    invalidate();
    const pending = await api(token).get('/payouts/pending').expect(200);
    const a = pending.body.data.sellers.find((r) => r.seller.shopName === 'Shop A');
    expect(a.cashOrders).toBe(1);
    expect(a.cashCommission).toBe(29.5);
    expect(a.pendingDeduction).toBe(95);
    expect(a.netAmount).toBe(Math.round((590 - 29.5 - 29.5 - 95) * 100) / 100);

    const res = await api(token).post('/payouts/initiate').send({ sellerIds: [String(seller._id)] }).expect(200);
    const id = res.body.data.payoutIds[0];
    expect((await Seller.findById(seller._id)).pendingDeduction).toBe(0);
    await api(token).put(`/payouts/${id}/status`).send({ status: 'Failed', failureReason: 'Invalid IFSC' }).expect(200);
    await api(token).post(`/payouts/${id}/retry`).expect(200);
    await api(token).put(`/payouts/${id}/status`).send({ status: 'Rejected', notes: 'Hold' }).expect(200);
    // Orders released and deduction restored
    expect(await Order.countDocuments({ payoutId: id })).toBe(0);
    expect((await Seller.findById(seller._id)).pendingDeduction).toBe(95);
    expect((await Payout.findById(id)).status).toBe('Rejected');
  });

  test('payment dashboard summarises money', async () => {
    const res = await api(token).get('/payments/dashboard').expect(200);
    expect(res.body.data.totalPayoutsGiven).toBe(1681.5);
    expect(res.body.data.totalRevenue).toBeGreaterThan(0);
  });
});
