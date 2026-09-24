const cron = require('node-cron');
const config = require('../config');
const logger = require('../config/logger');
const { ReportSchedule, Admin } = require('../models');
const { sendMail } = require('../utils/mailer');

/** Next run for a frequency, at 07:00 IST. */
function nextRunDate(frequency, from = new Date()) {
  const next = new Date(from);
  next.setUTCHours(1, 30, 0, 0); // 07:00 IST
  if (next <= from) next.setUTCDate(next.getUTCDate() + 1);
  if (frequency === 'Weekly') {
    while (next.getUTCDay() !== 1) next.setUTCDate(next.getUTCDate() + 1); // Monday
  } else if (frequency === 'Monthly') {
    while (next.getUTCDate() !== 1) next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

const PERIOD_FOR = { Daily: 'today', Weekly: 'week', Monthly: 'month' };

async function runDueSchedules() {
  const { generateReport } = require('../services/report.service');
  const due = await ReportSchedule.find({ isActive: true, nextRunAt: { $lte: new Date() } });
  for (const schedule of due) {
    try {
      const report = await generateReport({
        reportType: schedule.reportType,
        format: schedule.format,
        period: PERIOD_FOR[schedule.frequency],
        adminId: schedule.createdBy,
        scheduleId: schedule._id,
      });
      await sendMail({
        to: schedule.recipients.join(','),
        subject: `${schedule.frequency} ${schedule.reportType} report`,
        text: `Attached is your ${schedule.frequency.toLowerCase()} ${schedule.reportType} report (${report.rowCount} rows).`,
        attachments: [{ filename: report.fileName, path: report.filePath }],
      });
      logger.info(`Scheduled report ${schedule._id} sent to ${schedule.recipients.join(', ')}`);
    } catch (err) {
      logger.error(`Scheduled report ${schedule._id} failed: ${err.message}`);
    }
    schedule.lastRunAt = new Date();
    schedule.nextRunAt = nextRunDate(schedule.frequency);
    await schedule.save();
  }
}

/** Daily digest for super admins (revenue, orders, alerts). */
async function sendDailyDigest() {
  const analytics = require('../services/analytics.service');
  const data = await analytics.dashboard({});
  const admins = await Admin.find({ role: 'SuperAdmin', isActive: true, isDeleted: false }).select('email');
  if (!admins.length) return;
  const lines = [
    `Today so far: ${data.today.orders} orders, ₹${data.today.revenue} revenue`,
    `New users: ${data.today.newUsers}, new sellers: ${data.today.newSellers}`,
    `Pending payouts: ₹${data.stats.pendingPayouts}`,
    '',
    'Alerts:',
    ...(data.alerts.length ? data.alerts.map((a) => `- [${a.level}] ${a.message}`) : ['- none']),
  ];
  await sendMail({ to: admins.map((a) => a.email).join(','), subject: 'PrimeNear daily summary', text: lines.join('\n') });
}

let started = false;
function startScheduler() {
  if (started || config.isTest) return;
  started = true;
  cron.schedule('*/15 * * * *', () => runDueSchedules().catch((e) => logger.error(e)));
  cron.schedule('*/5 * * * *', () => require('../services/checkout.service').expireUnpaidOrders().catch((e) => logger.error(e)));
  cron.schedule('0 21 * * *', () => sendDailyDigest().catch((e) => logger.error(e)), { timezone: 'Asia/Kolkata' });
  logger.info('Background scheduler started');
}

module.exports = { startScheduler, runDueSchedules, nextRunDate, sendDailyDigest };
