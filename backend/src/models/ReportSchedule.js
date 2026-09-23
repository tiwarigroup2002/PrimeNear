const mongoose = require('mongoose');
const { REPORT_TYPES, REPORT_FORMATS, REPORT_FREQUENCY } = require('./constants');

const reportScheduleSchema = new mongoose.Schema(
  {
    reportType: { type: String, enum: REPORT_TYPES, required: true },
    frequency: { type: String, enum: REPORT_FREQUENCY, required: true },
    format: { type: String, enum: REPORT_FORMATS, default: 'Excel' },
    recipients: [{ type: String, lowercase: true, trim: true }],
    isActive: { type: Boolean, default: true },
    lastRunAt: Date,
    nextRunAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReportSchedule', reportScheduleSchema);
