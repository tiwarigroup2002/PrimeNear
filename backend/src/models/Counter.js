const mongoose = require('mongoose');

// Stores running sequences used to build readable IDs (ORD-, INV-, PAYOUT-...).
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('Counter', counterSchema);
