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
