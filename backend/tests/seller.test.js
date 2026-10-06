const { describe, test, before: beforeAll, after: afterAll } = require('node:test');
const request = require('supertest');
const expect = require('./expect');
const { connect, disconnect, app } = require('./setup');
const { makeLocation, makeCatalog, makeUser } = require('./helpers');
const { Seller, Product, Order, Customer, StockMovement, Invoice, PlatformSettings, Notification, Dispute } = require('../src/models');
const { invalidate } = require('../src/services/settings.service');
const { pendingBySeller } = require('../src/services/payout.service');

const S = (token) => {
  const wrap = (m) => (url) => request(app)[m](`/api/seller${url}`).set('Authorization', `Bearer ${token}`);
  return { get: wrap('get'), post: wrap('post'), put: wrap('put'), delete: wrap('delete') };
};

async function otpLogin(mobileNumber) {
  const sent = await request(app).post('/api/seller/auth/send-otp').send({ mobileNumber }).expect(200);
  const otp = sent.body.data.devOtp;
  return request(app).post('/api/seller/auth/verify-otp').send({ mobileNumber, otp });
}

let loc;
let catalog;
let shopA;
let token;

beforeAll(async () => {
  await connect();
  loc = await makeLocation();
  catalog = await makeCatalog();
  shopA = await Seller.create({ shopName: 'Seller A', ownerName: 'Owner', mobileNumber: '9800000001', tahsilId: loc.tahsil._id, shopAddress: 'Addr A' });
});
afterAll(disconnect);

describe('Seller auth', () => {
  test('unknown mobile is rejected', async () => {
    const res = await request(app).post('/api/seller/auth/send-otp').send({ mobileNumber: '9800009999' }).expect(404);
    expect(res.body.message).toMatch(/not registered/);
  });

  test('wrong OTP counts attempts; resend is throttled', async () => {
    await request(app).post('/api/seller/auth/send-otp').send({ mobileNumber: '9800000001' }).expect(200);
    await request(app).post('/api/seller/auth/send-otp').send({ mobileNumber: '9800000001' }).expect(429);
    const bad = await request(app).post('/api/seller/auth/verify-otp').send({ mobileNumber: '9800000001', otp: '000000' }).expect(400);
    expect(bad.body.message).toMatch(/attempt/);
  });

  test('single shop logs straight in', async () => {
    const { Otp } = require('../src/models');
    await Otp.deleteMany({});
    const res = await otpLogin('9800000001');
    expect(res.status).toBe(200);
    token = res.body.data.token;
    expect(res.body.data.seller.shopName).toBe('Seller A');
    await S(token).get('/auth/me').expect(200);
  });

  test('multi-shop owner selects and switches shop; blocked shop is refused', async () => {
    const b1 = await Seller.create({ shopName: 'Multi 1', ownerName: 'M', mobileNumber: '9800000002', tahsilId: loc.tahsil._id, shopAddress: 'x1' });
    const b2 = await Seller.create({ shopName: 'Multi 2', ownerName: 'M', mobileNumber: '9800000002', tahsilId: loc.tahsil._id, shopAddress: 'x2', status: 'Blocked', blockReason: 'KYC' });
    const res = await otpLogin('9800000002');
    expect(res.body.data.selectShop).toBe(true);
    expect(res.body.data.shops).toHaveLength(2);
    const owner = res.body.data.ownerToken;
    await S(owner).get('/dashboard').expect(401); // owner token is not a shop token
    await S(owner).post('/auth/select-shop').send({ shopId: String(b2._id) }).expect(403);
    await S(owner).post('/auth/select-shop').send({ shopId: String(shopA._id) }).expect(404); // not his shop
    const sel = await S(owner).post('/auth/select-shop').send({ shopId: String(b1._id) }).expect(200);
    const t1 = sel.body.data.token;
    const shops = await S(t1).get('/auth/shops').expect(200);
    expect(shops.body.data).toHaveLength(2);
    // Admin blocks the shop -> token stops working
    await Seller.updateOne({ _id: b1._id }, { status: 'Blocked', $inc: { tokenVersion: 1 } });
    await S(t1).get('/dashboard').expect(403); // blocked: seller sees the reason
  });

  test('maintenance mode blocks the seller app', async () => {
    await PlatformSettings.updateOne({}, { maintenanceMode: true, maintenanceMessage: 'Upgrade' });
    invalidate();
    const res = await S(token).get('/dashboard').expect(503);
    expect(res.body.maintenance).toBe(true);
    await request(app).get('/api/seller/config').expect(200);
    await PlatformSettings.updateOne({}, { maintenanceMode: false });
    invalidate();
  });
});

