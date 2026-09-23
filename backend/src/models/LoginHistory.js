const mongoose = require('mongoose');

const loginHistorySchema = new mongoose.Schema(
  {
    principalType: { type: String, enum: ['Admin', 'Seller', 'User'], default: 'Admin' },
    principalId: { type: mongoose.Schema.Types.ObjectId, refPath: 'principalType' },
    identifier: String, // email or mobile used to attempt login
    loginTime: { type: Date, default: Date.now },
    logoutTime: Date,
    ipAddress: String,
    userAgent: String,
    status: { type: String, enum: ['Success', 'Failed', 'Locked'], default: 'Success' },
    reason: String,
  },
  { timestamps: false }
);

loginHistorySchema.index({ principalType: 1, principalId: 1, loginTime: -1 });

module.exports = mongoose.model('LoginHistory', loginHistorySchema);
