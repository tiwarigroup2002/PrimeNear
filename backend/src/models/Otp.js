const mongoose = require('mongoose');

// MongoDB collection "otps" as specified by Meta WhatsApp OTP requirements
const otpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    used: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    // Backwards-compatibility fields for legacy queries
    mobileNumber: { type: String },
    purpose: { type: String },
    codeHash: { type: String },
    lastSentAt: { type: Date },
    sendCount: { type: Number },
    windowStart: { type: Date },
  },
  {
    collection: 'otps',
    timestamps: false,
  }
);

// TTL index on expiresAt so old docs auto-delete
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ phone: 1, used: 1, expiresAt: 1 });
otpSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Otp', otpSchema);
