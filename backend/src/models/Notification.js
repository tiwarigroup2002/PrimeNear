const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipientType: { type: String, enum: ['User', 'Seller', 'Admin'], required: true },
    // null for Admin notifications means "all admins"
    recipientId: { type: mongoose.Schema.Types.ObjectId, index: true },
    title: { type: String, required: true },
    message: String,
    type: { type: String, default: 'System' }, // NewProduct, OrderStatus, Payout, Dispute, Alert ...
    link: String,
    data: mongoose.Schema.Types.Mixed,
    isRead: { type: Boolean, default: false },
    readBy: [mongoose.Schema.Types.ObjectId], // for broadcast admin notifications
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ recipientType: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
