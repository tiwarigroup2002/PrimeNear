const fs = require('fs');
const { describe, test, before: beforeAll, after: afterAll } = require('node:test');
const expect = require('./expect');
const { connect, disconnect, login, api } = require('./setup');
const { makeLocation, makeCatalog, makeProduct, makeUser, makeOrder } = require('./helpers');
const { Seller, Order, Report, Dispute, AuditLog, Tahsil } = require('../src/models');
const { runDueSchedules } = require('../src/jobs/scheduler');
const { ReportSchedule } = require('../src/models');

let token;
let seller;
let product;
let user;
let category;

beforeAll(async () => {
  await connect();
  token = await login();
  const loc = await makeLocation();
  ({ category } = await makeCatalog());
  seller = await Seller.create({ shopName: 'Shop M', ownerName: 'M', mobileNumber: '9876500009', tahsilId: loc.tahsil._id, shopAddress: 'Addr' });
  product = await makeProduct(seller._id, category._id);
  user = await makeUser('9827099999');
  await makeOrder({ seller, user, product, qty: 2 });
  await makeOrder({ seller, user, product, orderStatus: 'Pending' });
});
afterAll(disconnect);

describe('Locations & categories', () => {
  test('India directory: states, districts, talukas with PIN codes, PIN lookup and import', async () => {
    const states = await api(token).get('/locations/directory/states').expect(200);
    expect(states.body.data).toContain('Madhya Pradesh');
    const districts = await api(token).get('/locations/directory/districts?state=Madhya%20Pradesh').expect(200);
    expect(districts.body.data).toEqual(['Dewas', 'Indore']);
    const talukas = await api(token).get('/locations/directory/talukas?state=Madhya%20Pradesh&district=Indore').expect(200);
    expect(talukas.body.data.map((t) => t.name)).toEqual(['Indore', 'Mhow', 'Sanwer']);
    expect(talukas.body.data.find((t) => t.name === 'Mhow').pincodes).toEqual(['452099', '453441']);
    const pin = await api(token).get('/locations/pincode/455118').expect(200);
    expect([pin.body.data.state, pin.body.data.district, pin.body.data.taluka]).toEqual(['Madhya Pradesh', 'Dewas', 'Sonkutch']);
    await api(token).post('/locations/import').send({ state: 'Madhya Pradesh', district: 'Dewas', talukas: ['Nowhere'] }).expect(400);
    const imp = await api(token).post('/locations/import').send({ state: 'Madhya Pradesh', district: 'Dewas', talukas: 'all' }).expect(201);
    expect(imp.body.data.tahsils.map((t) => t.name).sort()).toEqual(['Dewas', 'Sonkutch']);
    await api(token).post('/locations/import').send({ state: 'Madhya Pradesh', district: 'Dewas' }).expect(201); // again: no duplicates
    expect(await Tahsil.countDocuments({ districtId: imp.body.data.district._id })).toBe(2);
  });

  test('district with tahsils, duplicate protection and delete guard', async () => {
    const res = await api(token).post('/locations/districts').send({ name: 'Ujjain', state: 'Madhya Pradesh', tahsils: [{ name: 'Ujjain', pincodes: ['456001'] }] }).expect(201);
    expect(res.body.data.tahsils).toHaveLength(1);
    await api(token).post('/locations/districts').send({ name: 'ujjain', state: 'Madhya Pradesh' }).expect(409);
    // Same district name in another state is a different district
    await api(token).post('/locations/districts').send({ name: 'Ujjain', state: 'Rajasthan' }).expect(201);
    await api(token).post('/locations/tahsils').send({ districtId: res.body.data.district._id, name: 'Nagda', pincodes: ['4562'] }).expect(400);
    const t = await api(token).post('/locations/tahsils').send({ districtId: res.body.data.district._id, name: 'Nagda', pincodes: ['456335'] }).expect(201);
    expect(t.body.data.pincodes).toEqual(['456335']);
    expect(t.body.data.latitude).toBe(undefined);
    const list = await api(token).get(`/locations/tahsils?district=${res.body.data.district._id}`).expect(200);
    expect(list.body.data).toHaveLength(2);
    await api(token).delete(`/locations/districts/${res.body.data.district._id}`).expect(200);
    const sellerDistrict = seller.districtIds[0] || (await Seller.findById(seller._id)).tahsilId;
    expect(sellerDistrict).toBeTruthy();
  });

  test('category CRUD with icon upload and in-use guard', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
    const res = await api(token).post('/categories').field('name', 'Books').field('description', 'All books').attach('icon', png, { filename: 'b.png', contentType: 'image/png' }).expect(201);
    expect(res.body.data.icon).toMatch(/^\/uploads\/categories\//);
    await api(token).post('/categories').field('name', 'books').expect(409);
    const sub = await api(token).post(`/categories/${res.body.data._id}/subcategories`).send({ name: 'Novels' }).expect(201);
    await api(token).put(`/subcategories/${sub.body.data._id}`).send({ isActive: false }).expect(200);
    await api(token).delete(`/categories/${res.body.data._id}`).expect(200);
    await api(token).delete(`/categories/${category._id}`).expect(400); // used by a product
    const list = await api(token).get('/categories').expect(200);
    expect(list.body.data[0].productCount).toBe(1);
  });

  test('admin can disable a product', async () => {
    await api(token).post(`/products/${product._id}/toggle-active`).send({ isActive: false, reason: 'Fake listing' }).expect(200);
    const res = await api(token).get('/products?status=disabledByAdmin').expect(200);
    expect(res.body.data.totalCount).toBe(1);
    await api(token).put(`/products/${product._id}`).send({ gstRate: 7 }).expect(400);
    await api(token).put(`/products/${product._id}`).send({ gstRate: 12, sellingPrice: 1000 }).expect(200);
    const p = await api(token).get(`/products/${product._id}`).expect(200);
    expect(p.body.data.product.finalPrice).toBe(1120);
  });
});