describe('Products & inventory', () => {
  let productId;
  test('categories list and product create with auto SKU', async () => {
    const cats = await S(token).get('/categories').expect(200);
    expect(cats.body.data[0].subCategories).toHaveLength(1);
    await S(token).post('/products').field('name', 'Bad GST').field('categoryId', String(catalog.category._id)).field('sellingPrice', '100').field('gstRate', '7').expect(400);
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
    const res = await S(token).post('/products')
      .field('name', 'Red Shoes').field('categoryId', String(catalog.category._id)).field('subCategoryId', String(catalog.sub._id))
      .field('sellingPrice', '500').field('mrp', '600').field('costPrice', '300').field('gstRate', '18').field('stock', '10')
      .attach('images', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    productId = res.body.data._id;
    expect(res.body.data.finalPrice).toBe(590);
    expect(res.body.data.sku).toMatch(/^SELL-FOO-0001$/);
    expect(res.body.data.images).toHaveLength(1);
    expect(await StockMovement.countDocuments({ productId, reason: 'Added' })).toBe(1);
  });

  test('update keeps / removes images, cannot change stock directly', async () => {
    const res = await S(token).put(`/products/${productId}`).field('sellingPrice', '1000').field('stock', '999').field('keepImages', '[]').expect(200);
    expect(res.body.data.finalPrice).toBe(1180);
    expect(res.body.data.stock).toBe(10);
    expect(res.body.data.images).toHaveLength(0);
    await S(token).put(`/products/${productId}`).field('sellingPrice', '500').expect(200);
  });

  test('stock adjust, low stock, barcode, bulk, admin-disabled', async () => {
    await S(token).post('/inventory/adjust-stock').send({ productId, quantity: -20, reason: 'Damage' }).expect(400);
    const adj = await S(token).post('/inventory/adjust-stock').send({ productId, quantity: 3, mode: 'set', reason: 'Recount' }).expect(200);
    expect(adj.body.data.newStock).toBe(3);
    const inv = await S(token).get('/inventory').expect(200);
    expect(inv.body.data.lowStock).toBe(1);
    const bc = await S(token).get(`/products/${productId}/barcode`).expect(200);
    expect(bc.body.data.qrCode).toMatch(/^data:image\/png/);
    const found = await S(token).get(`/products/search?q=${bc.body.data.sku}`).expect(200);
    expect(found.body.data).toHaveLength(1);
    await S(token).post('/products/bulk').send({ ids: [productId], action: 'price', percent: 10 }).expect(200);
    expect((await Product.findById(productId)).sellingPrice).toBe(550);
    await S(token).post('/products/bulk').send({ ids: [productId], action: 'price', percent: -9.090909 }).expect(200);
    await Product.updateOne({ _id: productId }, { disabledByAdmin: true, isActive: false });
    await S(token).post(`/products/${productId}/toggle-active`).send({ isActive: true }).expect(403);
    await Product.updateOne({ _id: productId }, { disabledByAdmin: false, isActive: true, stock: 10 });
    const hist = await S(token).get('/inventory/history').expect(200);
    expect(hist.body.data.totalCount).toBe(2);
  });

  test('seller adds a sub-category; product with a video', async () => {
    const add = await S(token).post(`/categories/${catalog.category._id}/subcategories`).send({ name: 'Sports Shoes' }).expect(201);
    const again = await S(token).post(`/categories/${catalog.category._id}/subcategories`).send({ name: 'sports  shoes' }).expect(200);
    expect(again.body.data._id).toBe(add.body.data._id);
    const res = await S(token)
      .post('/products')
      .field('name', 'Runner')
      .field('categoryId', String(catalog.category._id))
      .field('subCategoryId', add.body.data._id)
      .field('sellingPrice', '1000')
      .field('gstRate', '18')
      .attach('videos', Buffer.from('not really a video'), { filename: 'demo.mp4', contentType: 'video/mp4' })
      .expect(201);
    expect(res.body.data.videos).toHaveLength(1);
    await S(token).put(`/products/${res.body.data._id}`).field('keepVideos', '[]').expect(200);
    expect((await Product.findById(res.body.data._id)).videos).toHaveLength(0);
    await S(token).post('/products').field('name', 'Bad').field('categoryId', String(catalog.category._id)).field('sellingPrice', '10').attach('videos', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' }).expect(400);
  });

  test('bulk CSV upload with errors', async () => {
    const csv = `name,category,subCategory,sellingPrice,gstRate,stock\nJeans,${catalog.category.name},Casual,800,5,20\nBad,Nope,,10,0,1\nNoPrice,${catalog.category.name},,,0,1\n`;
    const res = await S(token).post('/products/bulk-upload').attach('csvFile', Buffer.from(csv), 'p.csv').expect(200);
    expect(res.body.data.uploadedCount).toBe(1);
    expect(res.body.data.failedCount).toBe(2);
  });
});

describe('Customers, bills & orders', () => {
  let customerId;
  let product;
  test('add customer creates the user link; duplicates rejected; new product notifies customers', async () => {
    const res = await S(token).post('/customers').send({ mobileNumber: '9827055555', name: 'Raj' }).expect(201);
    customerId = res.body.data._id;
    await S(token).post('/customers').send({ mobileNumber: '9827055555' }).expect(409);
    // Phone number can be corrected; the shop link moves to the new number
    const other = await S(token).post('/customers').send({ mobileNumber: '9827055556', name: 'Other' }).expect(201);
    await S(token).put(`/customers/${customerId}`).send({ mobileNumber: '9827055556' }).expect(409);
    await S(token).put(`/customers/${customerId}`).send({ mobileNumber: '9827055557' }).expect(200);
    const { User } = require('../src/models');
    const moved = await Customer.findById(customerId).populate('userId', 'mobileNumber');
    expect(moved.userId.mobileNumber).toBe('9827055557');
    expect(await User.exists({ mobileNumber: '9827055555' })).toBeTruthy();
    await S(token).put(`/customers/${customerId}`).send({ mobileNumber: '9827055555', name: 'Raj' }).expect(200);
    await S(token).delete(`/customers/${other.body.data._id}`).expect(200);
    await S(token).post('/products').field('name', 'Blue Jeans').field('categoryId', String(catalog.category._id)).field('sellingPrice', '950').field('gstRate', '18').field('stock', '5').expect(201);
    expect(await Notification.countDocuments({ recipientType: 'User', type: 'NewProduct' })).toBe(1);
    const csv = 'mobileNumber,name\n9827066666,Priya\n123,Bad\n';
    const bulk = await S(token).post('/customers/bulk-link').attach('csvFile', Buffer.from(csv), 'c.csv').expect(200);
    expect(bulk.body.data.linkedCount).toBe(1);
  });

  test('POS bill: stock, invoice, customer stats, no oversell', async () => {
    product = await Product.findOne({ sellerId: shopA._id, name: 'Red Shoes' });
    await S(token).post('/invoices').send({ customerId, items: [{ productId: String(product._id), quantity: 99 }], paymentMethod: 'Cash' }).expect(400);
    expect((await Product.findById(product._id)).stock).toBe(10);
    const res = await S(token).post('/invoices').send({ customerId, items: [{ productId: String(product._id), quantity: 2 }, { productId: String(product._id), quantity: 1 }], paymentMethod: 'Cash', discount: 20 }).expect(201);
    const { invoice, order } = res.body.data;
    expect(invoice.invoiceId).toMatch(/^INV-/);
    expect(order.finalAmount).toBe(1750); // 3 × 590 − 20
    expect(order.orderStatus).toBe('Delivered');
    expect(order.settlementStatus).toBe('NotApplicable');
    expect((await Product.findById(product._id)).stock).toBe(7);
    const c = await Customer.findById(customerId);
    expect(c.totalOrders).toBe(1);
    const detail = await S(token).get(`/invoices/${invoice._id}`).expect(200);
    expect(detail.body.data.whatsappText).toMatch(/Total amount: ₹1,750/);
    const share = await S(token).post(`/invoices/${invoice._id}/share`).send({ channel: 'whatsapp' }).expect(200);
    expect(share.body.data.url).toMatch(/^https:\/\/wa\.me\/919827055555/);
    const pdf = await S(token).get(`/invoices/${invoice.invoiceId}/pdf`).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    // Walk-in bill paid by UPI directly to the seller is NOT a platform payout
    await S(token).post('/invoices').send({ items: [{ productId: String(product._id), quantity: 1 }], paymentMethod: 'Online', walkInName: 'Walk-in' }).expect(201);
    await PlatformSettings.updateOne({}, { 'commissionSettings.payoutDelayDays': 0 });
    invalidate();
    const due = await pendingBySeller([shopA._id]);
    expect(due.length ? due[0].grossAmount : 0).toBe(0);
  });

  test('online order flow: confirm → pack → ship → deliver creates invoice; cancel restocks', async () => {
    const user = (await Customer.findById(customerId)).userId;
    const mk = async () => Order.create({
      orderId: `ORD-T-${Math.random()}`, sellerId: shopA._id, userId: user, source: 'Online', paymentMethod: 'Online', paymentStatus: 'Completed', orderStatus: 'Pending',
      items: [{ productId: product._id, productName: product.name, quantity: 1, price: 500, gstRate: 18, gst: 90, subtotal: 590 }], subtotal: 500, gstAmount: 90, finalAmount: 590, commissionRate: 5,
    });
    const o = await mk();
    await S(token).put(`/orders/${o._id}/status`).send({ status: 'Shipped' }).expect(400); // skipping steps
    for (const s of ['Confirmed', 'Packed', 'Shipped']) await S(token).put(`/orders/${o._id}/status`).send({ status: s }).expect(200);
    // Delivery needs the code the customer received
    await S(token).put(`/orders/${o._id}/status`).send({ status: 'Delivered' }).expect(400);
    await S(token).post(`/orders/${o._id}/delivery-otp`).expect(200);
    await S(token).post(`/orders/${o._id}/delivery-otp`).expect(429);
    const seen = await S(token).get(`/orders/${o._id}`).expect(200);
    expect(JSON.stringify(seen.body).includes('"code"')).toBe(false); // the seller never sees the code
    expect(!!seen.body.data.deliveryOtpSentAt).toBe(true);
    const { code } = (await Order.findById(o._id).select('+deliveryOtp')).deliveryOtp;
    await S(token).put(`/orders/${o._id}/status`).send({ status: 'Delivered', otp: code === '1111' ? '2222' : '1111' }).expect(400);
    await S(token).put(`/orders/${o._id}/status`).send({ status: 'Delivered', otp: code }).expect(200);
    expect(await Notification.countDocuments({ recipientType: 'User', recipientId: user, title: `Delivery code: ${code}` })).toBe(1);
    const after = await Order.findById(o._id);
    expect(!!after.invoiceId).toBe(true);
    await S(token).put(`/orders/${o._id}/add-note`).send({ note: 'Handed over' }).expect(200);
    const o2 = await mk();
    const stock = (await Product.findById(product._id)).stock;
    const c = await S(token).post(`/orders/${o2._id}/cancel`).send({ reason: 'Out of stock' }).expect(200);
    expect(c.body.data.refund.amount).toBe(590);
    expect((await Product.findById(product._id)).stock).toBe(stock + 1);
    const list = await S(token).get('/orders?status=open').expect(200);
    expect(list.body.data.totalCount).toBe(0);
    // Another seller cannot see this order
    const other = await Seller.create({ shopName: 'Other', ownerName: 'O', mobileNumber: '9800000003', tahsilId: loc.tahsil._id, shopAddress: 'o' });
    const { signShopToken } = require('../src/middleware/sellerAuth');
    await S(signShopToken(other)).get(`/orders/${o._id}`).expect(404);
    await S(signShopToken(other)).get(`/products/${product._id}`).expect(404);
  });

  test('customer detail, dashboard, analytics, export', async () => {
    const cd = await S(token).get(`/customers/${customerId}`).expect(200);
    expect(cd.body.data.stats.totalOrders).toBe(2);
    const d = await S(token).get('/dashboard').expect(200);
    expect(d.body.data.today.orders).toBeGreaterThan(0);
    const sm = await S(token).get('/analytics/summary?period=month').expect(200);
    expect(sm.body.data.estimatedProfit).toBeGreaterThan(0);
    const tr = await S(token).get('/analytics/sales-trend?days=7').expect(200);
    expect(tr.body.data.dates).toHaveLength(7);
    await S(token).get('/analytics/best-selling').expect(200);
    await S(token).get('/analytics/customer-analysis').expect(200);
    for (const format of ['CSV', 'Excel', 'PDF']) {
      const r = await S(token).post('/analytics/export-report').send({ type: 'Orders', format, period: 'month' }).buffer(true).parse((resp, cb) => { const ch = []; resp.on('data', (x) => ch.push(x)); resp.on('end', () => cb(null, Buffer.concat(ch))); }).expect(200);
      expect(r.body.length).toBeGreaterThan(100);
    }
    await S(token).get('/earnings').expect(200);
    await S(token).get('/payouts').expect(200);
    expect(await Invoice.countDocuments({ sellerId: shopA._id })).toBe(3);
  });

  test('settings, bank change notifies admins, support ticket, notifications', async () => {
    await S(token).put('/settings').send({ enableDelivery: true, deliveryCharge: 20, notifications: { sms: false } }).expect(200);
    const s = await S(token).get('/settings').expect(200);
    expect(s.body.data.shop.settings.notifications.sms).toBe(false);
    expect(s.body.data.shop.settings.notifications.push).toBe(true);
    await S(token).put('/bank').send({ accountNumber: '12', ifscCode: 'SBIN0001234' }).expect(400);
    await S(token).put('/bank').send({ accountHolder: 'Owner', accountNumber: '123412341234', ifscCode: 'SBIN0001234', upiId: 'a@upi' }).expect(200);
    expect(await Notification.countDocuments({ recipientType: 'Admin', title: /bank/ })).toBe(1);
    const t = await S(token).post('/support').field('title', 'Payout late').field('description', 'Not received last week').field('category', 'PaymentIssue').expect(201);
    expect(t.body.data.priority).toBe('High');
    await S(token).post(`/support/${t.body.data._id}/comments`).field('text', 'Any update?').expect(200);
    const tl = await S(token).get('/support').expect(200);
    expect(tl.body.data.totalCount).toBe(1);
    expect(await Dispute.countDocuments({ reportedBy: 'Seller' })).toBe(1);
    const n = await S(token).get('/notifications').expect(200);
    expect(n.body.data.unreadCount).toBeGreaterThan(0);
    await S(token).post('/notifications/mark-all-read').expect(200);
    await S(token).post('/auth/logout').expect(200);
    await S(token).get('/dashboard').expect(401);
  });
});
