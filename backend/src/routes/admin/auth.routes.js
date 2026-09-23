const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const config = require('../../config');
const ctrl = require('../../controllers/admin/auth.controller');
const validate = require('../../middleware/validate');
const { authenticateAdmin, authenticatePending2fa } = require('../../middleware/adminAuth');
const { imageUpload } = require('../../middleware/upload');
const { Joi, mobile, password } = require('../../validators/common');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later' },
});

const code = Joi.string().pattern(/^\d{6}$/).required().messages({ 'string.pattern.base': 'Code must be 6 digits' });

router.post('/login', authLimiter, validate(Joi.object({ email: Joi.string().email().required(), password: Joi.string().required() })), ctrl.login);
router.post('/verify-2fa', authLimiter, authenticatePending2fa, validate(Joi.object({ code })), ctrl.verify2fa);
router.post('/forgot-password', authLimiter, validate(Joi.object({ email: Joi.string().email().required() })), ctrl.forgotPassword);
router.post('/reset-password', authLimiter, validate(Joi.object({ token: Joi.string().required(), newPassword: password().required() })), ctrl.resetPassword);

router.use(authenticateAdmin);
router.post('/logout', ctrl.logout);
router.get('/me', ctrl.me);
router.put('/profile', validate(Joi.object({ fullName: Joi.string().min(2).max(80), mobileNumber: mobile().allow('') })), ctrl.updateProfile);
router.post('/profile/image', imageUpload('admins').single('image'), ctrl.uploadProfileImage);
router.put('/change-password', validate(Joi.object({ currentPassword: Joi.string().required(), newPassword: password().required() })), ctrl.changePassword);
router.post('/2fa/setup', ctrl.setup2fa);
router.post('/2fa/enable', validate(Joi.object({ code })), ctrl.enable2fa);
router.post('/2fa/disable', validate(Joi.object({ password: Joi.string().required() })), ctrl.disable2fa);

module.exports = router;
