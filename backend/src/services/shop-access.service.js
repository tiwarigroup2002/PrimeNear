const ApiError = require('../utils/ApiError');
const { Customer, Seller, Tahsil } = require('../models');

const SHOP_FIELDS = 'shopName ownerName shopImage shopAddress rating ratingCount tahsilId districtIds sellsAcrossDistricts settings mobileNumber';

/** Active shops the user is linked to (Customer links). */
async function linkedSellers(userId) {
  const links = await Customer.find({ userId }).select('sellerId customerType');
  const sellers = await Seller.find({ _id: { $in: links.map((l) => l.sellerId) }, status: 'Active' })
    .select(SHOP_FIELDS)
    .populate('tahsilId', 'name districtId')
    .sort({ shopName: 1 });
  return sellers;
}

function idOf(value) {
  if (!value) return '';
  return String(value._id || value);
}

/** A shop sells in its own tahsil. A bigger shop assigned districts sells in every tahsil of those districts. */
function shopServesTahsil(seller, userTahsil) {
  if (!userTahsil) return false;
  if (idOf(seller.tahsilId) === String(userTahsil._id)) return true;
  if (!seller.sellsAcrossDistricts) return false;
  const assigned = (seller.districtIds || []).map((d) => idOf(d));
  return assigned.includes(idOf(userTahsil.districtId));
}

/**
 * Shops this customer can order from right now.
 * Login still requires a shop link. Ordering also requires the phone's current tahsil.
 */
async function reachableShops(user) {
  const all = await linkedSellers(user._id);
  if (!user.tahsilId) return { sellers: [], all, locationRequired: true, tahsilName: null };
  const userTahsil = await Tahsil.findById(user.tahsilId).populate('districtId', 'name');
  if (!userTahsil) return { sellers: [], all, locationRequired: true, tahsilName: null };
  const sellers = all.filter((s) => shopServesTahsil(s, userTahsil));
  const tahsilName = `${userTahsil.name}${userTahsil.districtId?.name ? `, ${userTahsil.districtId.name}` : ''}`;
  return { sellers, all, locationRequired: false, tahsilName, outOfArea: sellers.length === 0 };
}

/** Throws unless the user is linked to this active seller. */
async function requireLinkedSeller(userId, sellerId) {
  const [link, seller] = await Promise.all([Customer.findOne({ userId, sellerId }), Seller.findOne({ _id: sellerId, status: 'Active' })]);
  if (!link || !seller) throw ApiError.forbidden('You are not a customer of this shop.');
  return { seller, link };
}

/**
 * Shop the user is currently browsing. Falls back to the first linked shop when the
 * saved one is no longer available.
 */
async function activeSeller(user) {
  const reach = await reachableShops(user);
  if (!reach.all.length) throw ApiError.forbidden('You are not registered with any shop yet. Ask your shopkeeper to add your number.');
  if (reach.locationRequired) {
    const err = ApiError.badRequest('Allow location so we can detect your tahsil. You can order only from shops that sell in your current tahsil.');
    err.locationRequired = true;
    throw err;
  }
  if (!reach.sellers.length) throw ApiError.badRequest(`You are in ${reach.tahsilName}. None of your linked shops sell here. You can order only from shops that sell in your current tahsil.`);
  let seller = reach.sellers.find((s) => String(s._id) === String(user.currentActiveSellerId));
  if (!seller) {
    seller = reach.sellers[0];
    user.currentActiveSellerId = seller._id;
    await user.save();
  }
  return { seller, sellers: reach.sellers, tahsilName: reach.tahsilName };
}

/** Blocks checkout when the shop does not sell in the tahsil the customer is standing in. */
async function assertShopInReach(user, sellerId) {
  const reach = await reachableShops(user);
  if (reach.locationRequired) throw ApiError.badRequest('Allow location so we can detect your tahsil. You can order only from shops that sell in your current tahsil.');
  if (!reach.sellers.some((s) => String(s._id) === String(sellerId))) {
    throw ApiError.badRequest('This shop does not sell in your current tahsil.');
  }
  return reach;
}

module.exports = { linkedSellers, requireLinkedSeller, activeSeller, reachableShops, assertShopInReach, shopServesTahsil };
