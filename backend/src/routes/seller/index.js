const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const config = require('../../config');
const validate = require('../../middleware/validate');
const { authenticateOwner, authenticateSeller } = require('../../middleware/sellerAuth');
const { maintenanceGuard } = require('../../middleware/maintenance');
const { imageUpload, csvUpload } = require('../../middleware/upload');
const { Joi, objectId, mobile } = require('../../validators/common');
const { CUSTOMER_TYPES, DISPUTE_CATEGORY, REPORT_FORMATS } = require('../../models/constants');

const auth = require('../../controllers/seller/auth.controller');
const dash = require('../../controllers/seller/dashboard.controller');
const profile = require('../../controllers/seller/profile.controller');
const products = require('../../controllers/seller/products.controller');
const inventory = require('../../controllers/seller/inventory.controller');
const customers = require('../../controllers/seller/customers.controller');
const orders = require('../../controllers/seller/orders.controller');
const insights = require('../../controllers/seller/insights.controller');
const engage = require('../../controllers/seller/engagement.controller');

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later' },
});

// ---------- Public ----------
router.get('/config', auth.publicConfig);
router.use(maintenanceGuard);
router.post('/auth/send-otp', otpLimiter, validate(Joi.object({ mobileNumber: mobile().required() })), auth.requestOtp);
router.post('/auth/verify-otp', otpLimiter, validate(Joi.object({ mobileNumber: mobile().required(), otp: Joi.string().pattern(/^\d{6}$/).required().messages({ 'string.pattern.base': 'OTP must be 6 digits' }) })), auth.verify);

// ---------- Owner (any shop of this mobile) ----------
router.get('/auth/shops', authenticateOwner, auth.listShops);
router.post('/auth/select-shop', authenticateOwner, validate(Joi.object({ shopId: objectId().required() })), auth.selectShop);
router.post('/sellers/switch-shop', authenticateOwner, validate(Joi.object({ shopId: objectId().required() })), auth.selectShop);

// ---------- Shop ----------
router.use(authenticateSeller);
router.get('/auth/me', auth.me);
router.post('/auth/logout', auth.logout);
router.get('/dashboard', dash.dashboard);

// Profile & settings
router.get('/settings', profile.getSettingsView);
router.put(
  '/settings',
  validate(Joi.object({
    enableDelivery: Joi.boolean(),
    deliveryCharge: Joi.number().min(0),
    freeDeliveryAbove: Joi.number().min(0),
    allowCashOnDelivery: Joi.boolean(),
    notifications: Joi.object({ push: Joi.boolean(), whatsapp: Joi.boolean(), sms: Joi.boolean() }),
  }).min(1)),
  profile.updateSettings
);
router.put(
  '/profile',
  validate(Joi.object({
    ownerName: Joi.string().trim().min(2).max(100),
    email: Joi.string().email().allow(''),
    shopAddress: Joi.string().trim().min(5).max(300),
    gstNumber: Joi.string().allow('').uppercase().pattern(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/).messages({ 'string.pattern.base': 'Invalid GST number' }),
  }).min(1)),
  profile.updateProfile
);
router.put(
  '/bank',
  validate(Joi.object({
    accountHolder: Joi.string().allow('').max(100),
    accountNumber: Joi.string().allow('').pattern(/^[0-9X]{6,20}$/).messages({ 'string.pattern.base': 'Account number must be 6-20 digits' }),
    ifscCode: Joi.string().allow('').pattern(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/).messages({ 'string.pattern.base': 'Invalid IFSC code' }),
    bankName: Joi.string().allow('').max(100),
    upiId: Joi.string().allow('').pattern(/^[\w.-]+@[\w.-]+$/).messages({ 'string.pattern.base': 'Invalid UPI ID' }),
  })),
  profile.updateBank
);
router.post('/profile/image', imageUpload('sellers').single('image'), profile.uploadImage);

