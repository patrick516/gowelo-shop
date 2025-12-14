// src/routes/admin/reports.routes.js
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth');
const adminReportController = require('../../controllers/admin/report.controller');

// All routes require admin authentication
router.use(authenticate);
router.use(authorize(['ADMIN', 'SUPER_ADMIN']));

// Sales reports
router.get('/sales', adminReportController.getSalesReport);
router.get('/vendors-performance', adminReportController.getVendorPerformanceReport);
router.get('/products-performance', adminReportController.getProductPerformanceReport);
router.get('/customer-analytics', adminReportController.getCustomerAnalyticsReport);
router.get('/subscriptions', adminReportController.getSubscriptionReport);
router.get('/inventory', adminReportController.getInventoryReport);
router.get('/export/comprehensive', adminReportController.getComprehensiveReport);

module.exports = router;