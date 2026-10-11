const { describe, test, before: beforeAll, after: afterAll } = require('node:test');
const request = require('supertest');
const expect = require('./expect');
const { connect, disconnect, app, login } = require('./setup');
const { makeLocation, makeCatalog, makeOrder } = require('./helpers');
const { Seller, Product, Customer, User, StockMovement, Order, Invoice } = require('../src/models');
const { signShopToken } = require('../src/middleware/sellerAuth');
const { signUserToken } = require('../src/middleware/userAuth');

const as = (prefix, token) => {
  const w = (m) => (url) => request(app)[m](`/api/${prefix}${url}`).set('Authorization', `Bearer ${token}`);
  return { get: w('get'), post: w('post'), put: w('put'), delete: w('delete') };
};
const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

let loc; let cat; let shop; let S; let U; let user; let productId; let red; let blue;

beforeAll(async () => {
  await connect();
  loc = await makeLocation();
  cat = await makeCatalog();
  shop = await Seller.create({ shopName: 'Variant Shop', ownerName: 'V', mobileNumber: '9811100001', tahsilId: loc.tahsil._id, shopAddress: 'V Road', settings: { enableDelivery: true, deliveryCharge: 0, allowCashOnDelivery: true } });
  user = await User.create({ mobileNumber: '9822200001', name: 'Asha', addresses: [{ fullAddress: '1 Main Road', zipCode: '452001', isDefault: true }] });
  await Customer.create({ sellerId: shop._id, userId: user._id, mobileNumber: user.mobileNumber });
  S = as('seller', signShopToken(shop));
  U = as('user', signUserToken(user));
});
afterAll(disconnect);