// Catalogue
const productFields = {
  name: Joi.string().trim().min(2).max(150),
  categoryId: objectId(),
  subCategoryId: objectId().allow('', null),
  description: Joi.string().allow('').max(5000),
  mrp: Joi.number().min(0).allow(null, ''),
  costPrice: Joi.number().min(0).allow(null, ''),
  sellingPrice: Joi.number().min(0),
  gstRate: Joi.number().min(0).max(100),
  stock: Joi.number().integer().min(0),
  lowStockThreshold: Joi.number().integer().min(0).max(100000),
  sku: Joi.string().trim().allow('').max(40).pattern(/^[\w-]*$/).messages({ 'string.pattern.base': 'SKU can contain letters, numbers, - and _' }),
  isActive: Joi.boolean(),
  keepImages: Joi.string(),
};
// multipart sends '' for empty numbers; turn those into "not set"
const clean = (req, _res, next) => {
  ['mrp', 'costPrice', 'subCategoryId'].forEach((k) => { if (req.body[k] === '' || req.body[k] === 'null') req.body[k] = undefined; });
  next();
};
const productImages = imageUpload('products').array('images', 6);
router.get('/categories', products.categories);
router.get('/categories/:categoryId/subcategories', async (req, res) => {
  const { SubCategory } = require('../../models');
  res.json({ success: true, data: await SubCategory.find({ categoryId: req.params.categoryId, isActive: true }).sort({ name: 1 }) });
});
router.get('/products', products.list);
router.get('/products/search', products.quickSearch);
router.get('/products/bulk-upload/template', products.csvTemplate);
router.post('/products/bulk-upload', csvUpload.single('csvFile'), products.bulkUpload);
router.post('/products/bulk', validate(Joi.object({ ids: Joi.array().items(objectId()).min(1).max(500).required(), action: Joi.string().valid('activate', 'deactivate', 'delete', 'price').required(), percent: Joi.when('action', { is: 'price', then: Joi.number().min(-90).max(500).required() }) })), products.bulk);
router.post(
  '/products',
  productImages,
  clean,
  validate(Joi.object({ ...productFields, name: productFields.name.required(), categoryId: productFields.categoryId.required(), sellingPrice: productFields.sellingPrice.required(), gstRate: productFields.gstRate.default(0), stock: productFields.stock.default(0), isActive: productFields.isActive.default(true) })),
  products.create
);
router.get('/products/:productId', products.getOne);
router.put('/products/:productId', productImages, clean, validate(Joi.object(productFields)), products.update);
router.delete('/products/:productId', products.remove);
router.post('/products/:productId/toggle-active', validate(Joi.object({ isActive: Joi.boolean().required() })), products.toggle);
router.get('/products/:productId/barcode', products.barcode);
router.post('/products/generate-barcode/:productId', products.barcode);

// Inventory
router.get('/inventory', inventory.overview);
router.get('/inventory/low-stock', async (req, res, next) => { req.query.status = 'lowStock'; next(); }, products.list);
router.get('/inventory/history', inventory.history);
router.post(
  '/inventory/adjust-stock',
  validate(Joi.object({
    productId: objectId().required(),
    quantity: Joi.number().integer().required(),
    mode: Joi.string().valid('add', 'set').default('add'),
    reason: Joi.string().valid('Added', 'Damage', 'Return', 'Recount', 'Adjustment').default('Adjustment'),
    note: Joi.string().allow('').max(300),
  })),
  inventory.adjust
);

// Customers
const customerFields = { name: Joi.string().trim().max(80).allow(''), email: Joi.string().email().allow(''), address: Joi.string().allow('').max(300), customerType: Joi.string().valid(...CUSTOMER_TYPES) };
router.get('/customers', customers.list);
router.get('/customers/search', customers.quickSearch);
router.post('/customers', validate(Joi.object({ ...customerFields, mobileNumber: mobile().required(), customerType: customerFields.customerType.default('Retail') })), customers.create);
router.post('/customers/bulk-link', csvUpload.single('csvFile'), customers.bulkLink);
router.get('/customers/:customerId', customers.getOne);
router.put('/customers/:customerId', validate(Joi.object(customerFields).min(1)), customers.update);
router.delete('/customers/:customerId', customers.remove);

