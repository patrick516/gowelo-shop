// src/controllers/dashboard.controller.js
const { prisma } = require('../config/prisma');

const dashboardController = {
  // Get admin dashboard overview
  getAdminDashboard: async (req, res) => {
    try {
      // Calculate date ranges
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));

      // Get all statistics in parallel
      const [
        totalRevenue,
        todayRevenue,
        totalOrders,
        todayOrders,
        pendingOrders,
        totalCustomers,
        newCustomersToday,
        totalVendors,
        activeVendors,
        trialVendors,
        totalProducts,
        lowStockProducts,
        subscriptionRevenue,
        platformStats,
        recentActivities
      ] = await Promise.all([
        // Total revenue (all time)
        prisma.order.aggregate({
          where: { paymentStatus: 'PAID' },
          _sum: { total: true }
        }),
        // Today's revenue
        prisma.order.aggregate({
          where: { 
            paymentStatus: 'PAID',
            createdAt: { gte: startOfToday }
          },
          _sum: { total: true }
        }),
        // Total orders
        prisma.order.count(),
        // Today's orders
        prisma.order.count({
          where: { createdAt: { gte: startOfToday } }
        }),
        // Pending orders
        prisma.order.count({
          where: { 
            status: { in: ['PENDING', 'CONFIRMED', 'PROCESSING'] }
          }
        }),
        // Total customers
        prisma.user.count({
          where: { role: 'CUSTOMER' }
        }),
        // New customers today
        prisma.user.count({
          where: { 
            role: 'CUSTOMER',
            createdAt: { gte: startOfToday }
          }
        }),
        // Total vendors
        prisma.vendorProfile.count(),
        // Active vendors
        prisma.vendorProfile.count({
          where: { status: 'ACTIVE' }
        }),
        // Trial vendors
        prisma.vendorProfile.count({
          where: { status: 'TRIAL' }
        }),
        // Total products
        prisma.product.count({
          where: { isActive: true }
        }),
        // Low stock products
        prisma.product.count({
          where: { 
            quantity: { lte: 5 },
            quantity: { gt: 0 }
          }
        }),
        // Subscription revenue (last 30 days)
        prisma.subscription.aggregate({
          where: { 
            status: 'ACTIVE',
            createdAt: { gte: thirtyDaysAgo }
          },
          _sum: { amount: true }
        }),
        // Platform-wide statistics
        prisma.$queryRaw`
          SELECT 
            COUNT(DISTINCT "customerId") as unique_customers,
            COUNT(DISTINCT "vendorId") as unique_vendors,
            AVG("total") as avg_order_value,
            SUM(CASE WHEN "status" = 'DELIVERED' THEN 1 ELSE 0 END) as delivered_orders
          FROM "orders"
          WHERE "paymentStatus" = 'PAID'
            AND "createdAt" >= ${thirtyDaysAgo}
        `,
        // Recent activities (audit logs)
        prisma.auditLog.findMany({
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        })
      ]);

      // Get sales data for chart (last 30 days)
      const salesData = await prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('day', "createdAt") as date,
          COUNT(*) as order_count,
          SUM("total") as revenue,
          COUNT(DISTINCT "customerId") as unique_customers
        FROM "orders"
        WHERE "paymentStatus" = 'PAID'
          AND "createdAt" >= ${thirtyDaysAgo}
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY date
      `;

      // Get vendor growth data
      const vendorGrowth = await prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('week', "createdAt") as week,
          COUNT(*) as new_vendors,
          SUM(CASE WHEN "status" = 'ACTIVE' THEN 1 ELSE 0 END) as active_vendors
        FROM "vendor_profiles"
        WHERE "createdAt" >= ${startOfMonth}
        GROUP BY DATE_TRUNC('week', "createdAt")
        ORDER BY week
      `;

      // Get top performing vendors
      const topVendors = await prisma.vendorProfile.findMany({
        select: {
          id: true,
          businessName: true,
          businessLogo: true,
          rating: true,
          totalSales: true,
          totalRevenue: true,
          user: {
            select: {
              email: true,
              phone: true
            }
          },
          _count: {
            select: {
              products: {
                where: { isActive: true }
              },
              orders: {
                where: { 
                  paymentStatus: 'PAID',
                  createdAt: { gte: thirtyDaysAgo }
                }
              }
            }
          }
        },
        orderBy: { totalRevenue: 'desc' },
        take: 5
      });

      // Get top selling products
      const topProducts = await prisma.product.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          images: true,
          price: true,
          salesCount: true,
          viewCount: true,
          vendor: {
            select: {
              businessName: true
            }
          }
        },
        orderBy: { salesCount: 'desc' },
        take: 10
      });

      // Get recent orders
      const recentOrders = await prisma.order.findMany({
        where: { paymentStatus: 'PAID' },
        include: {
          customer: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          },
          vendor: {
            select: {
              businessName: true
            }
          },
          items: {
            include: {
              product: {
                select: {
                  name: true
                }
              }
            },
            take: 2
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      // Get subscription status overview
      const subscriptionOverview = await prisma.$queryRaw`
        SELECT 
          "plan",
          COUNT(*) as count,
          SUM("amount") as total_revenue
        FROM "subscriptions"
        WHERE "status" = 'ACTIVE'
        GROUP BY "plan"
        ORDER BY total_revenue DESC
      `;

      // Get category-wise product distribution
      const categoryDistribution = await prisma.$queryRaw`
        SELECT 
          c.id,
          c.name,
          c.slug,
          COUNT(p.id) as product_count,
          COUNT(CASE WHEN p."isFeatured" = true THEN 1 END) as featured_count
        FROM "categories" c
        LEFT JOIN "products" p ON c.id = p."categoryId" 
          AND p."isActive" = true 
          AND p."isApproved" = true
        WHERE c."isActive" = true
        GROUP BY c.id, c.name, c.slug
        ORDER BY product_count DESC
        LIMIT 10
      `;

      // Calculate conversion rate
      const visitors = 10000; // This would come from analytics service
      const orders = totalOrders;
      const conversionRate = visitors > 0 ? (orders / visitors * 100).toFixed(2) : 0;

      res.json({
        success: true,
        data: {
          overview: {
            totalRevenue: totalRevenue._sum.total || 0,
            todayRevenue: todayRevenue._sum.total || 0,
            totalOrders,
            todayOrders,
            pendingOrders,
            totalCustomers,
            newCustomersToday,
            totalVendors,
            activeVendors,
            trialVendors,
            totalProducts,
            lowStockProducts,
            subscriptionRevenue: subscriptionRevenue._sum.amount || 0,
            conversionRate: `${conversionRate}%`
          },
          charts: {
            salesData: salesData.map(item => ({
              date: item.date.toISOString().split('T')[0],
              revenue: parseFloat(item.revenue) || 0,
              orders: parseInt(item.order_count) || 0,
              customers: parseInt(item.unique_customers) || 0
            })),
            vendorGrowth: vendorGrowth.map(item => ({
              week: item.week.toISOString().split('T')[0],
              newVendors: parseInt(item.new_vendors) || 0,
              activeVendors: parseInt(item.active_vendors) || 0
            }))
          },
          platform: {
            uniqueCustomers: parseInt(platformStats[0]?.unique_customers) || 0,
            uniqueVendors: parseInt(platformStats[0]?.unique_vendors) || 0,
            averageOrderValue: parseFloat(platformStats[0]?.avg_order_value) || 0,
            deliveredOrders: parseInt(platformStats[0]?.delivered_orders) || 0
          },
          leaderboards: {
            topVendors: topVendors.map(vendor => ({
              id: vendor.id,
              businessName: vendor.businessName,
              logo: vendor.businessLogo,
              rating: vendor.rating,
              totalSales: vendor.totalSales,
              totalRevenue: vendor.totalRevenue,
              productCount: vendor._count.products,
              recentOrders: vendor._count.orders,
              contact: {
                email: vendor.user.email,
                phone: vendor.user.phone
              }
            })),
            topProducts: topProducts.map(product => ({
              id: product.id,
              name: product.name,
              image: product.images[0],
              price: product.price,
              sales: product.salesCount,
              views: product.viewCount,
              vendor: product.vendor.businessName
            }))
          },
          recent: {
            orders: recentOrders.map(order => ({
              id: order.id,
              orderNumber: order.orderNumber,
              customer: order.customer.fullName || order.customer.email,
              vendor: order.vendor.businessName,
              total: order.total,
              status: order.status,
              items: order.items.map(item => item.product.name).join(', '),
              date: order.createdAt
            })),
            activities: recentActivities.map(activity => ({
              id: activity.id,
              user: activity.user ? activity.user.fullName || activity.user.email : 'System',
              action: activity.action,
              entity: activity.entity,
              timestamp: activity.createdAt,
              ip: activity.ipAddress
            }))
          },
          analytics: {
            subscriptionOverview: subscriptionOverview.map(item => ({
              plan: item.plan,
              count: parseInt(item.count) || 0,
              revenue: parseFloat(item.total_revenue) || 0
            })),
            categoryDistribution: categoryDistribution.map(item => ({
              id: item.id,
              name: item.name,
              slug: item.slug,
              productCount: parseInt(item.product_count) || 0,
              featuredCount: parseInt(item.featured_count) || 0
            }))
          }
        }
      });

    } catch (error) {
      console.error('Get admin dashboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to load dashboard',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Get vendor dashboard
  getVendorDashboard: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;

      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor profile not found'
        });
      }

      // Calculate date ranges
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));

      // Get vendor profile
      const vendor = await prisma.vendorProfile.findUnique({
        where: { id: vendorId },
        select: {
          id: true,
          businessName: true,
          businessLogo: true,
          status: true,
          rating: true,
          totalSales: true,
          totalRevenue: true,
          trialEndsAt: true,
          subscriptionEndsAt: true,
          currentPlan: true,
          user: {
            select: {
              email: true,
              phone: true
            }
          }
        }
      });

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message: 'Vendor not found'
        });
      }

      // Get all vendor statistics in parallel
      const [
        totalRevenue,
        todayRevenue,
        weekRevenue,
        monthRevenue,
        totalOrders,
        todayOrders,
        weekOrders,
        monthOrders,
        pendingOrders,
        totalProducts,
        activeProducts,
        lowStockProducts,
        outOfStockProducts,
        customerCount,
        recentReviews,
        subscriptionStatus
      ] = await Promise.all([
        // Total revenue
        prisma.order.aggregate({
          where: { 
            vendorId,
            paymentStatus: 'PAID' 
          },
          _sum: { total: true }
        }),
        // Today's revenue
        prisma.order.aggregate({
          where: { 
            vendorId,
            paymentStatus: 'PAID',
            createdAt: { gte: startOfToday }
          },
          _sum: { total: true }
        }),
        // This week's revenue
        prisma.order.aggregate({
          where: { 
            vendorId,
            paymentStatus: 'PAID',
            createdAt: { gte: startOfWeek }
          },
          _sum: { total: true }
        }),
        // This month's revenue
        prisma.order.aggregate({
          where: { 
            vendorId,
            paymentStatus: 'PAID',
            createdAt: { gte: startOfMonth }
          },
          _sum: { total: true }
        }),
        // Total orders
        prisma.order.count({
          where: { vendorId }
        }),
        // Today's orders
        prisma.order.count({
          where: { 
            vendorId,
            createdAt: { gte: startOfToday }
          }
        }),
        // This week's orders
        prisma.order.count({
          where: { 
            vendorId,
            createdAt: { gte: startOfWeek }
          }
        }),
        // This month's orders
        prisma.order.count({
          where: { 
            vendorId,
            createdAt: { gte: startOfMonth }
          }
        }),
        // Pending orders
        prisma.order.count({
          where: { 
            vendorId,
            status: { in: ['PENDING', 'CONFIRMED', 'PROCESSING'] }
          }
        }),
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
        // Low stock products
        prisma.product.count({
          where: { 
            vendorId,
            quantity: { lte: 5 },
            quantity: { gt: 0 }
          }
        }),
        // Out of stock products
        prisma.product.count({
          where: { 
            vendorId,
            quantity: 0
          }
        }),
        // Unique customers
        prisma.order.aggregate({
          where: { 
            vendorId,
            paymentStatus: 'PAID'
          },
          _count: { customerId: true }
        }),
        // Recent reviews
        prisma.review.findMany({
          where: { vendorId },
          include: {
            user: {
              select: {
                fullName: true,
                avatar: true
              }
            },
            product: {
              select: {
                name: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 5
        }),
        // Subscription status
        prisma.subscription.findFirst({
          where: { 
            vendorId,
            status: 'ACTIVE'
          },
          orderBy: { createdAt: 'desc' }
        })
      ]);

      // Get sales data for chart (last 30 days)
      const salesData = await prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('day', o."createdAt") as date,
          COUNT(*) as order_count,
          SUM(o."total") as revenue,
          COUNT(DISTINCT o."customerId") as unique_customers
        FROM "orders" o
        WHERE o."vendorId" = ${vendorId}
          AND o."paymentStatus" = 'PAID'
          AND o."createdAt" >= ${thirtyDaysAgo}
        GROUP BY DATE_TRUNC('day', o."createdAt")
        ORDER BY date
      `;

      // Get top selling products
      const topProducts = await prisma.product.findMany({
        where: { vendorId },
        select: {
          id: true,
          name: true,
          images: true,
          price: true,
          salesCount: true,
          viewCount: true,
          quantity: true
        },
        orderBy: { salesCount: 'desc' },
        take: 5
      });

      // Get recent orders
      const recentOrders = await prisma.order.findMany({
        where: { vendorId },
        include: {
          customer: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true
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
        take: 10
      });

      // Get inventory alerts
      const inventoryAlerts = await prisma.product.findMany({
        where: { 
          vendorId,
          quantity: { lte: 10 },
          quantity: { gt: 0 }
        },
        select: {
          id: true,
          name: true,
          images: true,
          quantity: true,
          lowStockThreshold: true
        },
        orderBy: { quantity: 'asc' },
        take: 10
      });

      // Get category-wise sales
      const categorySales = await prisma.$queryRaw`
        SELECT 
          c.id,
          c.name,
          COUNT(DISTINCT oi."productId") as product_count,
          SUM(oi."quantity") as total_quantity,
          SUM(oi."price" * oi."quantity") as total_revenue
        FROM "order_items" oi
        JOIN "products" p ON oi."productId" = p.id
        JOIN "categories" c ON p."categoryId" = c.id
        JOIN "orders" o ON oi."orderId" = o.id
        WHERE p."vendorId" = ${vendorId}
          AND o."paymentStatus" = 'PAID'
          AND o."createdAt" >= ${thirtyDaysAgo}
        GROUP BY c.id, c.name
        ORDER BY total_revenue DESC
        LIMIT 5
      `;

      // Check trial status
      let trialStatus = null;
      if (vendor.status === 'TRIAL' && vendor.trialEndsAt) {
        const daysLeft = Math.ceil((vendor.trialEndsAt - new Date()) / (1000 * 60 * 60 * 24));
        trialStatus = {
          isTrial: true,
          daysLeft: daysLeft > 0 ? daysLeft : 0,
          trialEndsAt: vendor.trialEndsAt,
          expired: vendor.trialEndsAt < new Date()
        };
      }

      // Check subscription status
      let subscriptionInfo = null;
      if (subscriptionStatus) {
        const daysUntilRenewal = Math.ceil((subscriptionStatus.endDate - new Date()) / (1000 * 60 * 60 * 24));
        subscriptionInfo = {
          plan: subscriptionStatus.plan,
          amount: subscriptionStatus.amount,
          startDate: subscriptionStatus.startDate,
          endDate: subscriptionStatus.endDate,
          daysUntilRenewal: daysUntilRenewal > 0 ? daysUntilRenewal : 0,
          autoRenew: subscriptionStatus.autoRenew
        };
      }

      res.json({
        success: true,
        data: {
          vendor: {
            id: vendor.id,
            businessName: vendor.businessName,
            logo: vendor.businessLogo,
            status: vendor.status,
            rating: vendor.rating,
            contact: {
              email: vendor.user.email,
              phone: vendor.user.phone
            }
          },
          overview: {
            totalRevenue: totalRevenue._sum.total || 0,
            todayRevenue: todayRevenue._sum.total || 0,
            weekRevenue: weekRevenue._sum.total || 0,
            monthRevenue: monthRevenue._sum.total || 0,
            totalOrders,
            todayOrders,
            weekOrders,
            monthOrders,
            pendingOrders,
            totalProducts,
            activeProducts,
            lowStockProducts,
            outOfStockProducts,
            customerCount: customerCount._count.customerId || 0
          },
          charts: {
            salesData: salesData.map(item => ({
              date: item.date.toISOString().split('T')[0],
              revenue: parseFloat(item.revenue) || 0,
              orders: parseInt(item.order_count) || 0,
              customers: parseInt(item.unique_customers) || 0
            })),
            categorySales: categorySales.map(item => ({
              category: item.name,
              productCount: parseInt(item.product_count) || 0,
              quantity: parseInt(item.total_quantity) || 0,
              revenue: parseFloat(item.total_revenue) || 0
            }))
          },
          products: {
            topSelling: topProducts.map(product => ({
              id: product.id,
              name: product.name,
              image: product.images[0],
              price: product.price,
              sales: product.salesCount,
              views: product.viewCount,
              stock: product.quantity
            }))
          },
          recent: {
            orders: recentOrders.map(order => ({
              id: order.id,
              orderNumber: order.orderNumber,
              customer: order.customer.fullName || order.customer.email,
              phone: order.customer.phone,
              total: order.total,
              status: order.status,
              items: order.items.map(item => item.product.name).join(', '),
              date: order.createdAt
            })),
            reviews: recentReviews.map(review => ({
              id: review.id,
              user: review.user.fullName || 'Customer',
              avatar: review.user.avatar,
              product: review.product.name,
              rating: review.rating,
              comment: review.comment,
              date: review.createdAt
            }))
          },
          alerts: {
            inventory: inventoryAlerts.map(product => ({
              id: product.id,
              name: product.name,
              image: product.images[0],
              quantity: product.quantity,
              threshold: product.lowStockThreshold,
              status: product.quantity <= product.lowStockThreshold ? 'low' : 'warning'
            })),
            trial: trialStatus,
            subscription: subscriptionInfo
          }
        }
      });

    } catch (error) {
      console.error('Get vendor dashboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to load vendor dashboard'
      });
    }
  },

  // Get customer dashboard
  getCustomerDashboard: async (req, res) => {
    try {
      const customerId = req.user.userId;

      // Get customer profile
      const customer = await prisma.user.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          email: true,
          phone: true,
          fullName: true,
          avatar: true,
          addresses: {
            where: { isDefault: true },
            take: 1
          }
        }
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Calculate date ranges
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));

      // Get customer statistics
      const [
        totalOrders,
        pendingOrders,
        totalSpent,
        monthSpent,
        favoriteVendors,
        recentOrders,
        cartItems,
        wishlistItems
      ] = await Promise.all([
        // Total orders
        prisma.order.count({
          where: { customerId }
        }),
        // Pending orders
        prisma.order.count({
          where: { 
            customerId,
            status: { in: ['PENDING', 'CONFIRMED', 'PROCESSING'] }
          }
        }),
        // Total spent
        prisma.order.aggregate({
          where: { 
            customerId,
            paymentStatus: 'PAID'
          },
          _sum: { total: true }
        }),
        // This month spent
        prisma.order.aggregate({
          where: { 
            customerId,
            paymentStatus: 'PAID',
            createdAt: { gte: startOfMonth }
          },
          _sum: { total: true }
        }),
        // Favorite vendors (most ordered from)
        prisma.$queryRaw`
          SELECT 
            v.id,
            v."businessName",
            v."businessLogo",
            v.rating,
            COUNT(DISTINCT o.id) as order_count,
            SUM(o.total) as total_spent
          FROM "orders" o
          JOIN "vendor_profiles" v ON o."vendorId" = v.id
          WHERE o."customerId" = ${customerId}
            AND o."paymentStatus" = 'PAID'
          GROUP BY v.id, v."businessName", v."businessLogo", v.rating
          ORDER BY order_count DESC
          LIMIT 5
        `,
        // Recent orders
        prisma.order.findMany({
          where: { customerId },
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
        // Cart items
        prisma.cartItem.findMany({
          where: { cart: { userId: customerId } },
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
          },
          orderBy: { createdAt: 'desc' },
          take: 5
        }),
        // Wishlist items (placeholder - implement wishlist model)
        []
      ]);

      // Get order history for chart
      const orderHistory = await prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('month', "createdAt") as month,
          COUNT(*) as order_count,
          SUM("total") as total_spent
        FROM "orders"
        WHERE "customerId" = ${customerId}
          AND "paymentStatus" = 'PAID'
        GROUP BY DATE_TRUNC('month', "createdAt")
        ORDER BY month DESC
        LIMIT 6
      `;

      // Get recommended products based on purchase history
      const recommendedProducts = await prisma.$queryRaw`
        SELECT 
          p.id,
          p.name,
          p."slug",
          p.images,
          p.price,
          p."salesCount",
          v."businessName",
          COUNT(DISTINCT oi."orderId") as purchase_count
        FROM "order_items" oi
        JOIN "orders" o ON oi."orderId" = o.id
        JOIN "products" p ON oi."productId" = p.id
        JOIN "vendor_profiles" v ON p."vendorId" = v.id
        WHERE o."customerId" = ${customerId}
          AND p."isActive" = true
          AND p."isApproved" = true
          AND p."quantity" > 0
        GROUP BY p.id, p.name, p."slug", p.images, p.price, p."salesCount", v."businessName"
        ORDER BY purchase_count DESC
        LIMIT 6
      `;

      // Get recently viewed products (implement view tracking)
      const recentlyViewed = [];

      res.json({
        success: true,
        data: {
          customer: {
            id: customer.id,
            name: customer.fullName,
            email: customer.email,
            phone: customer.phone,
            avatar: customer.avatar,
            defaultAddress: customer.addresses[0] || null
          },
          overview: {
            totalOrders,
            pendingOrders,
            totalSpent: totalSpent._sum.total || 0,
            monthSpent: monthSpent._sum.total || 0,
            averageOrderValue: totalOrders > 0 ? (totalSpent._sum.total || 0) / totalOrders : 0,
            cartItems: cartItems.length
          },
          charts: {
            orderHistory: orderHistory.map(item => ({
              month: item.month.toISOString().split('T')[0].substring(0, 7),
              orders: parseInt(item.order_count) || 0,
              spent: parseFloat(item.total_spent) || 0
            }))
          },
          favorites: {
            vendors: favoriteVendors.map(vendor => ({
              id: vendor.id,
              name: vendor.businessName,
              logo: vendor.businessLogo,
              rating: vendor.rating,
              orderCount: parseInt(vendor.order_count) || 0,
              totalSpent: parseFloat(vendor.total_spent) || 0
            }))
          },
          recent: {
            orders: recentOrders.map(order => ({
              id: order.id,
              orderNumber: order.orderNumber,
              vendor: order.vendor.businessName,
              logo: order.vendor.businessLogo,
              total: order.total,
              status: order.status,
              items: order.items.map(item => item.product.name).join(', '),
              date: order.createdAt
            }))
          },
          cart: {
            items: cartItems.map(item => ({
              id: item.id,
              product: {
                id: item.product.id,
                name: item.product.name,
                image: item.product.images[0],
                price: item.product.price,
                vendor: item.product.vendor.businessName
              },
              quantity: item.quantity,
              total: item.price * item.quantity
            })),
            itemCount: cartItems.length,
            total: cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
          },
          recommendations: {
            products: recommendedProducts.map(product => ({
              id: product.id,
              name: product.name,
              slug: product.slug,
              image: product.images[0],
              price: product.price,
              sales: product.salesCount,
              vendor: product.businessName,
              purchased: parseInt(product.purchase_count) || 0
            })),
            recentlyViewed
          },
          wishlist: wishlistItems // Placeholder
        }
      });

    } catch (error) {
      console.error('Get customer dashboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to load customer dashboard'
      });
    }
  },

  // Get platform analytics (admin only)
  getPlatformAnalytics: async (req, res) => {
    try {
      const { period = 'month' } = req.query; // day, week, month, year

      // Calculate date ranges
      const now = new Date();
      let startDate;
      let groupBy;

      switch (period) {
        case 'day':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          groupBy = 'hour';
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          groupBy = 'day';
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          groupBy = 'day';
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          groupBy = 'month';
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          groupBy = 'day';
      }

      // Get platform analytics
      const [
        revenueTrend,
        orderTrend,
        customerTrend,
        vendorTrend,
        categoryPerformance,
        paymentMethodDistribution,
        geographicDistribution
      ] = await Promise.all([
        // Revenue trend
        prisma.$queryRaw`
          SELECT 
            DATE_TRUNC(${groupBy}, "createdAt") as period,
            SUM("total") as revenue,
            COUNT(*) as orders
          FROM "orders"
          WHERE "paymentStatus" = 'PAID'
            AND "createdAt" >= ${startDate}
          GROUP BY DATE_TRUNC(${groupBy}, "createdAt")
          ORDER BY period
        `,
        // Order trend
        prisma.$queryRaw`
          SELECT 
            DATE_TRUNC(${groupBy}, "createdAt") as period,
            COUNT(*) as orders,
            COUNT(DISTINCT "customerId") as customers,
            COUNT(DISTINCT "vendorId") as vendors
          FROM "orders"
          WHERE "createdAt" >= ${startDate}
          GROUP BY DATE_TRUNC(${groupBy}, "createdAt")
          ORDER BY period
        `,
        // Customer trend
        prisma.$queryRaw`
          SELECT 
            DATE_TRUNC(${groupBy}, "createdAt") as period,
            COUNT(*) as new_customers,
            COUNT(CASE WHEN "lastLogin" >= ${startDate} THEN 1 END) as active_customers
          FROM "users"
          WHERE "role" = 'CUSTOMER'
            AND "createdAt" >= ${startDate}
          GROUP BY DATE_TRUNC(${groupBy}, "createdAt")
          ORDER BY period
        `,
        // Vendor trend
        prisma.$queryRaw`
          SELECT 
            DATE_TRUNC(${groupBy}, "createdAt") as period,
            COUNT(*) as new_vendors,
            COUNT(CASE WHEN "status" = 'ACTIVE' THEN 1 END) as active_vendors,
            COUNT(CASE WHEN "status" = 'TRIAL' THEN 1 END) as trial_vendors
          FROM "vendor_profiles"
          WHERE "createdAt" >= ${startDate}
          GROUP BY DATE_TRUNC(${groupBy}, "createdAt")
          ORDER BY period
        `,
        // Category performance
        prisma.$queryRaw`
          SELECT 
            c.id,
            c.name,
            c.slug,
            COUNT(DISTINCT o.id) as order_count,
            SUM(o.total) as revenue,
            COUNT(DISTINCT o."customerId") as customers,
            COUNT(DISTINCT p."vendorId") as vendors
          FROM "categories" c
          LEFT JOIN "products" p ON c.id = p."categoryId"
          LEFT JOIN "order_items" oi ON p.id = oi."productId"
          LEFT JOIN "orders" o ON oi."orderId" = o.id
          WHERE o."paymentStatus" = 'PAID'
            AND o."createdAt" >= ${startDate}
          GROUP BY c.id, c.name, c.slug
          ORDER BY revenue DESC
          LIMIT 10
        `,
        // Payment method distribution
        prisma.$queryRaw`
          SELECT 
            "paymentMethod",
            COUNT(*) as transaction_count,
            SUM("total") as total_amount,
            AVG("total") as average_amount
          FROM "orders"
          WHERE "paymentStatus" = 'PAID'
            AND "createdAt" >= ${startDate}
          GROUP BY "paymentMethod"
          ORDER BY total_amount DESC
        `,
        // Geographic distribution (based on delivery cities)
        prisma.$queryRaw`
          SELECT 
            o."deliveryCity" as city,
            COUNT(*) as order_count,
            SUM(o.total) as revenue,
            COUNT(DISTINCT o."customerId") as customers
          FROM "orders" o
          WHERE o."paymentStatus" = 'PAID'
            AND o."deliveryCity" IS NOT NULL
            AND o."createdAt" >= ${startDate}
          GROUP BY o."deliveryCity"
          ORDER BY revenue DESC
          LIMIT 10
        `
      ]);

      // Calculate key metrics
      const totalRevenue = revenueTrend.reduce((sum, item) => sum + parseFloat(item.revenue || 0), 0);
      const totalOrders = orderTrend.reduce((sum, item) => sum + parseInt(item.orders || 0), 0);
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      
      const newCustomers = customerTrend.reduce((sum, item) => sum + parseInt(item.new_customers || 0), 0);
      const activeCustomers = customerTrend.reduce((sum, item) => sum + parseInt(item.active_customers || 0), 0);
      
      const newVendors = vendorTrend.reduce((sum, item) => sum + parseInt(item.new_vendors || 0), 0);
      const activeVendors = vendorTrend.reduce((sum, item) => sum + parseInt(item.active_vendors || 0), 0);

      res.json({
        success: true,
        data: {
          period,
          metrics: {
            totalRevenue,
            totalOrders,
            avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
            newCustomers,
            activeCustomers,
            newVendors,
            activeVendors,
            customerRetentionRate: newCustomers > 0 ? (activeCustomers / newCustomers * 100).toFixed(2) : 0
          },
          trends: {
            revenue: revenueTrend.map(item => ({
              period: item.period.toISOString(),
              revenue: parseFloat(item.revenue) || 0,
              orders: parseInt(item.orders) || 0
            })),
            orders: orderTrend.map(item => ({
              period: item.period.toISOString(),
              orders: parseInt(item.orders) || 0,
              customers: parseInt(item.customers) || 0,
              vendors: parseInt(item.vendors) || 0
            })),
            customers: customerTrend.map(item => ({
              period: item.period.toISOString(),
              newCustomers: parseInt(item.new_customers) || 0,
              activeCustomers: parseInt(item.active_customers) || 0
            })),
            vendors: vendorTrend.map(item => ({
              period: item.period.toISOString(),
              newVendors: parseInt(item.new_vendors) || 0,
              activeVendors: parseInt(item.active_vendors) || 0,
              trialVendors: parseInt(item.trial_vendors) || 0
            }))
          },
          performance: {
            categories: categoryPerformance.map(item => ({
              id: item.id,
              name: item.name,
              slug: item.slug,
              orders: parseInt(item.order_count) || 0,
              revenue: parseFloat(item.revenue) || 0,
              customers: parseInt(item.customers) || 0,
              vendors: parseInt(item.vendors) || 0
            })),
            paymentMethods: paymentMethodDistribution.map(item => ({
              method: item.paymentMethod,
              transactions: parseInt(item.transaction_count) || 0,
              amount: parseFloat(item.total_amount) || 0,
              average: parseFloat(item.average_amount) || 0
            })),
            geography: geographicDistribution.map(item => ({
              city: item.city,
              orders: parseInt(item.order_count) || 0,
              revenue: parseFloat(item.revenue) || 0,
              customers: parseInt(item.customers) || 0
            }))
          }
        }
      });

    } catch (error) {
      console.error('Get platform analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to load platform analytics'
      });
    }
  },

  // Get real-time dashboard data
  getRealtimeData: async (req, res) => {
    try {
      const now = new Date();
      const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get real-time statistics
      const [
        recentOrders,
        recentCustomers,
        recentVendors,
        activeUsers,
        revenueLastHour,
        ordersLastHour
      ] = await Promise.all([
        // Recent orders (last hour)
        prisma.order.findMany({
          where: {
            createdAt: { gte: lastHour }
          },
          include: {
            customer: {
              select: {
                fullName: true,
                email: true
              }
            },
            vendor: {
              select: {
                businessName: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        }),
        // Recent customers (last 24 hours)
        prisma.user.findMany({
          where: {
            role: 'CUSTOMER',
            createdAt: { gte: last24Hours }
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        }),
        // Recent vendors (last 24 hours)
        prisma.vendorProfile.findMany({
          where: {
            createdAt: { gte: last24Hours }
          },
          include: {
            user: {
              select: {
                email: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        }),
        // Active users (last 15 minutes)
        prisma.user.count({
          where: {
            lastLogin: { gte: new Date(now.getTime() - 15 * 60 * 1000) }
          }
        }),
        // Revenue last hour
        prisma.order.aggregate({
          where: {
            paymentStatus: 'PAID',
            createdAt: { gte: lastHour }
          },
          _sum: { total: true }
        }),
        // Orders last hour
        prisma.order.count({
          where: {
            createdAt: { gte: lastHour }
          }
        })
      ]);

      // Get system health
      const databaseStatus = 'healthy'; // You can implement actual health checks
      const apiStatus = 'healthy';
      const cacheStatus = 'healthy';

      // Get pending tasks
      const pendingTasks = {
        ordersToProcess: await prisma.order.count({
          where: { status: 'PENDING' }
        }),
        vendorsToApprove: await prisma.vendorProfile.count({
          where: { status: 'PENDING' }
        }),
        productsToReview: await prisma.product.count({
          where: { isApproved: false }
        }),
        supportTickets: 0 // Implement support ticket system
      };

      res.json({
        success: true,
        data: {
          timestamp: now.toISOString(),
          realtime: {
            recentOrders: recentOrders.map(order => ({
              id: order.id,
              orderNumber: order.orderNumber,
              customer: order.customer.fullName || order.customer.email,
              vendor: order.vendor.businessName,
              total: order.total,
              status: order.status,
              time: order.createdAt
            })),
            recentCustomers: recentCustomers.map(customer => ({
              id: customer.id,
              email: customer.email,
              name: customer.fullName,
              joined: customer.createdAt
            })),
            recentVendors: recentVendors.map(vendor => ({
              id: vendor.id,
              businessName: vendor.businessName,
              email: vendor.user.email,
              status: vendor.status,
              joined: vendor.createdAt
            }))
          },
          metrics: {
            activeUsers,
            revenueLastHour: revenueLastHour._sum.total || 0,
            ordersLastHour,
            conversionRate: activeUsers > 0 ? (ordersLastHour / activeUsers * 100).toFixed(2) : 0
          },
          system: {
            health: {
              database: databaseStatus,
              api: apiStatus,
              cache: cacheStatus
            },
            pendingTasks
          }
        }
      });

    } catch (error) {
      console.error('Get realtime data error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to load real-time data'
      });
    }
  }
};

module.exports = dashboardController;