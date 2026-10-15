const { describe, test, before: beforeAll, after: afterAll } = require('node:test');
const request = require('supertest');
const expect = require('./expect');
const { connect, disconnect, app, login } = require('./setup');
const { District, Tahsil, Seller, Admin, Notification } = require('../src/models');
const { signShopToken } = require('../src/middleware/sellerAuth');

const A = (t) => ({
  get: (u) => request(app).get(`/api/admin${u}`).set('Authorization', `Bearer ${t}`),
  post: (u) => request(app).post(`/api/admin${u}`).set('Authorization', `Bearer ${t}`),
  put: (u) => request(app).put(`/api/admin${u}`).set('Authorization', `Bearer ${t}`),
  delete: (u) => request(app).delete(`/api/admin${u}`).set('Authorization', `Bearer ${t}`),
});

let token; let mpSeller; let mhSeller; let draftId;

beforeAll(async () => {
  await connect();
  token = await login();
  const mp = await District.create({ name: 'Indore', state: 'Madhya Pradesh' });
  const mh = await District.create({ name: 'Pune', state: 'Maharashtra' });
  const t1 = await Tahsil.create({ districtId: mp._id, name: 'Indore', pincodes: ['452001'] });
  const t2 = await Tahsil.create({ districtId: mh._id, name: 'Haveli', pincodes: ['411001'] });
  mpSeller = await Seller.create({ shopName: 'MP Shop', ownerName: 'Mohan', mobileNumber: '9811133301', tahsilId: t1._id, shopAddress: 'MG Road', pincode: '452001', gstNumber: '23AABCT0123A1Z0' });
  mhSeller = await Seller.create({ shopName: 'MH Shop', ownerName: 'Meera', mobileNumber: '9811133302', tahsilId: t2._id, shopAddress: 'FC Road', pincode: '411001' });
});
afterAll(disconnect);

