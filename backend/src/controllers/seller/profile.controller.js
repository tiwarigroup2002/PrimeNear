const ApiError = require('../../utils/ApiError');
const { ok } = require('../../utils/respond');
const { fileUrl } = require('../../middleware/upload');
const { AuditLog } = require('../../models');
const { notifyAdmins } = require('../../services/notification.service');
const { getSettings } = require('../../services/settings.service');
const { sellerProfile } = require('./auth.controller');

/** GET /settings */
async function getSettingsView(req, res) {
  const s = await getSettings();
  return ok(res, {
    shop: await sellerProfile(req.seller),
    platform: {
      gstSlabs: s.gstSettings.slabs,
      deliverySettings: s.deliverySettings,
      paymentSettings: s.paymentSettings,
      payoutFrequency: s.commissionSettings.payoutFrequency,
      payoutDelayDays: s.commissionSettings.payoutDelayDays,
      chargeCommissionOnCash: s.commissionSettings.chargeCommissionOnCash,
    },
  });
}

/** PUT /settings - delivery & notification preferences */
async function updateSettings(req, res) {
  const current = req.seller.settings?.toObject ? req.seller.settings.toObject() : req.seller.settings || {};
  req.seller.settings = {
    ...current,
    ...req.body,
    notifications: { ...(current.notifications || {}), ...(req.body.notifications || {}) },
  };
  await req.seller.save();
  return ok(res, await sellerProfile(req.seller), 'Settings updated');
}

/** PUT /profile - shop details (name & mobile can only be changed by admin) */
async function updateProfile(req, res) {
  Object.assign(req.seller, req.body);
  await req.seller.save();
  return ok(res, await sellerProfile(req.seller), 'Profile updated');
}

/** PUT /bank - payout account. Admins are notified because this affects money. */
async function updateBank(req, res) {
  const before = req.seller.getBankDetails();
  const { upiId, ...bank } = req.body;
  if (!bank.accountNumber || /X/.test(bank.accountNumber)) bank.accountNumber = before.accountNumber;
  req.seller.bankDetails = bank;
  if (upiId !== undefined) req.seller.upiId = upiId;
  await req.seller.save();
  await AuditLog.create({ action: 'BankDetailsChangedBySeller', entityType: 'Seller', entityId: req.seller._id, ipAddress: req.ip, userAgent: req.get('user-agent'), details: `${req.seller.shopName} changed payout details` });
  await notifyAdmins({ title: 'Seller changed bank details', message: `${req.seller.shopName} updated their payout account. Verify before the next payout.`, type: 'Seller', link: `/sellers/${req.seller._id}` });
  return ok(res, await sellerProfile(req.seller), 'Bank details updated');
}

/** POST /profile/image */
async function uploadImage(req, res) {
  if (!req.file) throw ApiError.badRequest('Please choose an image');
  req.seller.shopImage = fileUrl('sellers', req.file.filename);
  await req.seller.save();
  return ok(res, { shopImage: req.seller.shopImage }, 'Shop image updated');
}

module.exports = { getSettingsView, updateSettings, updateProfile, updateBank, uploadImage };
