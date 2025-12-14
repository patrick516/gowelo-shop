// src/services/order.service.js
const { prisma } = require('../config/prisma');
const { sendEmail } = require('./notification.service');
const { sendSMS } = require('./sms.service');
const inventoryService = require('./inventory.service');
const paymentService = require('./payment.service');

class OrderService {
  constructor() {
    this.prisma = prisma;
  }

  /**
   * Validate and calculate order totals
   */
  async validateAndCalculateOrder(vendorId, items) {
    try {
      let subtotal = 0;
      const orderItems = [];
      const validationErrors = [];

      // Process each item
      for (const item of items) {
        const product = await this.prisma.product.findUnique({
          where: { id: item.productId },
          select: {
            id: true,
            name: true,
            price: true,
            quantity: true,
            isActive: true,
            isApproved: true,
            vendorId: true,
            sku: true,
            images: true
          }
        });

        if (!product) {
          validationErrors.push({
            productId: item.productId,
            error: 'Product not found'
          });
          continue;
        }

        // Check product belongs to vendor
        if (product.vendorId !== vendorId) {
          validationErrors.push({
            productId: item.productId,
            productName: product.name,
            error: 'Product does not belong to this vendor'
          });
          continue;
        }

        // Check product availability
        if (!product.isActive || !product.isApproved) {
          validationErrors.push({
            productId: item.productId,
            productName: product.name,
            error: 'Product is not available for purchase'
          });
          continue;
        }

        // Check stock availability
        if (product.quantity < item.quantity) {
          validationErrors.push({
            productId: item.productId,
            productName: product.name,
            requested: item.quantity,
            available: product.quantity,
            error: 'Insufficient stock'
          });
          continue;
        }

        const itemTotal = product.price * item.quantity;
        subtotal += itemTotal;

        orderItems.push({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          price: product.price,
          quantity: item.quantity,
          total: itemTotal,
          image: product.images?.[0]
        });
      }

      return {
        success: validationErrors.length === 0,
        subtotal,
        orderItems,
        validationErrors
      };
    } catch (error) {
      console.error('OrderService.validateAndCalculateOrder error:', error);
      throw error;
    }
  }

  /**
   * Calculate shipping fee
   */
  calculateShippingFee(deliveryCity, deliveryMethod) {
    // Define shipping fees for major cities in Malawi
    const shippingFees = {
      'blantyre': {
        standard: 2000,
        express: 4000,
        pickup: 0
      },
      'lilongwe': {
        standard: 2500,
        express: 5000,
        pickup: 0
      },
      'mzuzu': {
        standard: 3000,
        express: 6000,
        pickup: 0
      },
      'zomba': {
        standard: 2500,
        express: 5000,
        pickup: 0
      },
      'default': {
        standard: 5000,
        express: 8000,
        pickup: 0
      }
    };

    const cityKey = deliveryCity ? deliveryCity.toLowerCase() : 'default';
    const method = deliveryMethod || 'standard';

    if (shippingFees[cityKey] && shippingFees[cityKey][method]) {
      return shippingFees[cityKey][method];
    }

    return shippingFees.default[method] || shippingFees.default.standard;
  }