describe('Subscription bills (admin -> seller)', () => {
  test('admin customises the bill design', async () => {
    const t = await A(token).get('/subscription-bills/template').expect(200);
    expect(t.body.data.title).toBe('Tax Invoice');
    await A(token).put('/subscription-bills/template').send({ layout: { accentColor: 'pink' } }).expect(400);
    const res = await A(token).put('/subscription-bills/template').send({
      company: { name: 'PrimeNear Pvt Ltd', state: 'Madhya Pradesh', gstin: '23ABCDE1234F1Z5' },
      title: 'GST Invoice',
      numberFormat: 'SUB/{FY}/{SEQ}',
      layout: { style: 'modern', accentColor: '#0f766e' },
      show: { hsn: false, discount: true },
      labels: { description: 'Service' },
      customFields: [{ label: 'CIN', value: 'U12345MP2026PTC000001' }],
    }).expect(200);
    const d = res.body.data;
    expect([d.title, d.layout.style, d.layout.logoPosition, d.show.hsn, d.show.discount, d.show.bankDetails, d.labels.description, d.labels.amount]).toEqual(['GST Invoice', 'modern', 'left', false, true, true, 'Service', 'Amount']);
  });

  test('draft bill: same state -> CGST + SGST, totals and amount in words', async () => {
    const info = await A(token).get(`/subscription-bills/seller-info/${mpSeller._id}`).expect(200);
    expect(info.body.data.taxMode).toBe('intra');
    expect(info.body.data.billTo.gstin).toBe('23AABCT0123A1Z0');
    await A(token).post('/subscription-bills').send({ sellerId: String(mpSeller._id), items: [] }).expect(400);
    const res = await A(token).post('/subscription-bills').send({
      sellerId: String(mpSeller._id),
      invoiceDate: '2026-10-15',
      periodFrom: '2026-10-01',
      periodTo: '2026-10-31',
      items: [{ description: 'Monthly plan', rate: 999, taxRate: 18 }, { description: 'Setup', rate: 500, discount: 100, taxRate: 18 }],
      customFields: [{ label: 'PO number', value: 'PO-77' }],
    }).expect(201);
    const b = res.body.data;
    draftId = b._id;
    expect(b.status).toBe('Draft');
    expect(b.invoiceNumber).toBe(undefined);
    expect([b.subtotal, b.cgstTotal, b.sgstTotal, b.igstTotal, b.total]).toEqual([1399, 125.91, 125.91, 0, 1651]);
    expect(b.amountInWords).toBe('Rupees One Thousand Six Hundred Fifty One Only');
    expect(b.dueDate.slice(0, 10)).toBe('2026-10-22'); // invoice date + 7 days
    const edited = await A(token).put(`/subscription-bills/${draftId}`).send({ items: [{ description: 'Monthly plan', rate: 1000, taxRate: 18 }], billTo: { gstin: '' } }).expect(200);
    expect(edited.body.data.total).toBe(1180);
    expect(edited.body.data.billTo.name).toBe('MP Shop');
  });

  test('issue gives the next number from the format; issued bills are locked', async () => {
    const res = await A(token).post(`/subscription-bills/${draftId}/issue`).expect(200);
    expect(res.body.data.invoiceNumber).toBe('SUB/2026-27/0001');
    expect(res.body.data.templateSnapshot.title).toBe('GST Invoice');
    await A(token).put(`/subscription-bills/${draftId}`).send({ notes: 'x' }).expect(400);
    await A(token).delete(`/subscription-bills/${draftId}`).expect(400);
    expect(await Notification.countDocuments({ recipientType: 'Seller', recipientId: mpSeller._id, type: 'Billing' })).toBe(1);
    // later design changes do not change an issued bill
    await A(token).put('/subscription-bills/template').send({ title: 'Changed title' }).expect(200);
    const view = await A(token).get(`/subscription-bills/${draftId}`).expect(200);
    expect(view.body.data.template.title).toBe('GST Invoice');
    const pdf = await A(token).get(`/subscription-bills/${draftId}/pdf`).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
  });

  test('other state -> IGST only; create + issue in one step; paid and cancel', async () => {
    const res = await A(token).post('/subscription-bills').send({ sellerId: String(mhSeller._id), invoiceDate: '2026-11-01', items: [{ description: 'Yearly plan', rate: 10000, taxRate: 18 }], issue: true }).expect(201);
    const b = res.body.data;
    expect(b.taxMode).toBe('inter');
    expect([b.cgstTotal, b.sgstTotal, b.igstTotal, b.total]).toEqual([0, 0, 1800, 11800]);
    expect(b.invoiceNumber).toBe('SUB/2026-27/0002');
    await A(token).post(`/subscription-bills/${b._id}/mark-paid`).send({ paymentMethod: 'Gold' }).expect(400);
    const paid = await A(token).post(`/subscription-bills/${b._id}/mark-paid`).send({ paymentMethod: 'UPI', paymentRef: 'UTR123' }).expect(200);
    expect(paid.body.data.status).toBe('Paid');
    await A(token).post(`/subscription-bills/${draftId}/cancel`).send({ reason: 'Wrong amount' }).expect(200);
    const list = await A(token).get('/subscription-bills').expect(200);
    expect(list.body.data.totalCount).toBe(2);
    expect(list.body.data.summary.paid).toBe(11800);
    expect((await A(token).get('/subscription-bills?status=Paid').expect(200)).body.data.items).toHaveLength(1);
    // no GST mode
    const none = await A(token).post('/subscription-bills').send({ sellerId: String(mhSeller._id), taxMode: 'none', items: [{ description: 'Add-on', rate: 250, taxRate: 18 }] }).expect(201);
    expect([none.body.data.igstTotal, none.body.data.cgstTotal, none.body.data.total]).toEqual([0, 0, 250]);
    await A(token).delete(`/subscription-bills/${none.body.data._id}`).expect(200);
  });

  test('sellers see their issued bills only; support admins cannot manage bills', async () => {
    await A(token).post('/subscription-bills').send({ sellerId: String(mpSeller._id), items: [{ description: 'Draft only', rate: 10 }] }).expect(201);
    const st = signShopToken(mpSeller);
    const mine = await request(app).get('/api/seller/subscription-bills').set('Authorization', `Bearer ${st}`).expect(200);
    expect(mine.body.data.items).toHaveLength(1); // the cancelled one; the draft is hidden
    const id = mine.body.data.items[0]._id;
    const one = await request(app).get(`/api/seller/subscription-bills/${id}`).set('Authorization', `Bearer ${st}`).expect(200);
    expect(one.body.data.template.title).toBe('GST Invoice');
    await request(app).get(`/api/seller/subscription-bills/${id}/pdf`).set('Authorization', `Bearer ${st}`).expect(200);
    const other = signShopToken(mhSeller);
    await request(app).get(`/api/seller/subscription-bills/${id}`).set('Authorization', `Bearer ${other}`).expect(404);
    await Admin.create({ email: 'support@test.in', password: 'Support@12345', fullName: 'Support', role: 'SupportAdmin' });
    const sup = await login('support@test.in', 'Support@12345');
    await A(sup).get('/subscription-bills').expect(403);
  });
});