describe('Disputes', () => {
  test('create, comment, assign, resolve with refund, close, reopen', async () => {
    const order = await Order.findOne({ orderStatus: 'Delivered' });
    const res = await api(token).post('/disputes').send({ orderId: order.orderId, reportedBy: 'User', againstType: 'Seller', title: 'Wrong item', description: 'Received wrong colour', priority: 'High', category: 'ProductQuality' }).expect(201);
    const d = res.body.data;
    expect(String(d.reportedById)).toBe(String(user._id));
    expect(String(d.againstId)).toBe(String(seller._id));
    await api(token).post(`/disputes/${d.ticketId}/comments`).field('text', 'Asked seller for photos').expect(200);
    const me = await api(token).get('/auth/me');
    await api(token).post(`/disputes/${d._id}/assign`).send({ adminId: me.body.data.id }).expect(200);
    const resolved = await api(token).post(`/disputes/${d._id}/resolve`).send({ resolution: 'Partial refund', refundAmount: 200, refundTo: 'User' }).expect(200);
    expect(resolved.body.data.refundInitiated).toBe(true);
    expect((await Order.findById(order._id)).refundedAmount).toBe(200);
    await api(token).post(`/disputes/${d._id}/resolve`).send({ resolution: 'again' }).expect(400);
    await api(token).post(`/disputes/${d._id}/close`).expect(200);
    await api(token).post(`/disputes/${d._id}/reopen`).expect(200);
    const detail = await api(token).get(`/disputes/${d.ticketId}`).expect(200);
    expect(detail.body.data.dispute.timeline.length).toBeGreaterThan(3);
    const list = await api(token).get('/disputes?status=InProgress').expect(200);
    expect(list.body.data.totalCount).toBe(1);
  });
});

