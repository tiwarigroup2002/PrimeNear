const router = require('express').Router();
const ctrl = require('../../controllers/admin/settings.controller');
const validate = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/adminAuth');
const { imageUpload } = require('../../middleware/upload');
const { Joi } = require('../../validators/common');

const time = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).messages({ 'string.pattern.base': 'Time must be HH:mm' });

const commission = Joi.object({
  defaultCommission: Joi.number().min(0).max(100),
  commissionType: Joi.string().valid('Percentage', 'Fixed'),
  payoutFrequency: Joi.string().valid('Daily', 'Weekly', 'Monthly'),
  payoutDelayDays: Joi.number().integer().min(0).max(60),
  chargeCommissionOnCash: Joi.boolean(),
});
const delivery = Joi.object({
  enableDelivery: Joi.boolean(),
  defaultDeliveryCharge: Joi.number().min(0),
  freeDeliveryAbove: Joi.number().min(0),
  deliveryPartners: Joi.array().items(Joi.string().trim().max(60)),
});
const notifications = Joi.object({
  emailNotifications: Joi.boolean(),
  smsNotifications: Joi.boolean(),
  whatsappNotifications: Joi.boolean(),
  pushNotifications: Joi.boolean(),
});
const security = Joi.object({
  enableTwoFactor: Joi.boolean(),
  sessionTimeout: Joi.number().integer().min(5).max(1440),
  maxLoginAttempts: Joi.number().integer().min(3).max(20),
  lockMinutes: Joi.number().integer().min(1).max(1440),
  passwordExpiryDays: Joi.number().integer().min(0).max(365),
});
const payment = Joi.object({ enableCashPayment: Joi.boolean(), enableOnlinePayment: Joi.boolean() });

const general = Joi.object({
  platformName: Joi.string().trim().min(2).max(60),
  platformDescription: Joi.string().allow('').max(500),
  website: Joi.string().uri().allow(''),
  supportEmail: Joi.string().email().allow(''),
  supportPhone: Joi.string().allow('').max(20),
  supportHours: Joi.object({ startTime: time, endTime: time, timezone: Joi.string() }),
  lowStockThreshold: Joi.number().integer().min(0).max(1000),
  commissionSettings: commission,
  deliverySettings: delivery,
  notificationSettings: notifications,
  securitySettings: security,
  paymentSettings: payment,
}).min(1);

router.get('/', requirePermission('settings.view', 'settings.manage'), ctrl.get);
router.put('/', requirePermission('settings.manage'), validate(general), ctrl.update);
router.post('/upload-logo', requirePermission('settings.manage'), imageUpload('platform', { maxSizeMb: 2 }).single('logo'), ctrl.uploadLogo);
router.put('/commission', requirePermission('settings.manage'), validate(commission.min(1)), ctrl.commission);
router.put('/gst', requirePermission('settings.manage'), validate(Joi.object({ slabs: Joi.array().items(Joi.object({ percentage: Joi.number().min(0).max(100).required(), description: Joi.string().allow('').max(60) })).min(1).required() })), ctrl.gst);
router.put('/delivery', requirePermission('settings.manage'), validate(delivery.min(1)), ctrl.delivery);
router.put('/notifications', requirePermission('settings.manage'), validate(notifications.min(1)), ctrl.notifications);
router.put('/security', requirePermission('settings.manage'), validate(security.min(1)), ctrl.security);
router.put('/payment', requirePermission('settings.manage'), validate(payment.min(1)), ctrl.payment);
router.post('/maintenance-mode', requirePermission('settings.manage'), validate(Joi.object({ enabled: Joi.boolean().required(), message: Joi.string().allow('').max(300) })), ctrl.maintenance);

module.exports = router;
