const { describe, test, before: beforeAll, after: afterAll } = require('node:test');
const crypto = require('crypto');
const request = require('supertest');
const expect = require('./expect');
const { connect, disconnect, app } = require('./setup');
const { makeLocation, makeCatalog } = require('./helpers');
const { Seller, Product, Order, Customer, User, Cart, Notification, Payment, ReturnRequest, Review, PlatformSettings } = require('../src/models');
const { signShopToken } = require('../src/middleware/sellerAuth');
const { expireUnpaidOrders } = require('../src/services/checkout.service');
const { invalidate } = require('../src/services/settings.service');

const U = (token) => {
  const w = (m) => (url) => request(app)[m](`/api/user${url}`).set('Authorization', `Bearer ${token}`);
  return { get: w('get'), post: w('post'), put: w('put'), delete: w('delete') };
};

let loc; let cat; let shopA; let shopB; let pA1; let pA2; let pB1; let token; let user;

beforeAll(async () => {
  await connect();
  loc = await makeLocation();
  cat = await makeCatalog();
  shopA = await Seller.create({ shopName: 'User Shop A', ownerName: 'A', mobileNumber: '9811111111', tahsilId: loc.tahsil._id, shopAddress: 'A', settings: { enableDelivery: true, deliveryCharge: 30, freeDeliveryAbove: 1000, allowCashOnDelivery: true } });
  shopB = await Seller.create({ shopName: 'User Shop B', ownerName: 'B', mobileNumber: '9811111112', tahsilId: loc.tahsil._id, shopAddress: 'B' });
  pA1 = await Product.create({ sellerId: shopA._id, categoryId: cat.category._id, name: 'Red Shoes', sellingPrice: 500, gstRate: 18, mrp: 650, stock: 5 });
  pA2 = await Product.create({ sellerId: shopA._id, categoryId: cat.category._id, name: 'Socks', sellingPrice: 100, gstRate: 0, stock: 20 });
  pB1 = await Product.create({ sellerId: shopB._id, categoryId: cat.category._id, name: 'Rice', sellingPrice: 60, gstRate: 5, stock: 50 });
  user = await User.create({ mobileNumber: '9822222222', name: 'Raj' });
  await Customer.create({ sellerId: shopA._id, userId: user._id, mobileNumber: user.mobileNumber });
  await Customer.create({ sellerId: shopB._id, userId: user._id, mobileNumber: user.mobileNumber });
});
afterAll(disconnect);

describe('User login', () => {
  test('number not linked to any shop gets the Hindi message', async () => {
    await User.create({ mobileNumber: '9833333333' });
    const res = await request(app).post('/api/user/auth/send-otp').send({ mobileNumber: '9833333333' }).expect(404);
    expect(res.body.message).toMatch(/किसी दुकान के ग्राहक नहीं/);
    await request(app).post('/api/user/auth/send-otp').send({ mobileNumber: '9844444444' }).expect(404);
  });

  test('linked user logs in with OTP and sees both shops', async () => {
    const sent = await request(app).post('/api/user/auth/send-otp').send({ mobileNumber: '9822222222' }).expect(200);
    const res = await request(app).post('/api/user/auth/verify-otp').send({ mobileNumber: '9822222222', otp: sent.body.data.devOtp }).expect(200);
    token = res.body.data.token;
    expect(res.body.data.sellers).toHaveLength(2);
    await U(token).get('/auth/me').expect(200);
  });

  test('location update finds the tahsil', async () => {
    const res = await U(token).post('/location/update').send({ latitude: 22.701, longitude: 75.801 }).expect(200);
    expect(res.body.data.inServiceArea).toBe(true);
    const far = await U(token).post('/location/update').send({ latitude: 28.6, longitude: 77.2 }).expect(200);
    expect(far.body.data.inServiceArea).toBe(false);
  });
});

