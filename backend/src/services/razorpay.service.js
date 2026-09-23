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
