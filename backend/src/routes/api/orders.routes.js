// src/routes/api/orders.routes.js
const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/order.controller');
const { authenticate, authorize } = require('../../middleware/auth');

// Public routes (none - all order routes require authentication)

// Customer routes
router.post(
  '/',
  authenticate,
  authorize(['CUSTOMER']),
  orderController.createOrder
);

router.get(
  '/customer',
  authenticate,
  authorize(['CUSTOMER']),
  orderController.getCustomerOrders
);

router.get(
  '/customer/stats',
  authenticate,
  authorize(['CUSTOMER']),
  orderController.getOrderStats
);

// Vendor routes
router.get(
  '/vendor',
  authenticate,
  authorize(['VENDOR']),
  orderController.getVendorOrders
);

router.get(
  '/vendor/stats',
  authenticate,
  authorize(['VENDOR']),
  orderController.getOrderStats
);

// Shared routes (customer, vendor, admin can access their own orders)
router.get(
  '/:id',
  authenticate,
  orderController.getOrder
);

router.patch(
  '/:id/status',
  authenticate,
  orderController.updateOrderStatus
);

router.post(
  '/:id/cancel',
  authenticate,
  orderController.cancelOrder
);

// Admin routes
router.get(
  '/',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  orderController.getAllOrders
);

router.get(
  '/stats/all',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  orderController.getOrderStats
);

router.get(
  '/export/all',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  orderController.exportOrders
);

// Export for vendors
router.get(
  '/export/vendor',
  authenticate,
  authorize(['VENDOR']),
  orderController.exportOrders
);

module.exports = router;