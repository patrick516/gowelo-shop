// src/services/email.service.js
const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs').promises;

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
    
    this.templatesDir = path.join(__dirname, '../templates/email');
  }

  async sendEmail(to, subject, template, data) {
    try {
      // Load and render template
      const templatePath = path.join(this.templatesDir, `${template}.ejs`);
      const html = await ejs.renderFile(templatePath, data);
      
      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
        to,
        subject,
        html,
        text: this.stripHtml(html)
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent:', info.messageId);
      
      return {
        success: true,
        messageId: info.messageId,
        previewUrl: nodemailer.getTestMessageUrl(info)
      };
    } catch (error) {
      console.error('Email sending failed:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  async sendOrderConfirmation(order, customer) {
    const subject = `Order Confirmation - #${order.orderNumber}`;
    const data = {
      order,
      customer,
      date: new Date().toLocaleDateString(),
      supportEmail: process.env.SUPPORT_EMAIL
    };
    
    return this.sendEmail(customer.email, subject, 'order-confirmation', data);
  }

  async sendOrderShipped(order, customer, trackingInfo) {
    const subject = `Your Order #${order.orderNumber} Has Shipped!`;
    const data = {
      order,
      customer,
      trackingInfo,
      estimatedDelivery: this.calculateDeliveryDate(),
      supportEmail: process.env.SUPPORT_EMAIL
    };
    
    return this.sendEmail(customer.email, subject, 'order-shipped', data);
  }

  async sendOrderDelivered(order, customer) {
    const subject = `Your Order #${order.orderNumber} Has Been Delivered`;
    const data = {
      order,
      customer,
      date: new Date().toLocaleDateString(),
      supportEmail: process.env.SUPPORT_EMAIL
    };
    
    return this.sendEmail(customer.email, subject, 'order-delivered', data);
  }

  async sendPaymentReceipt(payment, customer) {
    const subject = `Payment Receipt - Transaction #${payment.transactionId}`;
    const data = {
      payment,
      customer,
      date: new Date().toLocaleDateString(),
      supportEmail: process.env.SUPPORT_EMAIL
    };
    
    return this.sendEmail(customer.email, subject, 'payment-receipt', data);
  }

  async sendSubscriptionConfirmation(subscription, vendor) {
    const subject = `Subscription Confirmation - ${subscription.plan} Plan`;
    const data = {
      subscription,
      vendor,
      startDate: new Date(subscription.startDate).toLocaleDateString(),
      endDate: new Date(subscription.endDate).toLocaleDateString(),
      supportEmail: process.env.SUPPORT_EMAIL
    };
    
    return this.sendEmail(vendor.contactEmail, subject, 'subscription-confirmation', data);
  }

  async sendSubscriptionRenewalReminder(subscription, vendor) {
    const daysUntilRenewal = Math.ceil((new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24));
    const subject = `Subscription Renewal Reminder - ${daysUntilRenewal} Days Left`;
    
    const data = {
      subscription,
      vendor,
      daysUntilRenewal,
      endDate: new Date(subscription.endDate).toLocaleDateString(),
      renewalAmount: subscription.amount,
      supportEmail: process.env.SUPPORT_EMAIL
    };
    
    return this.sendEmail(vendor.contactEmail, subject, 'subscription-renewal-reminder', data);
  }

  async sendLowStockAlert(product, vendor, currentQuantity) {
    const subject = `Low Stock Alert: ${product.name}`;
    const data = {
      product,
      vendor,
      currentQuantity,
      lowStockThreshold: product.lowStockThreshold,
      restockUrl: `${process.env.VENDOR_PORTAL_URL}/products/${product.id}/inventory`,
      supportEmail: process.env.SUPPORT_EMAIL
    };
    
    return this.sendEmail(vendor.contactEmail, subject, 'low-stock-alert', data);
  }

  async sendWelcomeEmail(user, userType) {
    const subject = `Welcome to ${process.env.APP_NAME}!`;
    const data = {
      user,
      userType,
      appName: process.env.APP_NAME,
      loginUrl: userType === 'VENDOR' 
        ? process.env.VENDOR_PORTAL_URL 
        : process.env.CUSTOMER_PORTAL_URL,
      supportEmail: process.env.SUPPORT_EMAIL
    };
    
    return this.sendEmail(user.email, subject, 'welcome', data);
  }

  async sendPasswordReset(user, resetToken) {
    const subject = 'Password Reset Request';
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const data = {
      user,
      resetUrl,
      expiryTime: '1 hour',
      supportEmail: process.env.SUPPORT_EMAIL
    };
    
    return this.sendEmail(user.email, subject, 'password-reset', data);
  }

  async sendAccountVerification(user, verificationToken) {
    const subject = 'Verify Your Account';
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-account?token=${verificationToken}`;
    
    const data = {
      user,
      verificationUrl,
      supportEmail: process.env.SUPPORT_EMAIL
    };
    
    return this.sendEmail(user.email, subject, 'account-verification', data);
  }

  async sendBulkEmail(recipients, subject, template, data) {
    const results = [];
    
    for (const recipient of recipients) {
      try {
        const result = await this.sendEmail(recipient.email, subject, template, {
          ...data,
          recipient
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

  stripHtml(html) {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  calculateDeliveryDate() {
    const date = new Date();
    date.setDate(date.getDate() + 3); // Default 3-day delivery
    return date.toLocaleDateString();
  }
}

module.exports = new EmailService();