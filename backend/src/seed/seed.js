/**
 * Seeds the database.
 *   npm run seed        -> super admin, platform settings, locations, categories
 *   npm run seed:demo   -> the above + demo sellers, users, products, orders, payouts, disputes
 * Safe to run multiple times (upserts by natural keys; demo data is only added once).
 */
const config = require('../config');
const logger = require('../config/logger');
const { connectDB, disconnectDB } = require('../config/db');
const { generateId } = require('../utils/ids');
const { refreshRatings } = require('../services/rating.service');
const {
  Admin, PlatformSettings, District, Tahsil, Category, SubCategory, Seller, User, Customer,
  Product, Order, Payment, Dispute, Review,
} = require('../models');

// Same names and PIN codes as the India location directory (so the seed works offline)
const LOCATIONS = [
  {
    name: 'Indore',
    state: 'Madhya Pradesh',
    tahsils: [
      { name: 'Indore', pincodes: ['452001', '452002', '452003', '452005', '452006', '452007', '452009', '452010', '452011', '452012', '452013', '452014', '452015', '452016', '452018', '452020', '453332', '453556', '453771'] },
      { name: 'Mhow', pincodes: ['453331', '453441', '453446', '453661'] },
      { name: 'Sanwer', pincodes: ['453551', '453555'] },
      { name: 'Depalpur', pincodes: ['453001', '453111', '453112', '453115', '453220'] },
    ],
  },
  {
    name: 'Dewas',
    state: 'Madhya Pradesh',
    tahsils: [
      { name: 'Dewas', pincodes: ['455001', '455111', '455227'] },
      { name: 'Sonkutch', pincodes: ['455116', '455118'] },
    ],
  },
  { name: 'Ujjain', state: 'Madhya Pradesh', tahsils: [{ name: 'Ujjain', pincodes: ['456001', '456003', '456006', '456010'] }] },
];

const CATEGORIES = [
  { name: 'Fashion', subs: ['Shirts', 'T-Shirts', 'Dresses', 'Jeans', 'Jackets'] },
  { name: 'Footwear', subs: ['Casual Shoes', 'Formal Shoes', 'Sports Shoes'] },
  { name: 'Electronics', subs: ['Mobile Accessories', 'Audio'] },
  { name: 'Grocery', subs: ['Staples', 'Snacks', 'Beverages'] },
];

async function seedBase() {
  await PlatformSettings.getSettings();

  let admin = await Admin.findOne({ email: config.superAdmin.email.toLowerCase() });
  if (!admin) {
    admin = await Admin.create({ email: config.superAdmin.email, password: config.superAdmin.password, fullName: config.superAdmin.name, role: 'SuperAdmin' });
    logger.info(`Super admin created: ${admin.email} / ${config.superAdmin.password}`);
  } else {
    logger.info(`Super admin exists: ${admin.email}`);
  }

  for (const d of LOCATIONS) {
    const district = await District.findOneAndUpdate({ name: d.name, state: d.state }, { $setOnInsert: { name: d.name, state: d.state } }, { upsert: true, returnDocument: 'after' });
    for (const t of d.tahsils) {
      const { pincodes = [], ...fields } = t;
      await Tahsil.findOneAndUpdate({ districtId: district._id, name: t.name }, { $setOnInsert: { ...fields, districtId: district._id }, $addToSet: { pincodes: { $each: pincodes } } }, { upsert: true });
    }
  }
  for (const [i, c] of CATEGORIES.entries()) {
    const cat = await Category.findOneAndUpdate({ name: c.name }, { $setOnInsert: { name: c.name, sortOrder: i } }, { upsert: true, returnDocument: 'after' });
    for (const s of c.subs) {
      await SubCategory.findOneAndUpdate({ categoryId: cat._id, name: s }, { $setOnInsert: { categoryId: cat._id, name: s } }, { upsert: true });
    }
  }
  logger.info('Base data ready (settings, locations, categories)');
  return admin;
}

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const round2 = (n) => Math.round(n * 100) / 100;

