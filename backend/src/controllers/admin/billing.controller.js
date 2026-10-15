const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/respond');
const { getPagination, paginated, searchRegex, dateRange } = require('../../utils/pagination');
const { fileUrl } = require('../../middleware/upload');
const { BillTemplate, SubscriptionInvoice, Seller } = require('../../models');
const { audit } = require('../../services/audit.service');
const { notifySeller } = require('../../services/notification.service');
const bills = require('../../services/subscription-bill.service');

// ---------- Bill design ----------
async function getTemplate(_req, res) {
  return ok(res, await BillTemplate.getDefault());
}

const SECTIONS = ['company', 'layout', 'show', 'labels', 'bank', 'defaults'];

/** PUT /subscription-bills/template - any part of the design (nested sections are merged) */
async function updateTemplate(req, res) {
  const t = await BillTemplate.getDefault();
  const before = t.toJSON();
  for (const [k, v] of Object.entries(req.body)) {
    if (SECTIONS.includes(k)) t[k] = { ...(t[k]?.toObject?.() || t[k] || {}), ...v };
    else t[k] = v;
  }
  await t.save();
  await audit(req, { action: 'Updated', entityType: 'BillTemplate', entityId: t._id, oldValue: before, newValue: t });
  return ok(res, t, 'Bill design saved');
}

/** POST /subscription-bills/template/image?kind=logo|signature */
async function uploadTemplateImage(req, res) {
  if (!req.file) throw ApiError.badRequest('Choose an image');
  const t = await BillTemplate.getDefault();
  const url = fileUrl('billing', req.file.filename);
  if (req.query.kind === 'signature') t.signatureImage = url;
  else t.company.logo = url;
  await t.save();
  return ok(res, t, 'Image uploaded');
}

// ---------- Bills ----------
async function findBill(id) {
  const q = mongoose.isValidObjectId(id) ? { _id: id } : { invoiceNumber: id };
  const inv = await SubscriptionInvoice.findOne(q).populate('sellerId', 'shopName ownerName mobileNumber status');
  if (!inv) throw ApiError.notFound('Bill not found');
  return inv;
}

/** Copies computed totals onto the bill document. */
function applyTotals(inv) {
  const t = bills.computeTotals(inv);
  inv.items = t.items;
  ['subtotal', 'discountTotal', 'cgstTotal', 'sgstTotal', 'igstTotal', 'roundOff', 'total', 'amountInWords'].forEach((k) => (inv[k] = t[k]));
}

async function list(req, res) {
  const p = getPagination(req.query);
  const q = req.validatedQuery || req.query;
  const filter = { ...dateRange(q, 'invoiceDate') };
  if (q.status) filter.status = q.status;
  if (q.sellerId) filter.sellerId = q.sellerId;
  if (q.search) {
    const rx = searchRegex(q.search);
    const sellerIds = await Seller.find({ shopName: rx }).distinct('_id');
    filter.$or = [{ invoiceNumber: rx }, { 'billTo.name': rx }, { sellerId: { $in: sellerIds } }, { planName: rx }];
  }
  const [items, total, sums] = await Promise.all([
    SubscriptionInvoice.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('sellerId', 'shopName mobileNumber').select('-templateSnapshot'),
    SubscriptionInvoice.countDocuments(filter),
    SubscriptionInvoice.aggregate([{ $group: { _id: '$status', amount: { $sum: '$total' }, count: { $sum: 1 } } }]),
  ]);
  const by = Object.fromEntries(sums.map((s) => [s._id, s]));
  return ok(res, paginated(items, total, p, {
    summary: {
      outstanding: by.Issued?.amount || 0,
      outstandingCount: by.Issued?.count || 0,
      paid: by.Paid?.amount || 0,
      paidCount: by.Paid?.count || 0,
      draftCount: by.Draft?.count || 0,
    },
  }));
}

/** GET /subscription-bills/:id - bill + the design to show it with */
async function getOne(req, res) {
  const inv = await findBill(req.params.id);
  const template = inv.templateSnapshot || (await BillTemplate.getDefault()).toJSON();
  return ok(res, { bill: inv, template });
}

/** GET /subscription-bills/seller-info/:sellerId - "Bill to" details and suggested GST mode */
async function sellerInfo(req, res) {
  const template = await BillTemplate.getDefault();
  const info = await bills.sellerBillTo(req.params.sellerId, template);
  if (!info) throw ApiError.notFound('Seller not found');
  const { seller, ...rest } = info;
  return ok(res, rest);
}

function billFields(body) {
  const pick = ['billTo', 'planName', 'periodFrom', 'periodTo', 'invoiceDate', 'dueDate', 'taxMode', 'placeOfSupply', 'items', 'notes', 'terms', 'customFields'];
  return Object.fromEntries(Object.entries(body).filter(([k]) => pick.includes(k)));
}

