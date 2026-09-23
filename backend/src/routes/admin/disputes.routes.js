const router = require('express').Router();
const ctrl = require('../../controllers/admin/disputes.controller');
const validate = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/adminAuth');
const { imageUpload } = require('../../middleware/upload');
const { Joi, objectId } = require('../../validators/common');
const { DISPUTE_STATUS, DISPUTE_PRIORITY, DISPUTE_CATEGORY } = require('../../models/constants');

router.get('/', requirePermission('disputes.view'), ctrl.list);
router.post(
  '/',
  requirePermission('disputes.manage'),
  validate(Joi.object({
    orderId: Joi.string().allow(''),
    reportedBy: Joi.string().valid('User', 'Seller', 'Admin').required(),
    reportedById: objectId(),
    againstType: Joi.string().valid('User', 'Seller', 'None').default('None'),
    againstId: objectId(),
    title: Joi.string().trim().min(3).max(150).required(),
    description: Joi.string().trim().min(5).max(3000).required(),
    category: Joi.string().valid(...DISPUTE_CATEGORY).default('Other'),
    priority: Joi.string().valid(...DISPUTE_PRIORITY).default('Medium'),
  })),
  ctrl.create
);
router.get('/:ticketId', requirePermission('disputes.view'), ctrl.getOne);
router.put(
  '/:ticketId',
  requirePermission('disputes.manage'),
  validate(Joi.object({
    status: Joi.string().valid('Open', 'InProgress'),
    priority: Joi.string().valid(...DISPUTE_PRIORITY),
    category: Joi.string().valid(...DISPUTE_CATEGORY),
    assignedToAdmin: objectId(),
    notes: Joi.string().allow('').max(2000),
  }).min(1)),
  ctrl.update
);
router.post('/:ticketId/assign', requirePermission('disputes.manage'), validate(Joi.object({ adminId: objectId().required() })), ctrl.assign);
router.post('/:ticketId/comments', requirePermission('disputes.manage'), imageUpload('disputes').array('attachments', 5), ctrl.comment);
router.post(
  '/:ticketId/resolve',
  requirePermission('disputes.manage'),
  validate(Joi.object({
    resolution: Joi.string().trim().min(3).max(1000).required(),
    refundAmount: Joi.number().min(0).precision(2).default(0),
    refundTo: Joi.string().valid('User', 'Seller', 'Both', 'None').default('None'),
    notes: Joi.string().allow('').max(2000),
  })),
  ctrl.resolve
);
router.post('/:ticketId/close', requirePermission('disputes.manage'), ctrl.close);
router.post('/:ticketId/reopen', requirePermission('disputes.manage'), ctrl.reopen);

module.exports = router;
