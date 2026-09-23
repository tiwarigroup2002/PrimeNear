const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    change: { type: Number, required: true }, // +ve added, -ve removed
    balanceAfter: Number,
    reason: {
      type: String,
      enum: ['Added', 'OnlineOrder', 'CashBill', 'OrderCancelled', 'Return', 'Damage', 'Recount', 'Adjustment'],
      required: true,
    },
    refType: String, // Order / Invoice
    refId: mongoose.Schema.Types.ObjectId,
    note: String,
    byType: { type: String, enum: ['Seller', 'Admin', 'System'], default: 'System' },
    by: mongoose.Schema.Types.ObjectId,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stockMovementSchema.index({ sellerId: 1, createdAt: -1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