// Orders
router.get('/orders', orders.list);
router.post('/orders', validate(billSchema()), orders.createInvoice); // manual order / cash bill
router.get('/orders/:orderId', orders.getOne);
router.put('/orders/:orderId/status', validate(Joi.object({ status: Joi.string().valid('Confirmed', 'Packed', 'Shipped', 'Delivered').required(), note: Joi.string().allow('').max(300) })), orders.updateStatus);
router.post('/orders/:orderId/cancel', validate(Joi.object({ reason: Joi.string().trim().min(3).max(300).required() })), orders.cancel);
router.put('/orders/:orderId/add-note', validate(Joi.object({ note: Joi.string().trim().min(1).max(1000).required() })), orders.addNote);
router.get('/orders/:orderId/invoice', orders.orderInvoice);

// Bills / invoices
function billSchema() {
  return Joi.object({
    customerId: objectId().allow('', null),
    walkInName: Joi.string().allow('').max(80),
    walkInMobile: mobile().allow(''),
    items: Joi.array().items(Joi.object({ productId: objectId().required(), quantity: Joi.number().integer().min(1).max(100000).required() })).min(1).max(200).required(),
    paymentMethod: Joi.string().valid('Cash', 'Online').required(),
    discount: Joi.number().min(0).default(0),
    notes: Joi.string().allow('').max(500),
  });
}
router.post('/invoices/create', validate(billSchema()), orders.createInvoice);
router.post('/invoices', validate(billSchema()), orders.createInvoice);
router.get('/invoices', orders.listInvoices);
router.get('/invoices/:invoiceId', orders.getInvoice);
router.get('/invoices/:invoiceId/pdf', orders.invoicePdfDownload);
router.post('/invoices/:invoiceId/share', validate(Joi.object({ channel: Joi.string().valid('whatsapp', 'sms').required() })), orders.share);

// Analytics, earnings, payouts
router.get('/analytics/summary', insights.summary);
router.get('/analytics/sales-trend', insights.salesTrend);
router.get('/analytics/best-selling', insights.bestSelling);
router.get('/analytics/customer-analysis', insights.customerAnalysis);
router.post(
  '/analytics/export-report',
  validate(Joi.object({
    type: Joi.string().valid('Orders', 'Revenue', 'Products').default('Orders'),
    format: Joi.string().valid(...REPORT_FORMATS).required(),
    period: Joi.string().valid('today', 'week', 'month', 'quarter', 'year', 'all', 'custom').default('month'),
    from: Joi.date(),
    to: Joi.date(),
  })),
  insights.exportReport
);
router.get('/earnings', insights.earnings);
router.get('/payouts', insights.payouts);
router.get('/payouts/:payoutId', insights.payout);

// Notifications, reviews, support
router.get('/notifications', engage.notifications);
router.put('/notifications/:notificationId/read', engage.markRead);
router.post('/notifications/mark-all-read', engage.markAllRead);
router.get('/reviews', engage.reviews);
router.post('/reviews/:reviewId/respond', validate(Joi.object({ text: Joi.string().trim().min(1).max(1000).required() })), engage.respond);
router.get('/support', engage.tickets);
router.post(
  '/support',
  imageUpload('disputes').array('images', 4),
  validate(Joi.object({
    orderId: Joi.string().allow(''),
    title: Joi.string().trim().min(3).max(150).required(),
    description: Joi.string().trim().min(5).max(3000).required(),
    category: Joi.string().valid(...DISPUTE_CATEGORY).default('Other'),
    againstUser: Joi.boolean().default(false),
  })),
  engage.createTicket
);
router.get('/support/:ticketId', engage.ticket);
router.post('/support/:ticketId/comments', imageUpload('disputes').array('attachments', 4), engage.commentTicket);

module.exports = router;
