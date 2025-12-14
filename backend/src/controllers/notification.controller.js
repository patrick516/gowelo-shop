// src/controllers/notification.controller.js
const { prisma } = require('../config/prisma');
const { sendEmail, sendBulkEmail, sendSMS } = require('../services/notification.service');

const notificationController = {
  // Get user notifications
  getUserNotifications: async (req, res) => {
    try {
      const userId = req.user.userId;
      const { page = 1, limit = 20, unreadOnly = false } = req.query;

      const skip = (page - 1) * limit;

      // Build where clause
      const where = {
        OR: [
          { userId },
          { vendorId: req.user.vendorId || undefined }
        ]
      };

      if (unreadOnly === 'true') {
        where.isRead = false;
      }

      const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit)
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({ 
          where: { ...where, isRead: false } 
        })
      ]);

      res.json({
        success: true,
        data: notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        unreadCount
      });

    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications'
      });
    }
  },

  // Mark notification as read
  markAsRead: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;

      const notification = await prisma.notification.findFirst({
        where: {
          id,
          OR: [
            { userId },
            { vendorId: req.user.vendorId || undefined }
          ]
        }
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      await prisma.notification.update({
        where: { id },
        data: { isRead: true }
      });

      res.json({
        success: true,
        message: 'Notification marked as read'
      });

    } catch (error) {
      console.error('Mark as read error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read'
      });
    }
  },

  // Mark all notifications as read
  markAllAsRead: async (req, res) => {
    try {
      const userId = req.user.userId;

      await prisma.notification.updateMany({
        where: {
          OR: [
            { userId },
            { vendorId: req.user.vendorId || undefined }
          ],
          isRead: false
        },
        data: { isRead: true }
      });

      res.json({
        success: true,
        message: 'All notifications marked as read'
      });

    } catch (error) {
      console.error('Mark all as read error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark notifications as read'
      });
    }
  },

  // Delete notification
  deleteNotification: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;

      const notification = await prisma.notification.findFirst({
        where: {
          id,
          OR: [
            { userId },
            { vendorId: req.user.vendorId || undefined }
          ]
        }
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      await prisma.notification.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Notification deleted'
      });

    } catch (error) {
      console.error('Delete notification error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete notification'
      });
    }
  },

  // Create notification (admin only)
  createNotification: async (req, res) => {
    try {
      const { title, message, type, userId, vendorId, metadata } = req.body;

      if (!title || !message) {
        return res.status(400).json({
          success: false,
          message: 'Title and message are required'
        });
      }

      const notification = await prisma.notification.create({
        data: {
          title,
          message,
          type: type || 'system',
          userId,
          vendorId,
          metadata: metadata ? JSON.parse(metadata) : null
        }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'CREATE_NOTIFICATION',
          entity: 'NOTIFICATION',
          entityId: notification.id,
          changes: JSON.stringify({ title, type }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      res.status(201).json({
        success: true,
        message: 'Notification created',
        data: notification
      });

    } catch (error) {
      console.error('Create notification error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create notification'
      });
    }
  },

  // Send bulk notification to vendors (admin only)
  sendBulkNotification: async (req, res) => {
    try {
      const { title, message, vendorIds, sendEmail: shouldSendEmail } = req.body;

      if (!title || !message) {
        return res.status(400).json({
          success: false,
          message: 'Title and message are required'
        });
      }

      let vendors = [];
      if (vendorIds && vendorIds.length > 0) {
        // Send to specific vendors
        vendors = await prisma.vendorProfile.findMany({
          where: { id: { in: vendorIds } },
          include: { user: true }
        });
      } else {
        // Send to all active vendors
        vendors = await prisma.vendorProfile.findMany({
          where: { status: 'ACTIVE' },
          include: { user: true }
        });
      }

      const notifications = [];
      const emailPromises = [];

      // Create notifications
      for (const vendor of vendors) {
        const notification = await prisma.notification.create({
          data: {
            title,
            message,
            type: 'system',
            vendorId: vendor.id,
            userId: vendor.userId
          }
        });
        notifications.push(notification);

        // Send email if requested
        if (shouldSendEmail && vendor.user.email) {
          emailPromises.push(
            sendEmail({
              to: vendor.user.email,
              subject: title,
              template: 'bulk-notification',
              data: {
                businessName: vendor.businessName,
                title,
                message,
                date: new Date().toLocaleDateString()
              }
            }).catch(error => {
              console.error(`Failed to send email to ${vendor.user.email}:`, error);
            })
          );
        }
      }

      // Wait for all emails to be sent
      if (emailPromises.length > 0) {
        await Promise.allSettled(emailPromises);
      }

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'BULK_NOTIFICATION',
          entity: 'NOTIFICATION',
          changes: JSON.stringify({
            title,
            vendorCount: vendors.length,
            sentEmails: shouldSendEmail
          }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      res.json({
        success: true,
        message: `Notification sent to ${vendors.length} vendor(s)`,
        data: {
          count: vendors.length,
          sentEmails: shouldSendEmail
        }
      });

    } catch (error) {
      console.error('Send bulk notification error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send bulk notification'
      });
    }
  },

  // Send subscription reminder (admin only)
  sendSubscriptionReminder: async (req, res) => {
    try {
      // Find vendors whose subscription expires in 3 days
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      const vendors = await prisma.vendorProfile.findMany({
        where: {
          status: 'ACTIVE',
          subscriptionEndsAt: {
            lte: threeDaysFromNow,
            gte: new Date()
          }
        },
        include: { user: true }
      });

      const results = [];
      for (const vendor of vendors) {
        try {
          // Create notification
          await prisma.notification.create({
            data: {
              title: 'Subscription Renewal Reminder',
              message: `Your subscription ends on ${vendor.subscriptionEndsAt.toLocaleDateString()}. Please renew to continue using the platform.`,
              type: 'subscription',
              vendorId: vendor.id,
              userId: vendor.userId
            }
          });

          // Send email
          await sendEmail({
            to: vendor.user.email,
            subject: 'Subscription Renewal Reminder - ManuwaFarm',
            template: 'subscription-reminder',
            data: {
              businessName: vendor.businessName,
              endDate: vendor.subscriptionEndsAt.toLocaleDateString(),
              daysLeft: Math.ceil((vendor.subscriptionEndsAt - new Date()) / (1000 * 60 * 60 * 24)),
              renewalLink: `${process.env.FRONTEND_URL}/vendor/subscription`
            }
          });

          results.push({
            vendor: vendor.businessName,
            email: vendor.user.email,
            status: 'sent'
          });
        } catch (error) {
          results.push({
            vendor: vendor.businessName,
            email: vendor.user.email,
            status: 'failed',
            error: error.message
          });
        }
      }

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'SUBSCRIPTION_REMINDERS',
          entity: 'NOTIFICATION',
          changes: JSON.stringify({
            vendorCount: vendors.length,
            successful: results.filter(r => r.status === 'sent').length,
            failed: results.filter(r => r.status === 'failed').length
          }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      res.json({
        success: true,
        message: `Subscription reminders sent to ${vendors.length} vendor(s)`,
        data: results
      });

    } catch (error) {
      console.error('Send subscription reminder error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send subscription reminders'
      });
    }
  },

  // Get notification templates
  getTemplates: async (req, res) => {
    try {
      const templates = {
        'vendor-welcome': {
          name: 'Vendor Welcome',
          subject: 'Welcome to ManuwaFarm Marketplace',
          description: 'Sent when vendor registers'
        },
        'subscription-initiated': {
          name: 'Subscription Initiated',
          subject: 'Subscription Payment Initiated',
          description: 'Sent when subscription payment is initiated'
        },
        'subscription-activated': {
          name: 'Subscription Activated',
          subject: 'Subscription Activated Successfully',
          description: 'Sent when subscription is activated'
        },
        'subscription-cancelled': {
          name: 'Subscription Cancelled',
          subject: 'Subscription Cancelled',
          description: 'Sent when subscription is cancelled'
        },
        'subscription-reminder': {
          name: 'Subscription Reminder',
          subject: 'Subscription Renewal Reminder',
          description: 'Sent before subscription expires'
        },
        'vendor-status-update': {
          name: 'Vendor Status Update',
          subject: 'Vendor Account Status Update',
          description: 'Sent when vendor status changes'
        },
        'password-reset': {
          name: 'Password Reset',
          subject: 'Password Reset Request',
          description: 'Sent for password reset'
        },
        'order-confirmation': {
          name: 'Order Confirmation',
          subject: 'Order Confirmation',
          description: 'Sent when order is placed'
        },
        'order-status-update': {
          name: 'Order Status Update',
          subject: 'Order Status Updated',
          description: 'Sent when order status changes'
        },
        'bulk-notification': {
          name: 'Bulk Notification',
          subject: 'Platform Announcement',
          description: 'For general announcements'
        }
      };

      res.json({
        success: true,
        data: templates
      });

    } catch (error) {
      console.error('Get templates error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch templates'
      });
    }
  }
};

module.exports = notificationController;