describe('Analytics, reports, settings, logs', () => {
  test('dashboard and analytics endpoints', async () => {
    const d = await api(token).get('/analytics/dashboard').expect(200);
    expect(d.body.data.stats.totalOrders).toBe(2); // both orders are paid
    expect(d.body.data.charts.revenueData).toHaveLength(30);
    for (const ep of ['revenue', 'orders', 'users', 'sellers', 'products', 'payments']) {
      await api(token).get(`/analytics/${ep}?period=year`).expect(200);
    }
    const custom = await api(token).get('/analytics/revenue?period=custom&from=2020-01-01&to=2020-12-31').expect(200);
    expect(custom.body.data.series[0].date).toBe('2020-01');
  });

  test('generates CSV, Excel and PDF reports and downloads them', async () => {
    for (const format of ['CSV', 'Excel', 'PDF']) {
      const res = await api(token).post('/reports/generate').send({ reportType: 'Orders', format, period: 'year' }).expect(201);
      const report = res.body.data.report;
      expect(report.rowCount).toBe(2);
      const file = await api(token).get(`/reports/${report._id}/download`).buffer(true).parse((r, cb) => { const c = []; r.on('data', (x) => c.push(x)); r.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
      expect(file.body.length).toBeGreaterThan(100);
    }
    for (const type of ['Revenue', 'Users', 'Sellers', 'Products', 'Disputes', 'Payouts']) {
      await api(token).post('/reports/generate').send({ reportType: type, format: 'CSV', period: 'all' }).expect(201);
    }
    const list = await api(token).get('/reports').expect(200);
    expect(list.body.data.totalCount).toBe(9);
    await api(token).delete(`/reports/${list.body.data.items[0]._id}`).expect(200);
  });

  test('scheduled reports run when due', async () => {
    const res = await api(token).post('/reports/schedule').send({ reportType: 'Revenue', frequency: 'Weekly', recipients: ['boss@test.in'] }).expect(201);
    await ReportSchedule.updateOne({ _id: res.body.data.scheduleId }, { nextRunAt: new Date(Date.now() - 1000) });
    const before = await Report.countDocuments();
    await runDueSchedules();
    expect(await Report.countDocuments()).toBe(before + 1);
    const s = await ReportSchedule.findById(res.body.data.scheduleId);
    expect(s.nextRunAt > new Date()).toBe(true);
    const files = await Report.find().select('filePath');
    files.forEach((f) => fs.rmSync(f.filePath, { force: true }));
  });

  test('settings updates are validated and audited', async () => {
    await api(token).put('/settings/commission').send({ defaultCommission: 150 }).expect(400);
    const res = await api(token).put('/settings/commission').send({ defaultCommission: 6, payoutDelayDays: 3 }).expect(200);
    expect(res.body.data.commissionSettings.defaultCommission).toBe(6);
    expect(res.body.data.commissionSettings.payoutFrequency).toBe('Weekly'); // untouched
    await api(token).put('/settings/gst').send({ slabs: [{ percentage: 5 }, { percentage: 5 }] }).expect(400);
    await api(token).put('/settings/gst').send({ slabs: [{ percentage: 18, description: '18' }, { percentage: 0, description: 'Nil' }] }).expect(200);
    await api(token).post('/settings/maintenance-mode').send({ enabled: true, message: 'Upgrade' }).expect(200);
    await api(token).put('/settings').send({ platformName: 'PrimeNear Test', supportHours: { startTime: '10:00' } }).expect(200);
    const s = await api(token).get('/settings').expect(200);
    expect(s.body.data.maintenanceMode).toBe(true);
    expect(s.body.data.supportHours.endTime).toBe('18:00');
    expect(s.body.data.gstSettings.slabs[0].percentage).toBe(0);
    expect(await AuditLog.countDocuments({ entityType: 'Settings' })).toBeGreaterThan(3);
    const logs = await api(token).get('/audit-logs?entityType=Settings').expect(200);
    expect(logs.body.data.totalCount).toBeGreaterThan(3);
    await api(token).get('/login-history').expect(200);
    await api(token).get('/system-logs').expect(200);
    const pub = await api(token).get('/public-config').expect(200);
    expect(pub.body.data.platformName).toBe('PrimeNear Test');
  });

  test('admin notifications are per admin read state', async () => {
    const { notifyAdmins } = require('../src/services/notification.service');
    await notifyAdmins({ title: 'Test alert', message: 'Hello' });
    const res = await api(token).get('/notifications').expect(200);
    expect(res.body.data.unreadCount).toBe(1);
    await api(token).post('/notifications/mark-all-read').expect(200);
    const after = await api(token).get('/notifications').expect(200);
    expect(after.body.data.unreadCount).toBe(0);
    expect(await Dispute.countDocuments()).toBe(1);
  });
});
