const router = require('express').Router();
const ctrl = require('../../controllers/admin/billing.controller');
const validate = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/adminAuth');
const { imageUpload } = require('../../middleware/upload');
const { Joi, objectId } = require('../../validators/common');

const view = requirePermission('billing.view', 'billing.manage');
const manage = requirePermission('billing.manage');
const str = (max = 300) => Joi.string().trim().allow('').max(max);
const kv = Joi.array().items(Joi.object({ label: str(60), value: str(200) })).max(20);

// ---- Bill design (template) ----
const templateSchema = Joi.object({
  company: Joi.object({ name: str(120), address: str(400), state: str(60), stateCode: str(4), gstin: str(20), pan: str(12), phone: str(40), email: str(120), website: str(120), logo: str(300) }),
  title: str(60),
  numberFormat: Joi.string().trim().max(60).pattern(/^[\w\s/{}.-]+$/).messages({ 'string.pattern.base': 'Number format may use letters, numbers, / - . and {FY} {YYYY} {MM} {SEQ}' }),
  seqPadding: Joi.number().integer().min(1).max(8),
  layout: Joi.object({
    style: Joi.string().valid('classic', 'modern', 'compact'),
    accentColor: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).messages({ 'string.pattern.base': 'Colour must look like #d70f64' }),
    logoPosition: Joi.string().valid('left', 'center', 'right'),
    fontSize: Joi.number().min(8).max(14),
    paperSize: Joi.string().valid('A4', 'Letter'),
  }),
  show: Joi.object().pattern(Joi.string(), Joi.boolean()),
  labels: Joi.object().pattern(Joi.string(), str(40)),
  bank: Joi.object({ accountName: str(120), accountNumber: str(30), ifsc: str(15), bankName: str(80), branch: str(80), upi: str(80) }),
  customFields: kv,
  defaults: Joi.object({ planName: str(120), hsn: str(12), taxRate: Joi.number().min(0).max(100), dueInDays: Joi.number().integer().min(0).max(365) }),
  notes: str(1000),
  terms: str(2000),
  footer: str(300),
  signatureLabel: str(60),
  signatureImage: str(300),
}).min(1);

router.get('/subscription-bills/template', view, ctrl.getTemplate);
router.put('/subscription-bills/template', manage, validate(templateSchema), ctrl.updateTemplate);
router.post('/subscription-bills/template/image', manage, imageUpload('billing', { maxSizeMb: 2 }).single('image'), ctrl.uploadTemplateImage);

// ---- Bills ----
const item = Joi.object({
  description: Joi.string().trim().min(1).max(300).required(),
  hsn: str(12),
  quantity: Joi.number().min(0).max(100000).default(1),
  rate: Joi.number().min(0).max(100000000).required(),
  discount: Joi.number().min(0).default(0),
  taxRate: Joi.number().min(0).max(100).default(0),
});
const billFields = {
  billTo: Joi.object({ name: str(120), ownerName: str(120), address: str(400), state: str(60), gstin: str(20), phone: str(40), email: str(120) }),
  planName: str(120),
  periodFrom: Joi.date().allow(null),
  periodTo: Joi.date().allow(null).min(Joi.ref('periodFrom')).messages({ 'date.min': 'Period end must be after the start' }),
  invoiceDate: Joi.date(),
  dueDate: Joi.date().allow(null),
  taxMode: Joi.string().valid('intra', 'inter', 'none'),
  placeOfSupply: str(60),
  items: Joi.array().items(item).max(50),
  notes: str(1000),
  terms: str(2000),
  customFields: kv,
};

router.get('/subscription-bills', view, validate(Joi.object({ status: Joi.string().valid('Draft', 'Issued', 'Paid', 'Cancelled').allow(''), sellerId: objectId().allow(''), search: str(80), from: Joi.date().allow(''), to: Joi.date().allow(''), page: Joi.number(), limit: Joi.number() }), 'query'), ctrl.list);
router.get('/subscription-bills/seller-info/:sellerId', view, ctrl.sellerInfo);
router.post('/subscription-bills', manage, validate(Joi.object({ ...billFields, sellerId: objectId().required(), items: billFields.items.min(1).required(), issue: Joi.boolean().default(false) })), ctrl.create);
router.get('/subscription-bills/:id', view, ctrl.getOne);
router.get('/subscription-bills/:id/pdf', view, ctrl.pdf);
router.put('/subscription-bills/:id', manage, validate(Joi.object(billFields).min(1)), ctrl.update);
router.post('/subscription-bills/:id/issue', manage, ctrl.issue);
router.post('/subscription-bills/:id/mark-paid', manage, validate(Joi.object({ paidAt: Joi.date(), paymentMethod: Joi.string().valid('Bank transfer', 'UPI', 'Cash', 'Cheque', 'Adjusted in payout', 'Other').required(), paymentRef: str(100) })), ctrl.markPaid);
router.post('/subscription-bills/:id/cancel', manage, validate(Joi.object({ reason: Joi.string().trim().min(3).max(300).required() })), ctrl.cancel);
router.delete('/subscription-bills/:id', manage, ctrl.remove);

module.exports = router;
