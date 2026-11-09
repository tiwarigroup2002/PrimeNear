const whatsappOtp = require('./whatsappOtp.service');
const config = require('../config');
const ApiError = require('../utils/ApiError');

const TEST_MOBILE = '7802807904';
const TEST_OTP = '2002';

/**
 * Creates and sends an OTP using WhatsApp Cloud API service.
 */
async function sendOtp(mobileNumber, purpose) {
  const result = await whatsappOtp.sendOtp(mobileNumber);
  return {
    expiresIn: result.expiresInSeconds || 300,
    resendIn: config.otp.resendCooldownSeconds || 60,
  };
}

/**
 * Verifies and consumes an OTP using WhatsApp Cloud API service.
 */
async function verifyOtp(mobileNumber, purpose, code) {
  // Test bypass
  if (mobileNumber === TEST_MOBILE && (code === TEST_OTP || code === '200200' || code === '002002')) {
    return true;
  }
  await whatsappOtp.verifyOtp(mobileNumber, code);
  return true;
}

module.exports = { sendOtp, verifyOtp };
