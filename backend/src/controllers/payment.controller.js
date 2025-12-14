// src/controllers/payment.controller.js
const { prisma } = require('../config/prisma');
const { validatePhoneNumber, formatPhoneNumber, generateTransactionId } = require('../config/mobile-money');
const { sendEmail } = require('../services/notification.service');

const paymentController = {
  // Initiate order payment
  initiateOrderPayment: async (req, res) => {
    try {
      const { orderId, paymentMethod, phoneNumber } = req.body;
      const customerId = req.user.userId;

      if (!orderId || !paymentMethod) {
        return res.status(400).json({
          success: false,
          message: 'Order ID and payment method are required'
        });
      }

      // Get order
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: true
            }
          },
          vendor: true,
          customer: true
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

      // Validate phone for mobile money
      if (paymentMethod === 'AIRTEL_MONEY' || paymentMethod === 'MPAMBA') {
        if (!phoneNumber) {
          return res.status(400).json({
            success: false,
            message: 'Phone number is required for mobile money payment'
          });
        }

        if (!validatePhoneNumber(phoneNumber)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid phone number format. Use format: 0881234567 or 265881234567'
          });
        }
      }

      // Generate transaction ID
      const transactionId = generateTransactionId();
      const formattedPhone = phoneNumber ? formatPhoneNumber(phoneNumber) : null;

      // Update order with payment info
      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentMethod,
          paymentReference: transactionId,
          paymentStatus: 'PROCESSING'
        }
      });

      // Create payment record
      const payment = await prisma.$transaction(async (prisma) => {
        // Create payment record
        const paymentRecord = await prisma.payment.create({
          data: {
            orderId,
            amount: order.total,
            currency: order.currency || 'MWK',
            paymentMethod,
            status: 'PENDING',
            transactionId,
            phoneNumber: formattedPhone,
            customerId,
            vendorId: order.vendorId
          }
        });

        // Create audit log
        await prisma.auditLog.create({
          data: {
            userId: customerId,
            action: 'PAYMENT_INITIATED',
            entity: 'PAYMENT',
            entityId: paymentRecord.id,
            changes: JSON.stringify({
              orderId,
              amount: order.total,
              paymentMethod,
              transactionId
            }),
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
          }
        });

        return paymentRecord;
      });

      // Prepare payment instructions based on method
      let paymentInstructions = {};
      let provider = '';

      switch (paymentMethod) {
        case 'AIRTEL_MONEY':
          provider = 'Airtel Money';
          paymentInstructions = {
            provider: 'Airtel Money',
            phone: '44444',
            amount: `MWK ${order.total}`,
            reference: transactionId,
            instructions: `Send MWK ${order.total} to 44444 with reference ${transactionId}`,
            steps: [
              'Dial *444# on your Airtel line',
              'Select "Send Money"',
              'Enter phone number: 44444',
              `Enter amount: ${order.total}`,
              `Enter reference: ${transactionId}`,
              'Enter your PIN to confirm'
            ]
          };
          break;

        case 'MPAMBA':
          provider = 'TNM Mpamba';
          paymentInstructions = {
            provider: 'TNM Mpamba',
            phone: '55555',
            amount: `MWK ${order.total}`,
            reference: transactionId,
            instructions: `Send MWK ${order.total} to 55555 with reference ${transactionId}`,
            steps: [
              'Dial *555# on your TNM line',
              'Select "Send Money"',
              'Enter phone number: 55555',
              `Enter amount: ${order.total}`,
              `Enter reference: ${transactionId}`,
              'Enter your PIN to confirm'
            ]
          };
          break;

        case 'CASH_ON_DELIVERY':
          paymentInstructions = {
            provider: 'Cash on Delivery',
            instructions: 'Pay with cash when your order is delivered',
            amount: `MWK ${order.total} (cash on delivery)`
          };
          break;

        case 'BANK_TRANSFER':
          paymentInstructions = {
            provider: 'Bank Transfer',
            bank: 'National Bank of Malawi',
            accountName: 'Manuwa Farm Marketplace',
            accountNumber: '1000000000001',
            branch: 'Blantyre Branch',
            reference: transactionId,
            amount: `MWK ${order.total}`,
            instructions: `Transfer MWK ${order.total} to the account above with reference ${transactionId}`
          };
          break;

        default:
          paymentInstructions = {
            instructions: 'Complete payment to confirm your order'
          };
      }

      // Send payment initiation notification to customer
      try {
        await sendEmail({
          to: order.customerEmail,
          subject: `Payment Instructions - Order #${order.orderNumber} - ManuwaFarm`,
          template: 'order-payment-instructions',
          data: {
            orderNumber: order.orderNumber,
            customerName: order.customerName || 'Customer',
            amount: order.total,
            paymentMethod,
            transactionId,
            instructions: paymentInstructions.instructions,
            orderDetails: order.items.map(item => ({
              product: item.product.name,
              quantity: item.quantity,
              price: item.price
            })),
            total: order.total,
            deliveryAddress: order.shippingAddress
          }
        });
      } catch (emailError) {
        console.error('Failed to send payment email:', emailError);
      }

      // Send notification to vendor
      if (order.vendor && order.vendor.user) {
        try {
          await sendEmail({
            to: order.vendor.contactEmail || order.vendor.user.email,
            subject: `New Order Payment Initiated - #${order.orderNumber}`,
            template: 'vendor-order-payment-initiated',
            data: {
              orderNumber: order.orderNumber,
              businessName: order.vendor.businessName,
              amount: order.total,
              paymentMethod,
              transactionId,
              customerName: order.customerName,
              customerPhone: order.customerPhone
            }
          });
        } catch (vendorEmailError) {
          console.error('Failed to send vendor notification:', vendorEmailError);
        }
      }

      res.json({
        success: true,
        message: 'Payment initiated successfully',
        data: {
          payment,
          order: updatedOrder,
          instructions: paymentInstructions,
          nextSteps: {
            verifyPayment: `/api/payments/verify/${transactionId}`,
            checkStatus: `/api/payments/status/${transactionId}`
          }
        }
      });

    } catch (error) {
      console.error('Initiate order payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate payment',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Verify payment (for webhooks from mobile money providers)
  verifyPayment: async (req, res) => {
    try {
      const { transactionId, status, provider, amount, phone, reference } = req.body;

      if (!transactionId || !status) {
        return res.status(400).json({
          success: false,
          message: 'Transaction ID and status are required'
        });
      }

      // Find payment by transaction ID
      const payment = await prisma.payment.findFirst({
        where: {
          OR: [
            { transactionId },
            { paymentReference: transactionId }
          ]
        },
        include: {
          order: {
            include: {
              customer: true,
              vendor: {
                include: { user: true }
              },
              items: {
                include: {
                  product: true
                }
              }
            }
          }
        }
      });

      if (!payment) {
        console.warn(`Payment not found for transaction ID: ${transactionId}`);
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      // Verify amount matches
      if (amount && parseFloat(amount) !== payment.amount) {
        console.warn(`Amount mismatch for transaction ${transactionId}: Expected ${payment.amount}, Received ${amount}`);
        // You might want to handle this differently - maybe flag for manual review
      }

      let paymentStatus = 'PENDING';
      let orderStatus = payment.order.status;
      let vendorUpdate = {};

      if (status === 'success' || status === 'paid' || status === 'completed') {
        paymentStatus = 'PAID';
        orderStatus = 'CONFIRMED';
        
        // Update vendor stats
        vendorUpdate = {
          totalSales: { increment: 1 },
          totalRevenue: { increment: payment.amount }
        };

        // Update product sales counts
        for (const item of payment.order.items) {
          await prisma.product.update({
            where: { id: item.productId },
            data: {
              salesCount: { increment: item.quantity },
              quantity: { decrement: item.quantity }
            }
          });
        }

      } else if (status === 'failed' || status === 'cancelled') {
        paymentStatus = 'FAILED';
        orderStatus = payment.order.status; // Keep current status or change to cancelled
      } else if (status === 'pending') {
        paymentStatus = 'PENDING';
      }

      // Update payment and order in transaction
      await prisma.$transaction(async (prisma) => {
        // Update payment
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: paymentStatus,
            verifiedAt: new Date(),
            provider: provider || payment.provider,
            providerReference: reference || transactionId,
            providerData: req.body // Store full response for audit
          }
        });

        // Update order
        await prisma.order.update({
          where: { id: payment.orderId },
          data: {
            paymentStatus: paymentStatus,
            status: orderStatus,
            ...(paymentStatus === 'PAID' && { confirmedAt: new Date() })
          }
        });

        // Update vendor stats if paid
        if (paymentStatus === 'PAID' && payment.order.vendorId) {
          await prisma.vendorProfile.update({
            where: { id: payment.order.vendorId },
            data: vendorUpdate
          });
        }

        // Create audit log
        await prisma.auditLog.create({
          data: {
            userId: payment.customerId,
            action: 'PAYMENT_VERIFIED',
            entity: 'PAYMENT',
            entityId: payment.id,
            changes: JSON.stringify({
              oldStatus: payment.status,
              newStatus: paymentStatus,
              provider,
              transactionId,
              amount
            }),
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
          }
        });
      });

      // Send notifications based on status
      if (paymentStatus === 'PAID') {
        // Send confirmation to customer
        try {
          await sendEmail({
            to: payment.order.customerEmail,
            subject: `Payment Confirmed - Order #${payment.order.orderNumber}`,
            template: 'payment-confirmed',
            data: {
              orderNumber: payment.order.orderNumber,
              customerName: payment.order.customerName || 'Customer',
              amount: payment.amount,
              transactionId,
              paymentMethod: payment.paymentMethod,
              orderDetails: payment.order.items.map(item => ({
                product: item.product.name,
                quantity: item.quantity,
                price: item.price
              })),
              total: payment.amount,
              nextSteps: 'Your order is now being processed by the vendor.'
            }
          });
        } catch (emailError) {
          console.error('Failed to send confirmation email:', emailError);
        }

        // Send notification to vendor
        if (payment.order.vendor && payment.order.vendor.user) {
          try {
            await sendEmail({
              to: payment.order.vendor.contactEmail || payment.order.vendor.user.email,
              subject: `Order Payment Received - #${payment.order.orderNumber}`,
              template: 'vendor-payment-received',
              data: {
                orderNumber: payment.order.orderNumber,
                businessName: payment.order.vendor.businessName,
                amount: payment.amount,
                customerName: payment.order.customerName,
                customerPhone: payment.order.customerPhone,
                items: payment.order.items.map(item => ({
                  product: item.product.name,
                  quantity: item.quantity,
                  price: item.price
                })),
                total: payment.amount
              }
            });
          } catch (vendorEmailError) {
            console.error('Failed to send vendor notification:', vendorEmailError);
          }
        }
      } else if (paymentStatus === 'FAILED') {
        // Send failure notification
        try {
          await sendEmail({
            to: payment.order.customerEmail,
            subject: `Payment Failed - Order #${payment.order.orderNumber}`,
            template: 'payment-failed',
            data: {
              orderNumber: payment.order.orderNumber,
              customerName: payment.order.customerName || 'Customer',
              amount: payment.amount,
              transactionId,
              paymentMethod: payment.paymentMethod,
              instructions: 'Please try again or contact support for assistance.'
            }
          });
        } catch (emailError) {
          console.error('Failed to send failure email:', emailError);
        }
      }

      res.json({
        success: true,
        message: `Payment ${paymentStatus.toLowerCase()}`,
        data: {
          transactionId,
          status: paymentStatus,
          orderId: payment.orderId,
          orderNumber: payment.order.orderNumber
        }
      });

    } catch (error) {
      console.error('Verify payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify payment',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Check payment status
  checkPaymentStatus: async (req, res) => {
    try {
      const { transactionId } = req.params;

      const payment = await prisma.payment.findFirst({
        where: {
          OR: [
            { transactionId },
            { paymentReference: transactionId }
          ]
        },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              total: true
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

      res.json({
        success: true,
        data: {
          transactionId: payment.transactionId,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          paymentMethod: payment.paymentMethod,
          createdAt: payment.createdAt,
          verifiedAt: payment.verifiedAt,
          order: payment.order
        }
      });

    } catch (error) {
      console.error('Check payment status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check payment status'
      });
    }
  },

  // Get payment history for user
  getPaymentHistory: async (req, res) => {
    try {
      const userId = req.user.userId;
      const { page = 1, limit = 20, status, startDate, endDate } = req.query;

      const skip = (page - 1) * limit;

      // Build where clause
      const where = { customerId: userId };
      
      if (status) {
        where.status = status;
      }
      
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          include: {
            order: {
              select: {
                orderNumber: true,
                status: true,
                items: {
                  include: {
                    product: {
                      select: {
                        name: true,
                        images: true
                      }
                    }
                  }
                }
              }
            },
            vendor: {
              select: {
                businessName: true,
                businessLogo: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit)
        }),
        prisma.payment.count({ where })
      ]);

      res.json({
        success: true,
        data: payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get payment history error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payment history'
      });
    }
  },

  // Process refund (admin/vendor)
  processRefund: async (req, res) => {
    try {
      const { paymentId } = req.params;
      const { reason, amount, notes } = req.body;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Get payment
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          order: {
            include: {
              customer: true,
              vendor: true
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
      if (userRole === 'VENDOR') {
        if (payment.vendorId !== req.user.vendorId) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to refund this payment'
          });
        }
      } else if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to process refunds'
        });
      }

      // Check if payment is eligible for refund
      if (payment.status !== 'PAID') {
        return res.status(400).json({
          success: false,
          message: 'Only paid payments can be refunded'
        });
      }

      // Calculate refund amount
      const refundAmount = amount ? parseFloat(amount) : payment.amount;
      
      if (refundAmount > payment.amount) {
        return res.status(400).json({
          success: false,
          message: 'Refund amount cannot exceed original payment amount'
        });
      }

      // Process refund
      const refund = await prisma.$transaction(async (prisma) => {
        // Create refund record
        const refundRecord = await prisma.refund.create({
          data: {
            paymentId,
            amount: refundAmount,
            currency: payment.currency,
            reason: reason || 'Customer request',
            notes,
            status: 'PROCESSING',
            processedBy: userId,
            customerId: payment.customerId,
            vendorId: payment.vendorId
          }
        });

        // Update payment status
        await prisma.payment.update({
          where: { id: paymentId },
          data: { status: 'REFUNDED' }
        });

        // Update order status
        await prisma.order.update({
          where: { id: payment.orderId },
          data: { 
            paymentStatus: 'REFUNDED',
            status: 'REFUNDED'
          }
        });

        // Update vendor revenue (deduct refund)
        if (payment.vendorId) {
          await prisma.vendorProfile.update({
            where: { id: payment.vendorId },
            data: {
              totalRevenue: { decrement: refundAmount }
            }
          });
        }

        // Create audit log
        await prisma.auditLog.create({
          data: {
            userId,
            action: 'REFUND_PROCESSED',
            entity: 'REFUND',
            entityId: refundRecord.id,
            changes: JSON.stringify({
              paymentId,
              amount: refundAmount,
              reason,
              originalAmount: payment.amount
            }),
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
          }
        });

        return refundRecord;
      });

      // Send refund notification
      try {
        await sendEmail({
          to: payment.order.customerEmail,
          subject: `Refund Processed - Order #${payment.order.orderNumber}`,
          template: 'refund-processed',
          data: {
            orderNumber: payment.order.orderNumber,
            customerName: payment.order.customerName || 'Customer',
            refundAmount: refundAmount,
            originalAmount: payment.amount,
            reason: reason || 'Customer request',
            notes,
            processingTime: '3-5 business days'
          }
        });
      } catch (emailError) {
        console.error('Failed to send refund email:', emailError);
      }

      res.json({
        success: true,
        message: 'Refund processed successfully',
        data: refund
      });

    } catch (error) {
      console.error('Process refund error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process refund'
      });
    }
  },

  // Get payment methods
  getPaymentMethods: async (req, res) => {
    try {
      const paymentMethods = [
        {
          id: 'airtel_money',
          name: 'Airtel Money',
          description: 'Pay using Airtel Money',
          icon: 'airtel-icon.png',
          supported: true,
          processingFee: '0%',
          processingTime: 'Instant',
          instructions: 'Dial *444# and follow prompts'
        },
        {
          id: 'mpamba',
          name: 'TNM Mpamba',
          description: 'Pay using TNM Mpamba',
          icon: 'mpamba-icon.png',
          supported: true,
          processingFee: '0%',
          processingTime: 'Instant',
          instructions: 'Dial *555# and follow prompts'
        },
        {
          id: 'cash_on_delivery',
          name: 'Cash on Delivery',
          description: 'Pay when you receive your order',
          icon: 'cash-icon.png',
          supported: true,
          processingFee: 'MWK 1,000',
          processingTime: 'On delivery',
          instructions: 'Pay cash to delivery agent'
        },
        {
          id: 'bank_transfer',
          name: 'Bank Transfer',
          description: 'Transfer directly to our bank account',
          icon: 'bank-icon.png',
          supported: true,
          processingFee: 'Bank charges apply',
          processingTime: '1-2 business days',
          instructions: 'Transfer to provided account details'
        }
      ];

      res.json({
        success: true,
        data: paymentMethods
      });

    } catch (error) {
      console.error('Get payment methods error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payment methods'
      });
    }
  },

  // Webhook endpoint for mobile money providers
  mobileMoneyWebhook: async (req, res) => {
    try {
      const provider = req.params.provider; // airtel or mpamba
      const payload = req.body;

      console.log(`Received webhook from ${provider}:`, JSON.stringify(payload, null, 2));

      // Validate webhook signature (in production)
      if (process.env.NODE_ENV === 'production') {
        // Implement signature validation based on provider
        const isValid = validateWebhookSignature(provider, req);
        if (!isValid) {
          console.warn(`Invalid webhook signature from ${provider}`);
          return res.status(401).json({ success: false, message: 'Invalid signature' });
        }
      }

      // Extract transaction details based on provider
      let transactionId, status, amount, phone, reference;

      if (provider === 'airtel') {
        // Airtel Money webhook format
        transactionId = payload.transactionId || payload.reference;
        status = payload.status?.toLowerCase();
        amount = payload.amount;
        phone = payload.phone;
        reference = payload.reference;
      } else if (provider === 'mpamba') {
        // TNM Mpamba webhook format
        transactionId = payload.transactionId || payload.reference;
        status = payload.status?.toLowerCase();
        amount = payload.amount;
        phone = payload.phone;
        reference = payload.reference;
      }

      // Call verify payment
      if (transactionId && status) {
        // This will trigger the verifyPayment function
        // In a real app, you might want to process this asynchronously
        const verifyReq = {
          body: {
            transactionId,
            status,
            provider,
            amount,
            phone,
            reference
          },
          ip: req.ip,
          headers: req.headers
        };

        // Process asynchronously
        processPaymentVerification(verifyReq).catch(error => {
          console.error('Error processing webhook payment:', error);
        });
      }

      // Always respond immediately to webhook
      res.json({ success: true, message: 'Webhook received' });

    } catch (error) {
      console.error('Mobile money webhook error:', error);
      res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
  },

  // Get transaction summary
  getTransactionSummary: async (req, res) => {
    try {
      const userId = req.user.userId;
      const userRole = req.user.role;

      let whereClause = {};
      
      if (userRole === 'CUSTOMER') {
        whereClause.customerId = userId;
      } else if (userRole === 'VENDOR') {
        whereClause.vendorId = req.user.vendorId;
      } else if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
        // Admin can see all
      } else {
        return res.status(403).json({
          success: false,
          message: 'Not authorized'
        });
      }

      // Get date ranges
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);

      // Get summary data
      const [
        totalTransactions,
        totalAmount,
        todayTransactions,
        todayAmount,
        monthTransactions,
        monthAmount,
        pendingTransactions
      ] = await Promise.all([
        // Total transactions
        prisma.payment.count({
          where: { ...whereClause, status: 'PAID' }
        }),
        // Total amount
        prisma.payment.aggregate({
          where: { ...whereClause, status: 'PAID' },
          _sum: { amount: true }
        }),
        // Today's transactions
        prisma.payment.count({
          where: { 
            ...whereClause, 
            status: 'PAID',
            createdAt: { gte: startOfToday }
          }
        }),
        // Today's amount
        prisma.payment.aggregate({
          where: { 
            ...whereClause, 
            status: 'PAID',
            createdAt: { gte: startOfToday }
          },
          _sum: { amount: true }
        }),
        // This month's transactions
        prisma.payment.count({
          where: { 
            ...whereClause, 
            status: 'PAID',
            createdAt: { gte: startOfMonth }
          }
        }),
        // This month's amount
        prisma.payment.aggregate({
          where: { 
            ...whereClause, 
            status: 'PAID',
            createdAt: { gte: startOfMonth }
          },
          _sum: { amount: true }
        }),
        // Pending transactions
        prisma.payment.count({
          where: { ...whereClause, status: 'PENDING' }
        })
      ]);

      // Get payment method distribution
      const methodDistribution = await prisma.payment.groupBy({
        by: ['paymentMethod'],
        where: { ...whereClause, status: 'PAID' },
        _count: true,
        _sum: { amount: true }
      });

      res.json({
        success: true,
        data: {
          summary: {
            totalTransactions,
            totalAmount: totalAmount._sum.amount || 0,
            todayTransactions,
            todayAmount: todayAmount._sum.amount || 0,
            monthTransactions,
            monthAmount: monthAmount._sum.amount || 0,
            pendingTransactions
          },
          methodDistribution: methodDistribution.map(method => ({
            method: method.paymentMethod,
            count: method._count,
            amount: method._sum.amount || 0,
            percentage: totalAmount._sum.amount 
              ? ((method._sum.amount || 0) / totalAmount._sum.amount * 100).toFixed(1)
              : 0
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
  }
};

// Helper function to validate webhook signature
const validateWebhookSignature = (provider, req) => {
  // In production, implement signature validation
  // This is a placeholder - you should implement proper validation
  // based on your mobile money provider's documentation
  
  if (provider === 'airtel') {
    // Validate Airtel Money signature
    const signature = req.headers['x-airtel-signature'];
    const secret = process.env.AIRTEL_WEBHOOK_SECRET;
    // Implement signature validation logic
    return true; // Placeholder
  } else if (provider === 'mpamba') {
    // Validate TNM Mpamba signature
    const signature = req.headers['x-mpamba-signature'];
    const secret = process.env.MPAMBA_WEBHOOK_SECRET;
    // Implement signature validation logic
    return true; // Placeholder
  }
  
  return false;
};

// Async function to process payment verification
const processPaymentVerification = async (verifyReq) => {
  // This would be called from webhook to process asynchronously
  // You can implement queue processing here
  console.log('Processing payment verification asynchronously:', verifyReq.body.transactionId);
  // In real implementation, add to a job queue
};

module.exports = paymentController;