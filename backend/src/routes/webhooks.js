const router = require('express').Router();
const express = require('express');
const logger = require('../config/logger');
const { Order } = require('../models');
const razorpay = require('../services/razorpay.service');
const checkout = require('../services/checkout.service');

/**
 * Razorpay webhook (configure in the Razorpay dashboard with RAZORPAY_WEBHOOK_SECRET).
 * Makes payment confirmation reliable even if the app closes before verify-payment.
 */
router.post('/razorpay/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
  if (!razorpay.verifyWebhookSignature(raw, req.get('x-razorpay-signature'))) return res.status(400).json({ success: false, message: 'Invalid signature' });
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid body' });
  }
  const entity = event.payload?.payment?.entity;
  try {
    if (event.event === 'payment.captured' && entity?.order_id) {
      const order = await Order.findOne({ razorpayOrderId: entity.order_id });
      if (order) await checkout.confirmPayment(order, { razorpayPaymentId: entity.id, gatewayMethod: entity.method });
    }
  } catch (err) {
    logger.warn(`Webhook ${event.event} for ${entity?.order_id}: ${err.message}`);
  }
  return res.json({ success: true });
});

module.exports = router;
