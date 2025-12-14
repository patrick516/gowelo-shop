// src/services/notification.service.js - AGRO-DEALER FOCUSED
const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const { prisma } = require('../config/prisma');
const mobileMoneyConfig = require('../config/mobile-money');

class NotificationService {
  constructor() {
    // Email transporter
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    this.templatesDir = path.join(__dirname, '../templates');
    this.smsProviders = {
      airtel: {
        url: 'https://api.africastalking.com/version1/messaging',
        apiKey: process.env.AIRTEL_SMS_API_KEY,
        username: process.env.AIRTEL_SMS_USERNAME
      },
      mpamba: {
        url: 'https://api.tnm.co.mw/sms/v1/messages',
        apiKey: process.env.MPAMBA_SMS_API_KEY
      }
    };
  }

  // ========== EMAIL NOTIFICATIONS ==========

  async sendEmail({ to, subject, template, data }) {
    try {
      // Load and render template
      const templatePath = path.join(this.templatesDir, `${template}.ejs`);
      let html;
      
      try {
        const templateContent = await fs.readFile(templatePath, 'utf-8');
        html = ejs.render(templateContent, {
          ...data,
          appName: process.env.APP_NAME || 'ManuwaFarm',
          currentYear: new Date().getFullYear(),
          supportEmail: process.env.SUPPORT_EMAIL || 'support@manuwafarm.com',
          baseUrl: process.env.FRONTEND_URL || 'https://manuwafarm.com'
        });
      } catch (error) {
        // If template not found, create simple HTML
        console.warn(`Template ${template} not found, using default`);
        html = this.createSimpleEmail(subject, data.message || '');
      }

      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME || 'ManuwaFarm'}" <${process.env.EMAIL_FROM || 'noreply@manuwafarm.com'}>`,
        to,
        subject,
        html,
        text: this.stripHtml(html)
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent:', info.messageId);

      // Log email notification
      await this.logNotification({
        type: 'EMAIL',
        recipient: to,
        subject,
        template,
        status: 'SENT',
        messageId: info.messageId
      });

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: nodemailer.getTestMessageUrl(info)
      };
    } catch (error) {
      console.error('Email sending failed:', error);
      
      // Log failed notification
      await this.logNotification({
        type: 'EMAIL',
        recipient: to,
        subject,
        template,
        status: 'FAILED',
        error: error.message
      });

      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  async sendBulkEmail(recipients, subject, template, data = {}) {
    const results = [];
    
    for (const recipient of recipients) {
      try {
        const result = await this.sendEmail({
          to: recipient.email,
          subject,
          template,
          data: { ...data, recipient }
        });
        results.push({ recipient, success: true, result });
      } catch (error) {
        results.push({ recipient, success: false, error: error.message });
      }
    }
    
    return {
      total: recipients.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      details: results
    };
  }

  // ========== SMS NOTIFICATIONS (Malawi Focused) ==========

  async sendSMS(phoneNumber, message, provider = 'airtel') {
    try {
      const formattedPhone = mobileMoneyConfig.formatPhoneNumber(phoneNumber);
      
      // Validate phone number
      if (!mobileMoneyConfig.validatePhoneNumber(formattedPhone)) {
        throw new Error('Invalid Malawi phone number');
      }

      let result;
      switch (provider.toLowerCase()) {
        case 'airtel':
          result = await this.sendViaAirtelSMS(formattedPhone, message);
          break;
        case 'mpamba':
          result = await this.sendViaMpambaSMS(formattedPhone, message);
          break;
        default:
          throw new Error(`Unsupported SMS provider: ${provider}`);
      }

      // Log SMS notification
      await this.logNotification({
        type: 'SMS',
        recipient: formattedPhone,
        provider,
        message,
        status: 'SENT',
        messageId: result.messageId
      });

      return result;
    } catch (error) {
      console.error(`SMS sending via ${provider} failed:`, error);
      
      // Log failed SMS
      await this.logNotification({
        type: 'SMS',
        recipient: phoneNumber,
        provider,
        message,
        status: 'FAILED',
        error: error.message
      });

      // Try fallback provider
      if (provider === 'airtel') {
        console.log('Trying Mpamba as fallback...');
        return this.sendSMS(phoneNumber, message, 'mpamba');
      }

      throw new Error(`All SMS providers failed: ${error.message}`);
    }
  }

  async sendViaAirtelSMS(phoneNumber, message) {
    const config = this.smsProviders.airtel;
    
    if (!config.apiKey || !config.username) {
      throw new Error('Airtel SMS configuration missing');
    }

    // In test mode, simulate SMS
    if (process.env.NODE_ENV === 'development' || process.env.SMS_TEST_MODE === 'true') {
      console.log(`TEST SMS to ${phoneNumber}: ${message}`);
      return {
        success: true,
        provider: 'airtel',
        messageId: `TEST-${Date.now()}`,
        status: 'SIMULATED'
      };
    }

    try {
      const response = await axios.post(
        config.url,
        {
          username: config.username,
          to: phoneNumber,
          message: message,
          from: process.env.SMS_SENDER_ID || 'ManuwaFarm'
        },
        {
          headers: {
            'apiKey': config.apiKey,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        success: response.data.SMSMessageData.Recipients[0].status === 'Success',
        provider: 'airtel',
        messageId: response.data.SMSMessageData.Recipients[0].messageId,
        cost: response.data.SMSMessageData.Recipients[0].cost,
        status: response.data.SMSMessageData.Recipients[0].status
      };
    } catch (error) {
      console.error('Airtel SMS API error:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendViaMpambaSMS(phoneNumber, message) {
    const config = this.smsProviders.mpamba;
    
    if (!config.apiKey) {
      throw new Error('Mpamba SMS configuration missing');
    }

    // In test mode, simulate SMS
    if (process.env.NODE_ENV === 'development' || process.env.SMS_TEST_MODE === 'true') {
      console.log(`TEST SMS to ${phoneNumber}: ${message}`);
      return {
        success: true,
        provider: 'mpamba',
        messageId: `TEST-${Date.now()}`,
        status: 'SIMULATED'
      };
    }

    try {
      const response = await axios.post(
        config.url,
        {
          to: phoneNumber,
          message: message,
          sender_id: process.env.SMS_SENDER_ID || 'ManuwaFarm'
        },
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: response.data.success,
        provider: 'mpamba',
        messageId: response.data.message_id,
        status: response.data.status
      };
    } catch (error) {
      console.error('Mpamba SMS API error:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendBulkSMS(recipients, message, provider = 'airtel') {
    const results = [];
    
    for (const recipient of recipients) {
      try {
        const result = await this.sendSMS(recipient.phoneNumber, message, provider);
        results.push({ recipient, success: true, result });
      } catch (error) {
        results.push({ recipient, success: false, error: error.message });
      }
    }
    
    return {
      total: recipients.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      details: results
    };
  }

  // ========== AGRO-SPECIFIC NOTIFICATIONS ==========

  // Send welcome notification to new agro-dealer
  async sendAgroDealerWelcome(vendor, user) {
    const emailResult = await this.sendEmail({
      to: user.email,
      subject: `Welcome to ${process.env.APP_NAME || 'ManuwaFarm'} - Agro-Dealer Marketplace`,
      template: 'vendor-welcome',
      data: {
        businessName: vendor.businessName,
        contactPerson: vendor.contactPerson,
        dashboardUrl: `${process.env.VENDOR_PORTAL_URL}/dashboard`,
        supportPhone: process.env.SUPPORT_PHONE || '+265 888 123 456',
        trialDays: vendor.trialEndsAt ? 
          Math.ceil((vendor.trialEndsAt - new Date()) / (1000 * 60 * 60 * 24)) : 30,
        trialEndDate: vendor.trialEndsAt ? vendor.trialEndsAt.toLocaleDateString() : 'N/A'
      }
    });

    // Send SMS welcome
    if (vendor.contactPhone) {
      await this.sendAgroDealerSMSWelcome(vendor.contactPhone, vendor.businessName);
    }

    return emailResult;
  }

  async sendAgroDealerSMSWelcome(phoneNumber, businessName) {
    const message = `Karibu ${businessName} to ManuwaFarm! Access your dashboard: ${process.env.VENDOR_PORTAL_URL}. For help call ${process.env.SUPPORT_PHONE || '+265 888 123 456'}`;
    return this.sendSMS(phoneNumber, message);
  }

  // Send order confirmation to farmer
  async sendFarmerOrderConfirmation(order, customer, items) {
    const emailResult = await this.sendEmail({
      to: customer.email,
      subject: `Order Confirmation - #${order.orderNumber} - ManuwaFarm`,
      template: 'order-confirmation-farmer',
      data: {
        orderNumber: order.orderNumber,
        farmerName: customer.fullName || 'Valued Farmer',
        orderDate: new Date(order.createdAt).toLocaleDateString(),
        items: items.map(item => ({
          name: item.product.name,
          quantity: item.quantity,
          unit: item.product.unit || 'unit',
          price: item.price,
          total: item.quantity * item.price
        })),
        subtotal: order.subtotal,
        shippingFee: order.shippingFee || 0,
        total: order.total,
        deliveryAddress: JSON.parse(order.shippingAddress),
        estimatedDelivery: order.estimatedDelivery ? 
          new Date(order.estimatedDelivery).toLocaleDateString() : '2-3 business days',
        vendorContact: order.vendor?.contactPhone || 'N/A',
        trackingNumber: order.trackingNumber || 'Will be provided'
      }
    });

    // Send SMS confirmation
    if (customer.phone) {
      const smsMessage = `Order #${order.orderNumber} confirmed. Total: MWK ${order.total}. Track: ${process.env.FRONTEND_URL}/track/${order.id}`;
      await this.sendSMS(customer.phone, smsMessage);
    }

    return emailResult;
  }

  // Send order confirmation to agro-dealer
  async sendAgroDealerOrderNotification(order, vendor, customer, items) {
    const emailResult = await this.sendEmail({
      to: vendor.contactEmail,
      subject: `New Agro-Order Received - #${order.orderNumber}`,
      template: 'order-notification-dealer',
      data: {
        orderNumber: order.orderNumber,
        businessName: vendor.businessName,
        farmerName: customer.fullName || 'Customer',
        farmerPhone: customer.phone,
        farmerLocation: order.deliveryCity || 'Unknown',
        orderDate: new Date(order.createdAt).toLocaleDateString(),
        items: items.map(item => ({
          name: item.product.name,
          quantity: item.quantity,
          unit: item.product.unit || 'unit',
          price: item.price,
          total: item.quantity * item.price
        })),
        subtotal: order.subtotal,
        shippingFee: order.shippingFee || 0,
        total: order.total,
        paymentMethod: order.paymentMethod,
        deliveryAddress: JSON.parse(order.shippingAddress),
        deliveryNotes: order.deliveryNotes || 'None',
        orderLink: `${process.env.VENDOR_PORTAL_URL}/orders/${order.id}`
      }
    });

    // Send SMS to dealer
    if (vendor.contactPhone) {
      const smsMessage = `New order #${order.orderNumber} from ${customer.fullName || 'customer'}. Total: MWK ${order.total}. View: ${process.env.VENDOR_PORTAL_URL}/orders`;
      await this.sendSMS(vendor.contactPhone, smsMessage);
    }

    return emailResult;
  }

  // Send payment confirmation
  async sendPaymentConfirmation(payment, customer, order = null) {
    const emailResult = await this.sendEmail({
      to: customer.email,
      subject: `Payment Confirmed - Transaction #${payment.transactionId}`,
      template: 'payment-confirmation',
      data: {
        transactionId: payment.transactionId,
        customerName: customer.fullName || 'Customer',
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        date: new Date(payment.createdAt).toLocaleDateString(),
        time: new Date(payment.createdAt).toLocaleTimeString(),
        orderNumber: order?.orderNumber || 'N/A',
        receiptUrl: `${process.env.FRONTEND_URL}/receipt/${payment.id}`
      }
    });

    // Send SMS receipt
    if (customer.phone) {
      const smsMessage = `Payment of MWK ${payment.amount} confirmed. Transaction: ${payment.transactionId}. Receipt: ${process.env.FRONTEND_URL}/receipt/${payment.id}`;
      await this.sendSMS(customer.phone, smsMessage);
    }

    return emailResult;
  }

  // Send low stock alert to agro-dealer
  async sendLowStockAlert(product, vendor) {
    const emailResult = await this.sendEmail({
      to: vendor.contactEmail,
      subject: `Low Stock Alert - ${product.name}`,
      template: 'low-stock-alert',
      data: {
        productName: product.name,
        sku: product.sku || 'N/A',
        currentQuantity: product.quantity,
        lowStockThreshold: product.lowStockThreshold || 5,
        category: product.category?.name || 'Agro Product',
        restockUrl: `${process.env.VENDOR_PORTAL_URL}/products/${product.id}/inventory`,
        daysSinceLastSale: product.updatedAt ? 
          Math.ceil((new Date() - new Date(product.updatedAt)) / (1000 * 60 * 60 * 24)) : 'N/A'
      }
    });

    // Send SMS alert
    if (vendor.contactPhone) {
      const smsMessage = `Low stock: ${product.name} (${product.quantity} left). Reorder now: ${process.env.VENDOR_PORTAL_URL}/products`;
      await this.sendSMS(vendor.contactPhone, smsMessage);
    }

    return emailResult;
  }

  // Send seasonal alert to farmers
  async sendSeasonalAlertToFarmers(season, cropType, region, farmers) {
    const emailPromises = farmers.map(farmer => 
      this.sendEmail({
        to: farmer.email,
        subject: `${season} Season Alert - ${cropType} Inputs Available`,
        template: 'seasonal-alert',
        data: {
          farmerName: farmer.fullName || 'Valued Farmer',
          season,
          cropType,
          region,
          seasonTips: this.getSeasonalTips(season, cropType),
          productsUrl: `${process.env.FRONTEND_URL}/products?category=${encodeURIComponent(cropType)}`,
          weatherAlert: this.getWeatherAlert(region, season)
        }
      }).catch(error => {
        console.error(`Failed to send seasonal alert to ${farmer.email}:`, error);
        return null;
      })
    );

    const results = await Promise.allSettled(emailPromises);
    
    return {
      total: farmers.length,
      success: results.filter(r => r.status === 'fulfilled' && r.value).length,
      failed: results.filter(r => r.status === 'rejected' || !r.value).length
    };
  }

  // Send price drop alert
  async sendPriceDropAlert(product, oldPrice, newPrice, customers) {
    const emailPromises = customers.map(customer =>
      this.sendEmail({
        to: customer.email,
        subject: `Price Drop Alert - ${product.name}`,
        template: 'price-drop-alert',
        data: {
          customerName: customer.fullName || 'Valued Customer',
          productName: product.name,
          oldPrice,
          newPrice,
          discountPercent: Math.round(((oldPrice - newPrice) / oldPrice) * 100),
          productUrl: `${process.env.FRONTEND_URL}/products/${product.slug || product.id}`,
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()
        }
      }).catch(error => {
        console.error(`Failed to send price alert to ${customer.email}:`, error);
        return null;
      })
    );

    const results = await Promise.allSettled(emailPromises);
    
    return {
      total: customers.length,
      success: results.filter(r => r.status === 'fulfilled' && r.value).length,
      failed: results.filter(r => r.status === 'rejected' || !r.value).length
    };
  }

  // Send subscription renewal reminder
  async sendSubscriptionRenewalReminder(subscription, vendor) {
    const daysUntilExpiry = Math.ceil((new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24));
    
    const emailResult = await this.sendEmail({
      to: vendor.contactEmail,
      subject: `Subscription Renewal Reminder - ${daysUntilExpiry} Days Left`,
      template: 'subscription-reminder',
      data: {
        businessName: vendor.businessName,
        currentPlan: subscription.plan,
        expiryDate: new Date(subscription.endDate).toLocaleDateString(),
        daysUntilExpiry,
        renewalAmount: subscription.amount,
        renewalUrl: `${process.env.VENDOR_PORTAL_URL}/subscription/renew`,
        gracePeriod: '7 days',
        consequences: 'You will lose access to vendor dashboard and new orders'
      }
    });

    // Send SMS reminder 3 days before expiry
    if (daysUntilExpiry <= 3 && vendor.contactPhone) {
      const smsMessage = `URGENT: Subscription expires in ${daysUntilExpiry} days. Renew now: ${process.env.VENDOR_PORTAL_URL}/subscription`;
      await this.sendSMS(vendor.contactPhone, smsMessage);
    }

    return emailResult;
  }

  // ========== HELPER METHODS ==========

  async logNotification(notificationData) {
    try {
      await prisma.auditLog.create({
        data: {
          action: 'NOTIFICATION_SENT',
          entity: 'NOTIFICATION',
          changes: JSON.stringify(notificationData),
          ipAddress: 'SYSTEM',
          createdAt: new Date()
        }
      });
    } catch (error) {
      console.error('Failed to log notification:', error);
    }
  }

  createSimpleEmail(subject, message) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2e7d32; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px; background-color: #f9f9f9; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .button { 
            display: inline-block; 
            padding: 10px 20px; 
            background-color: #4CAF50; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 10px 0; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${process.env.APP_NAME || 'ManuwaFarm'}</h1>
            <p>Agro-Dealer Marketplace</p>
          </div>
          <div class="content">
            ${message}
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} ${process.env.APP_NAME || 'ManuwaFarm'}. All rights reserved.</p>
            <p>Need help? Contact us: ${process.env.SUPPORT_EMAIL || 'support@manuwafarm.com'}</p>
            <p>Call us: ${process.env.SUPPORT_PHONE || '+265 888 123 456'}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  stripHtml(html) {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  getSeasonalTips(season, cropType) {
    const tips = {
      'rainy': {
        'maize': 'Plant maize seeds 5cm deep, spaced 75cm apart. Apply basal fertilizer at planting.',
        'rice': 'Prepare paddy fields with proper water management. Use certified rice seeds.',
        'soybeans': 'Inoculate seeds before planting for better nitrogen fixation.',
        'general': 'Ensure proper drainage, apply pre-emergence herbicides, monitor for pests.'
      },
      'dry': {
        'general': 'Implement irrigation systems, conserve soil moisture with mulch, harvest matured crops.'
      },
      'planting': {
        'general': 'Test soil pH, use certified seeds, apply correct fertilizer rates.'
      },
      'harvest': {
        'general': 'Harvest at right moisture content, dry properly, store in clean conditions.'
      }
    };

    return tips[season]?.[cropType] || tips[season]?.general || 'Consult agricultural extension officers for best practices.';
  }

  getWeatherAlert(region, season) {
    const alerts = {
      'blantyre': {
        'rainy': 'Heavy rains expected in Southern Region. Prepare drainage systems.',
        'dry': 'Dry spells expected. Consider supplementary irrigation.'
      },
      'lilongwe': {
        'rainy': 'Moderate to heavy rains in Central Region. Ideal planting conditions.',
        'dry': 'Temperatures rising. Ensure crops have adequate water.'
      },
      'mzuzu': {
        'rainy': 'Consistent rainfall in Northern Region. Good for crop growth.',
        'dry': 'Cool dry season. Protect crops from frost in highlands.'
      }
    };

    return alerts[region.toLowerCase()]?.[season] || 'Monitor local weather forecasts for updates.';
  }

  // Get farmers in specific region for seasonal alerts
  async getFarmersInRegion(region, cropPreference = null) {
    const where = {
      role: 'CUSTOMER',
      orders: {
        some: {
          deliveryCity: {
            contains: region,
            mode: 'insensitive'
          },
          paymentStatus: 'PAID'
        }
      }
    };

    if (cropPreference) {
      where.orders.some.items = {
        some: {
          product: {
            OR: [
              { name: { contains: cropPreference, mode: 'insensitive' } },
              { tags: { has: cropPreference.toLowerCase() } }
            ]
          }
        }
      };
    }

    const farmers = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true
      },
      take: 100 // Limit for bulk notifications
    });

    return farmers;
  }

  // Get customers who viewed/wishlisted a product for price drop alerts
  async getCustomersInterestedInProduct(productId) {
    // This would typically query a wishlist or product view history
    // For now, get customers who previously ordered this product
    const customers = await prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        orders: {
          some: {
            items: {
              some: {
                productId
              }
            },
            paymentStatus: 'PAID'
          }
        }
      },
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true
      },
      distinct: ['id']
    });

    return customers;
  }
}

module.exports = new NotificationService();