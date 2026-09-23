const router = require('express').Router();
const ctrl = require('../../controllers/admin/sellers.controller');
const validate = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/adminAuth');
const { imageUpload } = require('../../middleware/upload');
const { Joi, objectId, mobile } = require('../../validators/common');

const bankDetails = Joi.object({
  accountHolder: Joi.string().allow('').max(100),
  accountNumber: Joi.string().allow('').pattern(/^[0-9X]{6,20}$/).messages({ 'string.pattern.base': 'Account number must be 6-20 digits' }),
  ifscCode: Joi.string().allow('').pattern(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/).messages({ 'string.pattern.base': 'Invalid IFSC code' }),
  bankName: Joi.string().allow('').max(100),
});

const sellerFields = {
  shopName: Joi.string().trim().min(2).max(100),
  ownerName: Joi.string().trim().min(2).max(100),
  mobileNumber: mobile(),
  email: Joi.string().email().allow(''),
  tahsilId: objectId(),
  districtIds: Joi.array().items(objectId()).unique(),
  shopAddress: Joi.string().trim().min(5).max(300),
  gstNumber: Joi.string().allow('').uppercase().pattern(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/).messages({ 'string.pattern.base': 'Invalid GST number' }),
  bankDetails,
  upiId: Joi.string().allow('').pattern(/^[\w.-]+@[\w.-]+$/).messages({ 'string.pattern.base': 'Invalid UPI ID' }),
  commissionRate: Joi.number().min(0).max(100).allow(null),
  settings: Joi.object({
    enableDelivery: Joi.boolean(),
    deliveryCharge: Joi.number().min(0),
    freeDeliveryAbove: Joi.number().min(0),
    allowCashOnDelivery: Joi.boolean(),
  }),
};

const createSchema = Joi.object({
  ...sellerFields,
  shopName: sellerFields.shopName.required(),
  ownerName: sellerFields.ownerName.required(),
  mobileNumber: sellerFields.mobileNumber.required(),
  tahsilId: sellerFields.tahsilId.required(),
  shopAddress: sellerFields.shopAddress.required(),
  status: Joi.string().valid('Active', 'Blocked').default('Active'),
});

const reason = Joi.object({ reason: Joi.string().trim().min(3).max(500).required() });

router.get('/lookup', requirePermission('sellers.view', 'users.manage', 'orders.view', 'payments.view', 'products.view', 'reports.generate'), ctrl.lookup);
router.get('/', requirePermission('sellers.view'), ctrl.list);
router.post('/', requirePermission('sellers.manage'), validate(createSchema), ctrl.create);
router.get('/:sellerId', requirePermission('sellers.view'), ctrl.getOne);
router.put('/:sellerId', requirePermission('sellers.manage'), validate(Joi.object(sellerFields).min(1)), ctrl.update);
router.post('/:sellerId/image', requirePermission('sellers.manage'), imageUpload('sellers').single('image'), ctrl.uploadImage);
router.post('/:sellerId/block', requirePermission('sellers.manage'), validate(reason), ctrl.block);
router.post('/:sellerId/unblock', requirePermission('sellers.manage'), ctrl.unblock);
router.delete('/:sellerId', requirePermission('sellers.delete'), validate(Joi.object({ reason: Joi.string().allow('').max(500) })), ctrl.remove);
router.put('/:sellerId/commission', requirePermission('sellers.commission'), validate(Joi.object({ commissionRate: Joi.number().min(0).max(100).allow(null).required() })), ctrl.updateCommission);
router.put('/:sellerId/district-assignment', requirePermission('sellers.manage'), validate(Joi.object({ districtIds: Joi.array().items(objectId()).min(1).unique().required() })), ctrl.assignDistricts);
router.get('/:sellerId/products', requirePermission('sellers.view'), ctrl.products);
router.get('/:sellerId/orders', requirePermission('sellers.view'), ctrl.orders);
router.get('/:sellerId/customers', requirePermission('sellers.view'), ctrl.customers);
router.get('/:sellerId/payments', requirePermission('payments.view'), ctrl.payments);

module.exports = router;
