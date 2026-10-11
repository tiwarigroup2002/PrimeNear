const ApiError = require('../utils/ApiError');
const { Customer, Seller, Tahsil } = require('../models');
const { servicePincodes } = require('./locations.service');

const SHOP_FIELDS = 'shopName ownerName shopImage shopAddress pincode rating ratingCount tahsilId serviceTahsilIds districtIds settings mobileNumber';

/** Active shops the user is linked to (Customer links). */
async function linkedSellers(userId) {
  const links = await Customer.find({ userId }).select('sellerId customerType');
  const sellers = await Seller.find({ _id: { $in: links.map((l) => l.sellerId) }, status: 'Active' })
    .select(SHOP_FIELDS)
    .populate('tahsilId', 'name districtId')
    .sort({ shopName: 1 });
  return sellers;
}

async function tahsilLabel(tahsilId) {
  if (!tahsilId) return null;
  const t = await Tahsil.findById(tahsilId).populate('districtId', 'name');
  return t ? `${t.name}${t.districtId?.name ? `, ${t.districtId.name}` : ''}` : null;
}

/**
 * Shops this customer can browse. A shop that added the customer is always shown,
 * wherever the phone is. Location only matters for the delivery address at checkout.
 */
async function reachableShops(user) {
  const all = await linkedSellers(user._id);
  return { sellers: all, all, locationRequired: false, tahsilName: await tahsilLabel(user.tahsilId), outOfArea: false };
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
  let seller = reach.sellers.find((s) => String(s._id) === String(user.currentActiveSellerId));
  if (!seller) {
    seller = reach.sellers[0];
    user.currentActiveSellerId = seller._id;
    await user.save();
  }
  return { seller, sellers: reach.sellers, tahsilName: reach.tahsilName };
}

/** Kept for callers that check access: a linked shop is always in reach. */
async function assertShopInReach(user, sellerId) {
  await requireLinkedSeller(user._id, sellerId);
  return reachableShops(user);
}

/**
 * Can this shop deliver to this address? Only the PIN code decides:
 * it must be the shop's own PIN code or a PIN code of a taluka in the shop's selling area.
 */
async function checkDeliveryArea(seller, address) {
  if (!address) return { deliverable: false, message: 'Please select a delivery address' };
  const zip = String(address.zipCode || '').trim();
  if (!/^\d{6}$/.test(zip)) return { deliverable: false, message: 'Add a 6 digit PIN code to this address, or choose store pickup.' };
  const area = [address.taluka, address.district].filter(Boolean).join(', ');
  const pins = await servicePincodes(seller);
  if (pins.has(zip)) return { deliverable: true, area, message: zip === seller.pincode ? `Same PIN code as the shop (${zip})` : `Delivers to PIN ${zip}${area ? ` (${area})` : ''}` };
  return { deliverable: false, area, message: `${seller.shopName} does not deliver to PIN ${zip}${area ? ` (${area})` : ''}. Choose store pickup or another address.` };
}

module.exports = { linkedSellers, requireLinkedSeller, activeSeller, reachableShops, assertShopInReach, checkDeliveryArea };
