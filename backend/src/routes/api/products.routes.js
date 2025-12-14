// src/routes/api/products.routes.js
const express = require('express');
const router = express.Router();
const productController = require('../../controllers/product.controller');
const { authenticate, authorize, checkVendorSubscription } = require('../../middleware/auth');
const { uploadMultiple } = require('../../config/multer');

// Public routes
router.get('/', productController.getAllProducts);
router.get('/featured', productController.getFeaturedProducts);
router.get('/search', productController.searchProducts);
router.get('/category/:slug', productController.getProductsByCategory);
router.get('/:id', productController.getProduct);

// Vendor routes (protected)
router.post(
  '/',
  authenticate,
  authorize(['VENDOR']),
  checkVendorSubscription,
  uploadMultiple('images', 10),
  productController.createProduct
);

router.put(
  '/:id',
  authenticate,
  authorize(['VENDOR', 'ADMIN', 'SUPER_ADMIN']),
  checkVendorSubscription,
  uploadMultiple('images', 10),
  productController.updateProduct
);

router.delete(
  '/:id',
  authenticate,
  authorize(['VENDOR', 'ADMIN', 'SUPER_ADMIN']),
  productController.deleteProduct
);

// Admin routes
router.patch(
  '/:id/approve',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  async (req, res) => {
    // Approve product for sale
    const { id } = req.params;
    try {
      const product = await prisma.product.update({
        where: { id },
        data: { isApproved: true }
      });
      res.json({ success: true, data: product });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to approve product' });
    }
  }
);

router.patch(
  '/:id/feature',
  authenticate,
  authorize(['ADMIN', 'SUPER_ADMIN']),
  async (req, res) => {
    // Feature/unfeature product
    const { id } = req.params;
    const { featured } = req.body;
    
    try {
      const product = await prisma.product.update({
        where: { id },
        data: { isFeatured: featured }
      });
      res.json({ success: true, data: product });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to update featured status' });
    }
  }
);

module.exports = router;