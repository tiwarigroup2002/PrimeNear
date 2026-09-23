const { Notification } = require('../models');
const logger = require('../config/logger');

/**
 * In-app notifications. SMS / WhatsApp / push delivery will be plugged in
 * here once gateway credentials are configured; for now they are logged.
 */
async function notifyAdmins({ title, message, type = 'Alert', link, data }) {
  return Notification.create({ recipientType: 'Admin', recipientId: null, title, message, type, link, data });
}

async function notifySeller(sellerId, { title, message, type = 'System', link, data }) {
  logger.debug(`[notify:seller ${sellerId}] ${title} - ${message}`);
  return Notification.create({ recipientType: 'Seller', recipientId: sellerId, title, message, type, link, data });
}

async function notifyUser(userId, { title, message, type = 'System', link, data }) {
  logger.debug(`[notify:user ${userId}] ${title} - ${message}`);
  return Notification.create({ recipientType: 'User', recipientId: userId, title, message, type, link, data });
}

module.exports = { notifyAdmins, notifySeller, notifyUser };
