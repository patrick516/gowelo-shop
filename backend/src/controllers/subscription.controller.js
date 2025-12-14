// src/controllers/subscription.controller.js (updated with service)
const subscriptionService = require('../services/subscription.service');

const subscriptionController = {
  // Get all subscription plans
  getSubscriptionPlans: async (req, res) => {
    try {
      const result = await subscriptionService.getAllPlans();
      res.json(result);
    } catch (error) {
      console.error('Get subscription plans error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch subscription plans'
      });
    }
  },

  // Create/update subscription plan (admin only)
  upsertSubscriptionPlan: async (req, res) => {
    try {
      const result = await subscriptionService.upsertPlan(
        req.body,
        req.user.userId,
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );
      res.json(result);
    } catch (error) {
      console.error('Upsert subscription plan error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to save subscription plan'
      });
    }
  },

  // Get vendor's current subscription
  getCurrentSubscription: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor profile not found'
        });
      }
      
      const result = await subscriptionService.getVendorSubscription(vendorId);
      res.json(result);
    } catch (error) {
      console.error('Get current subscription error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch subscription details'
      });
    }
  },

  // Get vendor's subscription history
  getSubscriptionHistory: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor profile not found'
        });
      }
      
      const result = await subscriptionService.getVendorSubscriptionHistory(vendorId, req.query);
      res.json(result);
    } catch (error) {
      console.error('Get subscription history error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch subscription history'
      });
    }
  },

  // Initiate subscription payment
  initiateSubscription: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor profile not found'
        });
      }
      
      const result = await subscriptionService.initiateVendorSubscription(
        vendorId,
        req.body,
        {
          userId: req.user.userId,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        }
      );
      res.json(result);
    } catch (error) {
      console.error('Initiate subscription error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to initiate subscription'
      });
    }
  },

  // Verify subscription payment (webhook)
  verifyPayment: async (req, res) => {
    try {
      const result = await subscriptionService.verifyPaymentWebhook(req.body);
      res.json(result);
    } catch (error) {
      console.error('Verify payment error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to verify payment'
      });
    }
  },

  // Cancel subscription
  cancelSubscription: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor profile not found'
        });
      }
      
      const result = await subscriptionService.cancelVendorSubscription(
        vendorId,
        req.params.subscriptionId,
        {
          userId: req.user.userId,
          reason: req.body.reason,
          notes: req.body.notes,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        }
      );
      res.json(result);
    } catch (error) {
      console.error('Cancel subscription error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to cancel subscription'
      });
    }
  },

  // Check trial status (for frontend)
  checkTrialStatus: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor profile not found'
        });
      }
      
      const result = await subscriptionService.checkVendorTrialStatus(vendorId);
      res.json(result);
    } catch (error) {
      console.error('Check trial status error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to check trial status'
      });
    }
  }
};

module.exports = subscriptionController;