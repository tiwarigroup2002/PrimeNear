const { PlatformSettings } = require('../models');

let cache = null;
let cachedAt = 0;
const TTL_MS = 30 * 1000;

async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < TTL_MS) return cache;
  cache = await PlatformSettings.getSettings();
  cachedAt = Date.now();
  return cache;
}

function invalidate() {
  cache = null;
}

/**
 * Platform cut is always 0. Online money still lands in the platform Razorpay
 * account and is paid to the shop in full later. The shop keeps every rupee.
 */
async function commissionRateFor() {
  return 0;
}

module.exports = { getSettings, invalidate, commissionRateFor };
