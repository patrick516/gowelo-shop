// src/routes/api/categories.routes.js
const express = require('express');
const router = express.Router();
const categoryController = require('../../controllers/category.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { uploadSingle } = require('../../config/multer');

// Public routes
router.get('/', categoryController.getAllCategories);
router.get('/tree', categoryController.getCategoryTree);
router.get('/popular', categoryController.getPopularCategories);
router.get('/search', categoryController.searchCategories);
router.get('/:id', categoryController.getCategory);

// Admin routes
router.post(
  '/',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  uploadSingle('image'),
  categoryController.createCategory
);

router.put(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  uploadSingle('image'),
  categoryController.updateCategory
);

router.delete(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  categoryController.deleteCategory
);

router.post(
  '/bulk-order',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  categoryController.bulkUpdateCategoryOrder
);

router.get(
  '/stats/all',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  categoryController.getCategoryStats
);

module.exports = router;