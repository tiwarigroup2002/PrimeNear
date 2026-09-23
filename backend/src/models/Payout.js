const mongoose = require('mongoose');
const { PAYOUT_STATUS, PAYOUT_METHODS } = require('./constants');

const payoutSchema = new mongoose.Schema(
  {
    payoutId: { type: String, required: true, unique: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
    orderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
    grossAmount: { type: Number, default: 0 }, // online order value in this payout
    commissionAmount: { type: Number, default: 0 }, // commission on online orders
    cashCommissionDeducted: { type: Number, default: 0 }, // commission owed on cash orders
    refundDeducted: { type: Number, default: 0 },
    amount: { type: Number, required: true }, // net amount to transfer
    currency: { type: String, default: 'INR' },
    payoutMethod: { type: String, enum: PAYOUT_METHODS, default: 'BankTransfer' },
    bankDetails: {
      accountHolder: String,
      accountNumber: String, // encrypted copy at time of payout
      ifscCode: String,
      bankName: String,
    },
    upiId: String,
    status: { type: String, enum: PAYOUT_STATUS, default: 'Pending', index: true },
    payoutDate: Date, // scheduled date
    completedAt: Date,
    failureReason: String,
    transactionRef: String, // bank UTR / reference
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    statusHistory: [{ status: String, at: { type: Date, default: Date.now }, by: mongoose.Schema.Types.ObjectId, note: String, _id: false }],
    retryCount: { type: Number, default: 0 },
    notes: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payout', payoutSchema);
