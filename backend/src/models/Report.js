const mongoose = require('mongoose');
const { REPORT_TYPES, REPORT_FORMATS } = require('./constants');

const reportSchema = new mongoose.Schema(
  {
    reportType: { type: String, enum: REPORT_TYPES, required: true },
    format: { type: String, enum: REPORT_FORMATS, required: true },
    period: String,
    from: Date,
    to: Date,
    filters: mongoose.Schema.Types.Mixed,
    fileName: String,
    filePath: String,
    fileSize: Number,
    rowCount: Number,
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReportSchedule' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', reportSchema);