  /**
   * Generate order number
   */
  generateOrderNumber() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    
    return `ORD-${year}${month}${day}-${random}`;
  }

  /**
   * Create new order
   */
  async createOrder(orderData, customerInfo, userInfo = {}) {
    try {
      const {
        vendorId,
        shippingAddress,
        billingAddress,
        deliveryMethod = 'standard',
        deliveryNotes,
        deliveryCity,
        paymentMethod = 'CASH_ON_DELIVERY',
        items
      } = orderData;

      // Validate required fields
      if (!vendorId || !shippingAddress || !items || !Array.isArray(items) || items.length === 0) {
        throw new Error('Vendor ID, shipping address, and items are required');
      }

      // Get vendor details
      const vendor = await this.prisma.vendorProfile.findUnique({
        where: { id: vendorId },
        include: {
          user: {
            select: {
              email: true,
              phoneNumber: true
            }
          }
        }
      });

      if (!vendor) {
        throw new Error('Vendor not found');
      }

      // Check vendor status
      if (vendor.status !== 'ACTIVE' && vendor.status !== 'TRIAL') {
        throw new Error('Vendor is not active');
      }

      // Validate items and calculate totals
      const validationResult = await this.validateAndCalculateOrder(vendorId, items);
      
      if (!validationResult.success) {
        throw new Error('Order validation failed');
      }

      // Calculate shipping fee
      const shippingFee = this.calculateShippingFee(deliveryCity, deliveryMethod);
      const subtotal = validationResult.subtotal;
      const total = subtotal + shippingFee;

      // Generate order number
      const orderNumber = this.generateOrderNumber();

      // Create order in transaction
      const order = await this.prisma.$transaction(async (prisma) => {
        // Create order
        const newOrder = await prisma.order.create({
          data: {
            orderNumber,
            customerId: customerInfo.id,
            vendorId,
            customerEmail: customerInfo.email,
            customerPhone: customerInfo.phone || customerInfo.phoneNumber,
            customerName: customerInfo.fullName,
            shippingAddress: typeof shippingAddress === 'string' 
              ? shippingAddress 
              : JSON.stringify(shippingAddress),
            billingAddress: billingAddress 
              ? (typeof billingAddress === 'string' ? billingAddress : JSON.stringify(billingAddress))
              : (typeof shippingAddress === 'string' ? shippingAddress : JSON.stringify(shippingAddress)),
            deliveryMethod,
            deliveryNotes,
            deliveryCity,
            subtotal,
            shippingFee,
            total,
            paymentMethod,
            status: 'PENDING',
            paymentStatus: 'PENDING',
            metadata: {
              customerInfo,
              vendorInfo: {
                businessName: vendor.businessName
              }
            }
          }
        });

        // Create order items and reserve stock
        for (const item of validationResult.orderItems) {
          // Create order item
          await prisma.orderItem.create({
            data: {
              orderId: newOrder.id,
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
              total: item.total
            }
          });

          // Reserve stock using inventory service
          await inventoryService.updateProductStock(
            item.productId,
            vendorId,
            {
              quantity: item.quantity,
              action: 'RESERVE',
              reference: `ORDER_${newOrder.id}`,
              notes: `Reserved for order ${orderNumber}`
            },
            {
              userId: userInfo.userId || 'system',
              reference: `ORDER_${newOrder.id}`
            }
          );
        }

        // Clear customer cart for this vendor's items
        await this.clearCartForVendor(customerInfo.id, vendorId, validationResult.orderItems);

        // Create audit log
        await prisma.auditLog.create({
          data: {
            userId: customerInfo.id,
            action: 'CREATE_ORDER',
            entity: 'ORDER',
            entityId: newOrder.id,
            changes: JSON.stringify({
              orderNumber,
              vendorId,
              itemCount: validationResult.orderItems.length,
              total,
              paymentMethod
            }),
            ipAddress: userInfo.ip,
            userAgent: userInfo.userAgent
          }
        });

        return newOrder;
      });

      // Send order confirmation notifications
      await this.sendOrderConfirmationNotifications(order, customerInfo, vendor, validationResult.orderItems);

      return {
        success: true,
        message: 'Order created successfully',
        data: {
          order,
          items: validationResult.orderItems,
          summary: {
            subtotal,
            shippingFee,
            total
          }
        }
      };
    } catch (error) {
      console.error('OrderService.createOrder error:', error);
      throw error;
    }
  }

  /**
   * Clear customer cart for vendor's items
   */
  async clearCartForVendor(customerId, vendorId, orderItems) {
    try {
      const cart = await this.prisma.cart.findUnique({
        where: { userId: customerId },
        include: { items: true }
      });

      if (!cart) return;

      // Get vendor product IDs
      const vendorProductIds = orderItems.map(item => item.productId);

      // Remove vendor's products from cart
      await this.prisma.cartItem.deleteMany({
        where: {
          cartId: cart.id,
          productId: { in: vendorProductIds }
        }
      });

      // Recalculate cart total
      const remainingItems = await this.prisma.cartItem.findMany({
        where: { cartId: cart.id },
        include: { product: true }
      });

      const newCartTotal = remainingItems.reduce((sum, item) => 
        sum + (item.product.price * item.quantity), 0
      );

      await this.prisma.cart.update({
        where: { id: cart.id },
        data: { total: newCartTotal }
      });

    } catch (error) {
      console.error('OrderService.clearCartForVendor error:', error);
      // Don't throw error, cart clearing is not critical
    }
  }

  /**
   * Send order confirmation notifications
   */
  async sendOrderConfirmationNotifications(order, customer, vendor, orderItems) {
    try {
      const emailData = {
        orderNumber: order.orderNumber,
        customerName: customer.fullName,
        businessName: vendor.businessName,
        orderDate: new Date(order.createdAt).toLocaleDateString('en-MW'),
        items: orderItems.map(item => ({
          name: item.productName,
          sku: item.sku,
          quantity: item.quantity,
          price: item.price,
          total: item.total,
          image: item.image
        })),
        subtotal: order.subtotal,
        shippingFee: order.shippingFee,
        total: order.total,
        deliveryAddress: JSON.parse(order.shippingAddress),
        deliveryMethod: order.deliveryMethod,
        paymentMethod: order.paymentMethod,
        estimatedDelivery: this.getEstimatedDelivery(order.deliveryMethod, order.deliveryCity)
      };

      // Send to customer
      await sendEmail({
        to: customer.email,
        subject: `Order Confirmation - ${order.orderNumber} - ManuwaFarm`,
        template: 'order-confirmation-customer',
        data: {
          ...emailData,
          nextSteps: 'Your order is being processed by the vendor.',
          contactEmail: 'support@manuwafarm.mw',
          contactPhone: '+265 123 456 789'
        }
      });

      // Send to vendor
      await sendEmail({
        to: vendor.user.email,
        subject: `New Order Received - ${order.orderNumber}`,
        template: 'order-confirmation-vendor',
        data: {
          ...emailData,
          customerEmail: customer.email,
          customerPhone: customer.phone || customer.phoneNumber,
          deliveryNotes: order.deliveryNotes
        }
      });

      // Send SMS to customer for mobile money payments
      if (order.paymentMethod === 'AIRTEL_MONEY' || order.paymentMethod === 'MPAMBA') {
        const smsMessage = `ManuwaFarm: Order ${order.orderNumber} confirmed. Total: MWK ${order.total}. Payment via ${order.paymentMethod}.`;
        await sendSMS(customer.phone || customer.phoneNumber, smsMessage);
      }

    } catch (error) {
      console.error('OrderService.sendOrderConfirmationNotifications error:', error);
      // Don't throw error, notification failure shouldn't fail order creation
    }
  }

  /**
   * Get estimated delivery date
   */
  getEstimatedDelivery(deliveryMethod, deliveryCity) {
    const baseDays = deliveryMethod === 'express' ? 1 : 3;
    const cityAdjustments = {
      'blantyre': 0,
      'lilongwe': 1,
      'mzuzu': 2,
      'zomba': 1,
      'default': 3
    };

    const adjustment = cityAdjustments[deliveryCity?.toLowerCase()] || cityAdjustments.default;
    const totalDays = baseDays + adjustment;

    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + totalDays);

    return deliveryDate.toLocaleDateString('en-MW', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId, status, updateData, userInfo = {}) {
    try {
      const { notes, trackingNumber, estimatedDelivery } = updateData;
      const { userId, userRole, vendorId } = userInfo;

      // Get current order
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          customer: {
            select: {
              email: true,
              phoneNumber: true,
              fullName: true
            }
          },
          vendor: {
            include: {
              user: {
                select: {
                  email: true
                }
              }
            }
          }
        }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Validate authorization
      this.validateOrderStatusUpdateAuthorization(order, userRole, vendorId, status);

      // Validate status transition
      this.validateStatusTransition(order.status, status, userRole);

      // Prepare update data
      const updatePayload = await this.prepareStatusUpdateData(
        order, 
        status, 
        { notes, trackingNumber, estimatedDelivery }
      );

      // Update order in transaction
      const updatedOrder = await this.prisma.$transaction(async (prisma) => {
        const updated = await prisma.order.update({
          where: { id: orderId },
          data: updatePayload
        });

        // Handle status-specific actions
        await this.handleStatusSpecificActions(order, status, userId);

        // Create audit log
        await prisma.auditLog.create({
          data: {
            userId,
            action: `STATUS_${status}`,
            entity: 'ORDER',
            entityId: orderId,
            changes: JSON.stringify({
              oldStatus: order.status,
              newStatus: status,
              notes,
              trackingNumber
            }),
            ipAddress: userInfo.ip,
            userAgent: userInfo.userAgent
          }
        });

        return updated;
      });

      // Send status update notifications
      await this.sendStatusUpdateNotifications(order, status, notes, trackingNumber);

      return {
        success: true,
        message: `Order status updated to ${status}`,
        data: updatedOrder
      };
    } catch (error) {
      console.error('OrderService.updateOrderStatus error:', error);
      throw error;
    }
  }

  /**
   * Validate order status update authorization
   */
  validateOrderStatusUpdateAuthorization(order, userRole, vendorId, newStatus) {
    if (userRole === 'VENDOR') {
      if (order.vendorId !== vendorId) {
        throw new Error('Not authorized to update this order');
      }

      // Vendors can only update to certain statuses
      const allowedVendorStatuses = ['CONFIRMED', 'PROCESSING', 'SHIPPED'];
      if (!allowedVendorStatuses.includes(newStatus)) {
        throw new Error('Vendors can only update to: CONFIRMED, PROCESSING, or SHIPPED');
      }
    } else if (userRole === 'CUSTOMER') {
      // Customers can only cancel pending orders
      if (newStatus !== 'CANCELLED' || order.status !== 'PENDING') {
        throw new Error('Customers can only cancel pending orders');
      }
    }
  }

  /**
   * Validate status transition
   */
  validateStatusTransition(currentStatus, newStatus, userRole) {
    const validTransitions = {
      'PENDING': ['CONFIRMED', 'CANCELLED'],
      'CONFIRMED': ['PROCESSING', 'CANCELLED'],
      'PROCESSING': ['SHIPPED', 'CANCELLED'],
      'SHIPPED': ['DELIVERED'],
      'DELIVERED': ['REFUNDED'],
      'CANCELLED': [],
      'REFUNDED': []
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
    }
  }

  /**
   * Prepare status update data
   */
  async prepareStatusUpdateData(order, status, updateData) {
    const { notes, trackingNumber, estimatedDelivery } = updateData;
    const updatePayload = { status };

    if (notes) updatePayload.statusNotes = notes;
    if (trackingNumber) updatePayload.trackingNumber = trackingNumber;
    if (estimatedDelivery) updatePayload.estimatedDelivery = new Date(estimatedDelivery);

    switch (status) {
      case 'CANCELLED':
        updatePayload.cancelledAt = new Date();
        break;
      case 'DELIVERED':
        updatePayload.deliveredAt = new Date();
        
        // Update vendor stats
        if (order.paymentStatus === 'PAID') {
          await this.updateVendorStats(order.vendorId, order.total);
        }
        break;
      case 'SHIPPED':
        if (!estimatedDelivery) {
          // Auto-calculate estimated delivery
          updatePayload.estimatedDelivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        }
        break;
    }

    return updatePayload;
  }

  /**
   * Handle status-specific actions
   */
  async handleStatusSpecificActions(order, newStatus, userId) {
    switch (newStatus) {
      case 'CANCELLED':
        await this.handleOrderCancellation(order, userId);
        break;
      case 'DELIVERED':
        await this.handleOrderDelivery(order);
        break;
    }
  }

  /**
   * Handle order cancellation
   */
  async handleOrderCancellation(order, userId) {
    // Restore inventory for cancelled orders
    if (order.status !== 'PENDING') {
      const orderItems = await this.prisma.orderItem.findMany({
        where: { orderId: order.id },
        include: { product: true }
      });

      for (const item of orderItems) {
        // Restore stock using inventory service
        await inventoryService.updateProductStock(
          item.productId,
          order.vendorId,
          {
            quantity: item.quantity,
            action: 'RELEASE',
            reference: `ORDER_CANCELLED_${order.id}`,
            notes: `Released from cancelled order ${order.orderNumber}`
          },
          {
            userId: userId || 'system',
            reference: `ORDER_CANCELLED_${order.id}`
          }
        );
      }
    }

    // If payment was made, initiate refund
    if (order.paymentStatus === 'PAID') {
      await paymentService.initiateRefund({
        orderId: order.id,
        amount: order.total,
        reason: 'Order cancelled',
        processedBy: userId
      });
    }
  }

  /**
   * Handle order delivery
   */
  async handleOrderDelivery(order) {
    // Mark stock as sold
    const orderItems = await this.prisma.orderItem.findMany({
      where: { orderId: order.id }
    });

    for (const item of orderItems) {
      await inventoryService.updateProductStock(
        item.productId,
        order.vendorId,
        {
          quantity: item.quantity,
          action: 'SOLD',
          reference: `ORDER_DELIVERED_${order.id}`,
          notes: `Sold from delivered order ${order.orderNumber}`
        },
        {
          userId: 'system',
          reference: `ORDER_DELIVERED_${order.id}`
        }
      );
    }
  }

  /**
   * Update vendor stats
   */
  async updateVendorStats(vendorId, amount) {
    try {
      await this.prisma.vendorProfile.update({
        where: { id: vendorId },
        data: {
          totalSales: { increment: 1 },
          totalRevenue: { increment: amount },
          updatedAt: new Date()
        }
      });
    } catch (error) {
      console.error('OrderService.updateVendorStats error:', error);
    }
  }

  /**
   * Send status update notifications
   */
  async sendStatusUpdateNotifications(order, newStatus, notes, trackingNumber) {
    try {
      const emailData = {
        orderNumber: order.orderNumber,
        oldStatus: order.status,
        newStatus,
        notes: notes || 'No additional notes provided.',
        trackingNumber,
        contactEmail: 'support@manuwafarm.mw'
      };

      // Send to customer
      await sendEmail({
        to: order.customerEmail,
        subject: `Order Status Updated - ${order.orderNumber}`,
        template: 'order-status-update-customer',
        data: {
          ...emailData,
          customerName: order.customerName || 'Customer',
          estimatedDelivery: newStatus === 'SHIPPED' ? 
            new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-MW') : 
            null
        }
      });

      // Send to vendor if status changed by admin/customer
      const vendor = await this.prisma.vendorProfile.findUnique({
        where: { id: order.vendorId },
        include: { user: true }
      });

      if (vendor?.user?.email) {
        await sendEmail({
          to: vendor.user.email,
          subject: `Order Status Updated - ${order.orderNumber}`,
          template: 'order-status-update-vendor',
          data: {
            ...emailData,
            businessName: vendor.businessName,
            customerName: order.customerName || 'Customer'
          }
        });
      }

      // Send SMS for important status updates
      if (['SHIPPED', 'DELIVERED'].includes(newStatus) && order.customerPhone) {
        const smsMessage = `ManuwaFarm: Order ${order.orderNumber} is now ${newStatus.toLowerCase()}.`;
        if (trackingNumber) {
          smsMessage += ` Tracking: ${trackingNumber}`;
        }
        await sendSMS(order.customerPhone, smsMessage);
      }

    } catch (error) {
      console.error('OrderService.sendStatusUpdateNotifications error:', error);
    }
  }

  /**
   * Get orders with filters
   */
  async getOrders(filters = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        paymentStatus,
        vendorId,
        customerId,
        startDate,
        endDate,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = filters;

      const skip = (page - 1) * limit;

      // Build where clause
      const where = {};
      
      if (status) where.status = status;
      if (paymentStatus) where.paymentStatus = paymentStatus;
      if (vendorId) where.vendorId = vendorId;
      if (customerId) where.customerId = customerId;
      
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }
      
      if (search) {
        where.OR = [
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { customerName: { contains: search, mode: 'insensitive' } },
          { customerEmail: { contains: search, mode: 'insensitive' } },
          { customerPhone: { contains: search, mode: 'insensitive' } }
        ];
      }

      // Get orders with pagination
      const [orders, total] = await Promise.all([
        this.prisma.order.findMany({
          where,
          include: {
            customer: {
              select: {
                id: true,
                fullName: true,
                email: true,
                phone: true
              }
            },
            vendor: {
              select: {
                id: true,
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
              take: 3
            }
          },
          orderBy: { [sortBy]: sortOrder },
          skip,
          take: parseInt(limit)
        }),
        this.prisma.order.count({ where })
      ]);

      // Add item count to each order
      const ordersWithItemCount = await Promise.all(
        orders.map(async (order) => {
          const itemCount = await this.prisma.orderItem.count({
            where: { orderId: order.id }
          });
          return { ...order, itemCount };
        })
      );

      return {
        success: true,
        data: ordersWithItemCount,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('OrderService.getOrders error:', error);
      throw error;
    }
  }

  /**
   * Get single order with details
   */
  async getOrderById(orderId, userInfo = {}) {
    try {
      const { userId, userRole, vendorId } = userInfo;

      // Get order with relationships
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          customer: {
            select: {
              id: true,
              email: true,
              phone: true,
              fullName: true
            }
          },
          vendor: {
            select: {
              id: true,
              businessName: true,
              businessLogo: true,
              contactPhone: true,
              contactEmail: true,
              businessAddress: true
            }
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  images: true,
                  description: true,
                  specifications: true
                }
              }
            }
          }
        }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Check authorization
      if (userRole === 'CUSTOMER' && order.customerId !== userId) {
        throw new Error('Not authorized to view this order');
      }

      if (userRole === 'VENDOR' && order.vendorId !== vendorId) {
        throw new Error('Not authorized to view this order');
      }

      // Get order timeline/status history
      const statusHistory = await this.prisma.auditLog.findMany({
        where: {
          entity: 'ORDER',
          entityId: orderId,
          action: { contains: 'STATUS' }
        },
        orderBy: { createdAt: 'asc' }
      });

      // Get additional data based on user role
      const additionalData = await this.getOrderAdditionalData(orderId, userRole, order);

      return {
        success: true,
        data: {
          order,
          statusHistory,
          ...additionalData
        }
      };
    } catch (error) {
      console.error('OrderService.getOrderById error:', error);
      throw error;
    }
  }

  /**
   * Get additional order data based on user role
   */
  async getOrderAdditionalData(orderId, userRole, order) {
    const additionalData = {};

    if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
      // Get payment details
      const payment = await this.prisma.payment.findFirst({
        where: { orderId }
      });
      additionalData.payment = payment;

      // Get customer's other orders
      const customerOrders = await this.prisma.order.findMany({
        where: { 
          customerId: order.customerId,
          id: { not: orderId }
        },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          status: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      });
      additionalData.customerOrders = customerOrders;
    }

    return additionalData;
  }

  /**
   * Get order statistics
   */
  async getOrderStats(userInfo = {}, filters = {}) {
    try {
      const { userRole, vendorId, userId } = userInfo;
      const { period = 'month' } = filters;

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

      // Build where clause based on user role
      let where = { createdAt: { gte: startDate } };
      
      if (userRole === 'VENDOR') {
        where.vendorId = vendorId;
      } else if (userRole === 'CUSTOMER') {
        where.customerId = userId;
      }

      // Get comprehensive statistics
      const [
        totalOrders,
        totalRevenue,
        averageOrderValue,
        statusDistribution,
        paymentMethodDistribution,
        dailyTrend,
        topItems
      ] = await Promise.all([
        this.getTotalOrders(where),
        this.getTotalRevenue(where),
        this.getAverageOrderValue(where),
        this.getStatusDistribution(where),
        this.getPaymentMethodDistribution(where),
        this.getDailyTrend(where, userRole, vendorId, userId),
        this.getTopItems(where, userRole, vendorId, userId)
      ]);

      return {
        success: true,
        data: {
          period,
          summary: {
            totalOrders,
            totalRevenue,
            averageOrderValue
          },
          distribution: {
            status: statusDistribution,
            paymentMethods: paymentMethodDistribution
          },
          trends: {
            daily: dailyTrend
          },
          topItems
        }
      };
    } catch (error) {
      console.error('OrderService.getOrderStats error:', error);
      throw error;
    }
  }

  /**
   * Helper methods for statistics
   */
  async getTotalOrders(where) {
    return this.prisma.order.count({ where });
  }

  async getTotalRevenue(where) {
    const result = await this.prisma.order.aggregate({
      where: { ...where, paymentStatus: 'PAID' },
      _sum: { total: true }
    });
    return result._sum.total || 0;
  }

  async getAverageOrderValue(where) {
    const result = await this.prisma.order.aggregate({
      where: { ...where, paymentStatus: 'PAID' },
      _avg: { total: true }
    });
    return result._avg.total || 0;
  }

  async getStatusDistribution(where) {
    const result = await this.prisma.order.groupBy({
      by: ['status'],
      where,
      _count: true,
      _sum: { total: true }
    });

    return result.map(item => ({
      status: item.status,
      count: item._count,
      revenue: item._sum.total || 0
    }));
  }

  async getPaymentMethodDistribution(where) {
    const result = await this.prisma.order.groupBy({
      by: ['paymentMethod'],
      where: { ...where, paymentStatus: 'PAID' },
      _count: true,
      _sum: { total: true }
    });

    return result.map(item => ({
      method: item.paymentMethod,
      count: item._count,
      amount: item._sum.total || 0
    }));
  }

  async getDailyTrend(where, userRole, vendorId, userId) {
    let query = `
      SELECT 
        DATE_TRUNC('day', "createdAt") as date,
        COUNT(*) as order_count,
        SUM(CASE WHEN "paymentStatus" = 'PAID' THEN "total" ELSE 0 END) as revenue
      FROM "orders"
      WHERE "createdAt" >= $1
    `;

    const params = [where.createdAt.gte];

    if (userRole === 'VENDOR') {
      query += ` AND "vendorId" = $2`;
      params.push(vendorId);
    } else if (userRole === 'CUSTOMER') {
      query += ` AND "customerId" = $2`;
      params.push(userId);
    }

    query += ` GROUP BY DATE_TRUNC('day', "createdAt") ORDER BY date`;

    const result = await this.prisma.$queryRawUnsafe(query, ...params);
    
    return result.map(item => ({
      date: item.date.toISOString().split('T')[0],
      orders: parseInt(item.order_count) || 0,
      revenue: parseFloat(item.revenue) || 0
    }));
  }

  async getTopItems(where, userRole, vendorId, userId) {
    let query = `
      SELECT 
        p.id,
        p.name,
        p.images,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.quantity * oi.price) as total_revenue
      FROM "order_items" oi
      JOIN "products" p ON oi."productId" = p.id
      JOIN "orders" o ON oi."orderId" = o.id
      WHERE o."createdAt" >= $1
    `;

    const params = [where.createdAt.gte];

    if (userRole === 'VENDOR') {
      query += ` AND o."vendorId" = $2`;
      params.push(vendorId);
    } else if (userRole === 'CUSTOMER') {
      query += ` AND o."customerId" = $2`;
      params.push(userId);
    }

    query += ` GROUP BY p.id, p.name, p.images ORDER BY total_quantity DESC LIMIT 5`;

    const result = await this.prisma.$queryRawUnsafe(query, ...params);
    
    return result.map(item => ({
      id: item.id,
      name: item.name,
      image: item.images?.[0],
      quantity: parseInt(item.total_quantity) || 0,
      revenue: parseFloat(item.total_revenue) || 0
    }));
  }

  /**
   * Export orders
   */
  async exportOrders(filters = {}) {
    try {
      const { format = 'csv', startDate, endDate, status } = filters;

      // Build where clause
      const where = {};
      
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }
      
      if (status) where.status = status;

      const orders = await this.prisma.order.findMany({
        where,
        include: {
          customer: {
            select: {
              email: true,
              phone: true,
              fullName: true
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
                  name: true,
                  sku: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (format === 'json') {
        return {
          success: true,
          data: orders,
          format: 'json'
        };
      }

      // Generate CSV
      const csvData = this.generateOrderCSV(orders);
      
      return {
        success: true,
        data: csvData,
        format: 'csv',
        filename: `orders_${new Date().toISOString().split('T')[0]}.csv`
      };
    } catch (error) {
      console.error('OrderService.exportOrders error:', error);
      throw error;
    }
  }

  /**
   * Generate CSV from orders
   */
  generateOrderCSV(orders) {
    const headers = [
      'Order Number',
      'Order Date',
      'Customer Name',
      'Customer Email',
      'Customer Phone',
      'Vendor',
      'Status',
      'Payment Status',
      'Payment Method',
      'Subtotal',
      'Shipping Fee',
      'Total',
      'Delivery City',
      'Delivery Method',
      'Items Count',
      'Items'
    ];

    const csvRows = orders.map(order => [
      order.orderNumber,
      new Date(order.createdAt).toLocaleDateString(),
      order.customerName || '',
      order.customerEmail,
      order.customerPhone,
      order.vendor.businessName,
      order.status,
      order.paymentStatus,
      order.paymentMethod,
      order.subtotal,
      order.shippingFee,
      order.total,
      order.deliveryCity || '',
      order.deliveryMethod,
      order.items.length,
      order.items.map(item => `${item.product.name} (${item.quantity}x MWK ${item.price})`).join('; ')
    ]);

    const csvContent = [
      headers.join(','),
      ...csvRows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  /**
   * Process bulk order updates (for cron jobs)
   */
  async processBulkOrderUpdates() {
    try {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      // Update pending orders older than 2 hours to processing
      const updated = await this.prisma.order.updateMany({
        where: {
          status: 'PENDING',
          createdAt: {
            lte: twoHoursAgo
          }
        },
        data: {
          status: 'PROCESSING',
          updatedAt: new Date()
        }
      });

      return {
        success: true,
        message: `Updated ${updated.count} orders from PENDING to PROCESSING`,
        count: updated.count
      };
    } catch (error) {
      console.error('OrderService.processBulkOrderUpdates error:', error);
      throw error;
    }
  }

  /**
   * Get abandoned cart orders (for marketing)
   */
  async getAbandonedCarts(hoursThreshold = 24) {
    try {
      const cutoffDate = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);

      const abandonedCarts = await this.prisma.cart.findMany({
        where: {
          updatedAt: { lte: cutoffDate },
          items: { some: {} } // Has items
        },
        include: {
          user: {
            select: {
              email: true,
              phoneNumber: true,
              fullName: true
            }
          },
          items: {
            include: {
              product: {
                select: {
                  name: true,
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
        },
        orderBy: { updatedAt: 'desc' }
      });

      return {
        success: true,
        data: abandonedCarts,
        count: abandonedCarts.length,
        thresholdHours: hoursThreshold
      };
    } catch (error) {
      console.error('OrderService.getAbandonedCarts error:', error);
      throw error;
    }
  }

  /**
   * Send abandoned cart reminders
   */
  async sendAbandonedCartReminders(hoursThreshold = 24) {
    try {
      const { data: abandonedCarts } = await this.getAbandonedCarts(hoursThreshold);
      
      let remindersSent = 0;
      for (const cart of abandonedCarts) {
        try {
          await sendEmail({
            to: cart.user.email,
            subject: 'Complete Your Purchase - ManuwaFarm',
            template: 'abandoned-cart-reminder',
            data: {
              customerName: cart.user.fullName || 'Customer',
              cartTotal: cart.total,
              itemCount: cart.items.length,
              items: cart.items.map(item => ({
                name: item.product.name,
                quantity: item.quantity,
                price: item.product.price,
                total: item.quantity * item.product.price
              })),
              cartUrl: 'https://manuwafarm.mw/cart'
            }
          });
          remindersSent++;
        } catch (error) {
          console.error(`Failed to send reminder for cart ${cart.id}:`, error.message);
        }
      }

      return {
        success: true,
        message: `Sent ${remindersSent} abandoned cart reminders`,
        remindersSent,
        totalCarts: abandonedCarts.length
      };
    } catch (error) {
      console.error('OrderService.sendAbandonedCartReminders error:', error);
      throw error;
    }
  }
}

module.exports = new OrderService();