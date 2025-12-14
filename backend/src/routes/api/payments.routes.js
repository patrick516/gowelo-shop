// src/routes/api/payments.routes.js
const express = require('express');
const router = express.Router();
const paymentController = require('../../controllers/payment.controller');
const { authenticate, authorize } = require('../../middleware/auth');

// Public routes (for webhooks)
router.post('/webhook/:provider', paymentController.mobileMoneyWebhook);

// Customer routes
router.post(
  '/initiate',
  authenticate,
  authorize(['CUSTOMER']),
  paymentController.initiateOrderPayment
);

router.get(
  '/history',
  authenticate,
  authorize(['CUSTOMER']),
  paymentController.getPaymentHistory
);

router.get(
  '/methods',
  authenticate,
  authorize(['CUSTOMER', 'VENDOR', 'ADMIN', 'SUPER_ADMIN']),
  paymentController.getPaymentMethods
);

// Shared routes
router.get(
  '/status/:transactionId',
  authenticate,
  paymentController.checkPaymentStatus
);

// Vendor routes
router.get(
  '/vendor/summary',
  authenticate,
  authorize(['VENDOR']),
  paymentController.getTransactionSummary
);

// Admin routes
router.get(
  '/admin/summary',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  paymentController.getTransactionSummary
);

router.post(
  '/refund/:paymentId',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN', 'VENDOR']),
  paymentController.processRefund
);

// Payment verification (for testing)
router.post(
  '/verify',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  paymentController.verifyPayment
);

module.exports = router;