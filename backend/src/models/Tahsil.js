const mongoose = require('mongoose');

const tahsilSchema = new mongoose.Schema(
  {
    districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', required: true },
    name: { type: String, required: true, trim: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    radius: { type: Number, default: 5 }, // km
    // PIN codes in this tahsil. Used to fill the tahsil from a PIN and to check delivery addresses.
    pincodes: { type: [String], default: [], index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

tahsilSchema.index({ districtId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Tahsil', tahsilSchema);
