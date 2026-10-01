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

/**
 * Creates and sends an OTP. Returns { expiresIn, devOtp? } - devOtp only outside
 * production while no SMS gateway is configured, so the apps can be tested.
 */
async function sendOtp(mobileNumber, purpose) {
  const now = Date.now();
  const existing = await Otp.findOne({ mobileNumber, purpose });
  if (existing && now - existing.lastSentAt.getTime() < RESEND_AFTER_MS) {
    const wait = Math.ceil((RESEND_AFTER_MS - (now - existing.lastSentAt.getTime())) / 1000);
    throw new ApiError(429, `Please wait ${wait} seconds before requesting a new OTP`);
  }
  const withinHour = existing && now - existing.windowStart.getTime() < 3600 * 1000;
  if (withinHour && existing.sendCount >= MAX_SENDS_PER_HOUR) throw new ApiError(429, 'Too many OTP requests. Try again after some time.');

  const code = config.otp.fixedCode || String(crypto.randomInt(100000, 1000000));
  await Otp.findOneAndUpdate(
    { mobileNumber, purpose },
    {
      $set: {
        codeHash: sha256(`${mobileNumber}:${code}`),
        expiresAt: new Date(now + TTL_MS),
        attempts: 0,
        lastSentAt: new Date(now),
        sendCount: withinHour ? existing.sendCount + 1 : 1,
        windowStart: withinHour ? existing.windowStart : new Date(now),
      },
    },
    { upsert: true }
  );

  await sms.sendSms(mobileNumber, `${code} is your PrimeNear OTP. Valid for 5 minutes. Do not share it with anyone.`);
  const result = { expiresIn: TTL_MS / 1000, resendIn: RESEND_AFTER_MS / 1000 };
  if (!config.isProd && !sms.isConfigured()) result.devOtp = code;
  return result;
}

/** Verifies and consumes an OTP. Throws on failure. */
async function verifyOtp(mobileNumber, purpose, code) {
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
