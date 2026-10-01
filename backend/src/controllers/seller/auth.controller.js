const ApiError = require('../../utils/ApiError');
const { ok } = require('../../utils/respond');
const { Seller, LoginHistory } = require('../../models');
const { sendOtp, verifyOtp } = require('../../services/otp.service');
const { signOwnerToken, signShopToken } = require('../../middleware/sellerAuth');
const { getSettings, commissionRateFor } = require('../../services/settings.service');

const NOT_REGISTERED = 'This mobile number is not registered as a seller. Please contact the admin.';

async function shopsFor(mobileNumber) {
  return Seller.find({ mobileNumber, status: { $ne: 'Deleted' } })
    .select('shopName ownerName shopImage status blockReason tahsilId')
    .populate('tahsilId', 'name')
    .sort({ shopName: 1 });
}

function shopSummary(s) {
  return { _id: s._id, shopName: s.shopName, ownerName: s.ownerName, shopImage: s.shopImage, status: s.status, blockReason: s.blockReason, tahsil: s.tahsilId?.name };
}

async function sellerProfile(seller) {
  await seller.populate([{ path: 'tahsilId', select: 'name' }, { path: 'districtIds', select: 'name' }]);
  return { ...seller.toJSON(), effectiveCommissionRate: await commissionRateFor(seller) };
}

async function record(req, mobile, seller, status, reason) {
  await LoginHistory.create({ principalType: 'Seller', principalId: seller?._id, identifier: mobile, ipAddress: req.ip, userAgent: req.get('user-agent'), status, reason });
}

/** POST /auth/send-otp */
async function requestOtp(req, res) {
  const { mobileNumber } = req.body;
  const shops = await shopsFor(mobileNumber);
  if (!shops.length) throw ApiError.notFound(NOT_REGISTERED);
  const result = await sendOtp(mobileNumber, 'seller-login');
  return ok(res, result, 'OTP sent');
}

/** POST /auth/verify-otp -> shop token (one shop) or owner token + shop list */
async function verify(req, res) {
  const { mobileNumber, otp } = req.body;
  await verifyOtp(mobileNumber, 'seller-login', otp);
  const shops = await shopsFor(mobileNumber);
  if (!shops.length) throw ApiError.notFound(NOT_REGISTERED);
  const active = shops.filter((s) => s.status === 'Active');
  if (!active.length) {
    await record(req, mobileNumber, shops[0], 'Failed', 'All shops blocked');
    throw ApiError.forbidden(`Your shop is blocked${shops[0].blockReason ? `: ${shops[0].blockReason}` : ''}. Please contact support.`);
  }
  if (active.length === 1 && shops.length === 1) {
    const seller = await Seller.findById(active[0]._id);
    await record(req, mobileNumber, seller, 'Success');
    return ok(res, { token: signShopToken(seller), seller: await sellerProfile(seller), shops: shops.map(shopSummary) }, 'Login successful');
  }
  return ok(res, { selectShop: true, ownerToken: signOwnerToken(mobileNumber), shops: shops.map(shopSummary) }, 'Select a shop');
}

/** GET /auth/shops - shops of the logged in owner (for the shop switcher) */
async function listShops(req, res) {
  const shops = await shopsFor(req.ownerMobile);
  return ok(res, shops.map(shopSummary));
}

/** POST /auth/select-shop  (owner token or shop token) */
async function selectShop(req, res) {
  const seller = await Seller.findOne({ _id: req.body.shopId, mobileNumber: req.ownerMobile, status: { $ne: 'Deleted' } });
  if (!seller) throw ApiError.notFound('Shop not found');
  if (seller.status === 'Blocked') throw ApiError.forbidden(`This shop is blocked${seller.blockReason ? `: ${seller.blockReason}` : ''}`);
  await record(req, req.ownerMobile, seller, 'Success', 'Shop selected');
  return ok(res, { token: signShopToken(seller), seller: await sellerProfile(seller) }, `Switched to ${seller.shopName}`);
}

/** GET /auth/me */
async function me(req, res) {
  return ok(res, await sellerProfile(req.seller));
}

/** POST /auth/logout - signs out this shop on every device */
async function logout(req, res) {
  req.seller.tokenVersion = (req.seller.tokenVersion || 0) + 1;
  await req.seller.save();
  return ok(res, null, 'Logged out');
}

/** GET /config - public data the app needs (branding, GST slabs, maintenance) */
async function publicConfig(_req, res) {
  const s = await getSettings();
  return ok(res, {
    platformName: s.platformName,
    platformLogo: s.platformLogo,
    supportPhone: s.supportPhone,
    supportEmail: s.supportEmail,
    supportHours: s.supportHours,
    gstSlabs: s.gstSettings.slabs,
    lowStockThreshold: s.lowStockThreshold,
    maintenanceMode: s.maintenanceMode,
    maintenanceMessage: s.maintenanceMessage,
  });
}

module.exports = { requestOtp, verify, listShops, selectShop, me, logout, publicConfig, sellerProfile };
