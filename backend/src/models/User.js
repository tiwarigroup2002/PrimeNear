const mongoose = require('mongoose');
const { ACCOUNT_STATUS } = require('./constants');

const addressSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Home', 'Work', 'Other'], default: 'Home' },
    name: String,
    fullAddress: { type: String, required: true },
    latitude: Number,
    longitude: Number,
    city: String,
    state: String,
    zipCode: String,
    phoneNumber: String,
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/**
 * Platform wide customer identity (one per mobile number).
 * Which shops a user can buy from is stored in the Customer collection
 * (seller <-> user link), which is the single source of truth.
 */
const userSchema = new mongoose.Schema(
  {
    mobileNumber: { type: String, required: true, unique: true, match: /^[6-9]\d{9}$/ },
    name: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    profileImage: String,
    lastLocation: { latitude: Number, longitude: Number, updatedAt: Date },
    tahsilId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tahsil' },
    currentActiveSellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
    addresses: [addressSchema],
    dateOfBirth: Date,
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    preferences: {
      language: { type: String, default: 'en' },
      theme: { type: String, default: 'light' },
      pushNotifications: { type: Boolean, default: true },
      emailNotifications: { type: Boolean, default: true },
      smsNotifications: { type: Boolean, default: true },
      whatsappNotifications: { type: Boolean, default: true },
    },
    status: { type: String, enum: ACCOUNT_STATUS, default: 'Active', index: true },
    blockReason: String,
    lastLogin: Date,
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.tokenVersion;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
