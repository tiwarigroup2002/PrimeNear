const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const config = require('../../config');
const validate = require('../../middleware/validate');
const { authenticateUser } = require('../../middleware/userAuth');
const { maintenanceGuard } = require('../../middleware/maintenance');
const { imageUpload } = require('../../middleware/upload');
const { Joi, objectId, mobile } = require('../../validators/common');
const { DISPUTE_CATEGORY } = require('../../models/constants');
const account = require('../../controllers/user/account.controller');
const catalog = require('../../controllers/user/catalog.controller');
const shop = require('../../controllers/user/shopping.controller');

const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.isTest ? 1000 : 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many attempts, please try again later' } });

router.get('/config', account.publicConfig);
router.use(maintenanceGuard);
router.post('/auth/login', otpLimiter, validate(Joi.object({ mobileNumber: mobile().required() })), account.requestOtp);
router.post('/auth/send-otp', otpLimiter, validate(Joi.object({ mobileNumber: mobile().required() })), account.requestOtp);
router.post('/auth/verify-otp', otpLimiter, validate(Joi.object({ mobileNumber: mobile().required(), otp: Joi.string().pattern(/^\d{6}$/).required().messages({ 'string.pattern.base': 'OTP must be 6 digits' }) })), account.verify);

router.use(authenticateUser);

// Account
router.get('/auth/me', account.me);
router.post('/auth/logout', account.logout);
router.get('/profile', account.me);
router.put('/profile', validate(Joi.object({ name: Joi.string().trim().min(2).max(80), email: Joi.string().email().allow(''), dateOfBirth: Joi.date().max('now').allow(null), gender: Joi.string().valid('Male', 'Female', 'Other') }).min(1)), account.updateProfile);
router.post('/profile/upload-image', imageUpload('users', { maxSizeMb: 3 }).single('image'), account.uploadImage);
router.put('/profile/preferences', validate(Joi.object({ language: Joi.string().valid('hi', 'en'), theme: Joi.string().valid('light', 'dark'), pushNotifications: Joi.boolean(), emailNotifications: Joi.boolean(), smsNotifications: Joi.boolean(), whatsappNotifications: Joi.boolean() }).min(1)), account.updatePreferences);
router.get('/dashboard', shop.dashboard);
router.get('/pincode/:pincode', validate(Joi.object({ pincode: Joi.string().pattern(/^\d{6}$/).required().messages({ 'string.pattern.base': 'PIN code must be 6 digits' }) }), 'params'), account.pincodeInfo);

// State, district and taluka come from the PIN code
const address = {
  type: Joi.string().valid('Home', 'Work', 'Other'),
  name: Joi.string().trim().max(80).allow(''),
  fullAddress: Joi.string().trim().min(5).max(300),
  city: Joi.string().trim().max(60).allow(''),
  zipCode: Joi.string().pattern(/^\d{6}$/).messages({ 'string.pattern.base': 'PIN code must be 6 digits', 'any.required': 'PIN code is required' }),
  phoneNumber: mobile().allow(''),
  isDefault: Joi.boolean(),
};
router.get('/addresses', account.listAddresses);
router.post('/addresses', validate(Joi.object({ ...address, fullAddress: address.fullAddress.required(), zipCode: address.zipCode.required(), type: address.type.default('Home') })), account.addAddress);
router.put('/addresses/:addressId', validate(Joi.object(address).min(1)), account.updateAddress);
router.delete('/addresses/:addressId', account.deleteAddress);
router.post('/addresses/:addressId/set-default', account.setDefaultAddress);

router.get('/notifications', account.notifications);
router.put('/notifications/:notificationId/mark-read', account.markRead);
router.post('/notifications/mark-all-read', account.markAllRead);
router.delete('/notifications/:notificationId', account.deleteNotification);

// Shops & catalogue
router.get('/home', catalog.home);
router.get('/sellers', catalog.sellers);
router.post('/sellers/switch', validate(Joi.object({ sellerId: objectId().required() })), catalog.switchSeller);
router.get('/sellers/:sellerId/profile', catalog.sellerProfile);
router.get('/sellers/:sellerId/reviews', catalog.sellerReviews);
router.get('/categories', catalog.categories);
router.get('/products', catalog.products);
router.get('/products/search', catalog.products);
router.get('/products/:productId', catalog.product);
router.get('/wishlist', catalog.wishlist);
router.post('/wishlist/add', validate(Joi.object({ productId: objectId().required() })), catalog.addWishlist);
router.delete('/wishlist/:productId', catalog.removeWishlist);

