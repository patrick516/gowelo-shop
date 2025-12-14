// src/config/prisma.js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'info', 'warn', 'error'] 
    : ['error'],
});

// Test connection on startup
const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log('✅ PostgreSQL connected via Prisma');
    
    // Create default admin if not exists
    const adminExists = await prisma.user.findFirst({
      where: { email: 'admin@manuwafarm.com' }
    });
    
    if (!adminExists) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await prisma.user.create({
        data: {
          email: 'admin@manuwafarm.com',
          phone: '265888000000',
          fullName: 'System Admin',
          passwordHash: hashedPassword,
          role: 'SUPER_ADMIN',
          isVerified: true,
        }
      });
      console.log('✅ Default admin user created');
    }
    
    // Create default subscription plans
    const plans = await prisma.subscriptionPlanConfig.findMany();
    if (plans.length === 0) {
      await prisma.subscriptionPlanConfig.createMany({
        data: [
          {
            name: 'BASIC',
            description: 'For small vendors just starting',
            price: 5000,
            maxProducts: 50,
            maxImagesPerProduct: 3,
            canOfferDiscounts: false,
            analyticsAccess: false,
            supportLevel: 'basic'
          },
          {
            name: 'STANDARD',
            description: 'For growing businesses',
            price: 15000,
            maxProducts: 200,
            maxImagesPerProduct: 5,
            canOfferDiscounts: true,
            analyticsAccess: true,
            supportLevel: 'standard'
          },
          {
            name: 'PREMIUM',
            description: 'For established vendors',
            price: 30000,
            maxProducts: 500,
            maxImagesPerProduct: 8,
            canOfferDiscounts: true,
            analyticsAccess: true,
            supportLevel: 'priority'
          }
        ]
      });
      console.log('✅ Default subscription plans created');
    }
    
  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = { prisma, connectDB };