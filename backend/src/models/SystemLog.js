const mongoose = require('mongoose');

const systemLogSchema = new mongoose.Schema({
  level: { type: String, enum: ['Info', 'Warning', 'Error', 'Critical'], default: 'Error' },
  message: String,
  details: mongoose.Schema.Types.Mixed,
  stackTrace: String,
  source: String,
  userId: mongoose.Schema.Types.ObjectId,
  adminId: mongoose.Schema.Types.ObjectId,
  ipAddress: String,
  timestamp: { type: Date, default: Date.now },
});

systemLogSchema.index({ timestamp: -1 });
// Keep system logs for 90 days
systemLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

module.exports = mongoose.model('SystemLog', systemLogSchema);
