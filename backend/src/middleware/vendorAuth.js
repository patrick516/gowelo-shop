// src/middleware/vendorAuth.js
const prisma = require('../lib/prisma');

exports.requireVendor = async (req, res, next) => {
  try {
    if (req.user.role !== 'VENDOR') {
      return res.status(403).json({
        success: false,
        message: 'Vendor access required'
      });
    }

    // Get vendor profile
    const vendorProfile = await prisma.vendorProfile.findUnique({
      where: { userId: req.user.userId }
    });

    if (!vendorProfile) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }

    // Attach vendor to request
    req.vendorProfile = vendorProfile;
    next();
  } catch (error) {
    console.error('Vendor auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Vendor authentication failed'
    });
  }
};
