// src/routes/api/subscriptions.routes.js
const express = require('express');
const router = express.Router();
const subscriptionController = require('../../controllers/subscription.controller');
const { authenticate, authorize } = require('../../middleware/auth');

// Public routes
router.get('/plans', subscriptionController.getSubscriptionPlans);

// Vendor routes
router.get(
  '/me/current',
  authenticate,
  authorize(['VENDOR']),
  subscriptionController.getCurrentSubscription
);

router.get(
  '/me/history',
  authenticate,
  authorize(['VENDOR']),
  subscriptionController.getSubscriptionHistory
);

router.post(
  '/me/initiate',
  authenticate,
  authorize(['VENDOR']),
  subscriptionController.initiateSubscription
);

router.post(
  '/me/cancel/:subscriptionId',
  authenticate,
  authorize(['VENDOR']),
  subscriptionController.cancelSubscription
);

router.get(
  '/me/trial-status',
  authenticate,
  authorize(['VENDOR']),
  subscriptionController.checkTrialStatus
);

// Admin routes
router.post(
  '/plans',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  subscriptionController.upsertSubscriptionPlan
);

router.put(
  '/plans/:name',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  subscriptionController.upsertSubscriptionPlan
);

// Payment webhook (public - called by payment providers)
router.post(
  '/webhook/verify',
  subscriptionController.verifyPayment
);

module.exports = router;