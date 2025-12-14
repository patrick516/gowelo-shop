// src/controllers/category.controller.js
const { prisma } = require('../config/prisma');
const { deleteFile } = require('../config/multer');

const categoryController = {
  // Get all categories (public)
  getAllCategories: async (req, res) => {
    try {
      const { includeProducts = false, limit = 50 } = req.query;

      const categories = await prisma.category.findMany({
        where: { isActive: true },
        include: includeProducts === 'true' ? {
          products: {
            where: { 
              isActive: true, 
              isApproved: true,
              quantity: { gt: 0 }
            },
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              name: true,
              slug: true,
              price: true,
              images: true,
              vendor: {
                select: {
                  businessName: true
                }
              }
            }
          },
          _count: {
            select: {
              products: {
                where: { 
                  isActive: true, 
                  isApproved: true,
                  quantity: { gt: 0 }
                }
              }
            }
          }
        } : {
          _count: {
            select: {
              products: {
                where: { 
                  isActive: true, 
                  isApproved: true,
                  quantity: { gt: 0 }
                }
              }
            }
          }
        },
        orderBy: { sortOrder: 'asc' },
        take: parseInt(limit)
      });

      // Build hierarchical structure
      const buildCategoryTree = (categories, parentId = null) => {
        return categories
          .filter(category => category.parentId === parentId)
          .map(category => ({
            ...category,
            children: buildCategoryTree(categories, category.id)
          }));
      };

      const categoryTree = buildCategoryTree(categories);

      res.json({
        success: true,
        data: categoryTree
      });

    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch categories',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Get single category by ID or slug
  getCategory: async (req, res) => {
    try {
      const { id } = req.params;
      const { includeProducts = true, page = 1, limit = 20 } = req.query;
      const skip = (page - 1) * limit;

      // Check if ID is UUID or slug
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

      const where = isUUID 
        ? { id, isActive: true }
        : { slug: id, isActive: true };

      const category = await prisma.category.findUnique({
        where,
        include: {
          _count: {
            select: {
              products: {
                where: { 
                  isActive: true, 
                  isApproved: true,
                  quantity: { gt: 0 }
                }
              }
            }
          }
        }
      });

      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Category not found'
        });
      }

      let products = [];
      let productCount = 0;

      if (includeProducts === 'true') {
        // Get products in this category
        [products, productCount] = await Promise.all([
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

        // Calculate average ratings
        products = await Promise.all(
          products.map(async (product) => {
            const reviews = await prisma.review.aggregate({
              where: { productId: product.id },
              _avg: { rating: true }
            });

            return {
              ...product,
              averageRating: reviews._avg.rating || 0
            };
          })
        );
      }

      // Get subcategories
      const subcategories = await prisma.category.findMany({
        where: {
          parentId: category.id,
          isActive: true
        },
        include: {
          _count: {
            select: {
              products: {
                where: { 
                  isActive: true, 
                  isApproved: true,
                  quantity: { gt: 0 }
                }
              }
            }
          }
        },
        orderBy: { sortOrder: 'asc' }
      });

      // Get parent category if exists
      let parentCategory = null;
      if (category.parentId) {
        parentCategory = await prisma.category.findUnique({
          where: { id: category.parentId },
          select: {
            id: true,
            name: true,
            slug: true
          }
        });
      }

      // Get sibling categories
      const siblingCategories = await prisma.category.findMany({
        where: {
          parentId: category.parentId,
          id: { not: category.id },
          isActive: true
        },
        include: {
          _count: {
            select: {
              products: {
                where: { 
                  isActive: true, 
                  isApproved: true,
                  quantity: { gt: 0 }
                }
              }
            }
          }
        },
        orderBy: { sortOrder: 'asc' },
        take: 5
      });

      res.json({
        success: true,
        data: {
          ...category,
          parent: parentCategory,
          subcategories,
          siblings: siblingCategories,
          ...(includeProducts === 'true' && {
            products: {
              data: products,
              pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: productCount,
                pages: Math.ceil(productCount / limit)
              }
            }
          })
        }
      });

    } catch (error) {
      console.error('Get category error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch category'
      });
    }
  },

  // Create category (admin only)
  createCategory: async (req, res) => {
    try {
      const { name, description, parentId, sortOrder = 0 } = req.body;
      const image = req.file ? req.file.path : null;

      if (!name) {
        // Delete uploaded image if validation fails
        if (image) deleteFile(image);
        
        return res.status(400).json({
          success: false,
          message: 'Category name is required'
        });
      }

      // Generate slug
      const slug = name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

      // Check if slug exists
      const existingCategory = await prisma.category.findUnique({
        where: { slug }
      });

      if (existingCategory) {
        // Delete uploaded image if slug exists
        if (image) deleteFile(image);
        
        return res.status(400).json({
          success: false,
          message: 'Category with similar name already exists'
        });
      }

      // Validate parent category if provided
      if (parentId) {
        const parentCategory = await prisma.category.findUnique({
          where: { id: parentId }
        });

        if (!parentCategory) {
          if (image) deleteFile(image);
          
          return res.status(400).json({
            success: false,
            message: 'Parent category not found'
          });
        }

        // Prevent circular reference (category cannot be its own parent)
        if (parentId === slug) {
          if (image) deleteFile(image);
          
          return res.status(400).json({
            success: false,
            message: 'Category cannot be its own parent'
          });
        }
      }

      const category = await prisma.category.create({
        data: {
          name,
          slug,
          description,
          image,
          parentId,
          sortOrder: parseInt(sortOrder),
          isActive: true
        }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'CREATE',
          entity: 'CATEGORY',
          entityId: category.id,
          changes: JSON.stringify({ name, slug, parentId }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      res.status(201).json({
        success: true,
        message: 'Category created successfully',
        data: category
      });

    } catch (error) {
      console.error('Create category error:', error);
      
      // Delete uploaded image on error
      if (req.file) deleteFile(req.file.path);
      
      res.status(500).json({
        success: false,
        message: 'Failed to create category',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Update category (admin only)
  updateCategory: async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const image = req.file ? req.file.path : null;

      // Check if category exists
      const category = await prisma.category.findUnique({
        where: { id }
      });

      if (!category) {
        // Delete uploaded image if category not found
        if (image) deleteFile(image);
        
        return res.status(404).json({
          success: false,
          message: 'Category not found'
        });
      }

      // Generate new slug if name changed
      if (updates.name && updates.name !== category.name) {
        updates.slug = updates.name
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-');

        // Check if new slug exists (excluding current category)
        const existingSlug = await prisma.category.findFirst({
          where: {
            slug: updates.slug,
            id: { not: id }
          }
        });

        if (existingSlug) {
          if (image) deleteFile(image);
          
          return res.status(400).json({
            success: false,
            message: 'Category with this name already exists'
          });
        }
      }

      // Validate parent category if changing
      if (updates.parentId !== undefined) {
        // Prevent setting parent to itself
        if (updates.parentId === id) {
          if (image) deleteFile(image);
          
          return res.status(400).json({
            success: false,
            message: 'Category cannot be its own parent'
          });
        }

        // Check if parent exists
        if (updates.parentId) {
          const parentCategory = await prisma.category.findUnique({
            where: { id: updates.parentId }
          });

          if (!parentCategory) {
            if (image) deleteFile(image);
            
            return res.status(400).json({
              success: false,
              message: 'Parent category not found'
            });
          }

          // Prevent circular reference (check hierarchy)
          const isCircular = await checkCircularReference(id, updates.parentId);
          if (isCircular) {
            if (image) deleteFile(image);
            
            return res.status(400).json({
              success: false,
              message: 'Circular reference detected in category hierarchy'
            });
          }
        }
      }

      // Prepare update data
      const updateData = { ...updates };
      if (image) {
        updateData.image = image;
        // Delete old image if exists
        if (category.image) deleteFile(category.image);
      }

      // Parse numeric fields
      if (updates.sortOrder !== undefined) {
        updateData.sortOrder = parseInt(updates.sortOrder);
      }

      // Update category
      const updatedCategory = await prisma.category.update({
        where: { id },
        data: updateData
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'UPDATE',
          entity: 'CATEGORY',
          entityId: id,
          changes: JSON.stringify(updates),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      res.json({
        success: true,
        message: 'Category updated successfully',
        data: updatedCategory
      });

    } catch (error) {
      console.error('Update category error:', error);
      
      // Delete uploaded image on error
      if (req.file) deleteFile(req.file.path);
      
      res.status(500).json({
        success: false,
        message: 'Failed to update category'
      });
    }
  },

  // Delete category (admin only - soft delete)
  deleteCategory: async (req, res) => {
    try {
      const { id } = req.params;
      const { moveProductsTo } = req.query;

      // Check if category exists
      const category = await prisma.category.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              products: true,
              children: true
            }
          }
        }
      });

      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Category not found'
        });
      }

      // Check if category has products
      if (category._count.products > 0) {
        if (!moveProductsTo) {
          return res.status(400).json({
            success: false,
            message: `Category has ${category._count.products} product(s). Specify a target category to move products to or delete products first.`,
            requiresAction: true,
            productCount: category._count.products
          });
        }

        // Validate target category
        const targetCategory = await prisma.category.findUnique({
          where: { id: moveProductsTo }
        });

        if (!targetCategory) {
          return res.status(400).json({
            success: false,
            message: 'Target category not found'
          });
        }

        // Move products to new category
        await prisma.product.updateMany({
          where: { categoryId: id },
          data: { categoryId: moveProductsTo }
        });
      }

      // Check if category has subcategories
      if (category._count.children > 0) {
        if (!moveProductsTo) {
          return res.status(400).json({
            success: false,
            message: `Category has ${category._count.children} subcategory(ies). Move or delete subcategories first.`,
            requiresAction: true,
            subcategoryCount: category._count.children
          });
        }

        // Move subcategories to root or new parent
        await prisma.category.updateMany({
          where: { parentId: id },
          data: { parentId: moveProductsTo === 'root' ? null : moveProductsTo }
        });
      }

      // Soft delete category
      await prisma.category.update({
        where: { id },
        data: { isActive: false }
      });

      // Delete image file if exists
      if (category.image) deleteFile(category.image);

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'DELETE',
          entity: 'CATEGORY',
          entityId: id,
          changes: JSON.stringify({
            movedProductsTo: moveProductsTo,
            productCount: category._count.products,
            subcategoryCount: category._count.children
          }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      res.json({
        success: true,
        message: 'Category deleted successfully',
        data: {
          movedProducts: category._count.products,
          movedSubcategories: category._count.children
        }
      });

    } catch (error) {
      console.error('Delete category error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete category'
      });
    }
  },

  // Get category tree (for dropdowns)
  getCategoryTree: async (req, res) => {
    try {
      const { includeDisabled = false } = req.query;

      const where = includeDisabled === 'true' ? {} : { isActive: true };

      const categories = await prisma.category.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          image: true,
          parentId: true,
          sortOrder: true,
          isActive: true
        },
        orderBy: { sortOrder: 'asc' }
      });

      // Build hierarchical tree
      const buildTree = (items, parentId = null) => {
        return items
          .filter(item => item.parentId === parentId)
          .map(item => ({
            value: item.id,
            label: item.name,
            slug: item.slug,
            image: item.image,
            disabled: !item.isActive,
            children: buildTree(items, item.id)
          }));
      };

      const categoryTree = buildTree(categories);

      // Also return flat list for reference
      const flatList = categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        parentId: cat.parentId,
        level: calculateCategoryLevel(categories, cat.id),
        hasChildren: categories.some(c => c.parentId === cat.id)
      }));

      res.json({
        success: true,
        data: {
          tree: categoryTree,
          flat: flatList
        }
      });

    } catch (error) {
      console.error('Get category tree error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch category tree'
      });
    }
  },

  // Search categories
  searchCategories: async (req, res) => {
    try {
      const { q, limit = 10 } = req.query;

      if (!q || q.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Search query must be at least 2 characters'
        });
      }

      const categories = await prisma.category.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q, mode: 'insensitive' } }
          ]
        },
        include: {
          _count: {
            select: {
              products: {
                where: { 
                  isActive: true, 
                  isApproved: true,
                  quantity: { gt: 0 }
                }
              }
            }
          },
          parent: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          }
        },
        take: parseInt(limit),
        orderBy: { sortOrder: 'asc' }
      });

      res.json({
        success: true,
        data: categories,
        count: categories.length
      });

    } catch (error) {
      console.error('Search categories error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search categories'
      });
    }
  },

  // Bulk update category order
  bulkUpdateCategoryOrder: async (req, res) => {
    try {
      const { updates } = req.body; // Array of { id, sortOrder, parentId }

      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Updates array is required'
        });
      }

      // Validate all categories exist
      const categoryIds = updates.map(update => update.id);
      const existingCategories = await prisma.category.findMany({
        where: { id: { in: categoryIds } }
      });

      if (existingCategories.length !== updates.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more categories not found'
        });
      }

      // Process updates in transaction
      const results = await prisma.$transaction(
        updates.map(update =>
          prisma.category.update({
            where: { id: update.id },
            data: {
              sortOrder: update.sortOrder,
              parentId: update.parentId || null
            }
          })
        )
      );

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'BULK_UPDATE_ORDER',
          entity: 'CATEGORY',
          changes: JSON.stringify({ updateCount: updates.length }),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      res.json({
        success: true,
        message: `Updated order for ${results.length} categories`,
        data: results
      });

    } catch (error) {
      console.error('Bulk update category order error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update category order'
      });
    }
  },

  // Get popular categories (based on product count)
  getPopularCategories: async (req, res) => {
    try {
      const { limit = 10 } = req.query;

      // Get categories with most active products
      const categories = await prisma.category.findMany({
        where: { isActive: true },
        include: {
          _count: {
            select: {
              products: {
                where: { 
                  isActive: true, 
                  isApproved: true,
                  quantity: { gt: 0 }
                }
              }
            }
          },
          products: {
            where: { 
              isActive: true, 
              isApproved: true,
              quantity: { gt: 0 },
              isFeatured: true
            },
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              name: true,
              images: true,
              price: true
            }
          }
        },
        orderBy: {
          products: {
            _count: 'desc'
          }
        },
        take: parseInt(limit)
      });

      // Format response
      const popularCategories = categories.map(category => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        image: category.image,
        productCount: category._count.products,
        featuredProduct: category.products[0] || null
      }));

      res.json({
        success: true,
        data: popularCategories
      });

    } catch (error) {
      console.error('Get popular categories error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch popular categories'
      });
    }
  },

  // Get category statistics (admin only)
  getCategoryStats: async (req, res) => {
    try {
      const stats = await prisma.category.aggregate({
        where: { isActive: true },
        _count: true,
        _min: { createdAt: true },
        _max: { createdAt: true }
      });

      // Get categories with product counts
      const categoriesWithCounts = await prisma.category.findMany({
        where: { isActive: true },
        include: {
          _count: {
            select: {
              products: {
                where: { isActive: true }
              }
            }
          }
        },
        orderBy: {
          products: {
            _count: 'desc'
          }
        },
        take: 10
      });

      // Calculate distribution
      const distribution = categoriesWithCounts.map(cat => ({
        name: cat.name,
        productCount: cat._count.products,
        percentage: 0 // Will calculate below
      }));

      // Get total products
      const totalProducts = await prisma.product.count({
        where: { isActive: true }
      });

      // Calculate percentages
      if (totalProducts > 0) {
        distribution.forEach(item => {
          item.percentage = ((item.productCount / totalProducts) * 100).toFixed(1);
        });
      }

      res.json({
        success: true,
        data: {
          totalCategories: stats._count,
          firstCategory: stats._min.createdAt,
          latestCategory: stats._max.createdAt,
          topCategories: distribution,
          totalProducts
        }
      });

    } catch (error) {
      console.error('Get category stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch category statistics'
      });
    }
  }
};

// Helper function to check circular reference in category hierarchy
const checkCircularReference = async (categoryId, potentialParentId) => {
  let currentId = potentialParentId;
  const visited = new Set([categoryId]);

  while (currentId) {
    if (visited.has(currentId)) {
      return true; // Circular reference detected
    }

    visited.add(currentId);

    const parent = await prisma.category.findUnique({
      where: { id: currentId },
      select: { parentId: true }
    });

    if (!parent || !parent.parentId) {
      break;
    }

    currentId = parent.parentId;
  }

  return false;
};

// Helper function to calculate category level in hierarchy
const calculateCategoryLevel = (categories, categoryId, level = 0) => {
  const category = categories.find(c => c.id === categoryId);
  
  if (!category || !category.parentId) {
    return level;
  }

  return calculateCategoryLevel(categories, category.parentId, level + 1);
};

module.exports = categoryController;