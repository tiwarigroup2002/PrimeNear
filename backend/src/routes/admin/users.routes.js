const router = require('express').Router();
const ctrl = require('../../controllers/admin/users.controller');
const validate = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/adminAuth');
const { csvUpload } = require('../../middleware/upload');
const { Joi, objectId, mobile } = require('../../validators/common');
const { CUSTOMER_TYPES } = require('../../models/constants');

const reason = Joi.object({ reason: Joi.string().trim().min(3).max(500).required() });

router.get('/lookup', requirePermission('users.view', 'disputes.manage'), ctrl.lookup);
router.get('/bulk-link/template', requirePermission('users.manage'), (_req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="bulk-link-users-template.csv"');
  res.send('mobileNumber,name,sellerName,customerType\n9876543210,Raj Kumar,Bhagwati Shoes,Retail\n');
});
router.post('/bulk-link', requirePermission('users.manage'), csvUpload.single('csvFile'), ctrl.bulkLink);
router.get('/', requirePermission('users.view'), ctrl.list);
router.post(
  '/',
  requirePermission('users.manage'),
  validate(Joi.object({
    mobileNumber: mobile().required(),
    name: Joi.string().trim().max(80).allow(''),
    email: Joi.string().email().allow(''),
    sellerId: objectId().required(),
    customerType: Joi.string().valid(...CUSTOMER_TYPES).default('Retail'),
  })),
  ctrl.create
);
router.get('/:userId', requirePermission('users.view'), ctrl.getOne);
router.put(
  '/:userId',
  requirePermission('users.manage'),
  validate(Joi.object({
    name: Joi.string().trim().max(80).allow(''),
    email: Joi.string().email().allow(''),
    mobileNumber: mobile(),
    gender: Joi.string().valid('Male', 'Female', 'Other'),
    dateOfBirth: Joi.date().allow(null),
    preferences: Joi.object({
      language: Joi.string().valid('hi', 'en'),
      pushNotifications: Joi.boolean(),
      emailNotifications: Joi.boolean(),
      smsNotifications: Joi.boolean(),
      whatsappNotifications: Joi.boolean(),
    }),
  }).min(1)),
  ctrl.update
);
router.post('/:userId/link-seller', requirePermission('users.manage'), validate(Joi.object({ sellerId: objectId().required(), customerType: Joi.string().valid(...CUSTOMER_TYPES) })), ctrl.linkSeller);
router.post('/:userId/unlink-seller', requirePermission('users.manage'), validate(Joi.object({ sellerId: objectId().required() })), ctrl.unlinkSeller);
router.post('/:userId/block', requirePermission('users.manage'), validate(reason), ctrl.block);
router.post('/:userId/unblock', requirePermission('users.manage'), ctrl.unblock);
router.delete('/:userId', requirePermission('users.delete'), ctrl.remove);
router.get('/:userId/orders', requirePermission('users.view'), ctrl.orders);

module.exports = router;
