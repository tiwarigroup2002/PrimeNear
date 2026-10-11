const mongoose = require('mongoose');

const districtSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true, default: 'Madhya Pradesh' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// District names repeat across states (e.g. Aurangabad in Bihar and Maharashtra)
districtSchema.index({ name: 1, state: 1 }, { unique: true });

module.exports = mongoose.model('District', districtSchema);
