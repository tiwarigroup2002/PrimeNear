const router = require('express').Router();
const ctrl = require('../../controllers/admin/catalog.controller');
const validate = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/adminAuth');
const { imageUpload } = require('../../middleware/upload');
const { Joi, objectId } = require('../../validators/common');

const icon = imageUpload('categories', { maxSizeMb: 2 }).single('icon');
const categoryFields = {
  name: Joi.string().trim().min(2).max(60),
  description: Joi.string().allow('').max(500),
  sortOrder: Joi.number().integer().min(0),
  isActive: Joi.boolean(),
};
const subFields = { name: Joi.string().trim().min(2).max(60), isActive: Joi.boolean() };

const anyCatalogView = requirePermission('categories.manage', 'products.view', 'sellers.view', 'analytics.view');

// Categories
router.get('/categories', anyCatalogView, ctrl.listCategories);
router.post('/categories', requirePermission('categories.manage'), icon, validate(Joi.object({ ...categoryFields, name: categoryFields.name.required() })), ctrl.createCategory);
router.put('/categories/:categoryId', requirePermission('categories.manage'), icon, validate(Joi.object(categoryFields)), ctrl.updateCategory);
router.delete('/categories/:categoryId', requirePermission('categories.manage'), ctrl.deleteCategory);
router.get('/categories/:categoryId/subcategories', anyCatalogView, ctrl.listSubCategories);
router.post('/categories/:categoryId/subcategories', requirePermission('categories.manage'), icon, validate(Joi.object({ ...subFields, name: subFields.name.required() })), ctrl.createSubCategory);
router.get('/subcategories', anyCatalogView, ctrl.listSubCategories);
router.put('/subcategories/:subCategoryId', requirePermission('categories.manage'), icon, validate(Joi.object(subFields)), ctrl.updateSubCategory);
router.delete('/subcategories/:subCategoryId', requirePermission('categories.manage'), ctrl.deleteSubCategory);

// Products
router.get('/products', requirePermission('products.view'), ctrl.listProducts);
router.get('/products/:productId', requirePermission('products.view'), ctrl.getProduct);
router.put(
  '/products/:productId',
  requirePermission('products.manage'),
  validate(Joi.object({
    name: Joi.string().trim().min(2).max(150),
    description: Joi.string().allow('').max(5000),
    categoryId: objectId(),
    subCategoryId: objectId().allow(null),
    mrp: Joi.number().min(0),
    sellingPrice: Joi.number().min(0),
    gstRate: Joi.number().min(0).max(100),
    stock: Joi.number().integer().min(0),
    lowStockThreshold: Joi.number().integer().min(0),
  }).min(1)),
  ctrl.updateProduct
);
router.post('/products/:productId/toggle-active', requirePermission('products.manage'), validate(Joi.object({ isActive: Joi.boolean().required(), reason: Joi.string().allow('').max(300) })), ctrl.toggleProduct);
router.put('/reviews/:reviewId/visibility', requirePermission('products.manage'), validate(Joi.object({ isHidden: Joi.boolean().required() })), ctrl.moderateReview);

module.exports = router;
