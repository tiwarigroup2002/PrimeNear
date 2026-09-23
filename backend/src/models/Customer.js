const mongoose = require('mongoose');
const { CUSTOMER_TYPES } = require('./constants');

/**
 * Link between a Seller (shop) and a User. A user can only log in to the
 * user app and shop from a seller when such a link exists.
 * Sellers add customers from the seller app; admins can link manually or in bulk.
 */
const customerSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    mobileNumber: { type: String, required: true },
    name: String, // name as the seller knows this customer
    email: String,
    address: String,
    customerType: { type: String, enum: CUSTOMER_TYPES, default: 'Retail' },
    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    lastPurchaseDate: Date,
    linkedBy: { type: String, enum: ['Seller', 'Admin', 'Bulk'], default: 'Seller' },
    linkedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

customerSchema.index({ sellerId: 1, userId: 1 }, { unique: true });
customerSchema.index({ sellerId: 1, mobileNumber: 1 });
customerSchema.index({ userId: 1 });

module.exports = mongoose.model('Customer', customerSchema);
