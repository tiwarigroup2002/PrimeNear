const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/respond');
const { fileUrl } = require('../../middleware/upload');
const { User, Customer, LoginHistory, Notification } = require('../../models');
const { lookupPincode } = require('../../services/india-locations.service');
const { tahsilForPincode } = require('../../services/locations.service');
const { sendOtp, verifyOtp } = require('../../services/otp.service');
const { signUserToken } = require('../../middleware/userAuth');
const { linkedSellers } = require('../../services/shop-access.service');
const { getSettings } = require('../../services/settings.service');
const { getPagination, paginated } = require('../../utils/pagination');

const NOT_LINKED = 'You are not registered with any shop yet. Ask your shopkeeper to add your number.';

async function hasActiveLink(userId) {
  return (await linkedSellers(userId)).length > 0;
}

/** POST /auth/send-otp - only numbers added by at least one active shop can log in */
async function requestOtp(req, res) {
  const { mobileNumber } = req.body;
  const user = await User.findOne({ mobileNumber });
  if (!user || user.status === 'Deleted' || !(await hasActiveLink(user._id))) throw ApiError.notFound(NOT_LINKED);
  if (user.status === 'Blocked') throw ApiError.forbidden('Your account is blocked. Please contact support.');
  return ok(res, await sendOtp(mobileNumber, 'user-login'), 'OTP sent');
}

/** POST /auth/verify-otp */
async function verify(req, res) {
  const { mobileNumber, otp } = req.body;
  await verifyOtp(mobileNumber, 'user-login', otp);
  const user = await User.findOne({ mobileNumber, status: 'Active' });
  if (!user) throw ApiError.forbidden('Account not available');
  const sellers = await linkedSellers(user._id);
  if (!sellers.length) throw ApiError.notFound(NOT_LINKED);
  if (!sellers.some((s) => String(s._id) === String(user.currentActiveSellerId))) user.currentActiveSellerId = sellers[0]._id;
  user.lastLogin = new Date();
  await user.save();
  await LoginHistory.create({ principalType: 'User', principalId: user._id, identifier: mobileNumber, ipAddress: req.ip, userAgent: req.get('user-agent'), status: 'Success' });
  return ok(res, { token: signUserToken(user), user, sellers, activeSellerId: user.currentActiveSellerId }, 'Login successful');
}

async function me(req, res) {
  const sellers = await linkedSellers(req.userId);
  if (sellers.length && !sellers.some((s) => String(s._id) === String(req.user.currentActiveSellerId))) {
    req.user.currentActiveSellerId = sellers[0]._id;
    await req.user.save();
  }
  await req.user.populate('tahsilId', 'name');
  return ok(res, { user: req.user, sellers, activeSellerId: req.user.currentActiveSellerId });
}

async function logout(req, res) {
  req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
  await req.user.save();
  return ok(res, null, 'Logged out');
}

async function updateProfile(req, res) {
  Object.assign(req.user, req.body);
  await req.user.save();
  await Customer.updateMany({ userId: req.userId, $or: [{ name: null }, { name: '' }] }, { name: req.user.name });
  return ok(res, req.user, 'Profile updated');
}

async function updatePreferences(req, res) {
  req.user.preferences = { ...(req.user.preferences?.toObject?.() || {}), ...req.body };
  await req.user.save();
  return ok(res, req.user.preferences, 'Preferences saved');
}

async function uploadImage(req, res) {
  if (!req.file) throw ApiError.badRequest('Please choose an image');
  req.user.profileImage = fileUrl('users', req.file.filename);
  await req.user.save();
  return ok(res, { profileImage: req.user.profileImage }, 'Photo updated');
}

/** GET /pincode/:pincode - state, district and taluka for a PIN code (fills the address form) */
async function pincodeInfo(req, res) {
  const matches = await lookupPincode(req.params.pincode);
  return ok(res, { pincode: req.params.pincode, ...matches[0], matches });
}

/**
 * Fills state / district / taluka from the PIN code. The PIN decides the area, so the
 * typed state is replaced with the one from the India directory.
 */
