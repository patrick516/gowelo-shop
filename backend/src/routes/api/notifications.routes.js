// src/routes/api/notifications.routes.js
const express = require('express');
const router = express.Router();
const notificationController = require('../../controllers/notification.controller');
const { authenticate, authorize } = require('../../middleware/auth');

// User routes (customers and vendors)
router.get(
  '/',
  authenticate,
  notificationController.getUserNotifications
);

router.patch(
  '/:id/read',
  authenticate,
  notificationController.markAsRead
);

router.patch(
  '/read-all',
  authenticate,
  notificationController.markAllAsRead
);

router.delete(
  '/:id',
  authenticate,
  notificationController.deleteNotification
);

// Admin routes
router.post(
  '/',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  notificationController.createNotification
);

router.post(
  '/bulk',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  notificationController.sendBulkNotification
);

router.post(
  '/subscription-reminders',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  notificationController.sendSubscriptionReminder
);

router.get(
  '/templates',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  notificationController.getTemplates
);

module.exports = router;