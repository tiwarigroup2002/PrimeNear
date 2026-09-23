const mongoose = require('mongoose');

const returnRequestSchema = new mongoose.Schema(
  {
    returnId: { type: String, required: true, unique: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    reason: String,
    description: String,
    images: [String],
    status: { type: String, enum: ['Initiated', 'Approved', 'Rejected', 'Completed'], default: 'Initiated' },
    refundAmount: Number,
    refundStatus: { type: String, enum: ['Pending', 'Processed', 'Completed'], default: 'Pending' },
    decidedByType: { type: String, enum: ['Seller', 'Admin'] },
    decidedBy: mongoose.Schema.Types.ObjectId,
    approvalNotes: String,
    approvedAt: Date,
    completedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReturnRequest', returnRequestSchema);
