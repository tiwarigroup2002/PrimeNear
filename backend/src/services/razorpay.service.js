const Razorpay = require('razorpay');
const config = require('../config');

let client = null;
function getClient() {
  if (!config.razorpay.keyId || !config.razorpay.keySecret) return null;
  if (!client) client = new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret });
  return client;
}

function isConfigured() {
  return Boolean(getClient());
}

/** Refunds (part of) a captured Razorpay payment. Amount in rupees. */
async function refundPayment(paymentId, amount, notes = {}) {
  const rzp = getClient();
  if (!rzp) throw new Error('Razorpay is not configured');
  return rzp.payments.refund(paymentId, { amount: Math.round(amount * 100), speed: 'normal', notes });
}

module.exports = { isConfigured, refundPayment };

const crypto = require('crypto');

/** Creates a Razorpay order for Checkout. Amount in rupees. */
async function createOrder(amount, receipt, notes = {}) {
  const rzp = getClient();
  if (!rzp) throw new Error('Razorpay is not configured');
  return rzp.orders.create({ amount: Math.round(amount * 100), currency: 'INR', receipt, notes });
}

/** Signature sent by Razorpay Checkout after a successful payment. */
function verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, signature) {
  if (!config.razorpay.keySecret || !signature) return false;
  const expected = crypto.createHmac('sha256', config.razorpay.keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** Webhook signature (X-Razorpay-Signature) over the raw request body. */
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

module.exports.createOrder = createOrder;
module.exports.verifyPaymentSignature = verifyPaymentSignature;
module.exports.verifyWebhookSignature = verifyWebhookSignature;
module.exports.keyId = () => config.razorpay.keyId;
