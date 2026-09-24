const ApiError = require('../utils/ApiError');
const { Customer, Seller } = require('../models');

/** Active shops the user is linked to (Customer links). */
async function linkedSellers(userId) {
  const links = await Customer.find({ userId }).select('sellerId customerType');
  const sellers = await Seller.find({ _id: { $in: links.map((l) => l.sellerId) }, status: 'Active' })
    .select('shopName ownerName shopImage shopAddress rating ratingCount tahsilId settings mobileNumber')
    .populate('tahsilId', 'name')
    .sort({ shopName: 1 });
  return sellers;
}

/** Throws unless the user is linked to this active seller. */
async function requireLinkedSeller(userId, sellerId) {
  const [link, seller] = await Promise.all([Customer.findOne({ userId, sellerId }), Seller.findOne({ _id: sellerId, status: 'Active' })]);
  if (!link || !seller) throw ApiError.forbidden('आप इस दुकान के ग्राहक नहीं हैं। You are not a customer of this shop.');
  return { seller, link };
}

/**
 * Shop the user is currently browsing. Falls back to the first linked shop when the
 * saved one is no longer available.
 */
async function activeSeller(user) {
  const sellers = await linkedSellers(user._id);
  if (!sellers.length) throw ApiError.forbidden('अरे भाई! आप अभी किसी दुकान के ग्राहक नहीं हो। विक्रेता से अपना नंबर दर्ज करवाएं।');
  let seller = sellers.find((s) => String(s._id) === String(user.currentActiveSellerId));
  if (!seller) {
    seller = sellers[0];
    user.currentActiveSellerId = seller._id;
    await user.save();
  }
  return { seller, sellers };
}

module.exports = { linkedSellers, requireLinkedSeller, activeSeller };