async function issueBill(inv, req) {
  const template = await BillTemplate.getDefault();
  if (!inv.items?.length) throw ApiError.badRequest('Add at least one line to the bill');
  inv.invoiceNumber = await bills.nextInvoiceNumber(template, inv.invoiceDate || new Date());
  inv.status = 'Issued';
  inv.issuedAt = new Date();
  inv.templateSnapshot = template.toJSON();
  await inv.save();
  await notifySeller(inv.sellerId._id || inv.sellerId, {
    title: `Subscription bill ${inv.invoiceNumber}`,
    message: `Amount ₹${inv.total}${inv.dueDate ? `, due by ${new Date(inv.dueDate).toLocaleDateString('en-IN')}` : ''}`,
    type: 'Billing',
    link: `/subscription-bills/${inv._id}`,
  });
  await audit(req, { action: 'Issued', entityType: 'SubscriptionInvoice', entityId: inv._id, details: `${inv.invoiceNumber} ₹${inv.total}` });
}

/** POST /subscription-bills { sellerId, ..., issue? } - always made by hand */
async function create(req, res) {
  const template = await BillTemplate.getDefault();
  const info = await bills.sellerBillTo(req.body.sellerId, template);
  if (!info) throw ApiError.badRequest('Seller not found');
  const fields = billFields(req.body);
  const invoiceDate = fields.invoiceDate ? new Date(fields.invoiceDate) : new Date();
  const inv = new SubscriptionInvoice({
    sellerId: info.seller._id,
    billTo: { ...info.billTo, ...(fields.billTo || {}) },
    planName: template.defaults?.planName,
    taxMode: info.taxMode,
    placeOfSupply: info.placeOfSupply,
    notes: template.notes,
    terms: template.terms,
    dueDate: new Date(invoiceDate.getTime() + (template.defaults?.dueInDays ?? 7) * 86400000),
    ...fields,
    invoiceDate,
    createdBy: req.admin._id,
  });
  applyTotals(inv);
  await inv.save();
  await audit(req, { action: 'Created', entityType: 'SubscriptionInvoice', entityId: inv._id, details: `Draft for ${info.seller.shopName}` });
  if (req.body.issue) await issueBill(await findBill(inv._id), req);
  const fresh = await findBill(inv._id);
  return created(res, fresh, req.body.issue ? `Bill ${fresh.invoiceNumber} issued` : 'Draft saved');
}

/** PUT /subscription-bills/:id - drafts can be edited fully */
async function update(req, res) {
  const inv = await findBill(req.params.id);
  if (inv.status !== 'Draft') throw ApiError.badRequest('Only draft bills can be edited. Cancel this bill and create a new one.');
  const fields = billFields(req.body);
  if (fields.billTo) fields.billTo = { ...(inv.billTo?.toObject?.() || inv.billTo || {}), ...fields.billTo };
  Object.assign(inv, fields);
  applyTotals(inv);
  await inv.save();
  return ok(res, inv, 'Draft saved');
}

async function issue(req, res) {
  const inv = await findBill(req.params.id);
  if (inv.status !== 'Draft') throw ApiError.badRequest(`Bill is already ${inv.status}`);
  await issueBill(inv, req);
  return ok(res, inv, `Bill ${inv.invoiceNumber} issued`);
}

async function markPaid(req, res) {
  const inv = await findBill(req.params.id);
  if (inv.status !== 'Issued') throw ApiError.badRequest('Only issued bills can be marked paid');
  inv.status = 'Paid';
  inv.paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();
  inv.paymentMethod = req.body.paymentMethod;
  inv.paymentRef = req.body.paymentRef;
  await inv.save();
  await notifySeller(inv.sellerId._id, { title: `Payment received for ${inv.invoiceNumber}`, message: `₹${inv.total} received. Thank you!`, type: 'Billing', link: `/subscription-bills/${inv._id}` });
  await audit(req, { action: 'Paid', entityType: 'SubscriptionInvoice', entityId: inv._id, details: `${inv.invoiceNumber} ${inv.paymentMethod || ''} ${inv.paymentRef || ''}` });
  return ok(res, inv, 'Marked as paid');
}

async function cancel(req, res) {
  const inv = await findBill(req.params.id);
  if (inv.status === 'Cancelled') throw ApiError.badRequest('Bill is already cancelled');
  if (inv.status === 'Draft') throw ApiError.badRequest('Delete the draft instead');
  inv.status = 'Cancelled';
  inv.cancelledAt = new Date();
  inv.cancelReason = req.body.reason;
  await inv.save();
  await audit(req, { action: 'Cancelled', entityType: 'SubscriptionInvoice', entityId: inv._id, details: `${inv.invoiceNumber}: ${req.body.reason}` });
  return ok(res, inv, 'Bill cancelled');
}

async function remove(req, res) {
  const inv = await findBill(req.params.id);
  if (inv.status !== 'Draft') throw ApiError.badRequest('Issued bills cannot be deleted; cancel them instead');
  await inv.deleteOne();
  return ok(res, null, 'Draft deleted');
}

async function pdf(req, res) {
  const inv = await findBill(req.params.id);
  const template = inv.templateSnapshot || (await BillTemplate.getDefault()).toJSON();
  bills.billPdf(inv, template, res);
}

module.exports = { getTemplate, updateTemplate, uploadTemplateImage, list, getOne, sellerInfo, create, update, issue, markPaid, cancel, remove, pdf };