async function seedDemo(admin) {
  if (await Seller.exists({ shopName: 'Bhagwati Shoes Shop' })) {
    logger.info('Demo data already present, skipping');
    return;
  }
  const indore = await District.findOne({ name: 'Indore', state: 'Madhya Pradesh' });
  const dewasD = await District.findOne({ name: 'Dewas', state: 'Madhya Pradesh' });
  const rajwada = await Tahsil.findOne({ name: 'Indore', districtId: indore._id }); // shop PIN 452002 is in Indore taluka
  const mhow = await Tahsil.findOne({ name: 'Mhow', districtId: indore._id });
  const dewas = await Tahsil.findOne({ name: 'Dewas', districtId: dewasD._id });
  const indoreAll = await Tahsil.distinct('_id', { districtId: indore._id });
  const dewasAll = await Tahsil.distinct('_id', { districtId: dewasD._id });

  // Selling area: Bhagwati Shoes sells in all talukas of Indore + Dewas, RAM STORE in Mhow and Indore talukas,
  // ALI GARMENTS only in Dewas taluka, Bhagwati Kirana only in its own taluka
  const sellers = await Seller.create([
    { shopName: 'Bhagwati Shoes Shop', ownerName: 'Bhagwati Prasad', mobileNumber: '9876543210', tahsilId: rajwada._id, serviceTahsilIds: [...indoreAll, ...dewasAll], districtIds: [indore._id, dewasD._id], shopAddress: '12, Rajwada Chowk, Indore', pincode: '452002', settings: { enableDelivery: true, deliveryCharge: 30, freeDeliveryAbove: 1000, allowCashOnDelivery: true }, gstNumber: '23AABCT0123A1Z0', bankDetails: { accountHolder: 'Bhagwati Prasad', accountNumber: '123456789012', ifscCode: 'SBIN0001234', bankName: 'State Bank of India' }, commissionRate: 5, customerLimit: 200, createdBy: admin._id, rating: 4.6, ratingCount: 25 },
    { shopName: 'RAM STORE', ownerName: 'Ram Verma', mobileNumber: '9876543211', tahsilId: mhow._id, serviceTahsilIds: [mhow._id, rajwada._id], districtIds: [indore._id], shopAddress: 'Main Road, Mhow', pincode: '453441', bankDetails: { accountHolder: 'Ram Verma', accountNumber: '998877665544', ifscCode: 'HDFC0004321', bankName: 'HDFC Bank' }, customerLimit: 100, createdBy: admin._id, rating: 4.2, ratingCount: 12 },
    { shopName: 'ALI GARMENTS', ownerName: 'Ali Khan', mobileNumber: '9876543212', tahsilId: dewas._id, serviceTahsilIds: [dewas._id], districtIds: [dewasD._id], shopAddress: 'MG Road, Dewas', pincode: '455001', upiId: 'aligarments@upi', commissionRate: 4, customerLimit: 100, createdBy: admin._id, rating: 4.8, ratingCount: 18 },
    // Same owner mobile as Bhagwati -> multi-shop owner
    { shopName: 'Bhagwati Kirana', ownerName: 'Bhagwati Prasad', mobileNumber: '9876543210', tahsilId: rajwada._id, serviceTahsilIds: [rajwada._id], districtIds: [indore._id], shopAddress: '14, Rajwada Chowk, Indore', pincode: '452002', customerLimit: 50, createdBy: admin._id },
  ]);

  const cats = Object.fromEntries((await Category.find()).map((c) => [c.name, c]));
  const subs = await SubCategory.find();
  const sub = (name) => subs.find((s) => s.name === name)?._id;
  const productDefs = [
    [0, 'Red Casual Shoes', 'Footwear', 'Casual Shoes', 600, 500, 18, 12],
    [0, 'Black Formal Shoes', 'Footwear', 'Formal Shoes', 1500, 1299, 18, 3],
    [0, 'Running Sports Shoes', 'Footwear', 'Sports Shoes', 2200, 1899, 18, 0],
    [1, 'Basmati Rice 5kg', 'Grocery', 'Staples', 650, 599, 5, 40],
    [1, 'Masala Namkeen 400g', 'Grocery', 'Snacks', 120, 110, 12, 60],
    [1, 'Earphones Wired', 'Electronics', 'Audio', 499, 399, 18, 4],
    [2, 'Blue Denim Jeans', 'Fashion', 'Jeans', 1100, 950, 5, 25],
    [2, 'Black T-Shirt', 'Fashion', 'T-Shirts', 400, 300, 5, 15],
    [2, 'Cotton Kurti', 'Fashion', 'Dresses', 900, 799, 5, 2],
    [3, 'Sugar 1kg', 'Grocery', 'Staples', 50, 45, 0, 100],
  ];
  const products = [];
  for (const [si, name, cat, subName, mrp, sp, gst, stock] of productDefs) {
    products.push(await Product.create({
      sellerId: sellers[si]._id, name, categoryId: cats[cat]._id, subCategoryId: sub(subName), mrp, costPrice: round2(sp * 0.7),
      sellingPrice: sp, gstRate: gst, stock, sku: `${sellers[si].shopName.slice(0, 4).toUpperCase().replace(/\s/g, '')}-${String(products.length + 1).padStart(3, '0')}`,
      description: `${name} from ${sellers[si].shopName}`, rating: round2(3.5 + Math.random() * 1.5), ratingCount: randInt(0, 20),
    }));
  }

  // A product with colour / size variants (each combination has its own price and stock)
  const variantRows = [];
  for (const [color, extra] of [['Black', 0], ['Brown', 100]]) {
    for (const size of ['7', '8', '9']) variantRows.push({ color, size, sellingPrice: 1199 + extra, mrp: 1499 + extra, stock: size === '9' && color === 'Brown' ? 0 : randInt(2, 8), sku: `BHAG-LOAF-${color.slice(0, 2).toUpperCase()}${size}` });
  }
  products.push(await Product.create({
    sellerId: sellers[0]._id, name: 'Leather Loafers', categoryId: cats.Footwear._id, subCategoryId: sub('Formal Shoes'), costPrice: 800, sellingPrice: 1199, gstRate: 18,
    sku: 'BHAG-LOAF', description: 'Genuine leather loafers. Choose your colour and size.', variants: variantRows, rating: 4.4, ratingCount: 7,
  }));

  const names = ['Raj Kumar', 'Priya Singh', 'Amit Sharma', 'Neha Patel', 'Suresh Yadav', 'Pooja Jain', 'Vikas Gupta', 'Anita Verma', 'Rohit Mehta', 'Kavita Rathore', 'Deepak Chouhan', 'Sunita Tiwari'];
  const tahsils = [rajwada, mhow, dewas];
  const users = [];
  for (const [i, name] of names.entries()) {
    const createdAt = new Date(Date.now() - randInt(0, 75) * 86400000);
    users.push(await User.create({
      mobileNumber: `98270${String(10000 + i).slice(-5)}`, name, email: `${name.split(' ')[0].toLowerCase()}@example.com`,
      tahsilId: tahsils[i % 3]._id, createdAt, lastLogin: new Date(),
      addresses: [{ type: 'Home', name, fullAddress: `${i + 1}, Sample Nagar`, city: ['Indore', 'Mhow', 'Dewas'][i % 3], taluka: ['Indore', 'Mhow', 'Dewas'][i % 3], district: i % 3 === 2 ? 'Dewas' : 'Indore', state: 'Madhya Pradesh', zipCode: ['452002', '453441', '455001'][i % 3], phoneNumber: `98270${String(10000 + i).slice(-5)}`, isDefault: true }],
    }));
  }
  // Link users to sellers (some users linked to multiple shops)
  const links = [];
  users.forEach((u, i) => {
    links.push([u, sellers[i % 3]]);
    if (i % 4 === 0) links.push([u, sellers[(i + 1) % 3]]);
  });
  for (const [u, s] of links) {
    await Customer.create({ sellerId: s._id, userId: u._id, mobileNumber: u.mobileNumber, name: u.name, linkedBy: 'Seller', createdAt: u.createdAt });
  }

  // Orders over the last 60 days
  const statuses = ['Delivered', 'Delivered', 'Delivered', 'Delivered', 'Shipped', 'Confirmed', 'Pending', 'Cancelled', 'Packed'];
  const methods = ['Online', 'Online', 'Online', 'Cash'];
  let orderCount = 0;
  for (let n = 0; n < 90; n += 1) {
    const [user, seller] = rand(links);
    // Simple products only: demo orders do not pick a colour / size
    const sellerProducts = products.filter((p) => String(p.sellerId) === String(seller._id) && !p.variants?.length);
    if (!sellerProducts.length) continue;
    const createdAt = new Date(Date.now() - randInt(0, 59) * 86400000 - randInt(0, 12) * 3600000);
    const isPos = Math.random() < 0.2;
    const paymentMethod = isPos ? 'Cash' : rand(methods);
    const orderStatus = isPos ? 'Delivered' : rand(statuses);
    const items = [];
    const chosen = [...sellerProducts].sort(() => Math.random() - 0.5).slice(0, randInt(1, Math.min(3, sellerProducts.length)));
    for (const p of chosen) {
      const qty = randInt(1, 3);
      const gst = round2(p.gstAmount * qty);
      items.push({ productId: p._id, productName: p.name, quantity: qty, price: p.sellingPrice, gstRate: p.gstRate, gst, subtotal: round2(p.finalPrice * qty) });
    }
    const subtotal = round2(items.reduce((s, i) => s + i.price * i.quantity, 0));
    const gstAmount = round2(items.reduce((s, i) => s + i.gst, 0));
    const finalAmount = round2(subtotal + gstAmount);
    const rate = seller.commissionRate ?? 5;
    let paymentStatus = 'Completed';
    if (orderStatus === 'Cancelled') paymentStatus = paymentMethod === 'Online' ? 'Refunded' : 'Failed';
    else if (paymentMethod === 'Cash' && orderStatus !== 'Delivered') paymentStatus = 'Pending';
    const deliveredAt = orderStatus === 'Delivered' ? new Date(createdAt.getTime() + randInt(1, 3) * 86400000) : undefined;
    const flow = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered'];
    const history = orderStatus === 'Cancelled' ? ['Pending', 'Cancelled'] : flow.slice(0, flow.indexOf(orderStatus) + 1);
    const a = user.addresses[0];
    const addr = { name: user.name, fullAddress: a.fullAddress, city: a.city, taluka: a.taluka, district: a.district, state: a.state, zipCode: a.zipCode, phoneNumber: user.mobileNumber };

    const order = await Order.create({
      orderId: await generateId('ORD', createdAt),
      source: isPos ? 'POS' : 'Online',
      sellerId: seller._id,
      userId: user._id,
      customerSnapshot: { name: user.name, mobileNumber: user.mobileNumber },
      items,
      deliveryAddress: isPos ? undefined : addr,
      billingAddress: isPos ? undefined : addr,
      subtotal, gstAmount, finalAmount,
      paymentMethod, paymentStatus, orderStatus,
      razorpayPaymentId: paymentMethod === 'Online' ? `pay_demo${n}${Date.now()}` : undefined,
      refundedAmount: paymentStatus === 'Refunded' ? finalAmount : 0,
      statusHistory: history.map((s, i) => ({ status: s, at: new Date(createdAt.getTime() + i * 6 * 3600000), byType: i === 0 ? 'User' : 'Seller' })),
      cancelReason: orderStatus === 'Cancelled' ? 'Customer changed mind' : undefined,
      deliveredAt,
      commissionRate: rate,
      commissionAmount: round2((finalAmount * rate) / 100),
      sellerEarning: round2(finalAmount - (finalAmount * rate) / 100),
      settlementStatus: orderStatus === 'Cancelled' ? 'NotApplicable' : 'Unsettled',
      createdAt,
    });
    orderCount += 1;
    if (paymentMethod === 'Online' || paymentStatus === 'Completed') {
      await Payment.create({
        transactionId: await generateId('TXN', createdAt), orderId: order._id, userId: user._id, sellerId: seller._id, type: 'Payment',
        amount: finalAmount, method: paymentMethod, gateway: paymentMethod === 'Online' ? 'Razorpay' : 'Cash', gatewayMethod: paymentMethod === 'Online' ? rand(['upi', 'upi', 'card', 'netbanking']) : 'cash',
        razorpayPaymentId: order.razorpayPaymentId, status: 'Success', paidAt: createdAt, createdAt,
      });
    }
    if (paymentStatus === 'Refunded') {
      await Payment.create({ transactionId: await generateId('TXN', createdAt), orderId: order._id, userId: user._id, sellerId: seller._id, type: 'Refund', amount: finalAmount, method: 'Online', status: 'Success', paidAt: createdAt, createdAt });
    }
    if (orderStatus === 'Delivered' && Math.random() < 0.4 && !isPos) {
      await Review.create({ userId: user._id, orderId: order._id, sellerId: seller._id, productId: items[0].productId, ratingType: 'Product', rating: randInt(3, 5), reviewText: rand(['Great product! 👍', 'Good quality', 'Value for money', 'Fast delivery']), createdAt });
      await Review.create({ userId: user._id, orderId: order._id, sellerId: seller._id, ratingType: 'Seller', rating: randInt(3, 5), reviewText: rand(['Helpful shopkeeper', 'Quick delivery', 'Trusted shop 🙏', '']), createdAt });
    }
  }
  // Ratings shown in the apps are always computed from the stored reviews
  for (const s of sellers) await refreshRatings({ sellerId: s._id });
  for (const p of products) await refreshRatings({ productId: p._id });

  // One failed payment for alerts
  await Payment.create({ transactionId: await generateId('TXN'), userId: users[0]._id, sellerId: sellers[0]._id, type: 'Payment', amount: 590, method: 'Online', status: 'Failed', failureReason: 'UPI timeout' });

  const someOrder = await Order.findOne({ sellerId: sellers[0]._id, orderStatus: 'Delivered', paymentMethod: 'Online' });
  if (someOrder) {
    await Dispute.create({
      ticketId: await generateId('DIS'), orderId: someOrder._id, reportedBy: 'User', reportedById: someOrder.userId, againstType: 'Seller', againstId: someOrder.sellerId,
      title: 'Wrong size delivered', description: 'I ordered size 9 but received size 8. Seller is not responding.', category: 'ProductQuality', priority: 'High',
      timeline: [{ action: 'Created', note: 'Raised from user app' }],
    });
  }
  await Dispute.create({
    ticketId: await generateId('DIS'), reportedBy: 'Seller', reportedById: sellers[1]._id, againstType: 'None',
    title: 'Payout not received', description: 'My last week payout is not credited yet.', category: 'PaymentIssue', priority: 'Medium',
  });

  logger.info(`Demo data created: ${sellers.length} sellers, ${products.length} products, ${users.length} users, ${orderCount} orders`);
}

(async () => {
  const demo = process.argv.includes('--demo');
  await connectDB();
  const admin = await seedBase();
  if (demo) await seedDemo(admin);
  await disconnectDB();
})().catch(async (err) => {
  logger.error(err);
  await disconnectDB();
  process.exit(1);
});
