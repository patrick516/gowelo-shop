// src/controllers/auth.controller.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/prisma');
const { generateRandomPassword, sendEmail } = require('../services/notification.service');

const authController = {
  // Customer Registration
  registerCustomer: async (req, res) => {
    try {
      const { email, phone, password, fullName } = req.body;

      // Validate required fields
      if (!email || !phone || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email, phone and password are required'
        });
      }

      // Check if user exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            { phone }
          ]
        }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User with this email or phone already exists'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          phone,
          fullName,
          passwordHash: hashedPassword,
          role: 'CUSTOMER'
        }
      });

      // Create cart for user
      await prisma.cart.create({
        data: {
          userId: user.id
        }
      });

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Remove password hash from response
      const { passwordHash, ...userWithoutPassword } = user;

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
          user: userWithoutPassword,
          token
        }
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Registration failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Vendor Registration
  registerVendor: async (req, res) => {
    try {
      const {
        email,
        phone,
        businessName,
        contactPerson,
        contactPhone,
        contactEmail,
        businessAddress,
        city,
        region
      } = req.body;

      // Validate required fields
      if (!email || !phone || !businessName || !contactPerson) {
        return res.status(400).json({
          success: false,
          message: 'Required fields are missing'
        });
      }

      // Check if user exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            { phone }
          ]
        }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User with this email or phone already exists'
        });
      }

      // Generate temporary password (1-10)
      const tempPassword = Math.floor(Math.random() * 10) + 1;
      const hashedPassword = await bcrypt.hash(tempPassword.toString(), 10);

      // Calculate trial end date (2 days from now)
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 2);

      // Create user and vendor profile in transaction
      const result = await prisma.$transaction(async (prisma) => {
        // Create user
        const user = await prisma.user.create({
          data: {
            email,
            phone,
            fullName: contactPerson,
            passwordHash: hashedPassword,
            role: 'VENDOR',
            isVerified: false
          }
        });

        // Create vendor profile
        const vendorProfile = await prisma.vendorProfile.create({
          data: {
            userId: user.id,
            businessName,
            contactPerson,
            contactPhone: contactPhone || phone,
            contactEmail: contactEmail || email,
            businessAddress,
            city,
            region,
            status: 'TRIAL',
            trialEndsAt,
            isTrialActive: true
          }
        });

        // Create audit log
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'REGISTER',
            entity: 'VENDOR',
            entityId: vendorProfile.id,
            changes: JSON.stringify({ status: 'TRIAL', trialEndsAt }),
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
          }
        });

        return { user, vendorProfile };
      });

      // Send welcome email with temporary password
      try {
        await sendEmail({
          to: email,
          subject: 'Welcome to ManuwaFarm Marketplace - Vendor Account Created',
          template: 'vendor-welcome',
          data: {
            businessName,
            contactPerson,
            email,
            tempPassword,
            trialEndsAt: trialEndsAt.toLocaleDateString(),
            loginLink: `${process.env.FRONTEND_URL}/vendor/login`
          }
        });
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Continue even if email fails
      }

      // Remove sensitive data from response
      const { passwordHash, ...userWithoutPassword } = result.user;

      res.status(201).json({
        success: true,
        message: 'Vendor registration successful. Check your email for temporary password.',
        data: {
          user: userWithoutPassword,
          vendor: result.vendorProfile
        }
      });

    } catch (error) {
      console.error('Vendor registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Vendor registration failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Login
  login: async (req, res) => {
    try {
      const { email, phone, password } = req.body;

      // Validate input
      if ((!email && !phone) || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email/phone and password are required'
        });
      }

      // Find user
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: email || undefined },
            { phone: phone || undefined }
          ]
        },
        include: {
          vendorProfile: true
        }
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated. Please contact support.'
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check vendor trial status if vendor
      if (user.role === 'VENDOR' && user.vendorProfile) {
        const vendor = user.vendorProfile;
        
        if (vendor.status === 'TRIAL' && vendor.trialEndsAt < new Date()) {
          // Trial expired
          await prisma.vendorProfile.update({
            where: { id: vendor.id },
            data: { 
              status: 'EXPIRED',
              isTrialActive: false 
            }
          });
          
          return res.status(403).json({
            success: false,
            message: 'Trial period expired. Please subscribe to continue.',
            requiresSubscription: true
          });
        }
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      });

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          role: user.role,
          vendorId: user.vendorProfile?.id 
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Remove password hash from response
      const { passwordHash, ...userWithoutPassword } = user;

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: userWithoutPassword,
          token,
          requiresPasswordChange: password.match(/^[1-9]$|^10$/) // Check if temp password
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Change Password
  changePassword: async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.userId;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current and new passwords are required'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 6 characters'
        });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: hashedPassword }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'PASSWORD_CHANGE',
          entity: 'USER',
          entityId: userId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });

    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to change password'
      });
    }
  },

  // Forgot Password
  forgotPassword: async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user) {
        // Don't reveal that user doesn't exist for security
        return res.json({
          success: true,
          message: 'If an account exists, you will receive a password reset email'
        });
      }

      // Generate reset token
      const resetToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET + user.passwordHash,
        { expiresIn: '1h' }
      );

      // Save reset token to database (optional)
      // You can create a separate reset tokens table

      // Send reset email
      const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
      
      await sendEmail({
        to: email,
        subject: 'Password Reset Request - ManuwaFarm',
        template: 'password-reset',
        data: {
          name: user.fullName || 'User',
          resetLink,
          expiryTime: '1 hour'
        }
      });

      res.json({
        success: true,
        message: 'Password reset email sent'
      });

    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process request'
      });
    }
  },

  // Reset Password
  resetPassword: async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Token and new password are required'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters'
        });
      }

      // Decode token to get userId
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.userId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid token'
        });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Verify token
      try {
        jwt.verify(token, process.env.JWT_SECRET + user.passwordHash);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired token'
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: hashedPassword }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'PASSWORD_RESET',
          entity: 'USER',
          entityId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      res.json({
        success: true,
        message: 'Password reset successful'
      });

    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reset password'
      });
    }
  },

  // Get Current User
  getCurrentUser: async (req, res) => {
    try {
      const userId = req.user.userId;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          vendorProfile: true,
          addresses: {
            where: { isDefault: true },
            take: 1
          }
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Remove password hash
      const { passwordHash, ...userWithoutPassword } = user;

      res.json({
        success: true,
        data: userWithoutPassword
      });

    } catch (error) {
      console.error('Get current user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user data'
      });
    }
  },

  // Logout
  logout: async (req, res) => {
    try {
      // With JWT, logout is client-side (just delete token)
      // But we can log the logout action
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'LOGOUT',
          entity: 'USER',
          entityId: req.user.userId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      res.json({
        success: true,
        message: 'Logged out successfully'
      });

    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Logout failed'
      });
    }
  }
};

module.exports = authController;