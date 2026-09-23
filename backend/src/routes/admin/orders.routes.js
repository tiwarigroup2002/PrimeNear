const router = require('express').Router();
const ctrl = require('../../controllers/admin/orders.controller');
const validate = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/adminAuth');
const { Joi } = require('../../validators/common');
const { ORDER_STATUS } = require('../../models/constants');

router.get('/', requirePermission('orders.view'), ctrl.list);
router.get('/:orderId', requirePermission('orders.view'), ctrl.getOne);
router.put('/:orderId/status', requirePermission('orders.manage'), validate(Joi.object({ status: Joi.string().valid(...ORDER_STATUS).required(), notes: Joi.string().allow('').max(500) })), ctrl.updateStatus);
router.post('/:orderId/refund', requirePermission('orders.refund'), validate(Joi.object({ amount: Joi.number().positive().precision(2), reason: Joi.string().trim().min(3).max(500).required() })), ctrl.refund);
router.post('/:orderId/cancel', requirePermission('orders.manage'), validate(Joi.object({ reason: Joi.string().trim().min(3).max(500).required(), refund: Joi.boolean().default(true) })), ctrl.cancel);
router.post('/:orderId/notes', requirePermission('orders.manage', 'disputes.manage'), validate(Joi.object({ note: Joi.string().trim().min(1).max(1000).required() })), ctrl.addNote);
router.get('/:orderId/disputes', requirePermission('orders.view'), ctrl.disputes);

module.exports = router;
