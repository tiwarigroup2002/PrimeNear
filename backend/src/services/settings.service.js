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

/** Commission % applied to a seller (seller override or platform default). */
async function commissionRateFor(seller) {
  if (seller && seller.commissionRate !== null && seller.commissionRate !== undefined) return seller.commissionRate;
  const settings = await getSettings();
  return settings.commissionSettings.defaultCommission;
}

module.exports = { getSettings, invalidate, commissionRateFor };
