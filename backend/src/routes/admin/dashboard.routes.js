// src/routes/admin/dashboard.routes.js
const express = require('express');
const router = express.Router();
const dashboardController = require('../../controllers/dashboard.controller');
const { authenticate, authorize } = require('../../middleware/auth');

// All routes require admin authentication
router.use(authenticate);
router.use(authorize(['ADMIN', 'SUPER_ADMIN']));

// Dashboard overview
router.get('/', dashboardController.getAdminDashboard);

// Platform analytics
router.get('/analytics', dashboardController.getPlatformAnalytics);

// Real-time data
router.get('/realtime', dashboardController.getRealtimeData);

// Vendor dashboard (admin view of vendor data)
router.get('/vendors/:id', async (req, res) => {
  // Admin view of vendor dashboard
  // You can call vendorController.getVendorStats with admin override
  res.json({ success: true, message: 'Vendor dashboard admin view' });
});

// Customer dashboard (admin view of customer data)
router.get('/customers/:id', async (req, res) => {
  // Admin view of customer dashboard
  res.json({ success: true, message: 'Customer dashboard admin view' });
});

module.exports = router;