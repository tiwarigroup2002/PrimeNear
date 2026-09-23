const router = require('express').Router();
const ctrl = require('../../controllers/admin/analytics.controller');
const validate = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/adminAuth');
const { Joi, objectId } = require('../../validators/common');
const { REPORT_TYPES, REPORT_FORMATS, REPORT_FREQUENCY } = require('../../models/constants');

// Mounted at /api/admin
router.get('/analytics/dashboard', requirePermission('dashboard.view'), ctrl.dashboard);
router.get('/analytics/revenue', requirePermission('analytics.view'), ctrl.revenue);
router.get('/analytics/orders', requirePermission('analytics.view'), ctrl.orders);
router.get('/analytics/users', requirePermission('analytics.view'), ctrl.users);
router.get('/analytics/sellers', requirePermission('analytics.view'), ctrl.sellers);
router.get('/analytics/products', requirePermission('analytics.view'), ctrl.products);
router.get('/analytics/payments', requirePermission('analytics.view', 'payments.view'), ctrl.payments);

const period = Joi.string().valid('today', 'week', 'month', 'quarter', 'year', 'all', 'custom').default('month');
router.post(
  '/reports/generate',
  requirePermission('reports.generate'),
  validate(Joi.object({
    reportType: Joi.string().valid(...REPORT_TYPES).required(),
    format: Joi.string().valid(...REPORT_FORMATS).required(),
    period,
    from: Joi.when('period', { is: 'custom', then: Joi.date().required(), otherwise: Joi.date() }),
    to: Joi.date(),
    filters: Joi.object({ sellerId: objectId(), categoryId: objectId(), status: Joi.string(), paymentMethod: Joi.string().valid('Online', 'Cash') }).default({}),
  })),
  ctrl.generate
);
router.get('/reports', requirePermission('reports.generate'), ctrl.listReports);
router.get('/reports/scheduled', requirePermission('reports.generate'), ctrl.listSchedules);
router.post(
  '/reports/schedule',
  requirePermission('reports.generate'),
  validate(Joi.object({
    reportType: Joi.string().valid(...REPORT_TYPES).required(),
    frequency: Joi.string().valid(...REPORT_FREQUENCY).required(),
    recipients: Joi.array().items(Joi.string().email()).min(1).max(20).required(),
    format: Joi.string().valid(...REPORT_FORMATS).default('Excel'),
    isActive: Joi.boolean().default(true),
  })),
  ctrl.createSchedule
);
router.put(
  '/reports/schedule/:scheduleId',
  requirePermission('reports.generate'),
  validate(Joi.object({
    frequency: Joi.string().valid(...REPORT_FREQUENCY),
    recipients: Joi.array().items(Joi.string().email()).min(1).max(20),
    format: Joi.string().valid(...REPORT_FORMATS),
    isActive: Joi.boolean(),
  }).min(1)),
  ctrl.updateSchedule
);
router.delete('/reports/schedule/:scheduleId', requirePermission('reports.generate'), ctrl.deleteSchedule);
router.get('/reports/:reportId/download', requirePermission('reports.generate'), ctrl.download);
router.post('/reports/:reportId/email', requirePermission('reports.generate'), validate(Joi.object({ email: Joi.string().email() })), ctrl.emailReport);
router.delete('/reports/:reportId', requirePermission('reports.generate'), ctrl.removeReport);

module.exports = router;
