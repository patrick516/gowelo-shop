// src/controllers/payment.controller.js - AGRO-DEALER FOCUSED
const { prisma } = require('../config/prisma');
const paymentService = require('../services/payment.service');
const orderService = require('../services/order.service');
const notificationService = require('../services/notification.service');

const paymentController = {
  
  // Initiate payment for agro-order
  initiateOrderPayment: async (req, res) => {
    try {
      const { orderId, paymentMethod, phoneNumber, bankDetails } = req.body;
      const customerId = req.user.userId;
      const userRole = req.user.role;

      if (userRole !== 'CUSTOMER') {
        return res.status(403).json({
          success: false,
          message: 'Only customers can initiate payments'
        });
      }

      // Get order details
      const order = await prisma.order.findUnique({
        where: { id: orderId },
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
              businessName: true,
              user: {
                select: {
                  email: true,
                  phone: true
                }
              }
            }
          },
          items: {
            include: {
              product: {
                select: {
                  name: true,
                  price: true
                }
              }
            }
          }
        }
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Verify order belongs to customer
      if (order.customerId !== customerId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to pay for this order'
        });
      }

      // Check if order is already paid
      if (order.paymentStatus === 'PAID') {
        return res.status(400).json({
          success: false,
          message: 'Order is already paid'
        });
      }

      // Check if order can be paid (not cancelled)
      if (order.status === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          message: 'Cannot pay for cancelled order'
        });
      }

      let paymentResult;

      // Process payment based on method
      switch (paymentMethod) {
        case 'AIRTEL_MONEY':
          if (!phoneNumber) {
            return res.status(400).json({
              success: false,
              message: 'Phone number is required for Airtel Money'
            });
          }
          paymentResult = await paymentService.initiateAirtelMoneyPayment(order, phoneNumber);
          break;

        case 'MPAMBA':
          if (!phoneNumber) {
            return res.status(400).json({
              success: false,
              message: 'Phone number is required for Mpamba'
            });
          }
          paymentResult = await paymentService.initiateMpambaPayment(order, phoneNumber);
          break;

        case 'CASH':
          paymentResult = await paymentService.processCashOnDelivery(order);
          break;

        case 'BANK_TRANSFER':
          if (!bankDetails) {
            return res.status(400).json({
              success: false,
              message: 'Bank details are required for bank transfer'
            });
          }
          paymentResult = await paymentService.processBankTransfer(order, bankDetails);
          break;

        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid payment method'
          });
      }

      // Update order with payment info
      await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentMethod,
          paymentReference: paymentResult.transactionId,
          paymentStatus: paymentResult.status === 'SUCCESS' ? 'PAID' : 'PENDING'
        }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: customerId,
          action: 'PAYMENT_INITIATED',
          entity: 'ORDER',
          entityId: orderId,
          changes: JSON.stringify({
            paymentMethod,
            amount: order.total,
            transactionId: paymentResult.transactionId,
            status: paymentResult.status
          }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      // Send payment confirmation
      if (paymentResult.status === 'SUCCESS' || paymentResult.status === 'PENDING') {
        try {
          await notificationService.createNotification(
            customerId,
            'PAYMENT_INITIATED',
            'Payment Initiated',
            `Payment of MWK ${order.total} initiated for Order #${order.orderNumber}`,
            {
              orderId,
              orderNumber: order.orderNumber,
              amount: order.total,
              paymentMethod,
              transactionId: paymentResult.transactionId,
              status: paymentResult.status
            }
          );

          // Also notify vendor
          const vendorUser = await prisma.user.findFirst({
            where: { vendorProfile: { id: order.vendorId } }
          });

          if (vendorUser) {
            await notificationService.createNotification(
              vendorUser.id,
              'PAYMENT_RECEIVED',
              'Payment Received',
              `Customer initiated payment of MWK ${order.total} for Order #${order.orderNumber}`,
              {
                orderId,
                orderNumber: order.orderNumber,
                amount: order.total,
                paymentMethod,
                customerName: order.customer.fullName || 'Customer'
              }
            );
          }
        } catch (notificationError) {
          console.error('Payment notification error:', notificationError);
          // Continue even if notification fails
        }
      }

      res.json({
        success: true,
        message: paymentResult.message,
        data: {
          payment: paymentResult,
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            total: order.total,
            status: order.status,
            paymentStatus: paymentResult.status === 'SUCCESS' ? 'PAID' : 'PENDING'
          }
        }
      });

    } catch (error) {
      console.error('Initiate payment error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to initiate payment'
      });
    }
  },

  // Check payment status
  checkPaymentStatus: async (req, res) => {
    try {
      const { transactionId } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Get payment record
      const payment = await prisma.payment.findUnique({
        where: { transactionId },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              customerId: true,
              vendorId: true
            }
          }
        }
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      // Check authorization
      if (userRole === 'CUSTOMER' && payment.customerId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this payment'
        });
      }

      if (userRole === 'VENDOR' && payment.vendorId !== req.user.vendorId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this payment'
        });
      }

      // Check payment status from provider
      const statusResult = await paymentService.verifyPayment(transactionId, payment.provider);

      // Update payment status if changed
      if (statusResult.status !== payment.status && payment.order) {
        await prisma.payment.update({
          where: { transactionId },
          data: {
            status: statusResult.status === 'SUCCESS' ? 'PAID' : payment.status,
            verifiedAt: statusResult.verified ? new Date() : payment.verifiedAt
          }
        });

        // Update order payment status
        if (statusResult.status === 'SUCCESS') {
          await prisma.order.update({
            where: { id: payment.order.id },
            data: {
              paymentStatus: 'PAID'
            }
          });

          // Update vendor stats for successful payment
          await prisma.vendorProfile.update({
            where: { id: payment.vendorId },
            data: {
              totalSales: { increment: 1 },
              totalRevenue: { increment: payment.amount }
            }
          });
        }
      }

      res.json({
        success: true,
        data: {
          payment: {
            ...payment,
            currentStatus: statusResult.status,
            verified: statusResult.verified
          },
          order: payment.order ? {
            id: payment.order.id,
            orderNumber: payment.order.orderNumber
          } : null
        }
      });

    } catch (error) {
      console.error('Check payment status error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to check payment status'
      });
    }
  },

  // Get payment history
  getPaymentHistory: async (req, res) => {
    try {
      const userId = req.user.userId;
      const userRole = req.user.role;
      const {
        page = 1,
        limit = 20,
        startDate,
        endDate,
        status,
        paymentMethod
      } = req.query;

      const filters = {
        page: parseInt(page),
        limit: parseInt(limit),
        startDate,
        endDate,
        status,
        paymentMethod
      };

      const paymentHistory = await paymentService.getPaymentHistory(userId, userRole, filters);

      res.json({
        success: true,
        data: paymentHistory
      });

    } catch (error) {
      console.error('Get payment history error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payment history'
      });
    }
  },

  // Handle payment webhook (public endpoint for mobile money providers)
  mobileMoneyWebhook: async (req, res) => {
    try {
      const { provider } = req.params;
      const webhookData = req.body;

      console.log(`${provider} webhook received:`, JSON.stringify(webhookData, null, 2));

      // Verify webhook signature (implement based on provider requirements)
      const isValid = await verifyWebhookSignature(provider, webhookData, req.headers);
      
      if (!isValid) {
        console.error('Invalid webhook signature');
        return res.status(401).json({ success: false, message: 'Invalid signature' });
      }

      // Process webhook
      const result = await paymentService.handlePaymentWebhook(provider, webhookData);

      // Send response to provider
      res.json({
        success: true,
        message: 'Webhook processed successfully',
        data: result
      });

    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({
        success: false,
        message: 'Webhook processing failed'
      });
    }
  },

  // Get transaction summary (for vendor/admin)
  getTransactionSummary: async (req, res) => {
    try {
      const userRole = req.user.role;
      const vendorId = req.user.vendorId;
      const { startDate, endDate } = req.query;

      // Calculate date range
      const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
      const end = endDate ? new Date(endDate) : new Date();

      // Build where clause based on user role
      const where = {
        status: 'PAID',
        createdAt: {
          gte: start,
          lte: end
        }
      };

      if (userRole === 'VENDOR') {
        where.vendorId = vendorId;
      }

      // Get summary data
      const [
        totalTransactions,
        totalAmount,
        paymentMethodSummary,
        dailySummary,
        topCustomers
      ] = await Promise.all([
        // Total transactions
        prisma.payment.count({ where }),
        // Total amount
        prisma.payment.aggregate({
          where,
          _sum: { amount: true }
        }),
        // Payment method summary
        prisma.payment.groupBy({
          by: ['paymentMethod'],
          where,
          _count: true,
          _sum: { amount: true }
        }),
        // Daily summary
        prisma.$queryRaw`
          SELECT 
            DATE_TRUNC('day', "createdAt") as date,
            COUNT(*) as transaction_count,
            SUM(amount) as daily_amount
          FROM "payments"
          WHERE "status" = 'PAID'
            AND "createdAt" >= ${start}
            AND "createdAt" <= ${end}
            ${userRole === 'VENDOR' ? `AND "vendorId" = ${vendorId}` : ''}
          GROUP BY DATE_TRUNC('day', "createdAt")
          ORDER BY date
        `,
        // Top customers
        userRole === 'VENDOR' ? prisma.$queryRaw`
          SELECT 
            c.id,
            u."fullName" as customer_name,
            u.phone as customer_phone,
            COUNT(p.id) as transaction_count,
            SUM(p.amount) as total_spent
          FROM "payments" p
          JOIN "users" u ON p."customerId" = u.id
          JOIN "customers" c ON u.id = c."userId"
          WHERE p."vendorId" = ${vendorId}
            AND p."status" = 'PAID'
            AND p."createdAt" >= ${start}
            AND p."createdAt" <= ${end}
          GROUP BY c.id, u."fullName", u.phone
          ORDER BY total_spent DESC
          LIMIT 10
        ` : []
      ]);

      res.json({
        success: true,
        data: {
          period: {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0],
            days: Math.ceil((end - start) / (1000 * 60 * 60 * 24))
          },
          summary: {
            totalTransactions,
            totalAmount: totalAmount._sum.amount || 0,
            averageTransaction: totalTransactions > 0 ? (totalAmount._sum.amount || 0) / totalTransactions : 0
          },
          paymentMethods: paymentMethodSummary.map(item => ({
            method: item.paymentMethod,
            count: item._count,
            amount: item._sum.amount || 0,
            percentage: totalAmount._sum.amount > 0 ? 
              ((item._sum.amount || 0) / totalAmount._sum.amount * 100).toFixed(2) : 0
          })),
          dailyTrend: dailySummary.map(item => ({
            date: item.date.toISOString().split('T')[0],
            transactions: parseInt(item.transaction_count) || 0,
            amount: parseFloat(item.daily_amount) || 0
          })),
          topCustomers: topCustomers.map(customer => ({
            id: customer.id,
            name: customer.customer_name || 'Unknown',
            phone: customer.customer_phone,
            transactions: parseInt(customer.transaction_count) || 0,
            totalSpent: parseFloat(customer.total_spent) || 0
          }))
        }
      });

    } catch (error) {
      console.error('Get transaction summary error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction summary'
      });
    }
  },

  // Process refund
  processRefund: async (req, res) => {
    try {
      const { paymentId } = req.params;
      const { amount, reason, notes } = req.body;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Get payment details
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          order: true,
          customer: {
            select: {
              id: true,
              user: {
                select: {
                  email: true,
                  phone: true,
                  fullName: true
                }
              }
            }
          },
          vendor: {
            select: {
              id: true,
              businessName: true,
              user: {
                select: {
                  email: true
                }
              }
            }
          }
        }
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      // Check authorization
      if (userRole === 'VENDOR' && payment.vendorId !== req.user.vendorId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to refund this payment'
        });
      }

      // Check if refund is allowed
      if (payment.status !== 'PAID') {
        return res.status(400).json({
          success: false,
          message: 'Cannot refund unpaid payment'
        });
      }

      // Prepare refund data
      const refundData = {
        amount: amount || payment.amount,
        reason: reason || 'Customer request',
        notes,
        processedBy: userId
      };

      // Process refund
      const refundResult = await paymentService.processRefund(paymentId, refundData);

      // Send refund notifications
      try {
        // Notify customer
        if (payment.customer.user.email) {
          await notificationService.createNotification(
            payment.customer.user.id,
            'REFUND_INITIATED',
            'Refund Initiated',
            `Refund of MWK ${refundData.amount} has been initiated for your payment`,
            {
              paymentId,
              amount: refundData.amount,
              reason: refundData.reason,
              status: refundResult.status
            }
          );
        }

        // Notify vendor
        const vendorUser = await prisma.user.findFirst({
          where: { vendorProfile: { id: payment.vendorId } }
        });

        if (vendorUser) {
          await notificationService.createNotification(
            vendorUser.id,
            'REFUND_PROCESSED',
            'Refund Processed',
            `Refund of MWK ${refundData.amount} processed for payment ${payment.transactionId}`,
            {
              paymentId,
              amount: refundData.amount,
              reason: refundData.reason,
              customerName: payment.customer.user.fullName || 'Customer'
            }
          );
        }
      } catch (notificationError) {
        console.error('Refund notification error:', notificationError);
        // Continue even if notifications fail
      }

      res.json({
        success: true,
        message: refundResult.message,
        data: {
          refundId: refundResult.refundId,
          status: refundResult.status,
          payment: {
            id: payment.id,
            transactionId: payment.transactionId,
            amount: payment.amount,
            originalStatus: payment.status
          }
        }
      });

    } catch (error) {
      console.error('Process refund error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to process refund'
      });
    }
  }
};

// Helper function to verify webhook signatures
async function verifyWebhookSignature(provider, data, headers) {
  // This is a placeholder. Implement proper signature verification
  // based on your mobile money provider's requirements
  
  if (process.env.NODE_ENV === 'development') {
    console.log('Skipping webhook signature verification in development');
    return true;
  }

  // For Airtel Money
  if (provider === 'airtel') {
    const signature = headers['x-signature'];
    const timestamp = headers['x-timestamp'];
    
    // Verify signature logic here
    // return verifyAirtelSignature(signature, data, timestamp);
  }

  // For Mpamba
  if (provider === 'mpamba') {
    const signature = headers['x-mpamba-signature'];
    
    // Verify signature logic here
    // return verifyMpambaSignature(signature, data);
  }

  // Default to true for now, but implement proper verification in production
  return true;
}

module.exports = paymentController;