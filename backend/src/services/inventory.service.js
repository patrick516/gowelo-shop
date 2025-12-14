// src/services/inventory.service.js
const { prisma } = require('../config/prisma');
const { sendEmail } = require('./notification.service');
const { sendSMS } = require('./sms.service');

class InventoryService {
  constructor() {
    this.prisma = prisma;
    this.defaultLowStockThreshold = 5;
    this.defaultCriticalStockThreshold = 2;
  }

  /**
   * Get inventory status for a product
   */
  getInventoryStatus(stockQuantity, lowStockThreshold = null, criticalStockThreshold = null) {
    const lowThreshold = lowStockThreshold || this.defaultLowStockThreshold;
    const criticalThreshold = criticalStockThreshold || this.defaultCriticalStockThreshold;

    if (stockQuantity === 0) {
      return {
        level: 'OUT_OF_STOCK',
        label: 'Out of Stock',
        color: '#EF4444', // red-500
        priority: 1,
        shouldReorder: true,
        reorderUrgency: 'critical',
        icon: '❌'
      };
    } else if (stockQuantity <= criticalThreshold) {
      return {
        level: 'CRITICAL',
        label: 'Critical Stock',
        color: '#F97316', // orange-500
        priority: 2,
        shouldReorder: true,
        reorderUrgency: 'high',
        icon: '⚠️'
      };
    } else if (stockQuantity <= lowThreshold) {
      return {
        level: 'LOW',
        label: 'Low Stock',
        color: '#EAB308', // yellow-500
        priority: 3,
        shouldReorder: true,
        reorderUrgency: 'medium',
        icon: '📉'
      };
    } else {
      return {
        level: 'IN_STOCK',
        label: 'In Stock',
        color: '#22C55E', // green-500
        priority: 4,
        shouldReorder: false,
        reorderUrgency: 'none',
        icon: '✅'
      };
    }
  }

  /**
   * Update product stock with inventory tracking
   */
  async updateProductStock(productId, vendorId, updateData, userInfo = {}) {
    try {
      const { quantity, action, notes, reference, adjustCostPrice } = updateData;

      if (!productId || !vendorId || quantity === undefined || !action) {
        throw new Error('Product ID, vendor ID, quantity, and action are required');
      }

      // Verify product belongs to vendor
      const product = await this.prisma.product.findFirst({
        where: {
          id: productId,
          vendorId,
          isActive: true
        }
      });

      if (!product) {
        throw new Error('Product not found or not authorized');
      }

      let newQuantity = product.quantity;
      let stockChange = 0;
      let operation = action.toUpperCase();

      // Calculate new quantity based on action
      switch (operation) {
        case 'ADD':
        case 'INCREASE':
          newQuantity += parseInt(quantity);
          stockChange = parseInt(quantity);
          operation = 'ADD';
          break;
        case 'REMOVE':
        case 'DECREASE':
          newQuantity -= parseInt(quantity);
          if (newQuantity < 0) {
            throw new Error('Cannot remove more stock than available');
          }
          stockChange = -parseInt(quantity);
          operation = 'REMOVE';
          break;
        case 'SET':
          newQuantity = parseInt(quantity);
          stockChange = newQuantity - product.quantity;
          break;
        case 'RESERVE':
          // For order reservations
          if (product.quantity < quantity) {
            throw new Error('Insufficient stock to reserve');
          }
          newQuantity = product.quantity - parseInt(quantity);
          stockChange = -parseInt(quantity);
          break;
        case 'RELEASE':
          // Release reserved stock
          newQuantity += parseInt(quantity);
          stockChange = parseInt(quantity);
          break;
        case 'SOLD':
          // Mark as sold (for completed orders)
          if (product.quantity < quantity) {
            throw new Error('Insufficient stock to mark as sold');
          }
          newQuantity -= parseInt(quantity);
          stockChange = -parseInt(quantity);
          operation = 'SOLD';
          break;
        case 'RETURN':
          // Return stock (for cancelled/returned orders)
          newQuantity += parseInt(quantity);
          stockChange = parseInt(quantity);
          break;
        default:
          throw new Error('Invalid action. Use: ADD, REMOVE, SET, RESERVE, RELEASE, SOLD, RETURN');
      }

      // Calculate new stock value if cost price is provided
      let newCostPrice = product.costPrice;
      if (adjustCostPrice && operation === 'ADD') {
        // Weighted average cost calculation
        const currentValue = (product.costPrice || 0) * product.quantity;
        const addedValue = adjustCostPrice * quantity;
        const totalValue = currentValue + addedValue;
        const totalQuantity = product.quantity + quantity;
        newCostPrice = totalValue / totalQuantity;
      }

      // Update product stock in transaction
      const updatedProduct = await this.prisma.$transaction(async (prisma) => {
        const updated = await prisma.product.update({
          where: { id: productId },
          data: {
            quantity: newQuantity,
            costPrice: newCostPrice,
            updatedAt: new Date()
          }
        });

        // Create stock movement record
        await prisma.stockMovement.create({
          data: {
            productId,
            vendorId,
            previousQuantity: product.quantity,
            newQuantity,
            quantityChanged: stockChange,
            action: operation,
            notes: notes || `${operation} ${Math.abs(stockChange)} units`,
            reference: reference || userInfo.reference || `USER_${userInfo.userId}`,
            userId: userInfo.userId,
            unitCost: adjustCostPrice || product.costPrice || 0,
            totalValue: Math.abs(stockChange) * (adjustCostPrice || product.costPrice || 0),
            metadata: {
              productName: product.name,
              productSku: product.sku,
              userAgent: userInfo.userAgent,
              ipAddress: userInfo.ip,
              operation
            }
          }
        });

        // Check and trigger low stock alerts
        if (newQuantity <= (product.lowStockThreshold || this.defaultLowStockThreshold)) {
          await this.checkAndTriggerLowStockAlert(updated, vendorId);
        }

        return updated;
      });

      // Get updated inventory status
      const inventoryStatus = this.getInventoryStatus(
        newQuantity, 
        product.lowStockThreshold, 
        this.defaultCriticalStockThreshold
      );

      return {
        success: true,
        message: `Stock ${operation.toLowerCase()}ed successfully. ${Math.abs(stockChange)} units.`,
        data: {
          product: {
            id: updatedProduct.id,
            name: updatedProduct.name,
            sku: updatedProduct.sku,
            previousStock: product.quantity,
            newStock: newQuantity,
            change: stockChange,
            costPrice: updatedProduct.costPrice
          },
          inventoryStatus,
          movement: {
            action: operation,
            quantityChanged: stockChange,
            reference: reference || `USER_${userInfo.userId}`
          }
        }
      };
    } catch (error) {
      console.error('InventoryService.updateProductStock error:', error);
      throw error;
    }
  }

