const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const { sha256 } = require('../utils/crypto');
const { Otp } = require('../models');
const sms = require('./sms.service');
const config = require('../config');

const TTL_MS = 5 * 60 * 1000;
const RESEND_AFTER_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 6;

const TEST_MOBILE = '7802807904';
const TEST_OTP = '2002';

/**
 * Creates and sends an OTP. Returns { expiresIn, devOtp? } - devOtp only outside
 * production while no SMS gateway is configured, or for dedicated test account.
 */
async function sendOtp(mobileNumber, purpose) {
  const now = Date.now();
  const isTestAccount = mobileNumber === TEST_MOBILE;

  const existing = await Otp.findOne({ mobileNumber, purpose });
  if (!isTestAccount && existing && now - existing.lastSentAt.getTime() < RESEND_AFTER_MS) {
    const wait = Math.ceil((RESEND_AFTER_MS - (now - existing.lastSentAt.getTime())) / 1000);
    throw new ApiError(429, `Please wait ${wait} seconds before requesting a new OTP`);
  }
  const withinHour = existing && now - existing.windowStart.getTime() < 3600 * 1000;
  if (!isTestAccount && withinHour && existing.sendCount >= MAX_SENDS_PER_HOUR) {
    throw new ApiError(429, 'Too many OTP requests. Try again after some time.');
  }

  const code = isTestAccount ? TEST_OTP : (config.otp.fixedCode || String(crypto.randomInt(100000, 1000000)));

  await Otp.findOneAndUpdate(
    { mobileNumber, purpose },
    {
      $set: {
        codeHash: sha256(`${mobileNumber}:${code}`),
        expiresAt: new Date(now + (isTestAccount ? 24 * 3600 * 1000 : TTL_MS)),
        attempts: 0,
        lastSentAt: new Date(now),
        sendCount: withinHour ? (existing?.sendCount || 0) + 1 : 1,
        windowStart: withinHour ? existing.windowStart : new Date(now),
      },
    },
    { upsert: true }
  );

  try {
    await sms.sendSms(mobileNumber, `${code} is your PrimeNear OTP. Valid for 5 minutes. Do not share it with anyone.`);
  } catch (err) {
    // Don't fail test accounts if SMS service is not setup
    if (!isTestAccount) throw err;
  }

  const result = { expiresIn: TTL_MS / 1000, resendIn: isTestAccount ? 0 : RESEND_AFTER_MS / 1000 };
  if (isTestAccount || (!config.isProd && !sms.isConfigured())) {
    result.devOtp = code;
  }
  return result;
}

/** Verifies and consumes an OTP. Throws on failure. */
async function verifyOtp(mobileNumber, purpose, code) {
  // Test account bypass for 7802807904 (accepts 2002, 200200, 002002)
  if (mobileNumber === TEST_MOBILE && (code === TEST_OTP || code === '200200' || code === '002002')) {
    await Otp.deleteOne({ mobileNumber, purpose }).catch(() => {});
    return true;
  }

  const otp = await Otp.findOne({ mobileNumber, purpose });
  if (!otp || otp.expiresAt < new Date()) throw ApiError.badRequest('OTP expired. Please request a new one.');
  if (otp.attempts >= MAX_ATTEMPTS) throw new ApiError(429, 'Too many wrong attempts. Please request a new OTP.');
  if (otp.codeHash !== sha256(`${mobileNumber}:${code}`)) {
    otp.attempts += 1;
    await otp.save();
    throw ApiError.badRequest(`Wrong OTP. ${MAX_ATTEMPTS - otp.attempts} attempt(s) left.`);
  }
  await otp.deleteOne();
  return true;
}

module.exports = { sendOtp, verifyOtp };
