const router = require('express').Router();
const ctrl = require('../../controllers/admin/locations.controller');
const validate = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/adminAuth');
const { Joi, objectId } = require('../../validators/common');

const pincodes = Joi.array().items(Joi.string().pattern(/^\d{6}$/).messages({ 'string.pattern.base': 'PIN codes must be 6 digits' })).unique().max(500);
const tahsilFields = {
  name: Joi.string().trim().min(2).max(80),
  pincodes,
  isActive: Joi.boolean(),
};
const newTahsil = Joi.object({ ...tahsilFields, name: tahsilFields.name.required() });
const talukaSelection = Joi.object({
  state: Joi.string().trim().required(),
  district: Joi.string().trim().required(),
  talukas: Joi.alternatives().try(Joi.string().valid('all'), Joi.array().items(Joi.string().trim()).min(1)).default('all'),
});

// Read access is needed by several screens (seller form, filters)
const canRead = requirePermission('locations.manage', 'sellers.view', 'sellers.manage', 'users.view', 'analytics.view');

// India directory (state -> district -> taluka -> PIN codes), free data
router.get('/directory/states', canRead, ctrl.directoryStates);
router.get('/directory/districts', canRead, validate(Joi.object({ state: Joi.string().required() }), 'query'), ctrl.directoryDistricts);
router.get('/directory/talukas', canRead, validate(Joi.object({ state: Joi.string().required(), district: Joi.string().required() }), 'query'), ctrl.directoryTalukas);
router.get('/pincode/:pincode', canRead, validate(Joi.object({ pincode: Joi.string().pattern(/^\d{6}$/).required() }), 'params'), ctrl.lookupPincode);
router.post('/import', requirePermission('locations.manage'), validate(talukaSelection), ctrl.importFromDirectory);

router.get('/districts', canRead, ctrl.listDistricts);
router.post(
  '/districts',
  requirePermission('locations.manage'),
  validate(Joi.object({
    name: Joi.string().trim().min(2).max(80).required(),
    state: Joi.string().trim().min(2).max(80).required(),
    isActive: Joi.boolean().default(true),
    tahsils: Joi.array().items(newTahsil).default([]),
  })),
  ctrl.createDistrict
);
router.put('/districts/:districtId', requirePermission('locations.manage'), validate(Joi.object({ name: Joi.string().trim().min(2).max(80), state: Joi.string().trim().min(2).max(80), isActive: Joi.boolean() }).min(1)), ctrl.updateDistrict);
router.delete('/districts/:districtId', requirePermission('locations.manage'), ctrl.deleteDistrict);

router.get('/tahsils', canRead, ctrl.listTahsils);
router.post('/tahsils', requirePermission('locations.manage'), validate(newTahsil.keys({ districtId: objectId().required() })), ctrl.createTahsil);
router.put('/tahsils/:tahsilId', requirePermission('locations.manage'), validate(Joi.object({ ...tahsilFields, districtId: objectId() }).min(1)), ctrl.updateTahsil);
router.delete('/tahsils/:tahsilId', requirePermission('locations.manage'), ctrl.deleteTahsil);

module.exports = router;
