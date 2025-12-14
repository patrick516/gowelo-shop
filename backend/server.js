// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cron = require('node-cron');

// Import Prisma client (this will trigger connection)
require('./src/lib/prisma');

// Import services
const inventoryService = require('./src/services/inventory.service');
const subscriptionService = require('./src/services/subscription.service');
const notificationService = require('./src/services/notification.service');

// Import routes
const productRoutes = require('./src/routes/api/products.routes');
const vendorRoutes = require('./src/routes/api/vendors.routes');
const inventoryRoutes = require('./src/routes/api/inventory.routes');
const subscriptionRoutes = require('./src/routes/api/subscriptions.routes'); // Fixed: subscriptions not subscription
const orderRoutes = require('./src/routes/api/orders.routes');
const authRoutes = require('./src/routes/api/auth.routes');
const categoryRoutes = require('./src/routes/api/categories.routes');
const paymentRoutes = require('./src/routes/api/payments.routes'); // Fixed: payments not payment
const customerRoutes = require('./src/routes/api/customers.routes');
const adminRoutes = require('./src/routes/admin/dashboard.routes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files (for product images)
app.use('/uploads', express.static('uploads'));

// API Routes
app.use('/api/products', productRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/admin', adminRoutes);

// Import prisma for use in functions
const { prisma } = require('./src/config/prisma');

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'connected',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('\n🔄 Received shutdown signal, gracefully shutting down...');
  
  prisma.$disconnect()
    .then(() => {
      console.log('✅ Database disconnected');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    });
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log('='.repeat(50) + '\n');
});

module.exports = app;
