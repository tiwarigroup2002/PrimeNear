const router = require('express').Router();
const { authenticateAdmin } = require('../../middleware/adminAuth');
const { publicConfig } = require('../../controllers/admin/auth.controller');

// Public
router.get('/public-config', publicConfig);
router.use('/auth', require('./auth.routes'));

// Everything below requires a logged in admin
router.use(authenticateAdmin);
router.use('/admins', require('./admins.routes'));
router.use('/', require('./payments.routes')); // before /sellers so /sellers/:id/earnings matches
router.use('/sellers', require('./sellers.routes'));
router.use('/users', require('./users.routes'));
router.use('/orders', require('./orders.routes'));
router.use('/disputes', require('./disputes.routes'));
router.use('/locations', require('./locations.routes'));
router.use('/settings', require('./settings.routes'));
router.use('/', require('./catalog.routes'));
router.use('/', require('./analytics.routes'));
router.use('/', require('./logs.routes'));
router.use('/', require('./billing.routes'));

module.exports = router;
