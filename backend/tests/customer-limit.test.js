const { describe, test, before: beforeAll, after: afterAll } = require('node:test');
const request = require('supertest');
const expect = require('./expect');
const { connect, disconnect, app, login } = require('./setup');
const { makeLocation, makeCatalog } = require('./helpers');
const { Seller, Customer, User, Product } = require('../src/models');
const { signShopToken } = require('../src/middleware/sellerAuth');

let loc; let token; let sellerId;
const A = (t) => ({
  get: (u) => request(app).get(`/api/admin${u}`).set('Authorization', `Bearer ${t}`),
  post: (u) => request(app).post(`/api/admin${u}`).set('Authorization', `Bearer ${t}`),
  put: (u) => request(app).put(`/api/admin${u}`).set('Authorization', `Bearer ${t}`),
});
const S = (seller) => {
  const t = signShopToken(seller);
  return {
    get: (u) => request(app).get(`/api/seller${u}`).set('Authorization', `Bearer ${t}`),
    post: (u) => request(app).post(`/api/seller${u}`).set('Authorization', `Bearer ${t}`),
  };
};

beforeAll(async () => {
  await connect();
  token = await login();
  loc = await makeLocation();
});
afterAll(disconnect);

describe('Customer limit per seller', () => {
  test('admin must give the customer limit when adding a seller', async () => {
    const body = { shopName: 'Limit Shop', ownerName: 'Lalit', mobileNumber: '9811122201', shopAddress: 'Limit Road', pincode: '452002' };
    const missing = await A(token).post('/sellers').send(body).expect(400);
    expect(missing.body.message).toMatch(/how many customers/i);
    await A(token).post('/sellers').send({ ...body, customerLimit: 0 }).expect(400);
    const res = await A(token).post('/sellers').send({ ...body, customerLimit: 2 }).expect(201);
    sellerId = res.body.data._id;
    expect(res.body.data.customerLimit).toBe(2);
  });

  test('seller can add customers only up to the limit (single add and CSV)', async () => {
    const seller = await Seller.findById(sellerId);
    await S(seller).post('/customers').send({ mobileNumber: '9827100001' }).expect(201);
    const list = await S(seller).get('/customers').expect(200);
    expect([list.body.data.customerCount, list.body.data.customerLimit, list.body.data.customersLeft]).toEqual([1, 2, 1]);
    const csv = 'mobileNumber,name\n9827100002,Two\n9827100003,Three\n';
    const bulk = await S(seller).post('/customers/bulk-link').attach('csvFile', Buffer.from(csv), 'c.csv').expect(200);
    expect(bulk.body.data.linkedCount).toBe(1);
    expect(bulk.body.data.errors[0].message).toMatch(/limit reached/i);
    const full = await S(seller).post('/customers').send({ mobileNumber: '9827100004' }).expect(403);
    expect(full.body.message).toMatch(/limit reached/i);
    expect(await User.exists({ mobileNumber: '9827100004' })).toBe(null); // nothing created
    // an existing customer is still "already added", not "limit reached"
    await S(seller).post('/customers').send({ mobileNumber: '9827100001' }).expect(409);
  });

  test('admin linking also respects the limit; raising the limit allows more', async () => {
    const res = await A(token).post('/users').send({ mobileNumber: '9827100005', sellerId }).expect(403);
    expect(res.body.message).toMatch(/limit reached/i);
    expect(await User.exists({ mobileNumber: '9827100005' })).toBe(null);
    const csv = 'mobileNumber,name,sellerName\n9827100006,Six,Limit Shop\n';
    const bulk = await A(token).post('/users/bulk-link').attach('csvFile', Buffer.from(csv), 'u.csv').expect(200);
    expect(bulk.body.data.failedCount).toBe(1);
    await A(token).put(`/sellers/${sellerId}`).send({ customerLimit: 3 }).expect(200);
    await A(token).post('/users').send({ mobileNumber: '9827100005', sellerId }).expect(201);
    expect(await Customer.countDocuments({ sellerId })).toBe(3);
    const detail = await A(token).get(`/sellers/${sellerId}`).expect(200);
    expect(detail.body.data.seller.customerLimit).toBe(3);
    expect(detail.body.data.analytics.totalCustomers).toBe(3);
  });

  test('a counter bill for a new number is still shared when the shop is full', async () => {
    const seller = await Seller.findById(sellerId);
    const cat = await makeCatalog();
    const p = await Product.create({ sellerId, categoryId: cat.category._id, name: 'Pen', sellingPrice: 10, stock: 10 });
    const bill = await S(seller).post('/invoices').send({ items: [{ productId: String(p._id), quantity: 1 }], paymentMethod: 'Cash', walkInName: 'New', walkInMobile: '9827100009' }).expect(201);
    await S(seller).post(`/invoices/${bill.body.data.invoiceId}/share`).send({ channel: 'whatsapp' }).expect(200);
    expect(await Customer.countDocuments({ sellerId })).toBe(3); // not added: limit reached
  });

  test('older shops without a limit are not restricted', async () => {
    const old = await Seller.create({ shopName: 'Old Shop', ownerName: 'O', mobileNumber: '9811122202', tahsilId: loc.tahsil._id, shopAddress: 'Old Road' });
    expect(old.customerLimit).toBe(null);
    await S(old).post('/customers').send({ mobileNumber: '9827100010' }).expect(201);
    const list = await S(old).get('/customers').expect(200);
    expect(list.body.data.customerLimit).toBe(null);
  });
});
