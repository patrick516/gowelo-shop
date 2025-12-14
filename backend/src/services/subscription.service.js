// src/services/subscription.service.js
const { prisma } = require('../config/prisma');
const { sendEmail } = require('./notification.service');
const { validatePhoneNumber, generateTransactionId } = require('../config/mobile-money');
const { sendSMS } = require('./sms.service');

class SubscriptionService {
  constructor() {
    this.prisma = prisma;
  }

  /**
   * Get all active subscription plans
   */
  async getAllPlans() {
    try {
      const plans = await this.prisma.subscriptionPlanConfig.findMany({
        where: { isActive: true },
        orderBy: { price: 'asc' }
      });

      return {
        success: true,
        data: plans
      };
    } catch (error) {
      console.error('SubscriptionService.getAllPlans error:', error);
      throw new Error('Failed to fetch subscription plans');
    }
  }

  /**
   * Create or update subscription plan (admin)
   */
  async upsertPlan(planData, adminId, auditInfo = {}) {
    try {
      const { name, description, price, features, isActive = true } = planData;

      if (!name || price === undefined) {
        throw new Error('Plan name and price are required');
      }

      // Check if plan exists
      const existingPlan = await this.prisma.subscriptionPlanConfig.findUnique({
        where: { name }
      });

      let plan;
      const now = new Date();

      if (existingPlan) {
        // Update existing plan
        plan = await this.prisma.subscriptionPlanConfig.update({
          where: { name },
          data: {
            description: description || existingPlan.description,
            price: price !== undefined ? parseFloat(price) : existingPlan.price,
            features: features || existingPlan.features,
            isActive: isActive !== undefined ? isActive : existingPlan.isActive,
            updatedAt: now
          }
        });
      } else {
        // Create new plan
        plan = await this.prisma.subscriptionPlanConfig.create({
          data: {
            name,
            description: description || '',
            price: parseFloat(price),
            features: features || {},
            isActive,
            createdAt: now,
            updatedAt: now
          }
        });
      }

      // Create audit log
      await this.createAuditLog({
        userId: adminId,
        action: existingPlan ? 'UPDATE_PLAN' : 'CREATE_PLAN',
        entity: 'SUBSCRIPTION_PLAN',
        entityId: plan.id,
        changes: JSON.stringify(planData),
        ...auditInfo
      });

      return {
        success: true,
        message: `Subscription plan ${existingPlan ? 'updated' : 'created'} successfully`,
        data: plan
      };
    } catch (error) {
      console.error('SubscriptionService.upsertPlan error:', error);
      throw error;
    }
  }

