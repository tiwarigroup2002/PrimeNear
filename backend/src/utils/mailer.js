const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../config/logger');

let transporter;
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

/**
 * Sends an email. When SMTP is not configured the mail is only logged,
 * which keeps local development working without credentials.
 */
async function sendMail({ to, subject, html, text, attachments }) {
  if (!transporter) {
    logger.info(`[mail:dev] To: ${to} | Subject: ${subject}\n${text || html}`);
    return { delivered: false };
  }
  await transporter.sendMail({ from: config.smtp.from, to, subject, html, text, attachments });
  return { delivered: true };
}

module.exports = { sendMail };
