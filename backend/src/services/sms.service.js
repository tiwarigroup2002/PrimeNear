const config = require('../config');
const logger = require('../config/logger');

/**
 * SMS / WhatsApp sender. No gateway is wired yet: messages are logged.
 * Plug MSG91 / Twilio / Meta WhatsApp here using SMS_* env variables.
 */
function isConfigured() {
  return Boolean(config.sms.provider);
}

async function sendSms(mobileNumber, text) {
  if (!isConfigured()) {
    logger.info(`[sms:dev] to ${mobileNumber}: ${text}`);
    return { delivered: false };
  }
  // TODO: call the configured provider
  logger.warn(`SMS provider "${config.sms.provider}" not implemented; message to ${mobileNumber} not sent`);
  return { delivered: false };
}

module.exports = { isConfigured, sendSms };
