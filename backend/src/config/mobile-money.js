// src/config/mobile-money.js
require('dotenv').config();

const mobileMoneyConfig = {
  // Airtel Money Configuration
  airtelMoney: {
    apiKey: process.env.AIRTEL_MONEY_API_KEY || 'test_key',
    apiSecret: process.env.AIRTEL_MONEY_API_SECRET || 'test_secret',
    merchantId: process.env.AIRTEL_MONEY_MERCHANT_ID || 'test_merchant',
    baseUrl: process.env.AIRTEL_MONEY_BASE_URL || 'https://sandbox.airtel.mw',
    callbackUrl: process.env.AIRTEL_MONEY_CALLBACK_URL || 'https://yourdomain.com/api/payments/airtel/callback'
  },
  
  // TNM Mpamba Configuration
  mpamba: {
    apiKey: process.env.MPAMBA_API_KEY || 'test_key',
    apiSecret: process.env.MPAMBA_API_SECRET || 'test_secret',
    merchantCode: process.env.MPAMBA_MERCHANT_CODE || 'test_merchant',
    baseUrl: process.env.MPAMBA_BASE_URL || 'https://sandbox.tnm.mw',
    callbackUrl: process.env.MPAMBA_CALLBACK_URL || 'https://yourdomain.com/api/payments/mpamba/callback'
  },
  
  // Common settings
  currency: 'MWK',
  country: 'MW',
  
  // Test mode
  isTestMode: process.env.NODE_ENV === 'development',
  
  // Payment endpoints
  endpoints: {
    airtel: {
      initiate: '/merchant/v1/payments/',
      checkStatus: '/merchant/v1/payments/{transactionId}',
      refund: '/merchant/v1/refunds/'
    },
    mpamba: {
      initiate: '/api/v1/payments/request',
      checkStatus: '/api/v1/payments/status/{reference}',
      refund: '/api/v1/payments/refund'
    }
  }
};

// Helper functions
const formatPhoneNumber = (phone) => {
  // Format Malawi phone numbers
  let formatted = phone.toString().replace(/\D/g, '');
  
  if (formatted.startsWith('0')) {
    formatted = '265' + formatted.substring(1);
  } else if (formatted.startsWith('265')) {
    // Already formatted
  } else if (formatted.length === 9) {
    formatted = '265' + formatted;
  }
  
  return formatted;
};

const validatePhoneNumber = (phone) => {
  const formatted = formatPhoneNumber(phone);
  const regex = /^265(88|99|98|31)\d{7}$/;
  return regex.test(formatted);
};

const generateTransactionId = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `TX${timestamp}${random}`;
};

module.exports = {
  ...mobileMoneyConfig,
  formatPhoneNumber,
  validatePhoneNumber,
  generateTransactionId
};