async function withArea(body) {
  if (!body.zipCode) return body;
  const [m] = await lookupPincode(body.zipCode);
  return { ...body, state: m.state, district: m.district, taluka: m.taluka, city: body.city || m.taluka };
}

/** The user's taluka (for reports) follows the default address PIN code. */
async function syncUserTahsil(user) {
  const def = user.addresses.find((a) => a.isDefault) || user.addresses[0];
  if (!def?.zipCode) return;
  try {
    user.tahsilId = (await tahsilForPincode(def.zipCode)).tahsil._id;
  } catch {
    // unknown PIN: keep the previous value
  }
}

// ---- Addresses ----
async function listAddresses(req, res) {
  return ok(res, req.user.addresses);
}

async function addAddress(req, res) {
  if (req.user.addresses.length >= 10) throw ApiError.badRequest('You can save up to 10 addresses');
  const body = await withArea(req.body);
  const isDefault = body.isDefault || !req.user.addresses.length;
  if (isDefault) req.user.addresses.forEach((a) => (a.isDefault = false));
  req.user.addresses.push({ ...body, isDefault });
  await syncUserTahsil(req.user);
  await req.user.save();
  return created(res, req.user.addresses.at(-1), 'Address added');
}

async function updateAddress(req, res) {
  const a = req.user.addresses.id(req.params.addressId);
  if (!a) throw ApiError.notFound('Address not found');
  const body = await withArea(req.body);
  if (body.isDefault) req.user.addresses.forEach((x) => (x.isDefault = false));
  Object.assign(a, body);
  await syncUserTahsil(req.user);
  await req.user.save();
  return ok(res, a, 'Address updated');
}

async function deleteAddress(req, res) {
  const a = req.user.addresses.id(req.params.addressId);
  if (!a) throw ApiError.notFound('Address not found');
  const wasDefault = a.isDefault;
  a.deleteOne();
  if (wasDefault && req.user.addresses.length) req.user.addresses[0].isDefault = true;
  await syncUserTahsil(req.user);
  await req.user.save();
  return ok(res, null, 'Address deleted');
}

async function setDefaultAddress(req, res) {
  const a = req.user.addresses.id(req.params.addressId);
  if (!a) throw ApiError.notFound('Address not found');
  req.user.addresses.forEach((x) => (x.isDefault = String(x._id) === String(a._id)));
  await syncUserTahsil(req.user);
  await req.user.save();
  return ok(res, req.user.addresses, 'Default address set');
}

// ---- Notifications ----
async function notifications(req, res) {
  const p = getPagination(req.query, 20);
  const filter = { recipientType: 'User', recipientId: req.userId };
  if (req.query.unreadOnly === 'true') filter.isRead = false;
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipientType: 'User', recipientId: req.userId, isRead: false }),
  ]);
  return ok(res, paginated(items, total, p, { unreadCount }));
}

async function markRead(req, res) {
  await Notification.updateOne({ _id: req.params.notificationId, recipientType: 'User', recipientId: req.userId }, { isRead: true, readAt: new Date() });
  return ok(res, null, 'Marked as read');
}

async function markAllRead(req, res) {
  await Notification.updateMany({ recipientType: 'User', recipientId: req.userId, isRead: false }, { isRead: true, readAt: new Date() });
  return ok(res, null, 'All marked as read');
}

async function deleteNotification(req, res) {
  await Notification.deleteOne({ _id: req.params.notificationId, recipientType: 'User', recipientId: req.userId });
  return ok(res, null, 'Deleted');
}

/** GET /config - public branding & support info */
async function publicConfig(_req, res) {
  const s = await getSettings();
  return ok(res, { platformName: s.platformName, platformLogo: s.platformLogo, supportPhone: s.supportPhone, supportEmail: s.supportEmail, supportHours: s.supportHours, maintenanceMode: s.maintenanceMode, maintenanceMessage: s.maintenanceMessage });
}

module.exports = {
  requestOtp, verify, me, logout, updateProfile, updatePreferences, uploadImage, pincodeInfo,
  listAddresses, addAddress, updateAddress, deleteAddress, setDefaultAddress,
  notifications, markRead, markAllRead, deleteNotification, publicConfig,
};
