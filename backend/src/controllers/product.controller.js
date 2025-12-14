// src/controllers/product.controller.js
const { prisma } = require('../config/prisma');
const { deleteFile } = require('../config/multer');
const inventoryService = require('../services/inventory.service');
const productController = {
  // Get all products (public)
  getAllProducts: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        category,
        minPrice,
        maxPrice,
        search,
        vendor,
        inStock = true,
        featured,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const skip = (page - 1) * limit;

      // Build where clause
      const where = {
        isActive: true,
        isApproved: true,
        ...(category && { categoryId: category }),
        ...(minPrice && { price: { gte: parseFloat(minPrice) } }),
        ...(maxPrice && { price: { lte: parseFloat(maxPrice) } }),
        ...(inStock === 'true' && { quantity: { gt: 0 } }),
        ...(featured === 'true' && { isFeatured: true }),
        ...(vendor && { vendorId: vendor }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { tags: { has: search } }
          ]
        })
      };

      // Get products with pagination
      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: {
            category: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            },
            vendor: {
              select: {
                id: true,
                businessName: true,
                businessLogo: true,
                rating: true
              }
            },
            _count: {
              select: {
                reviews: true
              }
            }
          },
          orderBy: { [sortBy]: sortOrder },
          skip,
          take: parseInt(limit)
        }),
        prisma.product.count({ where })
      ]);

      // Calculate average rating for each product
      const productsWithRating = await Promise.all(
        products.map(async (product) => {
          const reviews = await prisma.review.aggregate({
            where: { productId: product.id },
            _avg: { rating: true },
            _count: true
          });

          return {
            ...product,
            averageRating: reviews._avg.rating || 0,
            reviewCount: reviews._count
          };
        })
      );

      res.json({
        success: true,
        data: productsWithRating,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get products error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch products',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },
getInventorySummary: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor profile not found'
        });
      }

      const result = await inventoryService.getInventorySummary(vendorId);
      res.json(result);
    } catch (error) {
      console.error('Get inventory summary error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch inventory summary'
      });
    }
  },
   updateStock: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      const { productId } = req.params;

      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor profile not found'
        });
      }

      const result = await inventoryService.updateProductStock(
        productId,
        vendorId,
        req.body,
        {
          userId: req.user.userId,
          reference: req.body.reference,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        }
      );
      res.json(result);
    } catch (error) {
      console.error('Update stock error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update stock'
      });
    }
  },
  batchUpdateStock: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor profile not found'
        });
      }

      const result = await inventoryService.batchUpdateStock(
        vendorId,
        req.body.updates || [],
        {
          userId: req.user.userId,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        }
      );
      res.json(result);
    } catch (error) {
      console.error('Batch update stock error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to batch update stock'
      });
    }
  },
 getStockMovements: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor profile not found'
        });
      }

      const result = await inventoryService.getStockMovements(vendorId, req.query);
      res.json(result);
    } catch (error) {
      console.error('Get stock movements error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch stock movements'
      });
    }
  },
  getReorderSuggestions: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor profile not found'
        });
      }

      const result = await inventoryService.getReorderSuggestions(vendorId, req.query.threshold);
      res.json(result);
    } catch (error) {
      console.error('Get reorder suggestions error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch reorder suggestions'
      });
    }
  },
getInventoryAlerts: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor profile not found'
        });
      }

      const result = await inventoryService.getInventoryAlerts(vendorId, req.query);
      res.json(result);
    } catch (error) {
      console.error('Get inventory alerts error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch inventory alerts'
      });
    }
  },
resolveInventoryAlert: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      const { alertId } = req.params;

      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor profile not found'
        });
      }

      const result = await inventoryService.resolveInventoryAlert(
        alertId,
        vendorId,
        {
          ...req.body,
          userId: req.user.userId
        }
      );
      res.json(result);
    } catch (error) {
      console.error('Resolve inventory alert error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to resolve alert'
      });
    }
  },
