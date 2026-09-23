const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', index: true },
    ratingType: { type: String, enum: ['Seller', 'Product'], required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    reviewText: String,
    images: [String],
    sellerResponse: { text: String, at: Date },
    isHidden: { type: Boolean, default: false }, // hidden by admin moderation
  },
  { timestamps: true }
);

module.exports = mongoose.model('Review', reviewSchema);
