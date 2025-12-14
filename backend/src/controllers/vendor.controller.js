// src/controllers/vendor.controller.js (Updated to use service)
const vendorService = require('../services/vendor.service');
const notificationService = require('../services/notification.service');

const vendorController = {
  // Get all vendors (admin only)
  getAllVendors: async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        status, 
        search,
        region,
        city,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const filters = {
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        search,
        region,
        city,
        sortBy,
        sortOrder
      };

      const result = await vendorService.getAllVendors(filters);

      res.json({
        success: true,
        data: result.vendors,
        pagination: result.pagination
      });

    } catch (error) {
      console.error('Get vendors error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch vendors'
      });
    }
  },

  // Get single vendor
  getVendor: async (req, res) => {
    try {
      const { id } = req.params;
      const vendor = await vendorService.getVendorById(id);

      res.json({
        success: true,
        data: vendor
      });

    } catch (error) {
      console.error('Get vendor error:', error);
      if (error.message === 'Vendor not found') {
        return res.status(404).json({
          success: false,
          message: 'Vendor not found'
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to fetch vendor'
      });
    }
  },

  // Get vendor's own profile
  getMyVendorProfile: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      const userId = req.user.userId;
      
      const vendor = await vendorService.getMyVendorProfile(vendorId, userId);

      res.json({
        success: true,
        data: vendor
      });

    } catch (error) {
      console.error('Get my vendor profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch vendor profile'
      });
    }
  },

  // Update vendor profile
  updateVendorProfile: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      const updates = req.body;

      const vendor = await vendorService.updateVendorProfile(vendorId, updates);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: vendor
      });

    } catch (error) {
      console.error('Update vendor profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update profile'
      });
    }
  },

  // Update vendor status (admin only)
  updateVendorStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;
      const adminId = req.user.userId;

      const vendor = await vendorService.updateVendorStatus(id, status, reason, adminId);

      res.json({
        success: true,
        message: `Vendor status updated to ${status}`,
        data: vendor
      });

    } catch (error) {
      console.error('Update vendor status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update vendor status'
      });
    }
  },

  // Get vendor statistics
  getVendorStats: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      const stats = await vendorService.getVendorStats(vendorId);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Get vendor stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch vendor statistics'
      });
    }
  },

  // Get vendor's products
  getVendorProducts: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      const { 
        page = 1, 
        limit = 20, 
        status,
        category,
        search,
        cropType,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const filters = {
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        category,
        search,
        cropType,
        sortBy,
        sortOrder
      };

      const result = await vendorService.getVendorProducts(vendorId, filters);

      res.json({
        success: true,
        data: result.products,
        pagination: result.pagination
      });

    } catch (error) {
      console.error('Get vendor products error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch products'
      });
    }
  },

  // Get vendor's orders
  getVendorOrders: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      const { 
        page = 1, 
        limit = 20, 
        status,
        startDate,
        endDate,
        search,
        cropType,
        region,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const filters = {
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        startDate,
        endDate,
        search,
        cropType,
        region,
        sortBy,
        sortOrder
      };

      const result = await vendorService.getVendorOrders(vendorId, filters);

      res.json({
        success: true,
        data: result.orders,
        pagination: result.pagination
      });

    } catch (error) {
      console.error('Get vendor orders error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch orders'
      });
    }
  },

  // ========== AGRO-SPECIFIC ENDPOINTS ==========

  // Get agro-dealers by specialization
  getAgroDealersBySpecialization: async (req, res) => {
    try {
      const { specialization, region } = req.query;
      const dealers = await vendorService.getAgroDealersBySpecialization(specialization, region);

      res.json({
        success: true,
        data: dealers
      });

    } catch (error) {
      console.error('Get agro dealers error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch agro dealers'
      });
    }
  },

  // Get dealer performance comparison
  getDealerPerformanceComparison: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      const { period = '30d' } = req.query;

      const comparison = await vendorService.getDealerPerformanceComparison(vendorId, period);

      res.json({
        success: true,
        data: comparison
      });

    } catch (error) {
      console.error('Get dealer comparison error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch performance comparison'
      });
    }
  },

  // Get seasonal insights for dealer
  getSeasonalInsights: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      const insights = await vendorService.getDealerSeasonalInsights(vendorId);

      res.json({
        success: true,
        data: insights
      });

    } catch (error) {
      console.error('Get seasonal insights error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch seasonal insights'
      });
    }
  }
};

module.exports = vendorController;