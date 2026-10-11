const mongoose = require('mongoose');

/** Taluka / tahsil (sub-district). Added from the India location directory with its PIN codes. */
const tahsilSchema = new mongoose.Schema(
  {
    districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', required: true },
    name: { type: String, required: true, trim: true },
    // PIN codes in this taluka. Delivery addresses are matched to sellers by PIN code.
    pincodes: { type: [String], default: [], index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

tahsilSchema.index({ districtId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Tahsil', tahsilSchema);
