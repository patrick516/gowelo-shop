// src/routes/api/inventory.routes.js
const express = require('express');
const router = express.Router();
const productController = require('../../controllers/product.controller');
const { authenticate, authorize } = require('../../middleware/auth');

// Vendor inventory routes (all under /me for vendor's own inventory)
router.get(
  '/me/summary',
  authenticate,
  authorize(['VENDOR']),
  productController.getInventorySummary
);

router.get(
  '/me/movements',
  authenticate,
  authorize(['VENDOR']),
  productController.getStockMovements
);

router.get(
  '/me/reorder-suggestions',
  authenticate,
  authorize(['VENDOR']),
  productController.getReorderSuggestions
);

router.get(
  '/me/alerts',
  authenticate,
  authorize(['VENDOR']),
  productController.getInventoryAlerts
);

router.post(
  '/me/alerts/:alertId/resolve',
  authenticate,
  authorize(['VENDOR']),
  productController.resolveInventoryAlert
);

router.get(
  '/me/report',
  authenticate,
  authorize(['VENDOR']),
  productController.generateInventoryReport
);

// Admin inventory routes (for monitoring all vendors)
router.get(
  '/summary/all',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  productController.getAllVendorsInventorySummary
);

router.get(
  '/vendor/:vendorId/summary',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  productController.getVendorInventorySummary
);

router.get(
  '/vendor/:vendorId/movements',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  productController.getVendorStockMovements
);

router.get(
  '/vendor/:vendorId/alerts',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  productController.getVendorInventoryAlerts
);

module.exports = router;