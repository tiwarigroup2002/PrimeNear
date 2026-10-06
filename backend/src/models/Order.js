const mongoose = require('mongoose');
const { ORDER_STATUS, PAYMENT_METHODS, PAYMENT_STATUS, ORDER_SOURCE } = require('./constants');

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productName: String,
    image: String,
    quantity: { type: Number, required: true, min: 1 },
    price: Number, // selling price per unit (before GST)
    gstRate: Number,
    gst: Number, // GST amount for the line
    subtotal: Number, // line total incl. GST
  },
  { _id: false }
);

const actorFields = {
  byType: { type: String, enum: ['User', 'Seller', 'Admin', 'System'] },
  by: mongoose.Schema.Types.ObjectId,
  byName: String,
};

/**
 * One collection for every order in the platform:
 *  - source "Online": placed by a user from the user app
 *  - source "POS":    cash/online bill created by the seller in the seller app
 */
const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    source: { type: String, enum: ORDER_SOURCE, default: 'Online' },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerSnapshot: { name: String, mobileNumber: String },
    items: [orderItemSchema],
    deliveryType: { type: String, enum: ['Delivery', 'Pickup'], default: 'Delivery' },
    // Online orders wait for payment until this time, then they are cancelled automatically
    paymentExpiresAt: Date,
    deliveryAddress: {
      name: String,
      fullAddress: String,
      city: String,
      state: String,
      zipCode: String,
      phoneNumber: String,
      latitude: Number,
      longitude: Number,
    },
    subtotal: { type: Number, default: 0 }, // sum of price * qty (before GST)
    gstAmount: { type: Number, default: 0 },
    deliveryCharge: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    finalAmount: { type: Number, required: true },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUS, default: 'Pending' },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    orderStatus: { type: String, enum: ORDER_STATUS, default: 'Pending', index: true },
    statusHistory: [{ status: String, at: { type: Date, default: Date.now }, note: String, ...actorFields, _id: false }],
    notes: [{ text: String, at: { type: Date, default: Date.now }, ...actorFields }],
    customerNote: String,
    cancelReason: String,
    returnReason: String,
    deliveredAt: Date,
    refundedAmount: { type: Number, default: 0 },
    // Commission & settlement
    commissionRate: { type: Number, default: 0 },
    commissionAmount: { type: Number, default: 0 },
    sellerEarning: { type: Number, default: 0 },
    settlementStatus: { type: String, enum: ['Unsettled', 'InPayout', 'Settled', 'NotApplicable'], default: 'Unsettled' },
    payoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payout' },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
    isRated: { type: Boolean, default: false },
    // Code the customer gives the shop at handover. Hidden from normal queries (the seller must not see it).
    deliveryOtp: {
      type: new mongoose.Schema({ code: String, sentAt: Date, attempts: { type: Number, default: 0 } }, { _id: false }),
      select: false,
    },
  },
  { timestamps: true }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ sellerId: 1, createdAt: -1 });
orderSchema.index({ settlementStatus: 1, sellerId: 1 });

module.exports = mongoose.model('Order', orderSchema);
