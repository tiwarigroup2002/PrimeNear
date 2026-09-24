const mongoose = require('mongoose');

// One-time passwords for mobile login (seller app now, user app later).
const otpSchema = new mongoose.Schema(
  {
    mobileNumber: { type: String, required: true },
    purpose: { type: String, enum: ['seller-login', 'user-login'], required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: Date.now },
    sendCount: { type: Number, default: 1 },
    windowStart: { type: Date, default: Date.now }, // start of the hourly send limit window
  },
  { timestamps: true }
);

otpSchema.index({ mobileNumber: 1, purpose: 1 }, { unique: true });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model('Otp', otpSchema);
