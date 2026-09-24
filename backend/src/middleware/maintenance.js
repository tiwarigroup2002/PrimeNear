const { getSettings } = require('../services/settings.service');

/** Blocks seller / user app APIs while maintenance mode is on (admin panel unaffected). */
async function maintenanceGuard(_req, res, next) {
  const settings = await getSettings();
  if (settings.maintenanceMode) {
    return res.status(503).json({
      success: false,
      maintenance: true,
      message: settings.maintenanceMessage || 'We are doing some maintenance. Please try again later.',
    });
  }
  return next();
}

module.exports = { maintenanceGuard };
