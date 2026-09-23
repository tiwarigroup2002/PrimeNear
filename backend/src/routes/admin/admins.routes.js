const router = require('express').Router();
const ctrl = require('../../controllers/admin/admins.controller');
const validate = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/adminAuth');
const { Joi, mobile, password } = require('../../validators/common');
const { ADMIN_ROLES } = require('../../models/constants');
const { ALL_PERMISSIONS } = require('../../config/permissions');

const perms = Joi.array().items(Joi.string().valid(...ALL_PERMISSIONS)).unique();

router.use(requirePermission('admins.manage'));
router.get('/', ctrl.list);
router.get('/permissions', ctrl.permissionCatalogue);
router.post(
  '/',
  validate(Joi.object({
    email: Joi.string().email().required(),
    password: password().required(),
    fullName: Joi.string().min(2).max(80).required(),
    mobileNumber: mobile().allow(''),
    role: Joi.string().valid(...ADMIN_ROLES).required(),
    permissions: perms.default([]),
    isActive: Joi.boolean().default(true),
  })),
  ctrl.create
);
router.get('/:adminId', ctrl.getOne);
router.put(
  '/:adminId',
  validate(Joi.object({
    fullName: Joi.string().min(2).max(80),
    mobileNumber: mobile().allow(''),
    role: Joi.string().valid(...ADMIN_ROLES),
    permissions: perms,
    isActive: Joi.boolean(),
  })),
  ctrl.update
);
router.post('/:adminId/toggle-active', validate(Joi.object({ isActive: Joi.boolean().required() })), ctrl.toggleActive);
router.post('/:adminId/reset-password', validate(Joi.object({ newPassword: password().required() })), ctrl.resetPassword);
router.delete('/:adminId', ctrl.remove);

module.exports = router;