generateInventoryReport: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor profile not found'
        });
      }

      const result = await inventoryService.generateInventoryReport(
        vendorId,
        req.query.reportType || 'summary',
        req.query
      );

      // Set appropriate headers for file downloads
      if (req.query.format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        return res.send(result.data);
      }

      res.json(result);
    } catch (error) {
      console.error('Generate inventory report error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate report'
      });
    }
  },
  
  // Get single product
  getProduct: async (req, res) => {
    try {
      const { id } = req.params;

      const product = await prisma.product.findUnique({
        where: { id },
        include: {
          category: true,
          vendor: {
            select: {
              id: true,
              businessName: true,
              businessLogo: true,
              rating: true,
              totalSales: true,
              contactPhone: true
            }
          },
          reviews: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  avatar: true
                }
              }
            },
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Check if product is active and approved
      if (!product.isActive || !product.isApproved) {
        return res.status(404).json({
          success: false,
          message: 'Product not available'
        });
      }

      // Increment view count
      await prisma.product.update({
        where: { id },
        data: { viewCount: { increment: 1 } }
      });

      // Get average rating
      const ratingAgg = await prisma.review.aggregate({
        where: { productId: id },
        _avg: { rating: true },
        _count: true
      });

      // Get related products
      const relatedProducts = await prisma.product.findMany({
        where: {
          categoryId: product.categoryId,
          id: { not: id },
          isActive: true,
          isApproved: true,
          quantity: { gt: 0 }
        },
        take: 4,
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        success: true,
        data: {
          ...product,
          averageRating: ratingAgg._avg.rating || 0,
          reviewCount: ratingAgg._count,
          relatedProducts
        }
      });

    } catch (error) {
      console.error('Get product error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch product'
      });
    }
  },

  // Create product (vendor only)
  createProduct: async (req, res) => {
    try {
      const vendorId = req.user.vendorId;
      const productData = req.body;
      const images = req.files ? req.files.map(file => file.path) : [];

      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor profile not found'
        });
      }

      // Check vendor subscription limits
      const vendor = await prisma.vendorProfile.findUnique({
        where: { id: vendorId },
        include: {
          _count: {
            select: { products: true }
          },
          subscriptions: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message: 'Vendor not found'
        });
      }

      // Check if vendor can add more products
      const activeSubscription = vendor.subscriptions[0];
      if (!activeSubscription) {
        // Trial period or no subscription
        if (vendor.status === 'TRIAL') {
          // Allow limited products during trial
          const trialProductLimit = 10;
          if (vendor._count.products >= trialProductLimit) {
            return res.status(403).json({
              success: false,
              message: `Trial limit reached. You can only add ${trialProductLimit} products during trial. Subscribe to add more.`
            });
          }
        } else {
          return res.status(403).json({
            success: false,
            message: 'Active subscription required to add products'
          });
        }
      } else {
        // Check subscription plan limits
        const planConfig = await prisma.subscriptionPlanConfig.findUnique({
          where: { name: activeSubscription.plan }
        });

        if (planConfig && vendor._count.products >= planConfig.maxProducts) {
          return res.status(403).json({
            success: false,
            message: `Product limit reached for your ${activeSubscription.plan} plan. Upgrade to add more products.`
          });
        }
      }

      // Validate required fields
      const requiredFields = ['name', 'price'];
      const missingFields = requiredFields.filter(field => !productData[field]);

      if (missingFields.length > 0) {
        // Delete uploaded images
        images.forEach(image => deleteFile(image));
        
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`
        });
      }

      // Generate slug
      const slug = productData.name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

      // Check if slug exists
      const existingProduct = await prisma.product.findUnique({
        where: { slug }
      });

      if (existingProduct) {
        // Delete uploaded images
        images.forEach(image => deleteFile(image));
        
        return res.status(400).json({
          success: false,
          message: 'Product with similar name already exists'
        });
      }

      // Create product
      const product = await prisma.product.create({
        data: {
          ...productData,
          slug,
          vendorId,
          price: parseFloat(productData.price),
          comparePrice: productData.comparePrice ? parseFloat(productData.comparePrice) : null,
          costPrice: productData.costPrice ? parseFloat(productData.costPrice) : null,
          quantity: parseInt(productData.quantity || 0),
          lowStockThreshold: parseInt(productData.lowStockThreshold || 5),
          images: images.length > 0 ? images : productData.images || [],
          tags: productData.tags ? productData.tags.split(',').map(tag => tag.trim()) : [],
          specifications: productData.specifications ? JSON.parse(productData.specifications) : null,
          isManuwaProduct: req.user.role === 'SUPER_ADMIN' && productData.isManuwaProduct === 'true'
        }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'CREATE',
          entity: 'PRODUCT',
          entityId: product.id,
          changes: JSON.stringify({ name: product.name, price: product.price }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: product
      });

    } catch (error) {
      console.error('Create product error:', error);
      
      // Delete uploaded images on error
      if (req.files) {
        req.files.forEach(file => deleteFile(file.path));
      }
      
      res.status(500).json({
        success: false,
        message: 'Failed to create product',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },
// Add to your existing product.controller.js

// Get all vendors inventory summary (admin only)
getAllVendorsInventorySummary: async (req, res) => {
  try {
    const vendors = await prisma.vendorProfile.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      include: {
        user: {
          select: {
            email: true,
            phoneNumber: true
          }
        },
        _count: {
          select: {
            products: true
          }
        },
        products: {
          select: {
            quantity: true,
            price: true,
            costPrice: true
          }
        }
      }
    });

    const summary = vendors.map(vendor => {
      const totalProducts = vendor._count.products;
      const totalStock = vendor.products.reduce((sum, p) => sum + p.quantity, 0);
      const totalValue = vendor.products.reduce((sum, p) => sum + (p.quantity * (p.costPrice || p.price * 0.7)), 0);
      const outOfStock = vendor.products.filter(p => p.quantity === 0).length;
      const lowStock = vendor.products.filter(p => p.quantity > 0 && p.quantity <= 5).length;

      return {
        vendorId: vendor.id,
        businessName: vendor.businessName,
        status: vendor.status,
        contact: {
          email: vendor.user.email,
          phone: vendor.user.phoneNumber
        },
        inventory: {
          totalProducts,
          totalStock,
          totalValue: parseFloat(totalValue.toFixed(2)),
          outOfStockProducts: outOfStock,
          lowStockProducts: lowStock,
          outOfStockPercentage: totalProducts > 0 ? parseFloat(((outOfStock / totalProducts) * 100).toFixed(2)) : 0,
          averageStockValue: totalProducts > 0 ? parseFloat((totalValue / totalProducts).toFixed(2)) : 0
        },
        lastUpdated: new Date()
      };
    });

    res.json({
      success: true,
      data: summary,
      totalVendors: vendors.length,
      generatedAt: new Date()
    });

  } catch (error) {
    console.error('Get all vendors inventory summary error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch vendors inventory summary'
    });
  }
},

// Get specific vendor inventory summary (admin only)
getVendorInventorySummary: async (req, res) => {
  try {
    const { vendorId } = req.params;
    
    // Check if vendor exists
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: vendorId },
      include: {
        user: {
          select: {
            email: true,
            phoneNumber: true,
            fullName: true
          }
        }
      }
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Use inventory service
    const inventoryService = require('../services/inventory.service');
    const result = await inventoryService.getInventorySummary(vendorId);

    res.json({
      success: true,
      data: {
        vendor: {
          id: vendor.id,
          businessName: vendor.businessName,
          status: vendor.status,
          contact: vendor.user
        },
        inventory: result.data
      }
    });

  } catch (error) {
    console.error('Get vendor inventory summary error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch vendor inventory summary'
    });
  }
},

// Get vendor stock movements (admin only)
getVendorStockMovements: async (req, res) => {
  try {
    const { vendorId } = req.params;
    
    // Check if vendor exists
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: vendorId }
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Use inventory service
    const inventoryService = require('../services/inventory.service');
    const result = await inventoryService.getStockMovements(vendorId, req.query);

    res.json(result);

  } catch (error) {
    console.error('Get vendor stock movements error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch vendor stock movements'
    });
  }
},

// Get vendor inventory alerts (admin only)
getVendorInventoryAlerts: async (req, res) => {
  try {
    const { vendorId } = req.params;
    
    // Check if vendor exists
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: vendorId }
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Use inventory service
    const inventoryService = require('../services/inventory.service');
    const result = await inventoryService.getInventoryAlerts(vendorId, req.query);

    res.json(result);

  } catch (error) {
    console.error('Get vendor inventory alerts error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch vendor inventory alerts'
    });
  }
},
  // Update product
  updateProduct: async (req, res) => {
    try {
      const { id } = req.params;
      const vendorId = req.user.vendorId;
      const updates = req.body;
      const newImages = req.files ? req.files.map(file => file.path) : [];

      // Check if product exists and belongs to vendor
      const product = await prisma.product.findUnique({
        where: { id }
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Check ownership (unless admin)
      if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
        if (product.vendorId !== vendorId) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to update this product'
          });
        }
      }

      // Generate new slug if name changed
      if (updates.name && updates.name !== product.name) {
        updates.slug = updates.name
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-');
      }

      // Handle images
      if (newImages.length > 0) {
        const existingImages = product.images || [];
        const allImages = [...existingImages, ...newImages];
        
        // Limit images based on subscription
        const vendor = await prisma.vendorProfile.findUnique({
          where: { id: product.vendorId || vendorId },
          include: {
            subscriptions: {
              where: { status: 'ACTIVE' },
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        });

        let maxImages = 5; // Default
        if (vendor && vendor.subscriptions[0]) {
          const planConfig = await prisma.subscriptionPlanConfig.findUnique({
            where: { name: vendor.subscriptions[0].plan }
          });
          if (planConfig) {
            maxImages = planConfig.maxImagesPerProduct;
          }
        }

        // Keep only the allowed number of images
        updates.images = allImages.slice(0, maxImages);
        
        // Delete old images if they were removed
        if (updates.removeImages) {
          const imagesToRemove = JSON.parse(updates.removeImages);
          updates.images = updates.images.filter(img => !imagesToRemove.includes(img));
          delete updates.removeImages;
          
          // Delete image files
          imagesToRemove.forEach(imagePath => deleteFile(imagePath));
        }
      }

      // Parse numeric fields
      if (updates.price) updates.price = parseFloat(updates.price);
      if (updates.comparePrice) updates.comparePrice = parseFloat(updates.comparePrice);
      if (updates.costPrice) updates.costPrice = parseFloat(updates.costPrice);
      if (updates.quantity) updates.quantity = parseInt(updates.quantity);
      if (updates.lowStockThreshold) updates.lowStockThreshold = parseInt(updates.lowStockThreshold);
      
      // Parse tags
      if (updates.tags && typeof updates.tags === 'string') {
        updates.tags = updates.tags.split(',').map(tag => tag.trim());
      }
      
      // Parse specifications
      if (updates.specifications && typeof updates.specifications === 'string') {
        updates.specifications = JSON.parse(updates.specifications);
      }

      // Update product
      const updatedProduct = await prisma.product.update({
        where: { id },
        data: updates
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'UPDATE',
          entity: 'PRODUCT',
          entityId: id,
          changes: JSON.stringify(updates),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      res.json({
        success: true,
        message: 'Product updated successfully',
        data: updatedProduct
      });

    } catch (error) {
      console.error('Update product error:', error);
      
      // Delete uploaded images on error
      if (req.files) {
        req.files.forEach(file => deleteFile(file.path));
      }
      
      res.status(500).json({
        success: false,
        message: 'Failed to update product'
      });
    }
  },

  // Delete product
  deleteProduct: async (req, res) => {
    try {
      const { id } = req.params;
      const vendorId = req.user.vendorId;

      // Check if product exists
      const product = await prisma.product.findUnique({
        where: { id }
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Check ownership (unless admin)
      if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
        if (product.vendorId !== vendorId) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to delete this product'
          });
        }
      }

      // Soft delete (mark as inactive)
      await prisma.product.update({
        where: { id },
        data: { isActive: false }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'DELETE',
          entity: 'PRODUCT',
          entityId: id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      res.json({
        success: true,
        message: 'Product deleted successfully'
      });

    } catch (error) {
      console.error('Delete product error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete product'
      });
    }
  },

  // Get featured products (public)
  getFeaturedProducts: async (req, res) => {
    try {
      const products = await prisma.product.findMany({
        where: {
          isFeatured: true,
          isActive: true,
          isApproved: true,
          quantity: { gt: 0 }
        },
        include: {
          vendor: {
            select: {
              businessName: true,
              businessLogo: true
            }
          },
          category: {
            select: {
              name: true,
              slug: true
            }
          }
        },
        take: 12,
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        success: true,
        data: products
      });

    } catch (error) {
      console.error('Get featured products error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch featured products'
      });
    }
  },

  // Get products by category (public)
  getProductsByCategory: async (req, res) => {
    try {
      const { slug } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const skip = (page - 1) * limit;

      // Find category
      const category = await prisma.category.findUnique({
        where: { slug }
      });

      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Category not found'
        });
      }

      // Get products
      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where: {
            categoryId: category.id,
            isActive: true,
            isApproved: true,
            quantity: { gt: 0 }
          },
          include: {
            vendor: {
              select: {
                businessName: true,
                businessLogo: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit)
        }),
        prisma.product.count({
          where: {
            categoryId: category.id,
            isActive: true,
            isApproved: true,
            quantity: { gt: 0 }
          }
        })
      ]);

      res.json({
        success: true,
        data: {
          category,
          products,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      console.error('Get products by category error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch category products'
      });
    }
  },

  // Search products (public)
  searchProducts: async (req, res) => {
    try {
      const { q, category, minPrice, maxPrice, sortBy = 'relevance' } = req.query;

      if (!q || q.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Search query must be at least 2 characters'
        });
      }

      // Build where clause
      const where = {
        isActive: true,
        isApproved: true,
        quantity: { gt: 0 },
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
          { tags: { has: q } }
        ]
      };

      if (category) {
        where.categoryId = category;
      }

      if (minPrice) {
        where.price = { ...where.price, gte: parseFloat(minPrice) };
      }

      if (maxPrice) {
        where.price = { ...where.price, lte: parseFloat(maxPrice) };
      }

      // Determine sort order
      let orderBy = {};
      switch (sortBy) {
        case 'price_asc':
          orderBy = { price: 'asc' };
          break;
        case 'price_desc':
          orderBy = { price: 'desc' };
          break;
        case 'newest':
          orderBy = { createdAt: 'desc' };
          break;
        case 'popular':
          orderBy = { viewCount: 'desc' };
          break;
        default:
          // Relevance - you might want to implement full-text search here
          orderBy = { createdAt: 'desc' };
      }

      const products = await prisma.product.findMany({
        where,
        include: {
          category: {
            select: {
              name: true,
              slug: true
            }
          },
          vendor: {
            select: {
              businessName: true,
              businessLogo: true
            }
          }
        },
        orderBy,
        take: 50
      });

      res.json({
        success: true,
        data: products,
        count: products.length
      });

    } catch (error) {
      console.error('Search products error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search products'
      });
    }
  }
};

module.exports = productController;