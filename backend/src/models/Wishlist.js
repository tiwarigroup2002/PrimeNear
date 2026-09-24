const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
        priceAtTime: Number, // final price when saved - used to show price drops
        addedAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Wishlist', wishlistSchema);
