const { describe, test, before: beforeAll, after: afterAll } = require('node:test');
const expect = require('./expect');
const { connect, disconnect, login, api } = require('./setup');
const { makeLocation } = require('./helpers');
const { Seller, User, Customer, AuditLog } = require('../src/models');

let token;
let loc;
beforeAll(async () => {
  await connect();
  token = await login();
  loc = await makeLocation();
});
afterAll(disconnect);

const sellerBody = () => ({
  shopName: 'Bhagwati Shoes',
  ownerName: 'Bhagwati',
  mobileNumber: '9876543210',
  tahsilId: String(loc.tahsil._id),
  shopAddress: 'Rajwada, Indore',
  bankDetails: { accountHolder: 'Bhagwati', accountNumber: '123456789012', ifscCode: 'SBIN0001234', bankName: 'SBI' },
  commissionRate: 5,
});

describe('Sellers', () => {
  let sellerId;

  test('creates a seller with encrypted bank account', async () => {
    const res = await api(token).post('/sellers').send(sellerBody()).expect(201);
    sellerId = res.body.data._id;
    expect(res.body.data.bankDetails.accountNumber).toBe('XXXXXXXX9012');
    const raw = await Seller.findById(sellerId).lean();
    expect(raw.bankDetails.accountNumber).not.toContain('123456789012');
    expect(raw.districtIds.map(String)).toEqual([String(loc.district._id)]);
    expect(await AuditLog.countDocuments({ entityType: 'Seller', action: 'Created' })).toBe(1);
  });

  test('validates input and duplicate shop names', async () => {
    await api(token).post('/sellers').send({ ...sellerBody(), shopName: 'bhagwati shoes' }).expect(409);
    const bad = await api(token).post('/sellers').send({ ...sellerBody(), shopName: 'X Shop', mobileNumber: '12345' }).expect(400);
    expect(bad.body.message).toMatch(/Mobile number/);
    await api(token).post('/sellers').send({ ...sellerBody(), shopName: 'Y Shop', gstNumber: 'BAD' }).expect(400);
  });

  test('same owner mobile can own a second shop', async () => {
    await api(token).post('/sellers').send({ ...sellerBody(), shopName: 'Bhagwati Kirana' }).expect(201);
    expect(await Seller.countDocuments({ mobileNumber: '9876543210' })).toBe(2);
  });

  test('detail shows full bank number to super admin', async () => {
    const res = await api(token).get(`/sellers/${sellerId}`).expect(200);
    expect(res.body.data.seller.bankDetails.accountNumber).toBe('123456789012');
    expect(res.body.data.analytics.totalOrders).toBe(0);
  });

  test('update keeps account number when masked value is sent back', async () => {
    await api(token).put(`/sellers/${sellerId}`).send({ ownerName: 'B. Prasad', bankDetails: { accountHolder: 'B', accountNumber: 'XXXXXXXX9012', ifscCode: 'SBIN0001234', bankName: 'SBI' } }).expect(200);
    const s = await Seller.findById(sellerId);
    expect(s.getBankDetails().accountNumber).toBe('123456789012');
    expect(s.ownerName).toBe('B. Prasad');
  });

  test('block / unblock / commission / delete', async () => {
    await api(token).post(`/sellers/${sellerId}/block`).send({}).expect(400);
    await api(token).post(`/sellers/${sellerId}/block`).send({ reason: 'KYC pending' }).expect(200);
    expect((await Seller.findById(sellerId)).status).toBe('Blocked');
    await api(token).post(`/sellers/${sellerId}/unblock`).expect(200);
    const c = await api(token).put(`/sellers/${sellerId}/commission`).send({ commissionRate: null }).expect(200);
    expect(c.body.data.newRate).toBe(5); // platform default
    const list = await api(token).get('/sellers?search=kirana').expect(200);
    expect(list.body.data.items).toHaveLength(1);
    await api(token).delete(`/sellers/${list.body.data.items[0]._id}`).send({ reason: 'Closed' }).expect(200);
    const after = await api(token).get('/sellers').expect(200);
    expect(after.body.data.totalCount).toBe(1);
  });
});

describe('Users', () => {
  let seller;
  beforeAll(async () => {
    seller = await Seller.findOne({ shopName: 'Bhagwati Shoes' });
  });

  test('creates a user and links to seller', async () => {
    const res = await api(token).post('/users').send({ mobileNumber: '9827011111', name: 'Raj', sellerId: String(seller._id) }).expect(201);
    expect(res.body.data.isNewUser).toBe(true);
    const again = await api(token).post('/users').send({ mobileNumber: '9827011111', sellerId: String(seller._id) }).expect(201);
    expect(again.body.data.linked).toBe(false);
    expect(await Customer.countDocuments({ sellerId: seller._id })).toBe(1);
  });

  test('bulk link via CSV with dry run and errors', async () => {
    const csv = 'mobileNumber,name,sellerName\n+91 98270 22222,Priya,Bhagwati Shoes\n12345,Bad,Bhagwati Shoes\n9827033333,Amit,Unknown Shop\n9827011111,Raj,bhagwati shoes\n';
    const dry = await api(token).post('/users/bulk-link').field('dryRun', 'true').attach('csvFile', Buffer.from(csv), 'users.csv').expect(200);
    expect(dry.body.data.dryRun).toBe(true);
    expect(dry.body.data.failedCount).toBe(2);
    expect(await User.countDocuments()).toBe(1);

    const res = await api(token).post('/users/bulk-link').attach('csvFile', Buffer.from(csv), 'users.csv').expect(200);
    expect(res.body.data.linkedCount).toBe(1);
    expect(res.body.data.alreadyLinked).toBe(1);
    expect(res.body.data.newUsers).toBe(1);
    expect(res.body.data.errors.map((e) => e.row)).toEqual([3, 4]);
  });

  test('list, detail, unlink, block', async () => {
    const list = await api(token).get('/users?search=priya').expect(200);
    const user = list.body.data.items[0];
    expect(user.linkedSellersCount).toBe(1);
    const detail = await api(token).get(`/users/${user._id}`).expect(200);
    expect(detail.body.data.linkedSellers[0].seller.shopName).toBe('Bhagwati Shoes');
    await api(token).post(`/users/${user._id}/unlink-seller`).send({ sellerId: String(seller._id) }).expect(200);
    await api(token).post(`/users/${user._id}/unlink-seller`).send({ sellerId: String(seller._id) }).expect(404);
    await api(token).post(`/users/${user._id}/link-seller`).send({ sellerId: String(seller._id) }).expect(200);
    await api(token).post(`/users/${user._id}/block`).send({ reason: 'Fraud' }).expect(200);
    const blocked = await api(token).get('/users?status=Blocked').expect(200);
    expect(blocked.body.data.totalCount).toBe(1);
  });
});
