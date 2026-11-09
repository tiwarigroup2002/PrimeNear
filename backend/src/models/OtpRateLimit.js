const mongoose = require('mongoose');

const otpRateLimitSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true },
    requests: [{ type: Date }],
    lastSentAt: { type: Date, default: Date.now },
  },
  {
    collection: 'otp_rate_limits',
    timestamps: true,
  }
);

otpRateLimitSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7200 });

module.exports = mongoose.model('OtpRateLimit', otpRateLimitSchema);

