const mongoose = require('mongoose');

// Every money movement tied to an order (payments in, refunds out).
const paymentSchema = new mongoose.Schema(
  {
    transactionId: { type: String, required: true, unique: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },
    type: { type: String, enum: ['Payment', 'Refund'], default: 'Payment' },
    amount: { type: Number, required: true },
    method: { type: String, enum: ['Online', 'Cash'], required: true },
    gateway: { type: String, default: 'Razorpay' },
    gatewayMethod: String, // upi / card / netbanking
    razorpayOrderId: String,
    razorpayPaymentId: String,
    status: { type: String, enum: ['Success', 'Failed', 'Pending'], default: 'Pending' },
    failureReason: String,
    paidAt: Date,
  },
  { timestamps: true }
);

paymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
