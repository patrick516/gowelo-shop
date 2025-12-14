// src/controllers/customer.controller.js
const { prisma } = require('../config/prisma');
const { sendEmail } = require('../services/notification.service');

const customerController = {
  // Get all customers (admin only)
  getAllCustomers: async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        search,
        isVerified,
        isActive,
        startDate,
        endDate,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const skip = (page - 1) * limit;

      // Build where clause
      const where = {
        role: 'CUSTOMER'
      };
      
      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { fullName: { contains: search, mode: 'insensitive' } }
        ];
      }
      
      if (isVerified !== undefined) {
        where.isVerified = isVerified === 'true';
      }
      
      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }
      
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      // Get customers with pagination
      const [customers, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            phone: true,
            fullName: true,
            avatar: true,
            isVerified: true,
            isActive: true,
            lastLogin: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                orders: true,
                addresses: true
              }
            }
          },
          orderBy: { [sortBy]: sortOrder },
          skip,
          take: parseInt(limit)
        }),
        prisma.user.count({ where })
      ]);

      // Calculate customer lifetime value
      const customersWithStats = await Promise.all(
        customers.map(async (customer) => {
          const orderStats = await prisma.order.aggregate({
            where: { 
              customerId: customer.id,
              paymentStatus: 'PAID'
            },
            _sum: { total: true },
            _count: true
          });

          return {
            ...customer,
            totalSpent: orderStats._sum.total || 0,
            totalOrders: orderStats._count,
            averageOrderValue: orderStats._count > 0 
              ? (orderStats._sum.total || 0) / orderStats._count 
              : 0
          };
        })
      );

      res.json({
        success: true,
        data: customersWithStats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get customers error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customers',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Get single customer (admin or own profile)
  getCustomer: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Check authorization
      if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this customer'
        });
      }

      const customer = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          phone: true,
          fullName: true,
          avatar: true,
          isVerified: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
          updatedAt: true,
          addresses: {
            orderBy: { isDefault: 'desc' }
          },
          cart: {
            include: {
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      images: true,
                      price: true,
                      vendor: {
                        select: {
                          businessName: true
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Get order statistics
      const [
        orderStats,
        recentOrders,
        favoriteCategories
      ] = await Promise.all([
        // Order statistics
        prisma.order.aggregate({
          where: { 
            customerId: id,
            paymentStatus: 'PAID'
          },
          _sum: { total: true },
          _count: true,
          _avg: { total: true }
        }),
        // Recent orders
        prisma.order.findMany({
          where: { customerId: id },
          include: {
            vendor: {
              select: {
                businessName: true,
                businessLogo: true
              }
            },
            items: {
              include: {
                product: {
                  select: {
                    name: true,
                    images: true
                  }
                }
              },
              take: 2
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 5
        }),
        // Favorite categories
        prisma.$queryRaw`
          SELECT 
            c.id, 
            c.name, 
            c.slug,
            COUNT(DISTINCT oi.productId) as product_count,
            COUNT(DISTINCT o.id) as order_count
          FROM "orders" o
          JOIN "order_items" oi ON o.id = oi."orderId"
          JOIN "products" p ON oi."productId" = p.id
          JOIN "categories" c ON p."categoryId" = c.id
          WHERE o."customerId" = ${id}
            AND o."paymentStatus" = 'PAID'
          GROUP BY c.id, c.name, c.slug
          ORDER BY order_count DESC
          LIMIT 5
        `
      ]);

      // Get wishlist if exists (you might want to implement a wishlist model)
      const wishlistItems = []; // Placeholder for wishlist implementation

      res.json({
        success: true,
        data: {
          ...customer,
          statistics: {
            totalSpent: orderStats._sum.total || 0,
            totalOrders: orderStats._count,
            averageOrderValue: orderStats._avg.total || 0,
            lastOrderDate: recentOrders[0]?.createdAt || null
          },
          recentOrders,
          favoriteCategories,
          wishlist: wishlistItems
        }
      });

    } catch (error) {
      console.error('Get customer error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customer details'
      });
    }
  },

  // Update customer profile
  updateCustomerProfile: async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Check authorization
      if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this customer'
        });
      }

      // Check if customer exists
      const customer = await prisma.user.findUnique({
        where: { id }
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Prevent role changes via this endpoint
      if (updates.role) {
        delete updates.role;
      }

      // Check email uniqueness if changing email
      if (updates.email && updates.email !== customer.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: updates.email }
        });

        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'Email already in use'
          });
        }

        // If email is changed, require verification
        updates.isVerified = false;
      }

      // Check phone uniqueness if changing phone
      if (updates.phone && updates.phone !== customer.phone) {
        const existingUser = await prisma.user.findUnique({
          where: { phone: updates.phone }
        });

        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'Phone number already in use'
          });
        }
      }

      const updatedCustomer = await prisma.user.update({
        where: { id },
        data: updates
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'UPDATE_PROFILE',
          entity: 'USER',
          entityId: id,
          changes: JSON.stringify(updates),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      // Remove sensitive data from response
      const { passwordHash, ...customerWithoutPassword } = updatedCustomer;

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: customerWithoutPassword
      });

    } catch (error) {
      console.error('Update customer error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update profile'
      });
    }
  },

  // Update customer status (admin only)
  updateCustomerStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive, reason } = req.body;

      if (isActive === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Status is required'
        });
      }

      // Check if customer exists
      const customer = await prisma.user.findUnique({
        where: { id }
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Prevent deactivating admin accounts
      if (customer.role !== 'CUSTOMER') {
        return res.status(400).json({
          success: false,
          message: 'Cannot modify status of non-customer users'
        });
      }

      const updatedCustomer = await prisma.user.update({
        where: { id },
        data: { isActive }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: isActive ? 'ACTIVATE_CUSTOMER' : 'DEACTIVATE_CUSTOMER',
          entity: 'USER',
          entityId: id,
          changes: JSON.stringify({ 
            oldStatus: customer.isActive, 
            newStatus: isActive,
            reason 
          }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      // Send notification email
      if (customer.email) {
        try {
          await sendEmail({
            to: customer.email,
            subject: `Account ${isActive ? 'Activated' : 'Deactivated'} - ManuwaFarm`,
            template: 'account-status-change',
            data: {
              name: customer.fullName || 'Customer',
              status: isActive ? 'activated' : 'deactivated',
              reason: reason || 'Administrative action',
              contactEmail: 'support@manuwafarm.com'
            }
          });
        } catch (emailError) {
          console.error('Failed to send status email:', emailError);
        }
      }

      res.json({
        success: true,
        message: `Customer account ${isActive ? 'activated' : 'deactivated'}`,
        data: {
          id: updatedCustomer.id,
          email: updatedCustomer.email,
          isActive: updatedCustomer.isActive
        }
      });

    } catch (error) {
      console.error('Update customer status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update customer status'
      });
    }
  },

  // Get customer orders
  getCustomerOrders: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;
      const { 
        page = 1, 
        limit = 20, 
        status,
        startDate,
        endDate,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Check authorization
      if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view these orders'
        });
      }

      const skip = (page - 1) * limit;

      // Build where clause
      const where = { customerId: id };
      
      if (status) {
        where.status = status;
      }
      
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      // Get orders with pagination
      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          include: {
            vendor: {
              select: {
                id: true,
                businessName: true,
                businessLogo: true,
                rating: true
              }
            },
            items: {
              include: {
                product: {
                  select: {
                    name: true,
                    images: true,
                    slug: true
                  }
                }
              }
            }
          },
          orderBy: { [sortBy]: sortOrder },
          skip,
          take: parseInt(limit)
        }),
        prisma.order.count({ where })
      ]);

      res.json({
        success: true,
        data: orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get customer orders error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customer orders'
      });
    }
  },

  // Get customer addresses
  getCustomerAddresses: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Check authorization
      if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view these addresses'
        });
      }

      const addresses = await prisma.address.findMany({
        where: { userId: id },
        orderBy: [
          { isDefault: 'desc' },
          { createdAt: 'desc' }
        ]
      });

      res.json({
        success: true,
        data: addresses
      });

    } catch (error) {
      console.error('Get customer addresses error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch addresses'
      });
    }
  },

  // Add customer address
  addCustomerAddress: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;
      const addressData = req.body;

      // Check authorization
      if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to add address for this customer'
        });
      }

      // Validate required fields
      const requiredFields = ['fullName', 'phone', 'address', 'city', 'region'];
      const missingFields = requiredFields.filter(field => !addressData[field]);

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`
        });
      }

      // Check if customer exists
      const customer = await prisma.user.findUnique({
        where: { id }
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // If setting as default, unset other defaults
      if (addressData.isDefault) {
        await prisma.address.updateMany({
          where: { 
            userId: id,
            isDefault: true 
          },
          data: { isDefault: false }
        });
      }

      const address = await prisma.address.create({
        data: {
          ...addressData,
          userId: id
        }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'ADD_ADDRESS',
          entity: 'ADDRESS',
          entityId: address.id,
          changes: JSON.stringify(addressData),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      res.status(201).json({
        success: true,
        message: 'Address added successfully',
        data: address
      });

    } catch (error) {
      console.error('Add customer address error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add address'
      });
    }
  },

  // Update customer address
  updateCustomerAddress: async (req, res) => {
    try {
      const { id, addressId } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;
      const updates = req.body;

      // Check authorization
      if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this address'
        });
      }

      // Check if address exists and belongs to customer
      const address = await prisma.address.findFirst({
        where: {
          id: addressId,
          userId: id
        }
      });

      if (!address) {
        return res.status(404).json({
          success: false,
          message: 'Address not found'
        });
      }

      // If setting as default, unset other defaults
      if (updates.isDefault) {
        await prisma.address.updateMany({
          where: { 
            userId: id,
            id: { not: addressId },
            isDefault: true 
          },
          data: { isDefault: false }
        });
      }

      const updatedAddress = await prisma.address.update({
        where: { id: addressId },
        data: updates
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'UPDATE_ADDRESS',
          entity: 'ADDRESS',
          entityId: addressId,
          changes: JSON.stringify(updates),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      res.json({
        success: true,
        message: 'Address updated successfully',
        data: updatedAddress
      });

    } catch (error) {
      console.error('Update customer address error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update address'
      });
    }
  },

  // Delete customer address
  deleteCustomerAddress: async (req, res) => {
    try {
      const { id, addressId } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Check authorization
      if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this address'
        });
      }

      // Check if address exists and belongs to customer
      const address = await prisma.address.findFirst({
        where: {
          id: addressId,
          userId: id
        }
      });

      if (!address) {
        return res.status(404).json({
          success: false,
          message: 'Address not found'
        });
      }

      // Prevent deleting default address if it's the only address
      if (address.isDefault) {
        const addressCount = await prisma.address.count({
          where: { userId: id }
        });

        if (addressCount === 1) {
          return res.status(400).json({
            success: false,
            message: 'Cannot delete the only address. Add a new address first.'
          });
        }
      }

      await prisma.address.delete({
        where: { id: addressId }
      });

      // If deleted address was default, set another address as default
      if (address.isDefault) {
        const newDefault = await prisma.address.findFirst({
          where: { userId: id },
          orderBy: { createdAt: 'desc' }
        });

        if (newDefault) {
          await prisma.address.update({
            where: { id: newDefault.id },
            data: { isDefault: true }
          });
        }
      }

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'DELETE_ADDRESS',
          entity: 'ADDRESS',
          entityId: addressId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      res.json({
        success: true,
        message: 'Address deleted successfully'
      });

    } catch (error) {
      console.error('Delete customer address error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete address'
      });
    }
  },

  // Get customer cart
  getCustomerCart: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Check authorization
      if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this cart'
        });
      }

      const cart = await prisma.cart.findUnique({
        where: { userId: id },
        include: {
          items: {
            include: {
              product: {
                include: {
                  vendor: {
                    select: {
                      id: true,
                      businessName: true
                    }
                  }
                }
              }
            },
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!cart) {
        // Create cart if doesn't exist
        const newCart = await prisma.cart.create({
          data: { userId: id },
          include: {
            items: true
          }
        });

        return res.json({
          success: true,
          data: newCart
        });
      }

      // Calculate cart total
      let cartTotal = 0;
      const updatedItems = [];

      for (const item of cart.items) {
        // Get current product price and availability
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: {
            price: true,
            quantity: true,
            isActive: true,
            isApproved: true
          }
        });

        if (!product || !product.isActive || !product.isApproved || product.quantity <= 0) {
          // Remove unavailable product from cart
          await prisma.cartItem.delete({
            where: { id: item.id }
          });
          continue;
        }

        // Update price if changed
        if (item.price !== product.price) {
          const updatedItem = await prisma.cartItem.update({
            where: { id: item.id },
            data: { price: product.price }
          });
          updatedItems.push(updatedItem);
          cartTotal += product.price * item.quantity;
        } else {
          updatedItems.push(item);
          cartTotal += item.price * item.quantity;
        }
      }

      // Update cart total if changed
      if (cartTotal !== cart.total) {
        await prisma.cart.update({
          where: { id: cart.id },
          data: { total: cartTotal }
        });
      }

      res.json({
        success: true,
        data: {
          ...cart,
          items: updatedItems,
          total: cartTotal
        }
      });

    } catch (error) {
      console.error('Get customer cart error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch cart'
      });
    }
  },

  // Get customer statistics (admin only)
  getCustomerStats: async (req, res) => {
    try {
      const { period = 'month' } = req.query; // day, week, month, year

      // Calculate date ranges
      const now = new Date();
      let startDate;

      switch (period) {
        case 'day':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      // Get statistics
      const [
        totalCustomers,
        newCustomers,
        activeCustomers,
        totalRevenue,
        averageOrderValue,
        customerGrowth
      ] = await Promise.all([
        // Total customers
        prisma.user.count({
          where: { role: 'CUSTOMER' }
        }),
        // New customers in period
        prisma.user.count({
          where: {
            role: 'CUSTOMER',
            createdAt: { gte: startDate }
          }
        }),
        // Active customers (made at least one purchase in period)
        prisma.user.count({
          where: {
            role: 'CUSTOMER',
            orders: {
              some: {
                paymentStatus: 'PAID',
                createdAt: { gte: startDate }
              }
            }
          }
        }),
        // Total revenue from customers
        prisma.order.aggregate({
          where: {
            customer: { role: 'CUSTOMER' },
            paymentStatus: 'PAID',
            createdAt: { gte: startDate }
          },
          _sum: { total: true }
        }),
        // Average order value
        prisma.order.aggregate({
          where: {
            customer: { role: 'CUSTOMER' },
            paymentStatus: 'PAID',
            createdAt: { gte: startDate }
          },
          _avg: { total: true }
        }),
        // Customer growth over time
        prisma.$queryRaw`
          SELECT 
            DATE_TRUNC('day', "createdAt") as date,
            COUNT(*) as new_customers
          FROM "users"
          WHERE "role" = 'CUSTOMER'
            AND "createdAt" >= ${startDate}
          GROUP BY DATE_TRUNC('day', "createdAt")
          ORDER BY date
        `
      ]);

      // Get top customers by spending
      const topCustomers = await prisma.user.findMany({
        where: { role: 'CUSTOMER' },
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          lastLogin: true,
          _count: {
            select: { orders: true }
          }
        },
        take: 10,
        orderBy: {
          orders: {
            _count: 'desc'
          }
        }
      });

      // Add spending data to top customers
      const topCustomersWithSpending = await Promise.all(
        topCustomers.map(async (customer) => {
          const spending = await prisma.order.aggregate({
            where: { 
              customerId: customer.id,
              paymentStatus: 'PAID'
            },
            _sum: { total: true }
          });

          return {
            ...customer,
            totalSpent: spending._sum.total || 0
          };
        })
      );

      res.json({
        success: true,
        data: {
          summary: {
            totalCustomers,
            newCustomers,
            activeCustomers,
            totalRevenue: totalRevenue._sum.total || 0,
            averageOrderValue: averageOrderValue._avg.total || 0,
            period
          },
          growthData: customerGrowth,
          topCustomers: topCustomersWithSpending
        }
      });

    } catch (error) {
      console.error('Get customer stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customer statistics'
      });
    }
  },

  // Export customers (admin only)
  exportCustomers: async (req, res) => {
    try {
      const { format = 'csv', startDate, endDate } = req.query;

      // Build where clause
      const where = { role: 'CUSTOMER' };
      
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      const customers = await prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          phone: true,
          fullName: true,
          isVerified: true,
          isActive: true,
          lastLogin: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      // Add order statistics
      const customersWithStats = await Promise.all(
        customers.map(async (customer) => {
          const orderStats = await prisma.order.aggregate({
            where: { 
              customerId: customer.id,
              paymentStatus: 'PAID'
            },
            _sum: { total: true },
            _count: true
          });

          return {
            ...customer,
            totalOrders: orderStats._count,
            totalSpent: orderStats._sum.total || 0,
            lastOrder: await prisma.order.findFirst({
              where: { customerId: customer.id },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true }
            }).then(order => order?.createdAt || null)
          };
        })
      );

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'EXPORT_CUSTOMERS',
          entity: 'USER',
          changes: JSON.stringify({ 
            format, 
            customerCount: customersWithStats.length,
            dateRange: { startDate, endDate }
          }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      if (format === 'json') {
        res.json({
          success: true,
          data: customersWithStats
        });
      } else {
        // Generate CSV
        const headers = [
          'ID', 'Email', 'Phone', 'Full Name', 'Verified', 'Active',
          'Total Orders', 'Total Spent (MWK)', 'Last Order', 'Last Login',
          'Joined Date'
        ];

        const csvRows = customersWithStats.map(customer => [
          customer.id,
          customer.email,
          customer.phone,
          customer.fullName || '',
          customer.isVerified ? 'Yes' : 'No',
          customer.isActive ? 'Yes' : 'No',
          customer.totalOrders,
          customer.totalSpent,
          customer.lastOrder ? new Date(customer.lastOrder).toLocaleDateString() : 'Never',
          customer.lastLogin ? new Date(customer.lastLogin).toLocaleDateString() : 'Never',
          new Date(customer.createdAt).toLocaleDateString()
        ]);

        const csvContent = [
          headers.join(','),
          ...csvRows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=customers_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csvContent);
      }

    } catch (error) {
      console.error('Export customers error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export customers'
      });
    }
  }
};

module.exports = customerController;