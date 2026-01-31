const Product = require("../models/Product");
const StockBatch = require("../models/StockBatch");

// Create product + initial stock batch
exports.createProduct = async (req, res) => {
  try {
    const { name, quantity, costPrice, sellingPrice } = req.body;

    if (
      !name ||
      quantity === undefined ||
      costPrice === undefined ||
      sellingPrice === undefined
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (quantity < 0 || costPrice < 0 || sellingPrice < 0) {
      return res.status(400).json({ message: "Invalid values" });
    }

    const existing = await Product.findOne({ name });
    if (existing) {
      return res.status(409).json({ message: "Product already exists" });
    }

    const product = await Product.create({
      name,
      quantity,
      costPrice,
      sellingPrice,
    });

    //  AUTO CREATE STOCK BATCH
    if (quantity > 0) {
      await StockBatch.create({
        productId: product._id,
        quantityRemaining: quantity,
        costPrice,
        sellingPrice,
      });
    }

    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all products
exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// Delete product safely
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check remaining stock in batches
    const activeBatches = await StockBatch.find({
      productId: id,
      quantityRemaining: { $gt: 0 },
    });

    if (activeBatches.length > 0) {
      return res.status(400).json({
        message:
          "Cannot delete product. Stock still available. Sell out stock first.",
      });
    }

    await Product.findByIdAndDelete(id);
    await StockBatch.deleteMany({ productId: id });

    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
