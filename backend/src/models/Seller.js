const mongoose = require('mongoose');
const { ACCOUNT_STATUS } = require('./constants');
const { encrypt, decrypt, mask } = require('../utils/crypto');

/**
 * A Seller document represents ONE shop. The same owner mobile number can own
 * several shops; the seller app lets them pick a shop after OTP login.
 */
const sellerSchema = new mongoose.Schema(
  {
    shopName: { type: String, required: true, unique: true, trim: true },
    ownerName: { type: String, required: true, trim: true },
    mobileNumber: { type: String, required: true, match: /^[6-9]\d{9}$/, index: true },
    email: { type: String, lowercase: true, trim: true },
    tahsilId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tahsil', required: true },
    districtIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'District' }],
    shopAddress: { type: String, required: true },
    shopImage: String,
    gstNumber: { type: String, uppercase: true, trim: true },
    bankDetails: {
      accountHolder: String,
      // Stored encrypted (AES-256-GCM); use seller.getBankDetails() to read.
      accountNumber: String,
      ifscCode: { type: String, uppercase: true, trim: true },
      bankName: String,
    },
    upiId: String,
    // Kept for old orders. New sales do not charge a platform cut — the shop keeps the full amount.
    commissionRate: { type: Number, min: 0, max: 100, default: 0 },
    // Default is the shop's own tahsil. When true, the shop can sell in every tahsil of districtIds.
    sellsAcrossDistricts: { type: Boolean, default: false },
    // Amount to recover from the next payout (e.g. refunds on already settled orders)
    pendingDeduction: { type: Number, default: 0 },
    status: { type: String, enum: ACCOUNT_STATUS, default: 'Active', index: true },
    blockReason: String,
    deletedAt: Date,
    deleteReason: String,
    settings: {
      enableDelivery: { type: Boolean, default: false },
      deliveryCharge: { type: Number, default: 0 },
      freeDeliveryAbove: { type: Number, default: 1000 },
      allowCashOnDelivery: { type: Boolean, default: true },
      notifications: {
        push: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: true },
        sms: { type: Boolean, default: true },
      },
    },
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

sellerSchema.pre('save', function encryptBank() {
  const acc = this.bankDetails && this.bankDetails.accountNumber;
  if (this.isModified('bankDetails.accountNumber') && acc && acc.split(':').length !== 3) {
    this.bankDetails.accountNumber = encrypt(acc);
  }
});

sellerSchema.methods.getBankDetails = function getBankDetails() {
  const b = (this.bankDetails && this.bankDetails.toObject ? this.bankDetails.toObject() : this.bankDetails) || {};
  return { ...b, accountNumber: decrypt(b.accountNumber) };
};

sellerSchema.set('toJSON', {
  transform: (_doc, ret) => {
    if (ret.bankDetails && ret.bankDetails.accountNumber) {
      ret.bankDetails.accountNumber = mask(decrypt(ret.bankDetails.accountNumber));
    }
    delete ret.tokenVersion;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Seller', sellerSchema);