  /**
   * Batch update multiple products stock
   */
  async batchUpdateStock(vendorId, updates, userInfo = {}) {
    try {
      if (!Array.isArray(updates) || updates.length === 0) {
        throw new Error('Updates array is required');
      }

      const results = [];
      const errors = [];

      // Process each update
      for (const update of updates) {
        try {
          const result = await this.updateProductStock(
            update.productId,
            vendorId,
            update,
            userInfo
          );
          results.push({
            productId: update.productId,
            success: true,
            data: result.data
          });
        } catch (error) {
          errors.push({
            productId: update.productId,
            error: error.message,
            success: false
          });
        }
      }

      return {
        success: true,
        message: `Batch update completed. ${results.length} successful, ${errors.length} failed.`,
        data: {
          successful: results,
          failed: errors
        }
      };
    } catch (error) {
      console.error('InventoryService.batchUpdateStock error:', error);
      throw error;
    }
  }

  /**
   * Check and trigger low stock alerts
   */
  async checkAndTriggerLowStockAlert(product, vendorId) {
    try {
      const inventoryStatus = this.getInventoryStatus(
        product.quantity,
        product.lowStockThreshold,
        this.defaultCriticalStockThreshold
      );

      if (inventoryStatus.shouldReorder) {
        // Get vendor info
        const vendor = await this.prisma.vendorProfile.findUnique({
          where: { id: vendorId },
          include: { user: true }
        });

        if (!vendor) return;

        // Check if alert was already sent recently (last 24 hours)
        const recentAlert = await this.prisma.inventoryAlert.findFirst({
          where: {
            productId: product.id,
            alertType: 'LOW_STOCK',
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            }
          }
        });

        if (recentAlert) {
          console.log('Low stock alert already sent recently for product:', product.id);
          return;
        }

        // Create alert record
        const alert = await this.prisma.inventoryAlert.create({
          data: {
            productId: product.id,
            vendorId: vendorId,
            alertType: 'LOW_STOCK',
            message: `${product.name} is ${inventoryStatus.level.toLowerCase()}. Current stock: ${product.quantity}`,
            severity: inventoryStatus.priority,
            metadata: {
              productName: product.name,
              currentStock: product.quantity,
              threshold: product.lowStockThreshold || this.defaultLowStockThreshold,
              status: inventoryStatus,
              sku: product.sku
            }
          }
        });

        // Send notifications
        await this.sendLowStockNotifications(vendor, product, inventoryStatus);

        return alert;
      }
    } catch (error) {
      console.error('InventoryService.checkAndTriggerLowStockAlert error:', error);
    }
  }

  /**
   * Send low stock notifications
   */
  async sendLowStockNotifications(vendor, product, inventoryStatus) {
    try {
      // Email notification
      await sendEmail({
        to: vendor.user.email,
        subject: `Low Stock Alert: ${product.name} - ManuwaFarm`,
        template: 'low-stock-alert',
        data: {
          businessName: vendor.businessName,
          productName: product.name,
          sku: product.sku,
          currentStock: product.quantity,
          stockStatus: inventoryStatus.label,
          threshold: product.lowStockThreshold || this.defaultLowStockThreshold,
          reorderUrgency: inventoryStatus.reorderUrgency,
          productUrl: `https://manuwafarm.mw/vendor/products/${product.id}/edit`,
          date: new Date().toLocaleDateString('en-MW'),
          icon: inventoryStatus.icon
        }
      });

      // SMS notification for critical stock
      if (inventoryStatus.level === 'CRITICAL' || inventoryStatus.level === 'OUT_OF_STOCK') {
        const smsMessage = `ManuwaFarm Alert: ${product.name} is ${inventoryStatus.label.toLowerCase()}. Stock: ${product.quantity}. Please restock to avoid sales interruption.`;
        await sendSMS(vendor.user.phoneNumber, smsMessage);
      }
    } catch (error) {
      console.error('Failed to send low stock notifications:', error);
    }
  }

  /**
   * Get stock movements for a product or vendor
   */
  async getStockMovements(vendorId, filters = {}) {
    try {
      const { 
        productId, 
        page = 1, 
        limit = 20, 
        startDate, 
        endDate, 
        action,
        reference 
      } = filters;

      const skip = (page - 1) * limit;

      // Build where clause
      const where = { vendorId };

      if (productId) {
        where.productId = productId;
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      if (action) {
        where.action = action.toUpperCase();
      }

      if (reference) {
        where.reference = { contains: reference, mode: 'insensitive' };
      }

      const [movements, total] = await Promise.all([
        this.prisma.stockMovement.findMany({
          where,
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                images: true
              }
            },
            user: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit)
        }),
        this.prisma.stockMovement.count({ where })
      ]);

      // Calculate summary
      const summary = await this.prisma.stockMovement.aggregate({
        where,
        _sum: {
          quantityChanged: true,
          totalValue: true
        },
        _avg: {
          unitCost: true
        }
      });

      return {
        success: true,
        data: movements,
        summary: {
          totalMovements: total,
          netQuantityChange: summary._sum.quantityChanged || 0,
          totalValueChange: summary._sum.totalValue || 0,
          averageUnitCost: summary._avg.unitCost || 0
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('InventoryService.getStockMovements error:', error);
      throw error;
    }
  }

  /**
   * Get inventory summary for vendor
   */
  async getInventorySummary(vendorId) {
    try {
      const [
        products,
        lowStockProducts,
        outOfStockProducts,
        stockValue,
        recentMovements
      ] = await Promise.all([
        this.prisma.product.findMany({
          where: {
            vendorId,
            isActive: true
          },
          select: {
            id: true,
            name: true,
            sku: true,
            quantity: true,
            price: true,
            costPrice: true,
            lowStockThreshold: true,
            images: true,
            category: {
              select: {
                name: true
              }
            }
          }
        }),
        this.prisma.product.count({
          where: {
            vendorId,
            isActive: true,
            quantity: {
              lte: this.defaultLowStockThreshold,
              gt: 0
            }
          }
        }),
        this.prisma.product.count({
          where: {
            vendorId,
            isActive: true,
            quantity: 0
          }
        }),
        this.prisma.product.aggregate({
          where: { vendorId, isActive: true },
          _sum: {
            quantity: true
          }
        }),
        this.prisma.stockMovement.findMany({
          where: { vendorId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            product: {
              select: {
                name: true,
                sku: true
              }
            }
          }
        })
      ]);

      // Calculate inventory metrics
      const totalProducts = products.length;
      const totalStockValue = products.reduce((sum, product) => {
        const cost = product.costPrice || product.price * 0.7; // Estimate if no cost price
        return sum + (product.quantity * cost);
      }, 0);

      const totalRetailValue = products.reduce((sum, product) => {
        return sum + (product.quantity * product.price);
      }, 0);

      const potentialProfit = totalRetailValue - totalStockValue;

      // Categorize products by inventory status
      const categorizedProducts = products.map(product => {
        const status = this.getInventoryStatus(
          product.quantity,
          product.lowStockThreshold,
          this.defaultCriticalStockThreshold
        );
        return {
          ...product,
          inventoryStatus: status,
          stockValue: (product.costPrice || product.price * 0.7) * product.quantity,
          retailValue: product.quantity * product.price
        };
      });

      // Group by status
      const byStatus = categorizedProducts.reduce((acc, product) => {
        const status = product.inventoryStatus.level;
        if (!acc[status]) acc[status] = [];
        acc[status].push(product);
        return acc;
      }, {});

      // Calculate category distribution
      const byCategory = products.reduce((acc, product) => {
        const category = product.category?.name || 'Uncategorized';
        if (!acc[category]) acc[category] = 0;
        acc[category] += product.quantity;
        return acc;
      }, {});

      return {
        success: true,
        data: {
          summary: {
            totalProducts,
            totalStockQuantity: stockValue._sum.quantity || 0,
            lowStockProducts,
            outOfStockProducts,
            inStockProducts: totalProducts - lowStockProducts - outOfStockProducts,
            totalStockValue: parseFloat(totalStockValue.toFixed(2)),
            totalRetailValue: parseFloat(totalRetailValue.toFixed(2)),
            potentialProfit: parseFloat(potentialProfit.toFixed(2)),
            profitMargin: totalRetailValue > 0 
              ? parseFloat(((potentialProfit / totalRetailValue) * 100).toFixed(2))
              : 0
          },
          categorizedProducts: byStatus,
          categoryDistribution: byCategory,
          recentMovements,
          generatedAt: new Date()
        }
      };
    } catch (error) {
      console.error('InventoryService.getInventorySummary error:', error);
      throw error;
    }
  }

  /**
   * Get products needing reorder
   */
  async getReorderSuggestions(vendorId, threshold = null) {
    try {
      const lowStockThreshold = threshold || this.defaultLowStockThreshold;

      const products = await this.prisma.product.findMany({
        where: {
          vendorId,
          isActive: true,
          quantity: {
            lte: lowStockThreshold
          }
        },
        include: {
          category: {
            select: { name: true }
          },
          orderItems: {
            where: {
              createdAt: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
              },
              order: {
                status: { not: 'CANCELLED' }
              }
            },
            select: {
              quantity: true
            }
          },
          vendor: {
            select: {
              businessName: true
            }
          }
        },
        orderBy: { quantity: 'asc' }
      });

      // Calculate reorder suggestions
      const suggestions = products.map(product => {
        const monthlySales = product.orderItems.reduce((sum, item) => sum + item.quantity, 0);
        const averageDailySales = monthlySales / 30;
        const daysOfStock = product.quantity > 0 ? product.quantity / averageDailySales : 0;
        
        let suggestedReorder = 0;
        let urgency = 'low';
        
        if (product.quantity === 0) {
          suggestedReorder = Math.max(Math.ceil(averageDailySales * 30), 10); // Min 10 units
          urgency = 'critical';
        } else if (daysOfStock < 7) {
          suggestedReorder = Math.max(Math.ceil(averageDailySales * 15), 5); // Min 5 units
          urgency = 'high';
        } else if (daysOfStock < 14) {
          suggestedReorder = Math.max(Math.ceil(averageDailySales * 10), 3); // Min 3 units
          urgency = 'medium';
        }

        const status = this.getInventoryStatus(
          product.quantity,
          product.lowStockThreshold,
          this.defaultCriticalStockThreshold
        );

        return {
          product: {
            id: product.id,
            name: product.name,
            sku: product.sku,
            category: product.category?.name,
            currentStock: product.quantity,
            price: product.price,
            costPrice: product.costPrice,
            lowStockThreshold: product.lowStockThreshold,
            image: product.images?.[0]
          },
          salesData: {
            monthlySales,
            averageDailySales: parseFloat(averageDailySales.toFixed(1)),
            daysOfStock: parseFloat(daysOfStock.toFixed(1))
          },
          reorderSuggestion: {
            suggestedReorder,
            urgency,
            estimatedCost: suggestedReorder * (product.costPrice || product.price * 0.7),
            estimatedRevenue: suggestedReorder * product.price,
            estimatedProfit: suggestedReorder * (product.price - (product.costPrice || product.price * 0.7))
          },
          inventoryStatus: status,
          vendor: product.vendor
        };
      });

      // Sort by urgency
      const urgencyOrder = { critical: 1, high: 2, medium: 3, low: 4 };
      suggestions.sort((a, b) => urgencyOrder[a.reorderSuggestion.urgency] - urgencyOrder[b.reorderSuggestion.urgency]);

      return {
        success: true,
        data: suggestions,
        count: suggestions.length,
        totalSuggestedReorder: suggestions.reduce((sum, s) => sum + s.reorderSuggestion.suggestedReorder, 0),
        totalEstimatedCost: suggestions.reduce((sum, s) => sum + s.reorderSuggestion.estimatedCost, 0)
      };
    } catch (error) {
      console.error('InventoryService.getReorderSuggestions error:', error);
      throw error;
    }
  }

  /**
   * Process stock update from order
   */
  async processOrderStockUpdate(orderId, action = 'RESERVE') {
    try {
      // Get order items
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: true
            }
          },
          vendor: {
            include: { user: true }
          }
        }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      const results = [];
      const errors = [];

      // Process each item
      for (const item of order.items) {
        try {
          const result = await this.updateProductStock(
            item.productId,
            order.vendorId,
            {
              quantity: item.quantity,
              action: action,
              reference: `ORDER_${orderId}`,
              notes: `${action} stock for order ${order.orderNumber}`
            },
            {
              userId: 'system',
              reference: `ORDER_${orderId}`
            }
          );

          results.push({
            productId: item.productId,
            productName: item.product.name,
            quantity: item.quantity,
            success: true,
            data: result.data
          });
        } catch (error) {
          errors.push({
            productId: item.productId,
            productName: item.product.name,
            quantity: item.quantity,
            error: error.message,
            success: false
          });
        }
      }

      return {
        success: errors.length === 0,
        message: `Order ${orderId} stock ${action.toLowerCase()} processed. ${results.length} successful, ${errors.length} failed.`,
        data: {
          orderId,
          orderNumber: order.orderNumber,
          successful: results,
          failed: errors
        }
      };
    } catch (error) {
      console.error('InventoryService.processOrderStockUpdate error:', error);
      throw error;
    }
  }

  /**
   * Get inventory alerts for vendor
   */
  async getInventoryAlerts(vendorId, filters = {}) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        resolved = false,
        alertType,
        severity,
        startDate,
        endDate 
      } = filters;

      const skip = (page - 1) * limit;

      // Build where clause
      const where = { vendorId };

      if (resolved !== undefined) {
        where.resolved = resolved;
      }

      if (alertType) {
        where.alertType = alertType.toUpperCase();
      }

      if (severity) {
        where.severity = parseInt(severity);
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      const [alerts, total] = await Promise.all([
        this.prisma.inventoryAlert.findMany({
          where,
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                quantity: true,
                lowStockThreshold: true,
                images: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit)
        }),
        this.prisma.inventoryAlert.count({ where })
      ]);

      // Add inventory status to each alert
      const alertsWithStatus = alerts.map(alert => ({
        ...alert,
        product: alert.product ? {
          ...alert.product,
          inventoryStatus: this.getInventoryStatus(
            alert.product.quantity,
            alert.product.lowStockThreshold,
            this.defaultCriticalStockThreshold
          )
        } : null
      }));

      return {
        success: true,
        data: alertsWithStatus,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('InventoryService.getInventoryAlerts error:', error);
      throw error;
    }
  }

  /**
   * Resolve inventory alert
   */
  async resolveInventoryAlert(alertId, vendorId, resolutionData = {}) {
    try {
      const { notes, restockedQuantity = 0, restocked = false } = resolutionData;

      // Verify alert belongs to vendor
      const alert = await this.prisma.inventoryAlert.findFirst({
        where: {
          id: alertId,
          vendorId,
          resolved: false
        },
        include: {
          product: true
        }
      });

      if (!alert) {
        throw new Error('Alert not found or already resolved');
      }

      const resolvedAlert = await this.prisma.$transaction(async (prisma) => {
        const updatedAlert = await prisma.inventoryAlert.update({
          where: { id: alertId },
          data: {
            resolved: true,
            resolvedAt: new Date(),
            resolutionNotes: notes,
            metadata: {
              ...alert.metadata,
              restocked,
              restockedQuantity,
              resolvedBy: resolutionData.userId
            }
          }
        });

        // If restocked, update product quantity
        if (restocked && restockedQuantity > 0 && alert.product) {
          await prisma.product.update({
            where: { id: alert.product.id },
            data: {
              quantity: { increment: restockedQuantity },
              updatedAt: new Date()
            }
          });

          // Record stock movement
          await prisma.stockMovement.create({
            data: {
              productId: alert.product.id,
              vendorId,
              previousQuantity: alert.product.quantity,
              newQuantity: alert.product.quantity + restockedQuantity,
              quantityChanged: restockedQuantity,
              action: 'ADD',
              notes: `Restocked after low stock alert. ${notes || ''}`,
              reference: `ALERT_${alertId}`,
              userId: resolutionData.userId || 'system',
              unitCost: alert.product.costPrice || 0,
              totalValue: restockedQuantity * (alert.product.costPrice || 0),
              metadata: {
                productName: alert.product.name,
                alertId: alertId,
                resolutionNotes: notes
              }
            }
          });
        }

        return updatedAlert;
      });

      return {
        success: true,
        message: 'Alert marked as resolved',
        data: resolvedAlert
      };
    } catch (error) {
      console.error('InventoryService.resolveInventoryAlert error:', error);
      throw error;
    }
  }

  /**
   * Generate inventory report
   */
  async generateInventoryReport(vendorId, reportType = 'summary', options = {}) {
    try {
      const { format = 'json', includeMovements = true, period = 'month' } = options;

      // Calculate date range
      const now = new Date();
      let startDate = new Date();
      
      switch (period) {
        case 'day':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'quarter':
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
      }

      // Get inventory data
      const [inventorySummary, reorderSuggestions, recentAlerts, stockMovements] = await Promise.all([
        this.getInventorySummary(vendorId),
        this.getReorderSuggestions(vendorId),
        this.getInventoryAlerts(vendorId, { 
          resolved: false,
          limit: 10 
        }),
        includeMovements ? this.getStockMovements(vendorId, {
          startDate: startDate.toISOString(),
          limit: 50
        }) : Promise.resolve({ data: [] })
      ]);

      const report = {
        metadata: {
          generatedAt: new Date(),
          vendorId,
          reportType,
          period,
          format
        },
        summary: inventorySummary.data.summary,
        reorderSuggestions: reorderSuggestions.data,
        activeAlerts: recentAlerts.data,
        recentMovements: stockMovements.data,
        generatedBy: 'Inventory Service'
      };

      // Format based on requested format
      if (format === 'csv') {
        return this.formatReportAsCSV(report);
      } else if (format === 'excel') {
        return this.formatReportAsExcel(report);
      }

      return {
        success: true,
        data: report
      };
    } catch (error) {
      console.error('InventoryService.generateInventoryReport error:', error);
      throw error;
    }
  }

  /**
   * Format report as CSV
   */
  formatReportAsCSV(report) {
    const headers = [
      'Product Name', 'SKU', 'Category', 'Current Stock', 
      'Low Stock Threshold', 'Status', 'Price', 'Cost Price',
      'Stock Value', 'Retail Value'
    ];

    const rows = [];
    if (report.summary.categorizedProducts) {
      Object.values(report.summary.categorizedProducts).forEach(products => {
        products.forEach(product => {
          rows.push([
            product.name,
            product.sku || '',
            product.category?.name || 'Uncategorized',
            product.quantity,
            product.lowStockThreshold || 5,
            product.inventoryStatus.label,
            product.price,
            product.costPrice || 'N/A',
            product.stockValue?.toFixed(2) || '0.00',
            product.retailValue?.toFixed(2) || '0.00'
          ]);
        });
      });
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    return {
      success: true,
      data: csvContent,
      contentType: 'text/csv',
      filename: `inventory-report-${new Date().toISOString().split('T')[0]}.csv`
    };
  }

  /**
   * Format report as Excel (placeholder)
   */
  formatReportAsExcel(report) {
    // In production, use a library like exceljs
    return {
      success: true,
      message: 'Excel export requires exceljs library. Currently returning JSON.',
      data: report
    };
  }
}

module.exports = new InventoryService();