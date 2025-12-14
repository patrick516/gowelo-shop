// src/services/product.service.js
const { prisma } = require('../config/prisma');

const productService = {
  // Get all products with filters
  getAllProducts: async (filters = {}) => {
    const {
      page = 1,
      limit = 20,
      category,
      minPrice,
      maxPrice,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = filters;

    const skip = (page - 1) * limit;
    
    // Build where clause
    const where = {
      isActive: true,
      ...(category && { categoryId: category }),
      ...(minPrice && { price: { gte: parseFloat(minPrice) } }),
      ...(maxPrice && { price: { lte: parseFloat(maxPrice) } }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } }
        ]
      })
    };

    // Get total count
    const total = await prisma.product.count({ where });
    
    // Get products
    const products = await prisma.product.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      },
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: parseInt(limit)
    });

    return {
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  },

  // Get single product
  getProductById: async (id) => {
    return await prisma.product.findUnique({
      where: { id },
      include: {
        category: true
      }
    });
  },

  // Create product
  createProduct: async (data) => {
    // Generate slug
    const slug = data.name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    return await prisma.product.create({
      data: {
        ...data,
        slug,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  },

  // Update product
  updateProduct: async (id, data) => {
    // Update slug if name changed
    if (data.name) {
      data.slug = data.name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    }

    return await prisma.product.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });
  },

  // Delete product (soft delete)
  deleteProduct: async (id) => {
    return await prisma.product.update({
      where: { id },
      data: {
        isActive: false,
        updatedAt: new Date()
      }
    });
  },

  // Update inventory quantity
  updateInventory: async (productId, quantityChange) => {
    // Get current product
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      throw new Error('Product not found');
    }

    const newQuantity = product.quantity + quantityChange;
    
    if (newQuantity < 0) {
      throw new Error('Insufficient stock');
    }

    return await prisma.product.update({
      where: { id: productId },
      data: { quantity: newQuantity }
    });
  },

  // Get featured products
  getFeaturedProducts: async (limit = 8) => {
    return await prisma.product.findMany({
      where: {
        isFeatured: true,
        isActive: true,
        quantity: { gt: 0 }
      },
      take: limit,
      orderBy: { createdAt: 'desc' }
    });
  },

  // Get products by category
  getProductsByCategory: async (categoryId, limit = 20) => {
    return await prisma.product.findMany({
      where: {
        categoryId,
        isActive: true,
        quantity: { gt: 0 }
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        category: {
          select: {
            name: true,
            slug: true
          }
        }
      }
    });
  }
};

module.exports = productService;