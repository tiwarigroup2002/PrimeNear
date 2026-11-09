const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const otpController = require('../controllers/otp.controller');

// Per-IP rate limiting on both endpoints as requested
const ipSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many OTP requests from this IP address. Please try again after a minute.',
  },
});

const ipVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many verification attempts from this IP address. Please try again later.',
  },
});

// 1) POST /auth/otp/send   body: { phone }
router.post('/send', ipSendLimiter, otpController.send);
router.post('/otp/send', ipSendLimiter, otpController.send);

// 2) POST /auth/otp/verify body: { phone, otp }
router.post('/verify', ipVerifyLimiter, otpController.verify);
router.post('/otp/verify', ipVerifyLimiter, otpController.verify);

module.exports = router;