describe('Browsing', () => {
  test('home & products only show the active shop', async () => {
    await U(token).post('/sellers/switch').send({ sellerId: String(shopA._id) }).expect(200);
    const home = await U(token).get('/home').expect(200);
    expect(home.body.data.seller.shopName).toBe('User Shop A');
    expect(home.body.data.featured.map((p) => p.name).includes('Rice')).toBe(false);
    const list = await U(token).get('/products?sortBy=price_asc').expect(200);
    expect(list.body.data.items.map((p) => p.name)).toEqual(['Socks', 'Red Shoes']);
    const search = await U(token).get('/products?search=red&priceMax=600').expect(200);
    expect(search.body.data.totalCount).toBe(1);
    const detail = await U(token).get(`/products/${pA1._id}`).expect(200);
    expect(detail.body.data.product.discountPercent).toBe(9);
    const cats = await U(token).get('/categories').expect(200);
    expect(cats.body.data[0].productCount).toBe(2);
  });

  test('cannot see products of a shop the user is not linked to', async () => {
    const shopC = await Seller.create({ shopName: 'Shop C', ownerName: 'C', mobileNumber: '9811111113', tahsilId: loc.tahsil._id, shopAddress: 'C' });
    const pc = await Product.create({ sellerId: shopC._id, categoryId: cat.category._id, name: 'Secret', sellingPrice: 10, stock: 1 });
    await U(token).get(`/products/${pc._id}`).expect(403);
    await U(token).post('/cart/add-item').send({ productId: String(pc._id) }).expect(403);
    await U(token).post('/sellers/switch').send({ sellerId: String(shopC._id) }).expect(403);
  });

  test('wishlist with price drop', async () => {
    await U(token).post('/wishlist/add').send({ productId: String(pA1._id) }).expect(200);
    await U(token).post('/wishlist/add').send({ productId: String(pA1._id) }).expect(200);
    await Product.findByIdAndUpdate(pA1._id, { sellingPrice: 450 }).then(async () => { const p = await Product.findById(pA1._id); p.markModified('sellingPrice'); await p.save(); });
    const w = await U(token).get('/wishlist').expect(200);
    expect(w.body.data.items).toHaveLength(1);
    expect(w.body.data.items[0].priceDrop).toBe(59);
    await U(token).delete(`/wishlist/${pA1._id}`).expect(200);
    const p = await Product.findById(pA1._id); p.sellingPrice = 500; await p.save();
  });
});

