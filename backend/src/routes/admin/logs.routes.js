const router = require('express').Router();
const ctrl = require('../../controllers/admin/logs.controller');
const { requirePermission } = require('../../middleware/adminAuth');

// Mounted at /api/admin
router.get('/audit-logs', requirePermission('audit.view'), ctrl.auditLogs);
router.get('/audit-logs/feed', requirePermission('audit.view'), ctrl.activityFeed);
router.get('/audit-logs/:logId', requirePermission('audit.view'), ctrl.auditLog);
router.get('/system-logs', requirePermission('audit.view'), ctrl.systemLogs);
router.get('/login-history', ctrl.loginHistory);
router.get('/notifications', ctrl.notifications);
router.put('/notifications/:notificationId/read', ctrl.markRead);
router.post('/notifications/mark-all-read', ctrl.markAllRead);

module.exports = router;
