const { District, Tahsil, Category, SubCategory, Product, Order, User, Customer } = require('../src/models');
const { generateId } = require('../src/utils/ids');

async function makeLocation() {
  const district = await District.create({ name: `Indore ${Date.now()}${Math.random()}`, state: 'Madhya Pradesh' });
  const tahsil = await Tahsil.create({ districtId: district._id, name: 'Rajwada', pincodes: ['452001', '452002'] });
  return { district, tahsil };
}

async function makeCatalog() {
  const category = await Category.create({ name: `Footwear ${Math.random()}` });
  const sub = await SubCategory.create({ categoryId: category._id, name: 'Casual' });
  return { category, sub };
}

async function makeProduct(sellerId, categoryId, extra = {}) {
  return Product.create({ sellerId, categoryId, name: 'Red Shoes', sellingPrice: 500, gstRate: 18, stock: 10, ...extra });
}

async function makeUser(mobile = '9827000001') {
  return User.create({ mobileNumber: mobile, name: 'Raj Kumar' });
}

async function makeOrder({ seller, user, product, qty = 1, paymentMethod = 'Online', orderStatus = 'Delivered', paymentStatus = 'Completed', deliveredDaysAgo = 10, commissionRate = 5 }) {
  const finalAmount = product.finalPrice * qty;
  const deliveredAt = orderStatus === 'Delivered' ? new Date(Date.now() - deliveredDaysAgo * 86400000) : undefined;
  if (user) await Customer.updateOne({ sellerId: seller._id, userId: user._id }, { $setOnInsert: { mobileNumber: user.mobileNumber } }, { upsert: true });
  await Product.updateOne({ _id: product._id }, { $inc: { stock: -qty } });
  return Order.create({
    orderId: await generateId('ORD'),
    sellerId: seller._id,
    userId: user?._id,
    items: [{ productId: product._id, productName: product.name, quantity: qty, price: product.sellingPrice, gstRate: product.gstRate, gst: product.gstAmount * qty, subtotal: finalAmount }],
    subtotal: product.sellingPrice * qty,
    gstAmount: product.gstAmount * qty,
    finalAmount,
    paymentMethod,
    paymentStatus,
    orderStatus,
    deliveredAt,
    razorpayPaymentId: paymentMethod === 'Online' ? 'pay_test' : undefined,
    commissionRate,
    commissionAmount: (finalAmount * commissionRate) / 100,
    createdAt: deliveredAt ? new Date(deliveredAt.getTime() - 86400000) : new Date(),
  });
}

module.exports = { makeLocation, makeCatalog, makeProduct, makeUser, makeOrder };
