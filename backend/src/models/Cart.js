const mongoose = require('mongoose');

/**
 * One cart per user, always for ONE shop (the active seller).
 * Switching shop clears the cart (as per the product spec).
 * Prices are not stored: they are read live from products when the cart is loaded.
 */
const cartSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        quantity: { type: Number, required: true, min: 1 },
        addedAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cart', cartSchema);
