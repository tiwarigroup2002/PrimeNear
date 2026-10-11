const router = require('express').Router();
const ctrl = require('../../controllers/admin/payments.controller');
const validate = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/adminAuth');
const { Joi, objectId } = require('../../validators/common');

// Mounted at /api/admin (paths: /payments, /payouts, /sellers/:id/earnings)
router.get('/payments', requirePermission('payments.view'), ctrl.listPayments);
router.get('/payments/dashboard', requirePermission('payments.view'), ctrl.dashboard);
router.get('/payouts', requirePermission('payments.view'), ctrl.listPayouts);
router.get('/payouts/pending', requirePermission('payments.view'), ctrl.pendingPayouts);
router.get('/payouts/on-hold', requirePermission('payments.view'), ctrl.onHoldPayouts);
router.post(
  '/payouts/initiate',
  requirePermission('payouts.manage'),
  validate(Joi.object({ sellerIds: Joi.array().items(objectId()).allow(null), payoutDate: Joi.date(), notes: Joi.string().allow('').max(500) })),
  ctrl.initiate
);
router.get('/payouts/:payoutId', requirePermission('payments.view'), ctrl.getPayout);
router.put(
  '/payouts/:payoutId/status',
  requirePermission('payouts.manage'),
  validate(Joi.object({
    status: Joi.string().valid('Processing', 'Completed', 'Failed', 'Rejected', 'Pending').required(),
    notes: Joi.string().allow('').max(500),
    transactionRef: Joi.string().allow('').max(100),
    failureReason: Joi.string().allow('').max(500),
  })),
  ctrl.updatePayoutStatus
);
router.post('/payouts/:payoutId/retry', requirePermission('payouts.manage'), ctrl.retry);
router.get('/sellers/:sellerId/earnings', requirePermission('payments.view'), ctrl.sellerEarnings);

module.exports = router;
