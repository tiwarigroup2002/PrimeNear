const ApiError = require('../utils/ApiError');
const { Customer, Seller, Tahsil } = require('../models');

const SHOP_FIELDS = 'shopName ownerName shopImage shopAddress pincode rating ratingCount tahsilId districtIds sellsAcrossDistricts settings mobileNumber';

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
function shopServesTahsil(seller, tahsil) {
  if (!tahsil) return false;
  if (idOf(seller.tahsilId) === String(tahsil._id)) return true;
  if (!seller.sellsAcrossDistricts) return false;
  const assigned = (seller.districtIds || []).map((d) => idOf(d));
  return assigned.includes(idOf(tahsil.districtId));
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

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Tahsil of an address: by PIN code first, then by map location (within the tahsil radius). */
async function tahsilForAddress(address) {
  const zip = String(address?.zipCode || '').trim();
  if (/^\d{6}$/.test(zip)) {
    const byPin = await Tahsil.findOne({ pincodes: zip, isActive: true }).populate('districtId', 'name');
    if (byPin) return byPin;
  }
  if (address?.latitude != null && address?.longitude != null) {
    const tahsils = await Tahsil.find({ isActive: true }).populate('districtId', 'name');
    let best = null;
    tahsils.forEach((t) => {
      const d = haversineKm(address.latitude, address.longitude, t.latitude, t.longitude);
      if (d <= (t.radius || 5) && (!best || d < best.d)) best = { t, d };
    });
    if (best) return best.t;
  }
  return null;
}

/**
 * Can this shop deliver to this address?
 * Same PIN code as the shop -> yes. Otherwise the address must be in the shop's tahsil
 * (or any tahsil of its districts when it sells across districts).
 */
async function checkDeliveryArea(seller, address) {
  if (!address) return { deliverable: false, message: 'Please select a delivery address' };
  const zip = String(address.zipCode || '').trim();
  if (seller.pincode && zip === seller.pincode) return { deliverable: true, message: 'Same PIN code as the shop' };
  const tahsil = await tahsilForAddress(address);
  if (!tahsil) {
    return {
      deliverable: false,
      message: zip
        ? `We could not find PIN code ${zip} in ${seller.shopName}'s delivery area. Choose store pickup or another address.`
        : 'Add the PIN code to this address so we can check delivery, or choose store pickup.',
    };
  }
  const area = `${tahsil.name}${tahsil.districtId?.name ? `, ${tahsil.districtId.name}` : ''}`;
  if (shopServesTahsil(seller, tahsil)) return { deliverable: true, area, message: `Delivers to ${area}` };
  return { deliverable: false, area, message: `${seller.shopName} does not deliver to ${area}. Choose store pickup or another address.` };
}

module.exports = { linkedSellers, requireLinkedSeller, activeSeller, reachableShops, assertShopInReach, shopServesTahsil, checkDeliveryArea, tahsilForAddress };
