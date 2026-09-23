const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema(
  {
    refundId: { type: String, required: true, unique: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    disputeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispute' },
    amount: { type: Number, required: true, min: 0 },
    reason: String,
    method: { type: String, enum: ['Razorpay', 'Manual'], default: 'Manual' },
    razorpayRefundId: String,
    status: { type: String, enum: ['Pending', 'Processed', 'Failed'], default: 'Pending' },
    failureReason: String,
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    processedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Refund', refundSchema);
