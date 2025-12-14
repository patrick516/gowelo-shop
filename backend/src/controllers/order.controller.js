// src/controllers/order.controller.js (updated with service)
const orderService = require('../services/order.service');
const { prisma } = require('../config/prisma');

const orderController = {
  // Create new order
  createOrder: async (req, res) => {
    try {
      const customerId = req.user.userId;

      // Get customer details
      const customer = await prisma.user.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          email: true,
          phone: true,
          phoneNumber: true,
          fullName: true
        }
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      const result = await orderService.createOrder(
        req.body,
        customer,
        {
          userId: customerId,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.status(201).json(result);
    } catch (error) {
      console.error('Create order error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create order',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Get all orders (admin only)
  getAllOrders: async (req, res) => {
    try {
      const result = await orderService.getOrders(req.query);
      res.json(result);
    } catch (error) {
      console.error('Get all orders error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch orders'
      });
    }
  },

  // Get single order
  getOrder: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await orderService.getOrderById(id, {
        userId: req.user.userId,
        userRole: req.user.role,
        vendorId: req.user.vendorId
      });
      res.json(result);
    } catch (error) {
      console.error('Get order error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch order details'
      });
    }
  },

  // Update order status
  updateOrderStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await orderService.updateOrderStatus(
        id,
        req.body.status,
        req.body,
        {
          userId: req.user.userId,
          userRole: req.user.role,
          vendorId: req.user.vendorId,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        }
      );
      res.json(result);
    } catch (error) {
      console.error('Update order status error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update order status'
      });
    }
  },

  // Cancel order
  cancelOrder: async (req, res) => {
    try {
      const { id } = req.params;
      
      // Use the updateOrderStatus service method for cancellation
      const result = await orderService.updateOrderStatus(
        id,
        'CANCELLED',
        req.body,
        {
          userId: req.user.userId,
          userRole: req.user.role,
          vendorId: req.user.vendorId,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        }
      );
      
      res.json(result);
    } catch (error) {
      console.error('Cancel order error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to cancel order'
      });
    }
  },

  // Get vendor's orders
  getVendorOrders: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      
      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor profile not found'
        });
      }

      const result = await orderService.getOrders({
        ...req.query,
        vendorId
      });

      // Get vendor-specific statistics
      const orderStats = {
        pending: await prisma.order.count({
          where: { vendorId, status: 'PENDING' }
        }),
        processing: await prisma.order.count({
          where: { vendorId, status: 'PROCESSING' }
        }),
        shipped: await prisma.order.count({
          where: { vendorId, status: 'SHIPPED' }
        }),
        delivered: await prisma.order.count({
          where: { vendorId, status: 'DELIVERED' }
        }),
        cancelled: await prisma.order.count({
          where: { vendorId, status: 'CANCELLED' }
        })
      };

      res.json({
        success: true,
        data: {
          orders: result.data,
          stats: orderStats,
          pagination: result.pagination
        }
      });

    } catch (error) {
      console.error('Get vendor orders error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch vendor orders'
      });
    }
  },

  // Get customer's orders
  getCustomerOrders: async (req, res) => {
    try {
      const customerId = req.user.userId;
      
      const result = await orderService.getOrders({
        ...req.query,
        customerId
      });

      // Get customer-specific statistics
      const orderStats = await prisma.order.aggregate({
        where: { customerId },
        _count: true,
        _sum: { total: true },
        _avg: { total: true }
      });

      // Get favorite vendors
      const favoriteVendors = await prisma.$queryRaw`
        SELECT 
          v.id,
          v."businessName",
          v."businessLogo",
          COUNT(o.id) as order_count,
          SUM(o.total) as total_spent
        FROM "orders" o
        JOIN "vendor_profiles" v ON o."vendorId" = v.id
        WHERE o."customerId" = ${customerId}
          AND o."paymentStatus" = 'PAID'
        GROUP BY v.id, v."businessName", v."businessLogo"
        ORDER BY order_count DESC
        LIMIT 3
      `;

      res.json({
        success: true,
        data: {
          orders: result.data,
          stats: {
            totalOrders: orderStats._count,
            totalSpent: orderStats._sum.total || 0,
            averageOrderValue: orderStats._avg.total || 0,
            favoriteVendors: favoriteVendors.map(vendor => ({
              id: vendor.id,
              name: vendor.businessName,
              logo: vendor.businessLogo,
              orderCount: parseInt(vendor.order_count),
              totalSpent: parseFloat(vendor.total_spent)
            }))
          },
          pagination: result.pagination
        }
      });

    } catch (error) {
      console.error('Get customer orders error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch customer orders'
      });
    }
  },

  // Get order statistics
  getOrderStats: async (req, res) => {
    try {
      const result = await orderService.getOrderStats(
        {
          userRole: req.user.role,
          vendorId: req.user.vendorId,
          userId: req.user.userId
        },
        req.query
      );
      res.json(result);
    } catch (error) {
      console.error('Get order stats error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch order statistics'
      });
    }
  },

  // Export orders
  exportOrders: async (req, res) => {
    try {
      const filters = req.query;
      
      // Add vendor filter for vendor exports
      if (req.user.role === 'VENDOR' && req.user.vendorId) {
        filters.vendorId = req.user.vendorId;
      }

      const result = await orderService.exportOrders(filters);

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'EXPORT_ORDERS',
          entity: 'ORDER',
          changes: JSON.stringify({ 
            format: filters.format,
            filters: filters,
            orderCount: result.data?.length || 0
          }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      if (filters.format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        return res.send(result.data);
      }

      res.json(result);
    } catch (error) {
      console.error('Export orders error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to export orders'
      });
    }
  }
};

module.exports = orderController;