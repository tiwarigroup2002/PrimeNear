const fs = require('fs');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/respond');
const { getPagination, paginated } = require('../../utils/pagination');
const { Report, ReportSchedule } = require('../../models');
const analytics = require('../../services/analytics.service');
const { generateReport, MIME } = require('../../services/report.service');
const { nextRunDate } = require('../../jobs/scheduler');
const { audit } = require('../../services/audit.service');

const dashboard = async (req, res) => ok(res, await analytics.dashboard(req.query));
const revenue = async (req, res) => ok(res, await analytics.revenue(req.query));
const orders = async (req, res) => ok(res, await analytics.orders(req.query));
const users = async (req, res) => ok(res, await analytics.users(req.query));
const sellers = async (req, res) => ok(res, await analytics.sellers(req.query));
const products = async (req, res) => ok(res, await analytics.products(req.query));
const payments = async (req, res) => ok(res, await analytics.payments(req.query));

async function generate(req, res) {
  const report = await generateReport({ ...req.body, adminId: req.admin._id });
  await audit(req, { action: 'Generated', entityType: 'Report', entityId: report._id, details: `${report.reportType} (${report.format})` });
  return created(res, { report, reportUrl: `/api/admin/reports/${report._id}/download`, generatedAt: report.createdAt }, 'Report generated successfully');
}

async function listReports(req, res) {
  const p = getPagination(req.query);
  const filter = {};
  if (req.query.reportType) filter.reportType = req.query.reportType;
  const [items, total] = await Promise.all([
    Report.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('generatedBy', 'fullName').select('-filePath'),
    Report.countDocuments(filter),
  ]);
  return ok(res, paginated(items, total, p));
}

async function download(req, res) {
  const report = await Report.findById(req.params.reportId);
  if (!report || !fs.existsSync(report.filePath)) throw ApiError.notFound('Report file not found');
  res.setHeader('Content-Type', MIME[report.format]);
  res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
  fs.createReadStream(report.filePath).pipe(res);
}

async function removeReport(req, res) {
  const report = await Report.findById(req.params.reportId);
  if (!report) throw ApiError.notFound('Report not found');
  fs.rm(report.filePath, { force: true }, () => {});
  await report.deleteOne();
  return ok(res, null, 'Report deleted');
}

async function emailReport(req, res) {
  const report = await Report.findById(req.params.reportId);
  if (!report || !fs.existsSync(report.filePath)) throw ApiError.notFound('Report file not found');
  const { sendMail } = require('../../utils/mailer');
  const to = req.body.email || req.admin.email;
  await sendMail({
    to,
    subject: `${report.reportType} report`,
    text: `Please find the attached ${report.reportType} report.`,
    attachments: [{ filename: report.fileName, path: report.filePath }],
  });
  return ok(res, null, `Report sent to ${to}`);
}

async function listSchedules(_req, res) {
  const items = await ReportSchedule.find().sort({ createdAt: -1 }).populate('createdBy', 'fullName');
  return ok(res, { reports: items });
}

async function createSchedule(req, res) {
  const schedule = await ReportSchedule.create({ ...req.body, createdBy: req.admin._id, nextRunAt: nextRunDate(req.body.frequency) });
  await audit(req, { action: 'Scheduled', entityType: 'Report', entityId: schedule._id, newValue: schedule });
  return created(res, { scheduleId: schedule._id, schedule }, 'Report scheduled');
}

async function updateSchedule(req, res) {
  const schedule = await ReportSchedule.findById(req.params.scheduleId);
  if (!schedule) throw ApiError.notFound('Schedule not found');
  Object.assign(schedule, req.body);
  if (req.body.frequency) schedule.nextRunAt = nextRunDate(req.body.frequency);
  await schedule.save();
  return ok(res, schedule, 'Schedule updated');
}

async function deleteSchedule(req, res) {
  const schedule = await ReportSchedule.findByIdAndDelete(req.params.scheduleId);
  if (!schedule) throw ApiError.notFound('Schedule not found');
  await audit(req, { action: 'Deleted', entityType: 'ReportSchedule', entityId: schedule._id });
  return ok(res, null, 'Schedule deleted');
}

module.exports = {
  dashboard, revenue, orders, users, sellers, products, payments,
  generate, listReports, download, removeReport, emailReport,
  listSchedules, createSchedule, updateSchedule, deleteSchedule,
};
