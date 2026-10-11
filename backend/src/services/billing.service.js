const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { generateId } = require('../utils/ids');
const { Product, Payment, Customer, Order: OrderModel } = require('../models');
const { takeStock } = require('./stock.service');
const { ensureInvoice } = require('./invoice.service');
const { getSettings, commissionRateFor } = require('./settings.service');
const { round2 } = require('./metrics');

/**
 * Creates a counter bill (POS) for a seller: a delivered + paid order, its payment,
 * the invoice and stock movements.
 * items: [{ productId, variantId?, quantity }]; customerId optional (walk-in customer otherwise).
 */
async function createBill(seller, { customerId, walkInName, walkInMobile, items, paymentMethod, discount = 0, deliveryCharge = 0, notes }) {
  if (!items?.length) throw ApiError.badRequest('Add at least one product');
  // Same product + same colour/size on two lines -> one line
  const merged = new Map();
  items.forEach((i) => {
    const key = `${i.productId}:${i.variantId || ''}`;
    const prev = merged.get(key);
    merged.set(key, { productId: String(i.productId), variantId: i.variantId || null, quantity: (prev?.quantity || 0) + Number(i.quantity) });
  });

  const ids = [...new Set([...merged.values()].map((m) => m.productId))].filter((id) => mongoose.isValidObjectId(id));
  const products = await Product.find({ _id: { $in: ids }, sellerId: seller._id, isDeleted: false });
  if (products.length !== ids.length) throw ApiError.badRequest('Some products were not found in your shop');
  const inactive = products.find((p) => !p.isActive);
  if (inactive) throw ApiError.badRequest(`"${inactive.name}" is inactive`);

  let customer = null;
  if (customerId) {
    customer = await Customer.findOne({ _id: customerId, sellerId: seller._id });
    if (!customer) throw ApiError.badRequest('Customer not found');
  }

  const lines = [...merged.values()].map(({ productId, variantId, quantity }) => {
    const p = products.find((x) => String(x._id) === productId);
    if (p.variants?.length && !variantId) throw ApiError.badRequest(`Choose a colour / size for "${p.name}"`);
    const u = p.unit(variantId);
    if (!u || !u.isActive) throw ApiError.badRequest(`That colour / size of "${p.name}" is not available`);
    const gst = round2(u.gstAmount * quantity);
    return { productId: p._id, variantId: u.variantId || undefined, variantLabel: u.variantLabel || undefined, productName: p.name, image: u.image, quantity, price: u.sellingPrice, gstRate: p.gstRate, gst, subtotal: round2(u.finalPrice * quantity) };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.price * l.quantity, 0));
  const gstAmount = round2(lines.reduce((s, l) => s + l.gst, 0));
  const gross = round2(subtotal + gstAmount);
  const disc = round2(Math.max(0, Number(discount) || 0));
  const delivery = round2(Math.max(0, Number(deliveryCharge) || 0));
  if (disc > gross) throw ApiError.badRequest('Discount cannot be more than the bill amount');
  const finalAmount = round2(gross - disc + delivery);

  const [settings, rate] = await Promise.all([getSettings(), commissionRateFor(seller)]);
  const orderId = await generateId('ORD');
  const orderObjectId = new mongoose.Types.ObjectId();

  // Reserve stock first; nothing else is written if stock is short
  await takeStock(
    seller._id,
    lines.map((l) => ({ product: products.find((p) => String(p._id) === String(l.productId)), quantity: l.quantity, variantId: l.variantId })),
    { reason: 'CashBill', refType: 'Order', refId: orderObjectId, by: seller._id }
  );

  const now = new Date();
  const order = await OrderModel.create({
    _id: orderObjectId,
    orderId,
    source: 'POS',
    sellerId: seller._id,
    userId: customer?.userId,
    customerId: customer?._id,
    customerSnapshot: customer ? { name: customer.name, mobileNumber: customer.mobileNumber } : { name: walkInName || 'Walk-in customer', mobileNumber: walkInMobile },
    items: lines,
    subtotal,
    gstAmount,
    discount: disc,
    deliveryCharge: delivery,
    finalAmount,
    paymentMethod,
    paymentStatus: 'Completed',
    orderStatus: 'Delivered',
    deliveredAt: now,
    statusHistory: [{ status: 'Delivered', byType: 'Seller', by: seller._id, byName: seller.shopName, note: 'Counter bill' }],
    customerNote: notes,
    commissionRate: rate,
    commissionAmount: round2((finalAmount * rate) / 100),
    sellerEarning: round2(finalAmount - (finalAmount * rate) / 100),
    // POS money is with the seller; commission is only recovered when enabled
    settlementStatus: settings.commissionSettings.chargeCommissionOnCash ? 'Unsettled' : 'NotApplicable',
  });

  await Payment.create({
    transactionId: await generateId('TXN'),
    orderId: order._id,
    userId: customer?.userId,
    sellerId: seller._id,
    type: 'Payment',
    amount: finalAmount,
    method: paymentMethod,
    gateway: 'Seller',
    gatewayMethod: paymentMethod === 'Cash' ? 'cash' : 'upi-to-seller',
    status: 'Success',
    paidAt: now,
  });

  if (customer) {
    await Customer.updateOne({ _id: customer._id }, { $inc: { totalOrders: 1, totalSpent: finalAmount }, lastPurchaseDate: now });
  }
  const invoice = await ensureInvoice(order);
  return { order, invoice };
}

module.exports = { createBill };
