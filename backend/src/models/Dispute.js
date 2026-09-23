const mongoose = require('mongoose');
const { DISPUTE_STATUS, DISPUTE_PRIORITY, DISPUTE_CATEGORY } = require('./constants');

const disputeSchema = new mongoose.Schema(
  {
    ticketId: { type: String, required: true, unique: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    reportedBy: { type: String, enum: ['User', 'Seller', 'Admin'], required: true },
    reportedById: { type: mongoose.Schema.Types.ObjectId, refPath: 'reportedBy' },
    againstType: { type: String, enum: ['User', 'Seller', 'None'], default: 'None' },
    againstId: { type: mongoose.Schema.Types.ObjectId, refPath: 'againstType' },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, enum: DISPUTE_CATEGORY, default: 'Other' },
    images: [String],
    status: { type: String, enum: DISPUTE_STATUS, default: 'Open', index: true },
    priority: { type: String, enum: DISPUTE_PRIORITY, default: 'Medium' },
    assignedToAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    resolution: String,
    resolutionNotes: String,
    refundAmount: Number,
    refundTo: { type: String, enum: ['User', 'Seller', 'Both', 'None'] },
    refundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Refund' },
    comments: [
      {
        text: String,
        attachments: [String],
        byType: { type: String, enum: ['User', 'Seller', 'Admin'] },
        by: mongoose.Schema.Types.ObjectId,
        byName: String,
        at: { type: Date, default: Date.now },
      },
    ],
    timeline: [{ action: String, note: String, by: mongoose.Schema.Types.ObjectId, byName: String, at: { type: Date, default: Date.now }, _id: false }],
    resolvedAt: Date,
    closedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Dispute', disputeSchema);
