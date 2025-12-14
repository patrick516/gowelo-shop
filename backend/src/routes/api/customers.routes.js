// src/routes/api/customers.routes.js
const express = require('express');
const router = express.Router();
const customerController = require('../../controllers/customer.controller');
const { authenticate, authorize } = require('../../middleware/auth');

// Public routes (none - all customer routes require authentication)

// Customer routes (for own profile)
router.get(
  '/me',
  authenticate,
  authorize(['CUSTOMER']),
  (req, res) => customerController.getCustomer(req, res) // Get own profile
);

router.put(
  '/me',
  authenticate,
  authorize(['CUSTOMER']),
  (req, res) => customerController.updateCustomerProfile(req, res) // Update own profile
);

// Customer address management
router.get(
  '/me/addresses',
  authenticate,
  authorize(['CUSTOMER']),
  (req, res) => customerController.getCustomerAddresses(req, res)
);

router.post(
  '/me/addresses',
  authenticate,
  authorize(['CUSTOMER']),
  (req, res) => customerController.addCustomerAddress(req, res)
);

router.put(
  '/me/addresses/:addressId',
  authenticate,
  authorize(['CUSTOMER']),
  (req, res) => customerController.updateCustomerAddress(req, res)
);

router.delete(
  '/me/addresses/:addressId',
  authenticate,
  authorize(['CUSTOMER']),
  (req, res) => customerController.deleteCustomerAddress(req, res)
);

// Customer cart
router.get(
  '/me/cart',
  authenticate,
  authorize(['CUSTOMER']),
  (req, res) => customerController.getCustomerCart(req, res)
);

// Customer orders (already in orders.routes)

// Admin routes
router.get(
  '/',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  customerController.getAllCustomers
);

router.get(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  customerController.getCustomer
);

router.put(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  customerController.updateCustomerProfile
);

router.patch(
  '/:id/status',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  customerController.updateCustomerStatus
);

router.get(
  '/:id/orders',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  customerController.getCustomerOrders
);

router.get(
  '/:id/addresses',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  customerController.getCustomerAddresses
);

router.post(
  '/:id/addresses',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  customerController.addCustomerAddress
);

router.get(
  '/stats/all',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  customerController.getCustomerStats
);

router.get(
  '/export/all',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  customerController.exportCustomers
);

module.exports = router;