describe('Cart & checkout', () => {
  let addressId;
  test('cart rules: stock limit, other shop clears cart, delivery charge', async () => {
    await U(token).post('/cart/add-item').send({ productId: String(pB1._id), quantity: 2 }).expect(200);
    const add = await U(token).post('/cart/add-item').send({ productId: String(pA1._id), quantity: 1 }).expect(200);
    expect(add.body.data.cartCleared).toBe(true);
    await U(token).post('/cart/add-item').send({ productId: String(pA1._id), quantity: 10 }).expect(400);
    await U(token).post('/cart/add-item').send({ productId: String(pA2._id), quantity: 2 }).expect(200);
    const cart = await U(token).get('/cart').expect(200);
    expect(cart.body.data.totals.itemsTotal).toBe(790);
    expect(cart.body.data.totals.deliveryCharge).toBe(30);
    expect(cart.body.data.totals.total).toBe(820);
    const pickup = await U(token).get('/cart?deliveryType=Pickup').expect(200);
    expect(pickup.body.data.totals.deliveryCharge).toBe(0);
    await U(token).put('/cart/update-item').send({ productId: String(pA2._id), quantity: 3 }).expect(200);
  });

  test('address book', async () => {
    await U(token).post('/addresses').send({ fullAddress: 'x' }).expect(400);
    const a = await U(token).post('/addresses').send({ fullAddress: '12 MG Road', city: 'Indore', zipCode: '452001' }).expect(201);
    addressId = a.body.data._id;
    expect(a.body.data.isDefault).toBe(true);
    const b = await U(token).post('/addresses').send({ fullAddress: 'Office, AB Road', type: 'Work' }).expect(201);
    await U(token).post(`/addresses/${b.body.data._id}/set-default`).expect(200);
    await U(token).delete(`/addresses/${b.body.data._id}`).expect(200);
    const list = await U(token).get('/addresses').expect(200);
    expect(list.body.data[0].isDefault).toBe(true);
  });

  test('online order (test payment) reserves stock, hidden from seller until paid', async () => {
    const res = await U(token).post('/orders/create').send({ deliveryAddressId: addressId, paymentMethod: 'Online' }).expect(201);
    expect(res.body.data.payment.gateway).toBe('mock');
    const orderId = res.body.data.orderId;
    expect((await Product.findById(pA1._id)).stock).toBe(4);
    expect((await Cart.findOne({ userId: user._id })).items).toHaveLength(0);
    const sellerToken = signShopToken(shopA);
    await request(app).get(`/api/seller/orders/${orderId}`).set('Authorization', `Bearer ${sellerToken}`).expect(404);
    await U(token).post('/orders/verify-payment').send({ orderId, razorpayOrderId: 'x', razorpayPaymentId: 'y', razorpaySignature: 'z' }).expect(400);
    await U(token).post('/orders/verify-payment').send({ orderId, mock: true }).expect(200);
    const seen = await request(app).get(`/api/seller/orders/${orderId}`).set('Authorization', `Bearer ${sellerToken}`).expect(200);
    expect(seen.body.data.order.paymentStatus).toBe('Completed');
    expect(await Notification.countDocuments({ recipientType: 'Seller', recipientId: shopA._id, title: /नया ऑर्डर/ })).toBe(1);
    expect(await Payment.countDocuments({ orderId, status: 'Success' })).toBe(1);
    // Idempotent
    await U(token).post('/orders/verify-payment').send({ orderId, mock: true }).expect(200);
    expect(await Payment.countDocuments({ orderId, status: 'Success' })).toBe(1);
  });

  test('unpaid online order expires and releases stock', async () => {
    await U(token).post('/cart/add-item').send({ productId: String(pA1._id), quantity: 2 }).expect(200);
    const res = await U(token).post('/orders/create').send({ paymentMethod: 'Online' }).expect(201); // default address
    expect((await Product.findById(pA1._id)).stock).toBe(2);
    await Order.updateOne({ _id: res.body.data.orderId }, { paymentExpiresAt: new Date(Date.now() - 1000) });
    expect(await expireUnpaidOrders()).toBe(1);
    expect((await Product.findById(pA1._id)).stock).toBe(4);
    const o = await Order.findById(res.body.data.orderId);
    expect(o.orderStatus).toBe('Cancelled');
    await U(token).post('/orders/verify-payment').send({ orderId: String(o._id), mock: true }).expect(400);
  });

  test('COD order: visible to seller at once, user cancel restocks; pickup-only shop', async () => {
    await U(token).post('/cart/add-item').send({ productId: String(pA2._id), quantity: 1 }).expect(200);
    const res = await U(token).post('/orders/create').send({ deliveryType: 'Pickup', paymentMethod: 'Cash', notes: 'Will collect at 6pm' }).expect(201);
    const o = res.body.data.order;
    expect(o.deliveryCharge).toBe(0);
    expect(o.paymentStatus).toBe('Pending');
    const detail = await U(token).get(`/orders/${o._id}`).expect(200);
    expect(detail.body.data.canCancel).toBe(true);
    expect(detail.body.data.order.notes).toBe(undefined);
    await U(token).post(`/orders/${o._id}/cancel`).send({ reason: 'Changed mind' }).expect(200);
    expect((await Product.findById(pA2._id)).stock).toBe(20 - 3 + 0); // 3 from paid order remain sold
    // Shop B does not deliver
    await U(token).post('/cart/add-item').send({ productId: String(pB1._id), quantity: 1 }).expect(200);
    await U(token).post('/orders/create').send({ paymentMethod: 'Cash' }).expect(400);
  });

  test('delivered order: invoice, review updates ratings, return approved by seller refunds', async () => {
    const paid = await Order.findOne({ userId: user._id, paymentStatus: 'Completed' });
    const sellerToken = signShopToken(shopA);
    for (const s of ['Confirmed', 'Packed', 'Shipped', 'Delivered']) {
      await request(app).put(`/api/seller/orders/${paid._id}/status`).set('Authorization', `Bearer ${sellerToken}`).send({ status: s }).expect(200);
    }
    const inv = await U(token).get(`/orders/${paid._id}/invoice`).expect(200);
    await U(token).get(`/invoices/${inv.body.data.invoiceId}`).expect(200);
    const pdf = await U(token).get(`/invoices/${inv.body.data.invoiceId}/download`).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');

    await U(token).post('/reviews').send({ orderId: String(paid._id), seller: { rating: 4, reviewText: 'Good shop' }, products: [{ productId: String(pA1._id), rating: 5, reviewText: 'बहुत अच्छा!' }] }).expect(201);
    expect((await Product.findById(pA1._id)).rating).toBe(5);
    expect((await Seller.findById(shopA._id)).rating).toBe(4);
    await U(token).post('/reviews').send({ orderId: String(paid._id), seller: { rating: 2 } }).expect(201); // update, not duplicate
    expect(await Review.countDocuments({ orderId: paid._id, ratingType: 'Seller' })).toBe(1);

    const rr = await U(token).post(`/orders/${paid._id}/return`).field('reason', 'Size too small').expect(201);
    await U(token).post(`/orders/${paid._id}/return`).field('reason', 'Again').expect(409);
    const list = await request(app).get('/api/seller/returns').set('Authorization', `Bearer ${sellerToken}`).expect(200);
    expect(list.body.data.pendingCount).toBe(1);
    await request(app).post(`/api/seller/returns/${rr.body.data.returnId}/decide`).set('Authorization', `Bearer ${sellerToken}`).send({ approve: true }).expect(200);
    const o = await Order.findById(paid._id);
    expect(o.orderStatus).toBe('Returned');
    expect(o.paymentStatus).toBe('Refunded');
    expect((await ReturnRequest.findById(rr.body.data.returnId)).status).toBe('Completed');
    const reorder = await U(token).post(`/orders/${paid._id}/reorder`).expect(200);
    expect(reorder.body.data.items.length).toBeGreaterThan(0);
  });

  test('orders list, support ticket, notifications, profile, logout', async () => {
    const list = await U(token).get('/orders?status=cancelled').expect(200);
    expect(list.body.data.totalCount).toBe(2);
    const t = await U(token).post('/support').field('title', 'Wrong item').field('description', 'Got blue instead of red').field('category', 'ProductQuality').expect(201);
    await U(token).post(`/support/${t.body.data._id}/comments`).field('text', 'Photo attached').expect(200);
    await U(token).get(`/support/${t.body.data._id}`).expect(200);
    const n = await U(token).get('/notifications').expect(200);
    expect(n.body.data.unreadCount).toBeGreaterThan(0);
    await U(token).post('/notifications/mark-all-read').expect(200);
    await U(token).put('/profile').send({ name: 'Raj Kumar', email: 'raj@x.in' }).expect(200);
    await U(token).put('/profile/preferences').send({ language: 'en', whatsappNotifications: false }).expect(200);
    const d = await U(token).get('/dashboard').expect(200);
    expect(d.body.data.stats.totalOrders).toBe(0); // the only paid order was fully refunded
    await U(token).post('/auth/logout').expect(200);
    await U(token).get('/auth/me').expect(401);
  });

  test('razorpay webhook signature is enforced', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec';
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'nope' } } } });
    await request(app).post('/api/payments/razorpay/webhook').set('Content-Type', 'application/json').set('x-razorpay-signature', 'bad').send(body).expect(400);
    const sig = crypto.createHmac('sha256', 'whsec').update(body).digest('hex');
    await request(app).post('/api/payments/razorpay/webhook').set('Content-Type', 'application/json').set('x-razorpay-signature', sig).send(body).expect(200);
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  test('user blocked by admin is logged out; maintenance mode', async () => {
    const sent = await request(app).post('/api/user/auth/send-otp').send({ mobileNumber: '9822222222' });
    const { Otp } = require('../src/models');
    await Otp.deleteMany({});
    const again = await request(app).post('/api/user/auth/send-otp').send({ mobileNumber: '9822222222' }).expect(200);
    const login = await request(app).post('/api/user/auth/verify-otp').send({ mobileNumber: '9822222222', otp: again.body.data.devOtp }).expect(200);
    const t2 = login.body.data.token;
    await PlatformSettings.updateOne({}, { maintenanceMode: true }); invalidate();
    await U(t2).get('/home').expect(503);
    await PlatformSettings.updateOne({}, { maintenanceMode: false }); invalidate();
    await User.updateOne({ _id: user._id }, { status: 'Blocked' });
    await U(t2).get('/home').expect(403);
    expect(sent.status === 200 || sent.status === 429).toBe(true);
  });
});
