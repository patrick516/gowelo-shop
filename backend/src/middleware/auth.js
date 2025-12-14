// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/prisma');

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        vendorProfile: {
          select: {
            id: true,
            status: true
          }
        }
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    // Attach user info to request
    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
      vendorId: user.vendorProfile?.id
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

const authorize = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

// Vendor-specific middleware to check subscription status
const checkVendorSubscription = async (req, res, next) => {
  try {
    if (req.user.role !== 'VENDOR') {
      return next();
    }

    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: req.user.vendorId },
      select: {
        status: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
        isTrialActive: true
      }
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }

    // Check if trial expired
    if (vendor.status === 'TRIAL' && vendor.trialEndsAt < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Trial period expired. Please subscribe to continue.',
        requiresSubscription: true
      });
    }

    // Check if subscription expired
    if (vendor.status === 'ACTIVE' && vendor.subscriptionEndsAt && vendor.subscriptionEndsAt < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Subscription expired. Please renew to continue.',
        requiresSubscription: true
      });
    }

    next();
  } catch (error) {
    console.error('Check vendor subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check subscription status'
    });
  }
};

module.exports = {
  authenticate,
  authorize,
  checkVendorSubscription
};