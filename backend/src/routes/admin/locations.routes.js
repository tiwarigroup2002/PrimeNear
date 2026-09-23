const router = require('express').Router();
const ctrl = require('../../controllers/admin/locations.controller');
const validate = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/adminAuth');
const { Joi, objectId } = require('../../validators/common');

const tahsilFields = {
  name: Joi.string().trim().min(2).max(80),
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
  radius: Joi.number().min(0.5).max(100),
  isActive: Joi.boolean(),
};
const newTahsil = Joi.object({
  ...tahsilFields,
  name: tahsilFields.name.required(),
  latitude: tahsilFields.latitude.required(),
  longitude: tahsilFields.longitude.required(),
  radius: tahsilFields.radius.default(5),
});

// Read access is needed by several screens (seller form, filters)
const canRead = requirePermission('locations.manage', 'sellers.view', 'users.view', 'analytics.view');

router.get('/districts', canRead, ctrl.listDistricts);
router.post(
  '/districts',
  requirePermission('locations.manage'),
  validate(Joi.object({
    name: Joi.string().trim().min(2).max(80).required(),
    state: Joi.string().trim().max(80).allow(''),
    isActive: Joi.boolean().default(true),
    tahsils: Joi.array().items(newTahsil).default([]),
  })),
  ctrl.createDistrict
);
router.put('/districts/:districtId', requirePermission('locations.manage'), validate(Joi.object({ name: Joi.string().trim().min(2).max(80), state: Joi.string().allow(''), isActive: Joi.boolean() }).min(1)), ctrl.updateDistrict);
router.delete('/districts/:districtId', requirePermission('locations.manage'), ctrl.deleteDistrict);

router.get('/tahsils', canRead, ctrl.listTahsils);
router.post('/tahsils', requirePermission('locations.manage'), validate(newTahsil.keys({ districtId: objectId().required() })), ctrl.createTahsil);
router.put('/tahsils/:tahsilId', requirePermission('locations.manage'), validate(Joi.object({ ...tahsilFields, districtId: objectId() }).min(1)), ctrl.updateTahsil);
router.delete('/tahsils/:tahsilId', requirePermission('locations.manage'), ctrl.deleteTahsil);

module.exports = router;