// Cart
router.get('/cart', shop.getCart);
router.post('/cart/add-item', validate(Joi.object({ productId: objectId().required(), variantId: objectId().allow(null), quantity: Joi.number().integer().min(1).max(100).default(1) })), shop.addItem);
router.put('/cart/update-item', validate(Joi.object({ productId: objectId().required(), variantId: objectId().allow(null), quantity: Joi.number().integer().min(0).max(100).required() })), shop.updateItem);
router.delete('/cart/remove-item/:productId', shop.removeItem);
router.post('/cart/clear', shop.clearCart);

// Orders
router.post(
  '/orders/create',
  validate(Joi.object({
    deliveryType: Joi.string().valid('Delivery', 'Pickup').default('Delivery'),
    deliveryAddressId: objectId(),
    addressId: objectId(),
    billingAddressId: objectId(),
    paymentMethod: Joi.string().valid('Online', 'Cash').required(),
    notes: Joi.string().allow('').max(500),
  })),
  shop.createOrder
);
router.post('/orders/check-delivery', validate(Joi.object({ addressId: objectId().required() })), shop.checkDelivery);
router.post('/orders/verify-payment', validate(Joi.object({ orderId: Joi.string().required(), razorpayOrderId: Joi.string(), razorpayPaymentId: Joi.string(), razorpaySignature: Joi.string(), method: Joi.string(), mock: Joi.boolean() })), shop.verifyPayment);
router.get('/orders', shop.listOrders);
router.get('/orders/:orderId', shop.getOrder);
router.post('/orders/:orderId/payment-failed', validate(Joi.object({ reason: Joi.string().allow('').max(200) })), shop.paymentFailed);
router.post('/orders/:orderId/retry-payment', shop.retryPayment);
router.post('/orders/:orderId/cancel', validate(Joi.object({ reason: Joi.string().trim().min(3).max(300).required() })), shop.cancel);
router.post('/orders/:orderId/return', imageUpload('returns').array('images', 4), validate(Joi.object({ reason: Joi.string().trim().min(3).max(200).required(), description: Joi.string().allow('').max(1000) })), shop.returnRequest);
router.get('/orders/:orderId/return-status', shop.returnStatus);
router.post('/orders/:orderId/track', shop.track);
router.get('/orders/:orderId/track', shop.track);
router.post('/orders/:orderId/reorder', shop.reorder);
router.get('/orders/:orderId/reviews', shop.orderReviews);
router.get('/orders/:orderId/invoice', shop.orderInvoice);

// Reviews
const stars = Joi.number().integer().min(1).max(5);
router.post(
  '/reviews',
  imageUpload('reviews').array('images', 3),
  (req, _res, next) => {
    // multipart sends the structured part as JSON in "payload"
    if (typeof req.body.payload === 'string') {
      try { Object.assign(req.body, JSON.parse(req.body.payload)); } catch { /* validated below */ }
    }
    next();
  },
  validate(Joi.object({
    orderId: Joi.string().required(),
    seller: Joi.object({ rating: stars, reviewText: Joi.string().allow('').max(1000) }),
    products: Joi.array().items(Joi.object({ productId: objectId().required(), rating: stars, reviewText: Joi.string().allow('').max(1000) })).max(50),
  })),
  shop.submitReviews
);

// Invoices
router.get('/invoices', shop.invoices);
router.get('/invoices/:invoiceId', shop.invoice);
router.get('/invoices/:invoiceId/download', shop.invoiceDownload);
router.post('/invoices/:invoiceId/download', shop.invoiceDownload);

// Help & support
router.get('/support', shop.tickets);
router.post(
  '/support',
  imageUpload('disputes').array('images', 4),
  validate(Joi.object({ orderId: Joi.string().allow(''), title: Joi.string().trim().min(3).max(150).required(), description: Joi.string().trim().min(5).max(3000).required(), category: Joi.string().valid(...DISPUTE_CATEGORY).default('Other') })),
  shop.createTicket
);
router.get('/support/:ticketId', shop.ticket);
router.post('/support/:ticketId/comments', imageUpload('disputes').array('attachments', 4), shop.commentTicket);

module.exports = router;