  /**
   * Get vendor's current subscription with status
   */
  async getVendorSubscription(vendorId) {
    try {
      if (!vendorId) {
        throw new Error('Vendor ID is required');
      }

      // Get vendor with active subscription
      const vendor = await this.prisma.vendorProfile.findUnique({
        where: { id: vendorId },
        include: {
          subscriptions: {
            where: { 
              OR: [
                { status: 'ACTIVE' },
                { status: 'PENDING' }
              ]
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              payments: {
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          },
          user: {
            select: {
              email: true,
              phoneNumber: true,
              fullName: true
            }
          }
        }
      });

      if (!vendor) {
        throw new Error('Vendor not found');
      }

      // Get plan details
      let planDetails = null;
      if (vendor.currentPlan) {
        planDetails = await this.prisma.subscriptionPlanConfig.findUnique({
          where: { name: vendor.currentPlan }
        });
      }

      // Calculate subscription status
      const statusInfo = this.calculateSubscriptionStatus(vendor);

      return {
        success: true,
        data: {
          vendor: {
            id: vendor.id,
            businessName: vendor.businessName,
            status: vendor.status,
            currentPlan: vendor.currentPlan,
            trialEndsAt: vendor.trialEndsAt,
            subscriptionEndsAt: vendor.subscriptionEndsAt,
            isTrialActive: vendor.isTrialActive,
            maxProducts: vendor.maxProducts,
            createdAt: vendor.createdAt
          },
          activeSubscription: vendor.subscriptions[0] || null,
          planDetails,
          statusInfo,
          userInfo: vendor.user
        }
      };
    } catch (error) {
      console.error('SubscriptionService.getVendorSubscription error:', error);
      throw error;
    }
  }

  /**
   * Calculate subscription status
   */
  calculateSubscriptionStatus(vendor) {
    const now = new Date();
    let isTrialExpired = false;
    let trialDaysLeft = 0;
    let expiresSoon = false;
    let daysUntilExpiry = 0;
    let requiresPayment = false;
    let canAddProducts = true;
    let maxProducts = vendor.maxProducts || 10;

    // Check trial status
    if (vendor.status === 'TRIAL' && vendor.trialEndsAt) {
      trialDaysLeft = Math.ceil((vendor.trialEndsAt - now) / (1000 * 60 * 60 * 24));
      isTrialExpired = vendor.trialEndsAt < now;
      requiresPayment = isTrialExpired;
      
      // Trial limits
      maxProducts = Math.min(maxProducts, 10); // Limit to 10 products in trial
    }

    // Check subscription status
    if (vendor.subscriptionEndsAt) {
      daysUntilExpiry = Math.ceil((vendor.subscriptionEndsAt - now) / (1000 * 60 * 60 * 24));
      expiresSoon = daysUntilExpiry <= 7 && daysUntilExpiry > 0;
      
      if (vendor.subscriptionEndsAt < now) {
        requiresPayment = true;
        vendor.status = 'EXPIRED';
      }
    }

    // Check if vendor is expired
    if (vendor.status === 'EXPIRED') {
      requiresPayment = true;
      canAddProducts = false;
    }

    // Check if vendor is suspended
    if (vendor.status === 'SUSPENDED') {
      canAddProducts = false;
    }

    // Check product limits
    const productCount = vendor._count?.products || 0;
    if (productCount >= maxProducts) {
      canAddProducts = false;
    }

    return {
      isTrialExpired,
      trialDaysLeft: Math.max(trialDaysLeft, 0),
      expiresSoon,
      daysUntilExpiry: Math.max(daysUntilExpiry, 0),
      requiresPayment,
      isActive: !requiresPayment && vendor.status === 'ACTIVE',
      canAddProducts,
      productLimit: maxProducts,
      currentProductCount: productCount
    };
  }

  /**
   * Get vendor's subscription history
   */
  async getVendorSubscriptionHistory(vendorId, pagination = {}) {
    try {
      const { page = 1, limit = 20 } = pagination;
      const skip = (page - 1) * limit;

      const [subscriptions, total] = await Promise.all([
        this.prisma.subscription.findMany({
          where: { vendorId },
          include: {
            payments: {
              select: {
                id: true,
                amount: true,
                status: true,
                paymentMethod: true,
                createdAt: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit)
        }),
        this.prisma.subscription.count({ where: { vendorId } })
      ]);

      return {
        success: true,
        data: subscriptions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('SubscriptionService.getVendorSubscriptionHistory error:', error);
      throw error;
    }
  }

  /**
   * Initiate subscription payment
   */
  async initiateVendorSubscription(vendorId, paymentData, userInfo = {}) {
    try {
      const { plan, paymentMethod, phoneNumber } = paymentData;

      if (!plan || !paymentMethod) {
        throw new Error('Plan and payment method are required');
      }

      // Get plan details
      const planDetails = await this.prisma.subscriptionPlanConfig.findUnique({
        where: { name: plan, isActive: true }
      });

      if (!planDetails) {
        throw new Error('Subscription plan not found or inactive');
      }

      // Get vendor details
      const vendor = await this.prisma.vendorProfile.findUnique({
        where: { id: vendorId },
        include: { 
          user: true,
          subscriptions: {
            where: { status: 'PENDING' },
            take: 1
          }
        }
      });

      if (!vendor) {
        throw new Error('Vendor not found');
      }

      // Check for existing pending subscription
      if (vendor.subscriptions.length > 0) {
        throw new Error('You already have a pending subscription payment');
      }

      // Validate phone for mobile money
      const validatedPhone = await this.validatePaymentPhone(phoneNumber, paymentMethod, vendor.user.phoneNumber);

      // Generate transaction ID
      const transactionId = generateTransactionId();
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1); // 1 month subscription

      // Create subscription and payment records
      const result = await this.prisma.$transaction(async (prisma) => {
        // Create subscription record
        const subscription = await prisma.subscription.create({
          data: {
            vendorId,
            plan,
            amount: planDetails.price,
            currency: 'MWK',
            status: 'PENDING',
            paymentMethod,
            paymentReference: transactionId,
            transactionId,
            startDate,
            endDate,
            autoRenew: true,
            metadata: {
              planFeatures: planDetails.features,
              maxProducts: planDetails.features.maxProducts || 50
            }
          }
        });

        // Create payment record
        const payment = await prisma.payment.create({
          data: {
            vendorId,
            subscriptionId: subscription.id,
            amount: planDetails.price,
            currency: 'MWK',
            paymentMethod,
            status: 'PENDING',
            transactionId,
            phoneNumber: validatedPhone,
            metadata: {
              plan: planDetails.name,
              initiatedBy: userInfo.userId || 'vendor',
              userAgent: userInfo.userAgent
            }
          }
        });

        // Update vendor's current plan status
        await prisma.vendorProfile.update({
          where: { id: vendorId },
          data: {
            currentPlan: plan,
            status: 'PENDING_PAYMENT',
            subscriptionEndsAt: null // Clear previous end date
          }
        });

        return { subscription, payment };
      });

      // Create audit log
      await this.createAuditLog({
        userId: userInfo.userId,
        vendorId,
        action: 'SUBSCRIPTION_INITIATED',
        entity: 'SUBSCRIPTION',
        entityId: result.subscription.id,
        changes: JSON.stringify({
          plan,
          amount: planDetails.price,
          paymentMethod,
          transactionId
        }),
        ipAddress: userInfo.ip,
        userAgent: userInfo.userAgent
      });

      // Generate payment instructions
      const paymentInstructions = this.generatePaymentInstructions(
        paymentMethod,
        planDetails.price,
        transactionId
      );

      // Send payment initiation notifications
      await this.sendPaymentInitiationNotifications(
        vendor.user.email,
        validatedPhone,
        vendor.businessName,
        plan,
        planDetails.price,
        transactionId,
        paymentMethod,
        paymentInstructions
      );

      return {
        success: true,
        message: 'Payment initiated successfully',
        data: {
          subscription: result.subscription,
          payment: result.payment,
          instructions: paymentInstructions,
          transactionId
        }
      };
    } catch (error) {
      console.error('SubscriptionService.initiateVendorSubscription error:', error);
      throw error;
    }
  }

  /**
   * Validate payment phone number
   */
  async validatePaymentPhone(providedPhone, paymentMethod, vendorPhone) {
    let phoneToUse = providedPhone || vendorPhone;

    if (!phoneToUse) {
      throw new Error('Phone number is required for mobile money payment');
    }

    // Validate phone format for Malawi numbers
    if (paymentMethod === 'AIRTEL_MONEY' || paymentMethod === 'MPAMBA') {
      if (!validatePhoneNumber(phoneToUse)) {
        throw new Error('Invalid phone number format. Use format: +265XXXXXXXXX or 0XXXXXXXXX');
      }
    }

    return phoneToUse;
  }

  /**
   * Generate payment instructions
   */
  generatePaymentInstructions(paymentMethod, amount, transactionId) {
    const formattedAmount = amount.toFixed(2);
    
    switch (paymentMethod) {
      case 'AIRTEL_MONEY':
        return {
          provider: 'Airtel Money',
          steps: [
            `Dial *444# on your Airtel line`,
            `Select "Send Money"`,
            `Enter number: 44444`,
            `Enter amount: MWK ${formattedAmount}`,
            `Enter reference: ${transactionId}`,
            `Enter your PIN to confirm`
          ],
          help: 'For issues, call Airtel Money customer care: 4455'
        };
      case 'MPAMBA':
        return {
          provider: 'TNM Mpamba',
          steps: [
            `Dial *444# on your TNM line`,
            `Select "Pay Bill"`,
            `Enter business number: 55555`,
            `Enter amount: MWK ${formattedAmount}`,
            `Enter reference: ${transactionId}`,
            `Enter your PIN to confirm`
          ],
          help: 'For issues, call TNM Customer Care: 212'
        };
      case 'CARD':
        return {
          provider: 'Credit/Debit Card',
          steps: [
            `Enter your card details`,
            `Complete 3D Secure verification`,
            `Confirm payment of MWK ${formattedAmount}`
          ],
          help: 'Cards accepted: Visa, MasterCard'
        };
      case 'BANK_TRANSFER':
        return {
          provider: 'Bank Transfer',
          steps: [
            `Transfer MWK ${formattedAmount} to:`,
            `Bank: Standard Bank`,
            `Account: 1234567890`,
            `Reference: ${transactionId}`,
            `Branch: Blantyre Main`
          ],
          help: 'Send proof of payment to payments@manuwafarm.mw'
        };
      default:
        return {
          provider: 'Manual Payment',
          steps: [`Contact support to complete payment of MWK ${formattedAmount}`],
          help: 'Email: support@manuwafarm.mw'
        };
    }
  }

  /**
   * Verify payment webhook
   */
  async verifyPaymentWebhook(verificationData) {
    try {
      const { transactionId, status, provider, metadata = {} } = verificationData;

      if (!transactionId || !status) {
        throw new Error('Transaction ID and status are required');
      }

      // Find payment
      const payment = await this.prisma.payment.findFirst({
        where: { 
          OR: [
            { transactionId },
            { paymentReference: transactionId }
          ],
          status: 'PENDING'
        },
        include: {
          subscription: {
            include: {
              vendor: {
                include: { 
                  user: true,
                  _count: {
                    select: { products: true }
                  }
                }
              }
            }
          }
        }
      });

      if (!payment) {
        throw new Error('Pending payment not found');
      }

      // Update payment and subscription
      const result = await this.prisma.$transaction(async (prisma) => {
        const paymentStatus = status === 'success' ? 'COMPLETED' : 'FAILED';
        const subscriptionStatus = status === 'success' ? 'ACTIVE' : 'CANCELLED';
        const vendorStatus = status === 'success' ? 'ACTIVE' : 'EXPIRED';

        // Update payment
        const updatedPayment = await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: paymentStatus,
            verifiedAt: new Date(),
            verificationData: {
              provider,
              ...metadata,
              webhookReceivedAt: new Date()
            }
          }
        });

        let updatedSubscription = payment.subscription;
        let updatedVendor = payment.subscription.vendor;

        if (status === 'success') {
          // Calculate new end date
          const startDate = new Date();
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + 1);

          // Update subscription
          updatedSubscription = await prisma.subscription.update({
            where: { id: payment.subscriptionId },
            data: {
              status: subscriptionStatus,
              startDate,
              endDate,
              activatedAt: new Date()
            }
          });

          // Update vendor profile with plan limits
          const planConfig = await prisma.subscriptionPlanConfig.findUnique({
            where: { name: payment.subscription.plan }
          });

          const maxProducts = planConfig?.features?.maxProducts || 50;

          updatedVendor = await prisma.vendorProfile.update({
            where: { id: payment.subscription.vendorId },
            data: {
              status: vendorStatus,
              currentPlan: payment.subscription.plan,
              subscriptionEndsAt: endDate,
              isTrialActive: false,
              maxProducts
            }
          });
        } else {
          // Payment failed
          updatedSubscription = await prisma.subscription.update({
            where: { id: payment.subscriptionId },
            data: {
              status: subscriptionStatus,
              cancelledAt: new Date()
            }
          });

          updatedVendor = await prisma.vendorProfile.update({
            where: { id: payment.subscription.vendorId },
            data: {
              status: vendorStatus,
              currentPlan: null
            }
          });
        }

        return { updatedPayment, updatedSubscription, updatedVendor };
      });

      // Create audit log
      await this.createAuditLog({
        userId: payment.subscription.vendor.userId,
        vendorId: payment.subscription.vendorId,
        action: status === 'success' ? 'PAYMENT_COMPLETED' : 'PAYMENT_FAILED',
        entity: 'PAYMENT',
        entityId: payment.id,
        changes: JSON.stringify({
          oldStatus: payment.status,
          newStatus: result.updatedPayment.status,
          provider,
          transactionId
        }),
        ipAddress: metadata.ip || 'webhook',
        userAgent: metadata.userAgent || 'webhook'
      });

      // Send notification
      if (status === 'success') {
        await this.sendPaymentSuccessNotifications(
          payment.subscription.vendor.user.email,
          payment.subscription.vendor.user.phoneNumber,
          payment.subscription.vendor.businessName,
          payment.subscription.plan,
          payment.amount,
          result.updatedSubscription.startDate,
          result.updatedSubscription.endDate
        );
      } else {
        await this.sendPaymentFailedNotifications(
          payment.subscription.vendor.user.email,
          payment.subscription.vendor.user.phoneNumber,
          payment.subscription.vendor.businessName,
          payment.subscription.plan,
          payment.amount,
          transactionId
        );
      }

      return {
        success: true,
        message: `Payment ${status === 'success' ? 'verified successfully' : 'failed'}`,
        data: result
      };
    } catch (error) {
      console.error('SubscriptionService.verifyPaymentWebhook error:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelVendorSubscription(vendorId, subscriptionId, cancellationData = {}) {
    try {
      // Find active subscription
      const subscription = await this.prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          vendorId,
          status: 'ACTIVE'
        },
        include: {
          vendor: {
            include: { user: true }
          }
        }
      });

      if (!subscription) {
        throw new Error('Active subscription not found');
      }

      // Check if subscription has already ended
      if (subscription.endDate && subscription.endDate < new Date()) {
        throw new Error('Subscription has already expired');
      }

      // Cancel subscription
      await this.prisma.$transaction(async (prisma) => {
        // Update subscription
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'CANCELLED',
            autoRenew: false,
            endDate: new Date(),
            cancelledAt: new Date(),
            cancellationReason: cancellationData.reason || 'Vendor requested',
            metadata: {
              ...subscription.metadata,
              cancelledBy: cancellationData.userId,
              cancellationNotes: cancellationData.notes
            }
          }
        });

