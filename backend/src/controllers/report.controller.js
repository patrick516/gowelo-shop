// src/controllers/admin/report.controller.js
const { prisma } = require('../../config/prisma');

class AdminReportController {
  
  // Sales Report
  async getSalesReport(req, res) {
    try {
      const { startDate, endDate, groupBy = 'day' } = req.query;
      
      let dateFilter = {};
      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) dateFilter.createdAt.gte = new Date(startDate);
        if (endDate) dateFilter.createdAt.lte = new Date(endDate);
      }

      const salesReport = await prisma.$queryRaw`
        SELECT 
          DATE_TRUNC(${groupBy}, "createdAt") as period,
          COUNT(*) as order_count,
          SUM("total") as revenue,
          COUNT(DISTINCT "customerId") as customers,
          COUNT(DISTINCT "vendorId") as vendors,
          AVG("total") as avg_order_value
        FROM "orders"
        WHERE "paymentStatus" = 'PAID'
          ${startDate ? `AND "createdAt" >= ${new Date(startDate)}` : ''}
          ${endDate ? `AND "createdAt" <= ${new Date(endDate)}` : ''}
        GROUP BY DATE_TRUNC(${groupBy}, "createdAt")
        ORDER BY period
      `;

      res.json({
        success: true,
        data: salesReport
      });
    } catch (error) {
      console.error('Sales report error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate sales report',
        error: error.message 
      });
    }
  }
  
  // Vendor Performance Report
  async getVendorPerformanceReport(req, res) {
    try {
      const { startDate, endDate, limit = 20 } = req.query;

      const vendorPerformance = await prisma.$queryRaw`
        SELECT 
          v.id,
          v."businessName",
          v."businessLogo",
          v.rating,
          COUNT(o.id) as order_count,
          SUM(o.total) as revenue,
          AVG(o.total) as avg_order_value,
          COUNT(DISTINCT o."customerId") as customers,
          COUNT(DISTINCT p.id) as products
        FROM "vendor_profiles" v
        LEFT JOIN "orders" o ON v.id = o."vendorId" 
          AND o."paymentStatus" = 'PAID'
          ${startDate ? `AND o."createdAt" >= ${new Date(startDate)}` : ''}
          ${endDate ? `AND o."createdAt" <= ${new Date(endDate)}` : ''}
        LEFT JOIN "products" p ON v.id = p."vendorId" 
          AND p."isActive" = true
        GROUP BY v.id, v."businessName", v."businessLogo", v.rating
        ORDER BY revenue DESC NULLS LAST
        LIMIT ${parseInt(limit)}
      `;

      res.json({
        success: true,
        data: vendorPerformance
      });
    } catch (error) {
      console.error('Vendor performance report error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate vendor performance report',
        error: error.message 
      });
    }
  }
  
  // Product Performance Report
  async getProductPerformanceReport(req, res) {
    try {
      const { startDate, endDate, limit = 20 } = req.query;

      const productPerformance = await prisma.$queryRaw`
        SELECT 
          p.id,
          p.name,
          p.images,
          p.price,
          p."salesCount",
          p."viewCount",
          v."businessName",
          c.name as category_name,
          SUM(oi.quantity) as total_sold,
          SUM(oi.quantity * oi.price) as revenue
        FROM "products" p
        LEFT JOIN "order_items" oi ON p.id = oi."productId"
        LEFT JOIN "orders" o ON oi."orderId" = o.id 
          AND o."paymentStatus" = 'PAID'
          ${startDate ? `AND o."createdAt" >= ${new Date(startDate)}` : ''}
          ${endDate ? `AND o."createdAt" <= ${new Date(endDate)}` : ''}
        LEFT JOIN "vendor_profiles" v ON p."vendorId" = v.id
        LEFT JOIN "categories" c ON p."categoryId" = c.id
        WHERE p."isActive" = true
        GROUP BY p.id, p.name, p.images, p.price, p."salesCount", p."viewCount", 
                 v."businessName", c.name
        ORDER BY revenue DESC NULLS LAST
        LIMIT ${parseInt(limit)}
      `;

      res.json({
        success: true,
        data: productPerformance
      });
    } catch (error) {
      console.error('Product performance report error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate product performance report',
        error: error.message 
      });
    }
  }
  
  // Customer Analytics Report
  async getCustomerAnalyticsReport(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const customerAnalytics = await prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('month', u."createdAt") as join_month,
          COUNT(DISTINCT u.id) as new_customers,
          COUNT(DISTINCT o."customerId") as purchasing_customers,
          COUNT(DISTINCT o.id) as total_orders,
          SUM(o.total) as total_revenue,
          AVG(o.total) as avg_order_value
        FROM "users" u
        LEFT JOIN "orders" o ON u.id = o."customerId" 
          AND o."paymentStatus" = 'PAID'
          ${startDate ? `AND o."createdAt" >= ${new Date(startDate)}` : ''}
          ${endDate ? `AND o."createdAt" <= ${new Date(endDate)}` : ''}
        WHERE u."role" = 'CUSTOMER'
          ${startDate ? `AND u."createdAt" >= ${new Date(startDate)}` : ''}
          ${endDate ? `AND u."createdAt" <= ${new Date(endDate)}` : ''}
        GROUP BY DATE_TRUNC('month', u."createdAt")
        ORDER BY join_month
      `;

      res.json({
        success: true,
        data: customerAnalytics
      });
    } catch (error) {
      console.error('Customer analytics report error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate customer analytics report',
        error: error.message 
      });
    }
  }
  
  // Subscription Report
  async getSubscriptionReport(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const subscriptionReport = await prisma.$queryRaw`
        SELECT 
          s."plan",
          COUNT(*) as subscription_count,
          SUM(s.amount) as total_revenue,
          AVG(s.amount) as avg_amount,
          COUNT(DISTINCT s."vendorId") as vendors,
          MIN(s."startDate") as earliest_start,
          MAX(s."endDate") as latest_end
        FROM "subscriptions" s
        WHERE s."status" = 'ACTIVE'
          ${startDate ? `AND s."createdAt" >= ${new Date(startDate)}` : ''}
          ${endDate ? `AND s."createdAt" <= ${new Date(endDate)}` : ''}
        GROUP BY s."plan"
        ORDER BY total_revenue DESC
      `;

      // Get upcoming renewals
      const upcomingRenewals = await prisma.$queryRaw`
        SELECT 
          v."businessName",
          v."contactEmail",
          v."contactPhone",
          s."plan",
          s."endDate",
          s.amount,
          DATE_PART('day', s."endDate" - CURRENT_DATE) as days_until_renewal
        FROM "subscriptions" s
        JOIN "vendor_profiles" v ON s."vendorId" = v.id
        WHERE s."status" = 'ACTIVE'
          AND s."endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        ORDER BY s."endDate"
        LIMIT 50
      `;

      // Get trial conversion
      const trialConversion = await prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('month', v."createdAt") as month,
          COUNT(*) as new_vendors,
          COUNT(CASE WHEN v."status" = 'ACTIVE' THEN 1 END) as converted,
          COUNT(CASE WHEN v."status" = 'TRIAL' THEN 1 END) as still_trial,
          COUNT(CASE WHEN v."status" = 'EXPIRED' THEN 1 END) as expired
        FROM "vendor_profiles" v
        WHERE v."createdAt" >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', v."createdAt")
        ORDER BY month
      `;

      res.json({
        success: true,
        data: {
          summary: subscriptionReport,
          upcomingRenewals,
          trialConversion
        }
      });
    } catch (error) {
      console.error('Subscription report error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate subscription report',
        error: error.message 
      });
    }
  }
  
  // Inventory Report
  async getInventoryReport(req, res) {
    try {
      const { threshold = 10 } = req.query;

      const inventoryReport = await prisma.$queryRaw`
        SELECT 
          p.id,
          p.name,
          p.images,
          p.price,
          p.quantity,
          p."lowStockThreshold",
          v."businessName",
          c.name as category_name,
          p."salesCount",
          p."viewCount",
          CASE 
            WHEN p.quantity = 0 THEN 'out_of_stock'
            WHEN p.quantity <= p."lowStockThreshold" THEN 'low_stock'
            ELSE 'in_stock'
          END as stock_status
        FROM "products" p
        JOIN "vendor_profiles" v ON p."vendorId" = v.id
        LEFT JOIN "categories" c ON p."categoryId" = c.id
        WHERE p."isActive" = true
          AND (p.quantity = 0 OR p.quantity <= ${parseInt(threshold)})
        ORDER BY 
          CASE 
            WHEN p.quantity = 0 THEN 1
            WHEN p.quantity <= p."lowStockThreshold" THEN 2
            ELSE 3
          END,
          p.quantity
        LIMIT 100
      `;

      // Get inventory summary
      const inventorySummary = await prisma.$queryRaw`
        SELECT 
          COUNT(CASE WHEN quantity = 0 THEN 1 END) as out_of_stock,
          COUNT(CASE WHEN quantity > 0 AND quantity <= "lowStockThreshold" THEN 1 END) as low_stock,
          COUNT(CASE WHEN quantity > "lowStockThreshold" THEN 1 END) as in_stock,
          SUM(quantity) as total_quantity,
          AVG(price) as avg_price
        FROM "products"
        WHERE "isActive" = true
      `;

      res.json({
        success: true,
        data: {
          items: inventoryReport,
          summary: inventorySummary[0]
        }
      });
    } catch (error) {
      console.error('Inventory report error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate inventory report',
        error: error.message 
      });
    }
  }
  
  // Comprehensive Report
  async getComprehensiveReport(req, res) {
    try {
      const { format = 'json', startDate, endDate } = req.query;

      // Get all data for comprehensive report
      const [
        salesData,
        vendorData,
        productData,
        customerData,
        subscriptionData
      ] = await Promise.all([
        // Sales data
        prisma.$queryRaw`
          SELECT 
            DATE_TRUNC('month', "createdAt") as month,
            COUNT(*) as orders,
            SUM("total") as revenue,
            COUNT(DISTINCT "customerId") as customers,
            COUNT(DISTINCT "vendorId") as vendors
          FROM "orders"
          WHERE "paymentStatus" = 'PAID'
            ${startDate ? `AND "createdAt" >= ${new Date(startDate)}` : ''}
            ${endDate ? `AND "createdAt" <= ${new Date(endDate)}` : ''}
          GROUP BY DATE_TRUNC('month', "createdAt")
          ORDER BY month
        `,
        // Vendor data
        prisma.$queryRaw`
          SELECT 
            "status",
            COUNT(*) as count,
            AVG("rating") as avg_rating,
            SUM("totalSales") as total_sales,
            SUM("totalRevenue") as total_revenue
          FROM "vendor_profiles"
          GROUP BY "status"
        `,
        // Product data
        prisma.$queryRaw`
          SELECT 
            c.name as category,
            COUNT(p.id) as product_count,
            SUM(p."salesCount") as total_sales,
            SUM(p."viewCount") as total_views,
            AVG(p.price) as avg_price
          FROM "products" p
          LEFT JOIN "categories" c ON p."categoryId" = c.id
          WHERE p."isActive" = true
          GROUP BY c.name
          ORDER BY product_count DESC
        `,
        // Customer data
        prisma.$queryRaw`
          SELECT 
            DATE_TRUNC('month', "createdAt") as month,
            COUNT(*) as new_customers,
            COUNT(CASE WHEN "lastLogin" >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as active_customers
          FROM "users"
          WHERE "role" = 'CUSTOMER'
            ${startDate ? `AND "createdAt" >= ${new Date(startDate)}` : ''}
            ${endDate ? `AND "createdAt" <= ${new Date(endDate)}` : ''}
          GROUP BY DATE_TRUNC('month', "createdAt")
          ORDER BY month
        `,
        // Subscription data
        prisma.$queryRaw`
          SELECT 
            "plan",
            COUNT(*) as subscriptions,
            SUM(amount) as revenue,
            AVG(amount) as avg_amount
          FROM "subscriptions"
          WHERE "status" = 'ACTIVE'
          GROUP BY "plan"
        `
      ]);

      const comprehensiveReport = {
        period: {
          startDate: startDate || 'Beginning',
          endDate: endDate || 'Now'
        },
        sales: salesData,
        vendors: vendorData,
        products: productData,
        customers: customerData,
        subscriptions: subscriptionData,
        generatedAt: new Date().toISOString()
      };

      if (format === 'csv') {
        // Convert to CSV (simplified version)
        const csvData = [
          ['Report Type', 'Metric', 'Value', 'Date'],
          ...salesData.map(item => ['Sales', 'Monthly Revenue', item.revenue, item.month]),
          ...vendorData.map(item => ['Vendors', `Vendors - ${item.status}`, item.count, '']),
          ...productData.map(item => ['Products', `Products - ${item.category}`, item.product_count, '']),
          ...customerData.map(item => ['Customers', 'New Customers', item.new_customers, item.month]),
          ...subscriptionData.map(item => ['Subscriptions', `Subscriptions - ${item.plan}`, item.subscriptions, ''])
        ];

        const csvContent = csvData.map(row => 
          row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=comprehensive_report_${Date.now()}.csv`);
        return res.send(csvContent);
      }

      // Default to JSON
      res.json({
        success: true,
        data: comprehensiveReport
      });
    } catch (error) {
      console.error('Comprehensive report error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate comprehensive report',
        error: error.message 
      });
    }
  }
}

module.exports = new AdminReportController();