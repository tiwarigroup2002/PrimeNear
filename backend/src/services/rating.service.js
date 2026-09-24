const mongoose = require('mongoose');
const { Review, Product, Seller } = require('../models');

/** Recomputes the average rating of a product and/or a seller from visible reviews. */
async function refreshRatings({ productId, sellerId }) {
  if (productId) {
    const [r] = await Review.aggregate([{ $match: { productId: new mongoose.Types.ObjectId(String(productId)), ratingType: 'Product', isHidden: false } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
    await Product.updateOne({ _id: productId }, { rating: Math.round((r?.avg || 0) * 10) / 10, ratingCount: r?.n || 0 });
  }
  if (sellerId) {
    const [r] = await Review.aggregate([{ $match: { sellerId: new mongoose.Types.ObjectId(String(sellerId)), ratingType: 'Seller', isHidden: false } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
    await Seller.updateOne({ _id: sellerId }, { rating: Math.round((r?.avg || 0) * 10) / 10, ratingCount: r?.n || 0 });
  }
}

module.exports = { refreshRatings };
