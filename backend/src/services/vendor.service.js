// src/services/vendor.service.js - AGRO-DEALER FOCUSED
const { prisma } = require('../config/prisma');
const notificationService = require('./notification.service');

class VendorService {
  
  // ========== VENDOR MANAGEMENT ==========
  
  async getAllVendors(filters = {}) {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      region,
      city,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = filters;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = {};
    
    if (status) {
      where.status = status;
    }
    
    if (region) {
      where.region = { contains: region, mode: 'insensitive' };
    }
    
    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }
    
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
        { contactPhone: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [vendors, total] = await Promise.all([
      prisma.vendorProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              isActive: true,
              lastLogin: true
            }
          },
          _count: {
            select: {
              products: true,
              orders: true
            }
          }
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: parseInt(limit)
      }),
      prisma.vendorProfile.count({ where })
    ]);

    // Calculate trial status and add agro-specific stats
    const vendorsWithStats = await Promise.all(
      vendors.map(async (vendor) => {
        const isTrialExpired = vendor.status === 'TRIAL' && 
                              vendor.trialEndsAt < new Date();
        const daysLeftInTrial = vendor.trialEndsAt 
          ? Math.ceil((vendor.trialEndsAt - new Date()) / (1000 * 60 * 60 * 24))
          : 0;

        // Get agro-specific stats
        const agroStats = await this.getAgroVendorStats(vendor.id);

        return {
          ...vendor,
          isTrialExpired,
          daysLeftInTrial,
          agroStats
        };
      })
    );

    return {
      vendors: vendorsWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getVendorById(id) {
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            isActive: true,
            lastLogin: true
          }
        },
        products: {
          where: { isActive: true },
          take: 10,
          orderBy: { createdAt: 'desc' }
        },
        orders: {
          take: 10,
          orderBy: { createdAt: 'desc' }
        },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 5
        },
        _count: {
          select: {
            products: true,
            orders: true
          }
        }
      }
    });

    if (!vendor) {
      throw new Error('Vendor not found');
    }

    // Calculate trial status
    const isTrialExpired = vendor.status === 'TRIAL' && 
                          vendor.trialEndsAt < new Date();
    const daysLeftInTrial = vendor.trialEndsAt 
      ? Math.ceil((vendor.trialEndsAt - new Date()) / (1000 * 60 * 60 * 24))
      : 0;

    // Get agro-specific stats
    const agroStats = await this.getAgroVendorStats(id);

    return {
      ...vendor,
      isTrialExpired,
      daysLeftInTrial,
      agroStats
    };
  }

  async getMyVendorProfile(vendorId, userId) {
    if (!vendorId) {
      throw new Error('Vendor profile not found');
    }

    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: vendorId },
      include: {
        user: {
          select: {
            email: true,
            phone: true
          }
        },
        products: {
          where: { isActive: true },
          take: 5,
          orderBy: { createdAt: 'desc' }
        },
        orders: {
          where: {
            createdAt: {
              gte: new Date(new Date().setDate(new Date().getDate() - 30))
            }
          },
          take: 10,
          orderBy: { createdAt: 'desc' }
        },
        subscriptions: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!vendor) {
      throw new Error('Vendor profile not found');
    }

    // Check trial status
    let status = vendor.status;
    let isTrialExpired = false;
    let daysLeft = 0;

    if (vendor.status === 'TRIAL' && vendor.trialEndsAt) {
      daysLeft = Math.ceil((vendor.trialEndsAt - new Date()) / (1000 * 60 * 60 * 24));
      
      if (vendor.trialEndsAt < new Date()) {
        status = 'EXPIRED';
        isTrialExpired = true;
        
        // Update status if expired
        await prisma.vendorProfile.update({
          where: { id: vendorId },
          data: { 
            status: 'EXPIRED',
            isTrialActive: false 
          }
        });
      }
    }

    // Get agro-specific stats
    const agroStats = await this.getAgroVendorStats(vendorId);

    return {
      ...vendor,
      status,
      isTrialExpired,
      daysLeftInTrial: daysLeft > 0 ? daysLeft : 0,
      requiresSubscription: isTrialExpired || vendor.status === 'EXPIRED',
      agroStats
    };
  }

  async updateVendorProfile(vendorId, updates) {
    // Remove fields that shouldn't be updated
    const { status, trialEndsAt, subscriptionEndsAt, ...allowedUpdates } = updates;

    const vendor = await prisma.vendorProfile.update({
      where: { id: vendorId },
      data: allowedUpdates
    });

    // Log profile update
    await this.logVendorActivity(vendorId, 'PROFILE_UPDATE', {
      updatedFields: Object.keys(allowedUpdates)
    });

    return vendor;
  }

  async updateVendorStatus(vendorId, newStatus, reason = '', adminId) {
    if (!['ACTIVE', 'SUSPENDED', 'BLOCKED'].includes(newStatus)) {
      throw new Error('Valid status is required');
    }

    // Get vendor
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: vendorId },
      include: { user: true }
    });

    if (!vendor) {
      throw new Error('Vendor not found');
    }

    const oldStatus = vendor.status;
    
    // Update status
    const updatedVendor = await prisma.vendorProfile.update({
      where: { id: vendorId },
      data: { status: newStatus }
    });

    // Log status change
    await this.logVendorActivity(vendorId, 'STATUS_CHANGE', {
      oldStatus,
      newStatus,
      reason,
      changedBy: adminId
    });

    // Send notification
    await notificationService.sendEmail({
      to: vendor.user.email,
      subject: `Vendor Account Status Update - ${process.env.APP_NAME || 'ManuwaFarm'}`,
      template: 'vendor-status-update',
      data: {
        businessName: vendor.businessName,
        oldStatus,
        newStatus,
        reason: reason || 'No reason provided',
        contactEmail: process.env.SUPPORT_EMAIL || 'support@manuwafarm.com'
      }
    });

    return updatedVendor;
  }

  // ========== VENDOR STATISTICS ==========

  async getVendorStats(vendorId) {
    // Calculate date ranges
    const now = new Date();
    const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));

    // Get counts
    const [
      totalProducts,
      activeProducts,
      totalOrders,
      pendingOrders,
      totalRevenue,
      monthlyRevenue,
      weeklyOrders,
      lowStockProducts,
      farmersServed
    ] = await Promise.all([
      // Total products
      prisma.product.count({
        where: { vendorId }
      }),
      // Active products
      prisma.product.count({
        where: { 
          vendorId,
          isActive: true,
          quantity: { gt: 0 }
        }
      }),
      // Total orders
      prisma.order.count({
        where: { vendorId }
      }),
      // Pending orders
      prisma.order.count({
        where: { 
          vendorId,
          status: { in: ['PENDING', 'CONFIRMED', 'PROCESSING'] }
        }
      }),
      // Total revenue
      prisma.order.aggregate({
        where: { 
          vendorId,
          paymentStatus: 'PAID'
        },
        _sum: { total: true }
      }),
      // Monthly revenue
      prisma.order.aggregate({
        where: { 
          vendorId,
          paymentStatus: 'PAID',
          createdAt: { gte: startOfMonth }
        },
        _sum: { total: true }
      }),
      // Weekly orders
      prisma.order.count({
        where: { 
          vendorId,
          createdAt: { gte: startOfWeek }
        }
      }),
      // Low stock products
      prisma.product.count({
        where: { 
          vendorId,
          quantity: { lte: 5 },
          quantity: { gt: 0 }
        }
      }),
      // Farmers served
      prisma.order.groupBy({
        by: ['customerId'],
        where: { 
          vendorId,
          paymentStatus: 'PAID'
        },
        _count: true
      }).then(result => result.length)
    ]);

    // Get recent orders
    const recentOrders = await prisma.order.findMany({
      where: { vendorId },
      include: {
        customer: {
          select: {
            fullName: true,
            phone: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    // Get top selling products
    const topProducts = await prisma.product.findMany({
      where: { vendorId },
      orderBy: { salesCount: 'desc' },
      take: 5
    });

    // Get agro-specific stats
    const agroStats = await this.getAgroVendorStats(vendorId);

    return {
      overview: {
        totalProducts,
        activeProducts,
        totalOrders,
        pendingOrders,
        totalRevenue: totalRevenue._sum.total || 0,
        monthlyRevenue: monthlyRevenue._sum.total || 0,
        weeklyOrders,
        lowStockProducts,
        farmersServed
      },
      recentOrders,
      topProducts,
      agroStats
    };
  }

  async getAgroVendorStats(vendorId) {
    // Get crop-specific stats
    const cropStats = await prisma.$queryRaw`
      SELECT 
        c.name as crop_type,
        COUNT(DISTINCT o.id) as order_count,
        SUM(o.total) as revenue,
        SUM(oi.quantity) as total_quantity,
        COUNT(DISTINCT o."customerId") as farmers_served
      FROM "orders" o
      JOIN "order_items" oi ON o.id = oi."orderId"
      JOIN "products" p ON oi."productId" = p.id
      JOIN "categories" c ON p."categoryId" = c.id
      WHERE o."vendorId" = ${vendorId}
        AND o."paymentStatus" = 'PAID'
      GROUP BY c.name
      ORDER BY revenue DESC
    `;

    // Get regional distribution
    const regionalStats = await prisma.$queryRaw`
      SELECT 
        o."deliveryCity" as region,
        COUNT(DISTINCT o.id) as order_count,
        SUM(o.total) as revenue,
        COUNT(DISTINCT o."customerId") as farmers_served
      FROM "orders" o
      WHERE o."vendorId" = ${vendorId}
        AND o."paymentStatus" = 'PAID'
        AND o."deliveryCity" IS NOT NULL
      GROUP BY o."deliveryCity"
      ORDER BY revenue DESC
    `;

    // Get seasonal trends (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const seasonalTrends = await prisma.$queryRaw`
      SELECT 
        EXTRACT(MONTH FROM o."createdAt") as month,
        EXTRACT(YEAR FROM o."createdAt") as year,
        COUNT(DISTINCT o.id) as order_count,
        SUM(o.total) as revenue
      FROM "orders" o
      WHERE o."vendorId" = ${vendorId}
        AND o."paymentStatus" = 'PAID'
        AND o."createdAt" >= ${sixMonthsAgo}
      GROUP BY EXTRACT(MONTH FROM o."createdAt"), EXTRACT(YEAR FROM o."createdAt")
      ORDER BY year, month
    `;

    return {
      cropStats: cropStats.map(stat => ({
        cropType: stat.crop_type,
        orderCount: parseInt(stat.order_count),
        revenue: parseFloat(stat.revenue) || 0,
        totalQuantity: parseFloat(stat.total_quantity) || 0,
        farmersServed: parseInt(stat.farmers_served)
      })),
      regionalStats: regionalStats.map(stat => ({
        region: stat.region,
        orderCount: parseInt(stat.order_count),
        revenue: parseFloat(stat.revenue) || 0,
        farmersServed: parseInt(stat.farmers_served)
      })),
      seasonalTrends: seasonalTrends.map(trend => ({
        month: parseInt(trend.month),
        year: parseInt(trend.year),
        orderCount: parseInt(trend.order_count),
        revenue: parseFloat(trend.revenue) || 0
      }))
    };
  }

  // ========== VENDOR PRODUCTS ==========

  async getVendorProducts(vendorId, filters = {}) {
    const {
      page = 1,
      limit = 20,
      status,
      category,
      search,
      cropType,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = filters;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = { vendorId };
    
    if (status === 'active') {
      where.isActive = true;
      where.quantity = { gt: 0 };
    } else if (status === 'out-of-stock') {
      where.quantity = 0;
    } else if (status === 'inactive') {
      where.isActive = false;
    }
    
    if (category) {
      where.categoryId = category;
    }
    
    if (cropType) {
      where.OR = [
        { name: { contains: cropType, mode: 'insensitive' } },
        { tags: { has: cropType.toLowerCase() } }
      ];
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          },
          _count: {
            select: {
              orderItems: true
            }
          }
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: parseInt(limit)
      }),
      prisma.product.count({ where })
    ]);

    // Add sales stats to products
    const productsWithStats = await Promise.all(
      products.map(async (product) => {
        const salesStats = await this.getProductSalesStats(product.id);
        return {
          ...product,
          salesStats
        };
      })
    );

    return {
      products: productsWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getProductSalesStats(productId) {
    const stats = await prisma.$queryRaw`
      SELECT 
        COUNT(DISTINCT oi."orderId") as total_orders,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.quantity * oi.price) as total_revenue,
        COUNT(DISTINCT o."customerId") as customers_served,
        AVG(oi.quantity) as avg_order_quantity
      FROM "order_items" oi
      JOIN "orders" o ON oi."orderId" = o.id
      WHERE oi."productId" = ${productId}
        AND o."paymentStatus" = 'PAID'
    `;

    return {
      totalOrders: parseInt(stats[0]?.total_orders) || 0,
      totalQuantity: parseInt(stats[0]?.total_quantity) || 0,
      totalRevenue: parseFloat(stats[0]?.total_revenue) || 0,
      customersServed: parseInt(stats[0]?.customers_served) || 0,
      avgOrderQuantity: parseFloat(stats[0]?.avg_order_quantity) || 0
    };
  }

  // ========== VENDOR ORDERS ==========

  async getVendorOrders(vendorId, filters = {}) {
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
    } = filters;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = { vendorId };
    
    if (status) {
      where.status = status;
    }
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }
    
    if (region) {
      where.deliveryCity = { contains: region, mode: 'insensitive' };
    }
    
    if (cropType) {
      where.items = {
        some: {
          product: {
            OR: [
              { name: { contains: cropType, mode: 'insensitive' } },
              { tags: { has: cropType.toLowerCase() } }
            ]
          }
        }
      };
    }
    
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              fullName: true,
              phone: true
            }
          },
          items: {
            include: {
              product: {
                select: {
                  name: true,
                  images: true,
                  category: {
                    select: {
                      name: true
                    }
                  }
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

    return {
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // ========== AGRO-DEALER SPECIFIC METHODS ==========

  async registerAgroDealer(userId, vendorData) {
    // Create vendor profile
    const vendor = await prisma.vendorProfile.create({
      data: {
        userId,
        ...vendorData,
        status: 'TRIAL',
        isTrialActive: true,
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days trial
      }
    });

    // Get user details for notification
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true, fullName: true }
    });

    // Send welcome notification
    await notificationService.sendAgroDealerWelcome(vendor, user);

    // Create audit log
    await this.logVendorActivity(vendor.id, 'REGISTRATION', {
      businessName: vendor.businessName,
      contactPerson: vendor.contactPerson
    });

    return vendor;
  }

  async getAgroDealersBySpecialization(specialization, region = null) {
    const where = {
      status: 'ACTIVE'
    };

    // Build search based on specialization
    if (specialization) {
      where.OR = [
        { businessName: { contains: specialization, mode: 'insensitive' } },
        { description: { contains: specialization, mode: 'insensitive' } }
      ];
    }

    if (region) {
      where.OR = [
        { city: { contains: region, mode: 'insensitive' } },
        { region: { contains: region, mode: 'insensitive' } }
      ];
    }

    const dealers = await prisma.vendorProfile.findMany({
      where,
      include: {
        user: {
          select: {
            email: true,
            phone: true
          }
        },
        products: {
          where: { isActive: true },
          take: 5,
          orderBy: { salesCount: 'desc' }
        },
        _count: {
          select: {
            products: true,
            orders: true
          }
        }
      },
      orderBy: { rating: 'desc' },
      take: 20
    });

    // Add agro-specific stats
    const dealersWithStats = await Promise.all(
      dealers.map(async (dealer) => {
        const agroStats = await this.getAgroVendorStats(dealer.id);
        return {
          ...dealer,
          agroStats
        };
      })
    );

    return dealersWithStats;
  }

  async getDealerPerformanceComparison(vendorId, period = '30d') {
    // Calculate date range
    let startDate = new Date();
    switch(period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    // Get current vendor stats
    const vendorStats = await this.getVendorStats(vendorId);

    // Get average stats for all vendors in same region
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: vendorId },
      select: { city: true, region: true }
    });

    const regionStats = await prisma.$queryRaw`
      SELECT 
        AVG(v."totalSales") as avg_sales,
        AVG(v."totalRevenue") as avg_revenue,
        AVG(v.rating) as avg_rating,
        COUNT(DISTINCT p.id) as avg_products
      FROM "vendor_profiles" v
      LEFT JOIN "products" p ON v.id = p."vendorId" 
        AND p."isActive" = true
      WHERE v.status = 'ACTIVE'
        AND (v.city = ${vendor?.city} OR v.region = ${vendor?.region})
        AND v.id != ${vendorId}
    `;

    return {
      period,
      vendorStats,
      regionComparison: {
        avgSales: parseFloat(regionStats[0]?.avg_sales) || 0,
        avgRevenue: parseFloat(regionStats[0]?.avg_revenue) || 0,
        avgRating: parseFloat(regionStats[0]?.avg_rating) || 0,
        avgProducts: parseInt(regionStats[0]?.avg_products) || 0
      }
    };
  }

  async getDealerSeasonalInsights(vendorId) {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    
    // Malawi agricultural seasons
    const seasons = {
      1: { name: 'January', season: 'Rainy', crops: ['Maize', 'Rice', 'Groundnuts'] },
      2: { name: 'February', season: 'Rainy', crops: ['Maize', 'Rice', 'Soybeans'] },
      3: { name: 'March', season: 'Rainy', crops: ['Maize', 'Rice', 'Beans'] },
      4: { name: 'April', season: 'Harvest', crops: ['Maize', 'Rice', 'Groundnuts'] },
      5: { name: 'May', season: 'Harvest', crops: ['Maize', 'Tobacco', 'Cotton'] },
      6: { name: 'June', season: 'Dry', crops: ['Vegetables', 'Tobacco', 'Cotton'] },
      7: { name: 'July', season: 'Dry', crops: ['Vegetables', 'Tobacco'] },
      8: { name: 'August', season: 'Dry', crops: ['Vegetables', 'Wheat'] },
      9: { name: 'September', season: 'Dry', crops: ['Vegetables', 'Wheat'] },
      10: { name: 'October', season: 'Planting', crops: ['Maize', 'Rice', 'Groundnuts'] },
      11: { name: 'November', season: 'Planting', crops: ['Maize', 'Rice', 'Soybeans'] },
      12: { name: 'December', season: 'Planting', crops: ['Maize', 'Rice', 'Beans'] }
    };

    const currentSeason = seasons[currentMonth];
    
    // Get historical sales for this season
    const seasonalSales = await prisma.$queryRaw`
      SELECT 
        c.name as crop_type,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.quantity * oi.price) as total_revenue
      FROM "orders" o
      JOIN "order_items" oi ON o.id = oi."orderId"
      JOIN "products" p ON oi."productId" = p.id
      JOIN "categories" c ON p."categoryId" = c.id
      WHERE o."vendorId" = ${vendorId}
        AND o."paymentStatus" = 'PAID'
        AND EXTRACT(MONTH FROM o."createdAt") = ${currentMonth}
      GROUP BY c.name
      ORDER BY total_revenue DESC
    `;

    // Get stock levels for seasonal crops
    const seasonalStock = await prisma.product.findMany({
      where: {
        vendorId,
        isActive: true,
        quantity: { gt: 0 },
        OR: currentSeason.crops.map(crop => ({
          name: { contains: crop, mode: 'insensitive' }
        }))
      },
      select: {
        id: true,
        name: true,
        quantity: true,
        lowStockThreshold: true,
        price: true
      },
      take: 10
    });

    return {
      currentSeason,
      seasonalSales: seasonalSales.map(sale => ({
        cropType: sale.crop_type,
        totalQuantity: parseFloat(sale.total_quantity) || 0,
        totalRevenue: parseFloat(sale.total_revenue) || 0
      })),
      seasonalStock,
      recommendations: this.generateSeasonalRecommendations(currentSeason, seasonalStock)
    };
  }

  generateSeasonalRecommendations(season, stock) {
    const recommendations = [];
    
    // Check stock levels for seasonal crops
    const lowStockCrops = stock.filter(product => 
      product.quantity <= product.lowStockThreshold
    );
    
    if (lowStockCrops.length > 0) {
      recommendations.push({
        type: 'STOCK_ALERT',
        message: `Low stock for ${lowStockCrops.length} seasonal crops. Consider restocking.`,
        crops: lowStockCrops.map(crop => crop.name)
      });
    }

    // Suggest popular seasonal crops not in stock
    const missingCrops = season.crops.filter(crop =>
      !stock.some(product => 
        product.name.toLowerCase().includes(crop.toLowerCase())
      )
    );

    if (missingCrops.length > 0) {
      recommendations.push({
        type: 'NEW_PRODUCT',
        message: `Consider adding these seasonal crops: ${missingCrops.join(', ')}`,
        crops: missingCrops
      });
    }

    return recommendations;
  }

  // ========== HELPER METHODS ==========

  async logVendorActivity(vendorId, action, details = {}) {
    try {
      await prisma.auditLog.create({
        data: {
          action,
          entity: 'VENDOR',
          entityId: vendorId,
          changes: JSON.stringify(details),
          ipAddress: 'SYSTEM',
          createdAt: new Date()
        }
      });
    } catch (error) {
      console.error('Failed to log vendor activity:', error);
    }
  }

  async validateVendorOwnership(vendorId, userId) {
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: vendorId },
      select: { userId: true }
    });

    if (!vendor) {
      throw new Error('Vendor not found');
    }

    if (vendor.userId !== userId) {
      throw new Error('Not authorized to access this vendor');
    }

    return true;
  }
}

module.exports = new VendorService();