        // Update vendor profile
        await prisma.vendorProfile.update({
          where: { id: vendorId },
          data: {
            status: 'EXPIRED',
            currentPlan: null,
            subscriptionEndsAt: new Date()
          }
        });

        // Cancel any pending payments
        await prisma.payment.updateMany({
          where: {
            subscriptionId,
            status: 'PENDING'
          },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date()
          }
        });
      });

      // Create audit log
      await this.createAuditLog({
        userId: cancellationData.userId,
        vendorId,
        action: 'SUBSCRIPTION_CANCELLED',
        entity: 'SUBSCRIPTION',
        entityId: subscriptionId,
        changes: JSON.stringify(cancellationData),
        ipAddress: cancellationData.ip,
        userAgent: cancellationData.userAgent
      });

      // Send cancellation notification
      await this.sendCancellationNotification(
        subscription.vendor.user.email,
        subscription.vendor.user.phoneNumber,
        subscription.vendor.businessName,
        subscription.plan,
        cancellationData.reason
      );

      return {
        success: true,
        message: 'Subscription cancelled successfully',
        data: {
          cancelledAt: new Date(),
          effectiveDate: new Date()
        }
      };
    } catch (error) {
      console.error('SubscriptionService.cancelVendorSubscription error:', error);
      throw error;
    }
  }

  /**
   * Check trial status
   */
  async checkVendorTrialStatus(vendorId) {
    try {
      const vendor = await this.prisma.vendorProfile.findUnique({
        where: { id: vendorId },
        include: {
          _count: {
            select: { products: true }
          }
        }
      });

      if (!vendor) {
        throw new Error('Vendor not found');
      }

      const statusInfo = this.calculateSubscriptionStatus(vendor);

      return {
        success: true,
        data: {
          vendorId: vendor.id,
          businessName: vendor.businessName,
          status: vendor.status,
          trialEndsAt: vendor.trialEndsAt,
          subscriptionEndsAt: vendor.subscriptionEndsAt,
          isTrialActive: vendor.isTrialActive,
          maxProducts: vendor.maxProducts,
          ...statusInfo
        }
      };
    } catch (error) {
      console.error('SubscriptionService.checkVendorTrialStatus error:', error);
      throw error;
    }
  }

  /**
   * Send payment initiation notifications
   */
  async sendPaymentInitiationNotifications(email, phone, businessName, plan, amount, transactionId, paymentMethod, instructions) {
    try {
      // Send email
      await sendEmail({
        to: email,
        subject: 'Payment Initiated - ManuwaFarm Vendor Subscription',
        template: 'payment-initiated',
        data: {
          businessName,
          plan,
          amount: amount.toFixed(2),
          transactionId,
          paymentMethod,
          instructions: instructions.steps,
          helpText: instructions.help,
          date: new Date().toLocaleDateString('en-MW', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })
        }
      });

      // Send SMS for mobile money
      if (paymentMethod === 'AIRTEL_MONEY' || paymentMethod === 'MPAMBA') {
        const smsMessage = `ManuwaFarm: Pay MWK ${amount.toFixed(2)} for ${plan} subscription. Ref: ${transactionId}. ${instructions.steps[0]}`;
        await sendSMS(phone, smsMessage);
      }
    } catch (error) {
      console.error('Failed to send payment initiation notifications:', error);
    }
  }

  /**
   * Send payment success notifications
   */
  async sendPaymentSuccessNotifications(email, phone, businessName, plan, amount, startDate, endDate) {
    try {
      // Send email
      await sendEmail({
        to: email,
        subject: 'Subscription Activated - ManuwaFarm',
        template: 'subscription-activated',
        data: {
          businessName,
          plan,
          amount: amount.toFixed(2),
          startDate: new Date(startDate).toLocaleDateString('en-MW'),
          endDate: new Date(endDate).toLocaleDateString('en-MW'),
          nextBillingDate: new Date(endDate).toLocaleDateString('en-MW')
        }
      });

      // Send SMS
      const smsMessage = `ManuwaFarm: Your ${plan} subscription is now active. Valid until ${new Date(endDate).toLocaleDateString('en-MW')}. Thank you!`;
      await sendSMS(phone, smsMessage);
    } catch (error) {
      console.error('Failed to send payment success notifications:', error);
    }
  }

  /**
   * Send payment failed notifications
   */
  async sendPaymentFailedNotifications(email, phone, businessName, plan, amount, transactionId) {
    try {
      // Send email
      await sendEmail({
        to: email,
        subject: 'Payment Failed - ManuwaFarm',
        template: 'payment-failed',
        data: {
          businessName,
          plan,
          amount: amount.toFixed(2),
          transactionId,
          date: new Date().toLocaleDateString('en-MW'),
          supportPhone: '+265 123 456 789',
          supportEmail: 'support@manuwafarm.mw'
        }
      });

      // Send SMS
      const smsMessage = `ManuwaFarm: Payment for ${plan} subscription failed. Ref: ${transactionId}. Contact support: +265 123 456 789`;
      await sendSMS(phone, smsMessage);
    } catch (error) {
      console.error('Failed to send payment failed notifications:', error);
    }
  }

  /**
   * Send cancellation notification
   */
  async sendCancellationNotification(email, phone, businessName, plan, reason) {
    try {
      // Send email
      await sendEmail({
        to: email,
        subject: 'Subscription Cancelled - ManuwaFarm',
        template: 'subscription-cancelled',
        data: {
          businessName,
          plan,
          reason: reason || 'No reason provided',
          cancellationDate: new Date().toLocaleDateString('en-MW'),
          effectiveDate: new Date().toLocaleDateString('en-MW')
        }
      });

      // Send SMS
      const smsMessage = `ManuwaFarm: Your ${plan} subscription has been cancelled. Effective immediately.`;
      await sendSMS(phone, smsMessage);
    } catch (error) {
      console.error('Failed to send cancellation notification:', error);
    }
  }

  /**
   * Create audit log
   */
  async createAuditLog(logData) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: logData.userId,
          vendorId: logData.vendorId,
          action: logData.action,
          entity: logData.entity,
          entityId: logData.entityId,
          changes: logData.changes,
          ipAddress: logData.ipAddress,
          userAgent: logData.userAgent,
          createdAt: new Date()
        }
      });
    } catch (error) {
      console.error('Failed to create audit log:', error);
    }
  }

  /**
   * Process subscription renewals (cron job)
   */
  async processRenewals() {
    try {
      const now = new Date();
      const renewalsDue = new Date();
      renewalsDue.setDate(renewalsDue.getDate() + 3); // 3 days before expiry

      // Find subscriptions due for renewal
      const subscriptions = await this.prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          autoRenew: true,
          endDate: {
            lte: renewalsDue,
            gte: now // Not expired yet
          }
        },
        include: {
          vendor: {
            include: { user: true }
          },
          payments: {
            where: { status: 'COMPLETED' },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      const results = [];
      for (const subscription of subscriptions) {
        try {
          // Attempt auto-renewal
          const renewed = await this.autoRenewSubscription(subscription);
          results.push({
            subscriptionId: subscription.id,
            vendorId: subscription.vendorId,
            success: renewed,
            timestamp: new Date()
          });
        } catch (error) {
          results.push({
            subscriptionId: subscription.id,
            vendorId: subscription.vendorId,
            success: false,
            error: error.message,
            timestamp: new Date()
          });
        }
      }

      return {
        success: true,
        message: `Processed ${subscriptions.length} renewals`,
        data: results
      };
    } catch (error) {
      console.error('SubscriptionService.processRenewals error:', error);
      throw error;
    }
  }

  /**
   * Auto-renew subscription
   */
  async autoRenewSubscription(subscription) {
    try {
      const transactionId = generateTransactionId();
      
      await this.prisma.$transaction(async (prisma) => {
        // Create renewal payment
        await prisma.payment.create({
          data: {
            vendorId: subscription.vendorId,
            subscriptionId: subscription.id,
            amount: subscription.amount,
            currency: subscription.currency,
            paymentMethod: subscription.paymentMethod,
            status: 'PENDING',
            transactionId,
            isRenewal: true,
            metadata: {
              previousPaymentId: subscription.payments[0]?.id,
              autoRenewal: true,
              renewalFor: subscription.id
            }
          }
        });

        // Extend subscription end date by 1 month
        const newEndDate = new Date(subscription.endDate);
        newEndDate.setMonth(newEndDate.getMonth() + 1);

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            endDate: newEndDate
          }
        });

        // Update vendor subscription end date
        await prisma.vendorProfile.update({
          where: { id: subscription.vendorId },
          data: {
            subscriptionEndsAt: newEndDate
          }
        });
      });

      // Send renewal notification
      await this.sendRenewalNotification(
        subscription.vendor.user.email,
        subscription.vendor.user.phoneNumber,
        subscription.vendor.businessName,
        subscription.plan,
        subscription.amount,
        transactionId
      );

      return true;
    } catch (error) {
      console.error('SubscriptionService.autoRenewSubscription error:', error);
      return false;
    }
  }

  /**
   * Send renewal notification
   */
  async sendRenewalNotification(email, phone, businessName, plan, amount, transactionId) {
    try {
      // Send email
      await sendEmail({
        to: email,
        subject: 'Subscription Renewal - ManuwaFarm',
        template: 'subscription-renewal',
        data: {
          businessName,
          plan,
          amount: amount.toFixed(2),
          transactionId,
          renewalDate: new Date().toLocaleDateString('en-MW'),
          nextBillingDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toLocaleDateString('en-MW')
        }
      });

      // Send SMS
      const smsMessage = `ManuwaFarm: Your ${plan} subscription is renewing. MWK ${amount.toFixed(2)} will be charged. Ref: ${transactionId}`;
      await sendSMS(phone, smsMessage);
    } catch (error) {
      console.error('Failed to send renewal notification:', error);
    }
  }

  /**
   * Get subscription statistics (admin)
   */
  async getSubscriptionStatistics(timeframe = 'month') {
    try {
      const now = new Date();
      let startDate;
      
      switch (timeframe) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        case 'year':
          startDate = new Date(now.setFullYear(now.getFullYear() - 1));
          break;
        default:
          startDate = new Date(now.setMonth(now.getMonth() - 1));
      }

      const [
        totalSubscriptions,
        activeSubscriptions,
        pendingSubscriptions,
        cancelledSubscriptions,
        trialVendors,
        revenue
      ] = await Promise.all([
        this.prisma.subscription.count({
          where: { createdAt: { gte: startDate } }
        }),
        this.prisma.subscription.count({
          where: { 
            status: 'ACTIVE',
            createdAt: { gte: startDate }
          }
        }),
        this.prisma.subscription.count({
          where: { 
            status: 'PENDING',
            createdAt: { gte: startDate }
          }
        }),
        this.prisma.subscription.count({
          where: { 
            status: 'CANCELLED',
            createdAt: { gte: startDate }
          }
        }),
        this.prisma.vendorProfile.count({
          where: { 
            status: 'TRIAL',
            createdAt: { gte: startDate }
          }
        }),
        this.prisma.payment.aggregate({
          where: { 
            status: 'COMPLETED',
            createdAt: { gte: startDate }
          },
          _sum: { amount: true }
        })
      ]);

      // Get plan distribution
      const planDistribution = await this.prisma.subscription.groupBy({
        by: ['plan'],
        where: {
          status: 'ACTIVE',
          createdAt: { gte: startDate }
        },
        _count: {
          id: true
        }
      });

      return {
        success: true,
        data: {
          totalSubscriptions,
          activeSubscriptions,
          pendingSubscriptions,
          cancelledSubscriptions,
          trialVendors,
          revenue: revenue._sum.amount || 0,
          averageRevenue: totalSubscriptions > 0 ? (revenue._sum.amount || 0) / totalSubscriptions : 0,
          planDistribution,
          timeframe,
          period: {
            start: startDate,
            end: new Date()
          }
        }
      };
    } catch (error) {
      console.error('SubscriptionService.getSubscriptionStatistics error:', error);
      throw error;
    }
  }

  /**
   * Get expiring subscriptions (for reminders)
   */
  async getExpiringSubscriptions(daysThreshold = 7) {
    try {
      const now = new Date();
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

      const subscriptions = await this.prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          endDate: {
            gte: now,
            lte: thresholdDate
          }
        },
        include: {
          vendor: {
            include: { user: true }
          }
        }
      });

      return {
        success: true,
        data: subscriptions,
        count: subscriptions.length,
        thresholdDays: daysThreshold
      };
    } catch (error) {
      console.error('SubscriptionService.getExpiringSubscriptions error:', error);
      throw error;
    }
  }

  /**
   * Send expiration reminders
   */
  async sendExpirationReminders(daysBefore = 3) {
    try {
      const { data: subscriptions } = await this.getExpiringSubscriptions(daysBefore);
      
      const results = [];
      for (const subscription of subscriptions) {
        try {
          await this.sendExpirationReminder(subscription);
          results.push({
            subscriptionId: subscription.id,
            vendorId: subscription.vendorId,
            success: true,
            sentAt: new Date()
          });
        } catch (error) {
          results.push({
            subscriptionId: subscription.id,
            vendorId: subscription.vendorId,
            success: false,
            error: error.message,
            sentAt: new Date()
          });
        }
      }

      return {
        success: true,
        message: `Sent ${results.filter(r => r.success).length} expiration reminders`,
        data: results
      };
    } catch (error) {
      console.error('SubscriptionService.sendExpirationReminders error:', error);
      throw error;
    }
  }

  /**
   * Send expiration reminder
   */
  async sendExpirationReminder(subscription) {
    try {
      const daysLeft = Math.ceil((subscription.endDate - new Date()) / (1000 * 60 * 60 * 24));
      
      // Send email
      await sendEmail({
        to: subscription.vendor.user.email,
        subject: `Subscription Expiring in ${daysLeft} days - ManuwaFarm`,
        template: 'subscription-expiring',
        data: {
          businessName: subscription.vendor.businessName,
          plan: subscription.plan,
          daysLeft,
          expiryDate: subscription.endDate.toLocaleDateString('en-MW'),
          renewalUrl: `https://manuwafarm.mw/vendor/subscriptions/renew`
        }
      });

      // Send SMS
      const smsMessage = `ManuwaFarm: Your ${subscription.plan} subscription expires in ${daysLeft} days. Renew now to avoid interruption.`;
      await sendSMS(subscription.vendor.user.phoneNumber, smsMessage);
    } catch (error) {
      console.error('Failed to send expiration reminder:', error);
      throw error;
    }
  }
}

module.exports = new SubscriptionService();