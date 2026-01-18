const StockBatch = require("../models/StockBatch");
const Product = require("../models/Product");

exports.replenishStock = async (req, res) => {
  try {
    const { productId, quantity, costPrice, sellingPrice } = req.body;

    if (!productId || !quantity || !costPrice || !sellingPrice) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const batch = await StockBatch.create({
      productId,
      quantityRemaining: quantity,
      costPrice,
      sellingPrice,
    });

    res.status(201).json(batch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getReplenishments = async (req, res) => {
  try {
    const batches = await StockBatch.find().populate("productId", "name");
    const result = batches.map((b) => ({
      product: b.productId.name,
      quantityRemaining: b.quantityRemaining,
      costPrice: b.costPrice,
      sellingPrice: b.sellingPrice,
      replenishedAt: b.replenishedAt,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