describe('Product variants (colour / size)', () => {
  test('seller creates a product with colour + size combinations, each with its own price and stock', async () => {
    const variants = [
      { color: 'Red', size: 'M', sellingPrice: 500, mrp: 600, stock: 3 },
      { color: 'Red', size: 'L', sellingPrice: 550, stock: 0 },
      { color: 'Blue', size: 'M', sellingPrice: 450, mrp: 500, stock: 5 },
    ];
    // duplicates and bad prices are refused
    await S.post('/products').field('name', 'Kurta').field('categoryId', String(cat.category._id)).field('gstRate', '5').field('variants', JSON.stringify([...variants, { color: 'red', size: 'm', sellingPrice: 1 }])).expect(400);
    await S.post('/products').field('name', 'Kurta').field('categoryId', String(cat.category._id)).field('gstRate', '5').field('variants', JSON.stringify([{ color: 'Red', sellingPrice: 500, mrp: 100 }])).expect(400);
    const res = await S.post('/products').field('name', 'Kurta').field('categoryId', String(cat.category._id)).field('gstRate', '5').field('variants', JSON.stringify(variants)).expect(201);
    productId = res.body.data._id;
    const p = await Product.findById(productId);
    expect(p.variants).toHaveLength(3);
    expect(p.stock).toBe(8); // total of all variants
    expect(p.sellingPrice).toBe(450); // "from" price = cheapest
    expect(p.variants.find((v) => v.color === 'Red' && v.size === 'M').finalPrice).toBe(525);
    red = p.variants.find((v) => v.color === 'Red' && v.size === 'M');
    blue = p.variants.find((v) => v.color === 'Blue');
    expect(await StockMovement.countDocuments({ productId, reason: 'Added' })).toBe(2);
  });

  test('photos per variant; update keeps stock, adds a new size, removes one', async () => {
    const up = await S.post(`/products/${productId}/variants/${red._id}/images`).attach('images', png, { filename: 'red.png', contentType: 'image/png' }).expect(200);
    expect(up.body.data.images).toHaveLength(1);
    const p = await Product.findById(productId);
    const rows = p.variants.map((v) => ({ _id: String(v._id), color: v.color, size: v.size, sellingPrice: v.sellingPrice, mrp: v.mrp, stock: 999, images: v.images }))
      .filter((v) => !(v.color === 'Red' && v.size === 'L'));
    rows.push({ color: 'Blue', size: 'L', sellingPrice: 480, stock: 4 });
    await S.put(`/products/${productId}`).field('variants', JSON.stringify(rows)).expect(200);
    const after = await Product.findById(productId);
    expect(after.variants.map((v) => `${v.color}/${v.size}`).sort()).toEqual(['Blue/L', 'Blue/M', 'Red/M']);
    expect(after.variants.id(red._id).stock).toBe(3); // existing stock is not overwritten
    expect(after.variants.id(red._id).images).toHaveLength(1);
    expect(after.stock).toBe(12);
  });

  test('stock adjust works per variant', async () => {
    await S.post('/inventory/adjust-stock').send({ productId, quantity: 2 }).expect(400); // must choose a variant
    const r = await S.post('/inventory/adjust-stock').send({ productId, variantId: String(blue._id), quantity: 2, reason: 'Added' }).expect(200);
    expect(r.body.data.newStock).toBe(14);
    expect((await Product.findById(productId)).variants.id(blue._id).stock).toBe(7);
  });

  test('shopper sees variants; cart needs a colour / size and uses its price', async () => {
    const d = await U.get(`/products/${productId}`).expect(200);
    expect(d.body.data.product.hasVariants).toBe(true);
    expect(d.body.data.product.colors).toEqual(['Red', 'Blue']);
    expect(d.body.data.product.sizes.sort()).toEqual(['L', 'M']);
    expect(d.body.data.product.variants[0].sku).toBe(undefined);
    await U.post('/cart/add-item').send({ productId }).expect(400);
    await U.post('/cart/add-item').send({ productId, variantId: String(red._id), quantity: 4 }).expect(400); // only 3 red/M
    await U.post('/cart/add-item').send({ productId, variantId: String(red._id), quantity: 2 }).expect(200);
    const cart = await U.post('/cart/add-item').send({ productId, variantId: String(blue._id), quantity: 1 }).expect(200);
    expect(cart.body.data.items).toHaveLength(2);
    const redLine = cart.body.data.items.find((i) => i.variantLabel === 'Red / M');
    expect(redLine.finalPrice).toBe(525);
    expect(redLine.image).toMatch(/^\/uploads\/products\//);
    expect(cart.body.data.totals.total).toBe(525 * 2 + 472.5);
    await U.put('/cart/update-item').send({ productId, variantId: String(blue._id), quantity: 0 }).expect(200);
    const after = await U.get('/cart').expect(200);
    expect(after.body.data.items).toHaveLength(1);
    expect((await U.get(`/products/${productId}`).expect(200)).body.data.product.inCartByVariant[String(red._id)]).toBe(2);
  });

  test('order takes stock of the chosen variant only; cancel puts it back', async () => {
    const res = await U.post('/orders/create').send({ paymentMethod: 'Cash' }).expect(201);
    const order = res.body.data.order;
    expect(order.items[0].variantLabel).toBe('Red / M');
    let p = await Product.findById(productId);
    expect(p.variants.id(red._id).stock).toBe(1);
    expect(p.variants.id(blue._id).stock).toBe(7);
    expect(p.stock).toBe(12);
    await U.post(`/orders/${order._id}/cancel`).send({ reason: 'Changed mind' }).expect(200);
    p = await Product.findById(productId);
    expect(p.variants.id(red._id).stock).toBe(3);
    expect(p.stock).toBe(14);
  });

  test('POS bill with a variant; invoice shows the colour / size', async () => {
    await S.post('/invoices').send({ items: [{ productId, quantity: 1 }], paymentMethod: 'Cash' }).expect(400);
    const res = await S.post('/invoices').send({ items: [{ productId, variantId: String(blue._id), quantity: 2 }, { productId, variantId: String(blue._id), quantity: 1 }], paymentMethod: 'Cash' }).expect(201);
    expect(res.body.data.order.items).toHaveLength(1);
    expect(res.body.data.order.items[0].quantity).toBe(3);
    const inv = await Invoice.findById(res.body.data.invoiceId);
    expect(inv.items[0].productName).toBe('Kurta (Blue / M)');
    expect((await Product.findById(productId)).variants.id(blue._id).stock).toBe(4);
  });
});

describe('Seller payouts on hold (7 day period)', () => {
  test('paid online orders inside the holding period are listed with their payable date', async () => {
    const plain = await Product.create({ sellerId: shop._id, categoryId: cat.category._id, name: 'Cap', sellingPrice: 100, gstRate: 0, stock: 20 });
    await makeOrder({ seller: shop, user, product: plain, deliveredDaysAgo: 2, commissionRate: 0 }); // on hold, payable in 5 days
    await makeOrder({ seller: shop, user, product: plain, orderStatus: 'Shipped', commissionRate: 0 }); // not delivered yet
    await makeOrder({ seller: shop, user, product: plain, deliveredDaysAgo: 10, commissionRate: 0 }); // already due
    const token = await login();
    const hold = await request(app).get('/api/admin/payouts/on-hold').set('Authorization', `Bearer ${token}`).expect(200);
    expect(hold.body.data.payoutDelayDays).toBe(7);
    const row = hold.body.data.sellers.find((s) => s.sellerId === String(shop._id));
    expect(row.orders).toHaveLength(2);
    expect(row.deliveredCount).toBe(1);
    expect(row.notDeliveredCount).toBe(1);
    expect(row.amount).toBe(200);
    const delivered = row.orders.find((o) => o.payableOn);
    const days = Math.round((new Date(delivered.payableOn) - new Date(delivered.deliveredAt)) / 86400000);
    expect(days).toBe(7);
    const due = await request(app).get('/api/admin/payouts/pending').set('Authorization', `Bearer ${token}`).expect(200);
    expect(due.body.data.sellers.find((s) => s.sellerId === String(shop._id)).grossAmount).toBe(100);
    expect(await Order.countDocuments({ sellerId: shop._id, paymentMethod: 'Online' })).toBe(3);
  });
});
