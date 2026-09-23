const ApiError = require('../../utils/ApiError');
const { ok } = require('../../utils/respond');
const { PlatformSettings } = require('../../models');
const { audit } = require('../../services/audit.service');
const { invalidate } = require('../../services/settings.service');
const { fileUrl } = require('../../middleware/upload');
const razorpay = require('../../services/razorpay.service');
const config = require('../../config');

function withMeta(settings) {
  return {
    ...settings.toJSON(),
    integrations: {
      razorpayConfigured: razorpay.isConfigured(),
      emailConfigured: Boolean(config.smtp.host),
    },
  };
}

async function get(_req, res) {
  return ok(res, withMeta(await PlatformSettings.getSettings()));
}

/** Deep merges the given sections into the singleton settings document. */
async function saveSettings(req, patch, label) {
  const settings = await PlatformSettings.getSettings();
  const before = settings.toJSON();
  Object.entries(patch).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value) && settings[key] && typeof settings[key] === 'object') {
      Object.entries(value).forEach(([k, v]) => settings.set(`${key}.${k}`, v));
    } else {
      settings.set(key, value);
    }
  });
  settings.updatedBy = req.admin._id;
  await settings.save();
  invalidate();
  await audit(req, { action: 'Updated', entityType: 'Settings', entityId: settings._id, oldValue: before, newValue: settings, details: label });
  return settings;
}

async function applyUpdate(req, res, patch, label = 'Settings') {
  const settings = await saveSettings(req, patch, label);
  return ok(res, withMeta(settings), `${label} updated`);
}

const update = (req, res) => applyUpdate(req, res, req.body, 'Settings');
const commission = (req, res) => applyUpdate(req, res, { commissionSettings: req.body }, 'Commission settings');
const delivery = (req, res) => applyUpdate(req, res, { deliverySettings: req.body }, 'Delivery settings');
const notifications = (req, res) => applyUpdate(req, res, { notificationSettings: req.body }, 'Notification settings');
const security = (req, res) => applyUpdate(req, res, { securitySettings: req.body }, 'Security settings');
const payment = (req, res) => applyUpdate(req, res, { paymentSettings: req.body }, 'Payment settings');

async function gst(req, res) {
  const pct = req.body.slabs.map((s) => s.percentage);
  if (new Set(pct).size !== pct.length) throw ApiError.badRequest('GST slabs must be unique');
  return applyUpdate(req, res, { gstSettings: { slabs: [...req.body.slabs].sort((a, b) => a.percentage - b.percentage) } }, 'GST settings');
}

async function maintenance(req, res) {
  return applyUpdate(req, res, { maintenanceMode: req.body.enabled, maintenanceMessage: req.body.message || '' }, req.body.enabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled');
}

async function uploadLogo(req, res) {
  if (!req.file) throw ApiError.badRequest('Please choose an image');
  const logoUrl = fileUrl('platform', req.file.filename);
  await saveSettings(req, { platformLogo: logoUrl }, 'Logo');
  return ok(res, { logoUrl }, 'Logo uploaded');
}

module.exports = { get, update, commission, gst, delivery, notifications, security, payment, maintenance, uploadLogo };
