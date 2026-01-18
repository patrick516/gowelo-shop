const StockBatch = require("../models/StockBatch");
const Sale = require("../models/Sale");
const Alert = require("../models/Alert");
const Product = require("../models/Product");
const Customer = require("../models/Customer"); // new

/**
 * Sell product
 * @body productId, quantity, customerId (optional for credit), isCredit (boolean)
 */
exports.sellProduct = async (req, res) => {
  try {
    const { productId, quantity, customerId, isCredit = false } = req.body;

    if (!productId || !quantity || quantity <= 0) {
      return res
        .status(400)
        .json({ message: "Product and valid quantity required" });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    let customer = null;
    if (isCredit) {
      if (!customerId)
        return res
          .status(400)
          .json({ message: "Customer ID required for credit sale" });

      customer = await Customer.findById(customerId);
      if (!customer)
        return res.status(404).json({ message: "Customer not found" });
    }

    // -----------------------------
    // 1. Sell from StockBatch (FIFO)
    // -----------------------------
    const batches = await StockBatch.find({
      productId,
      quantityRemaining: { $gt: 0 },
    }).sort({ replenishedAt: 1 });

    let remainingToSell = quantity;
    const salesRecords = [];

    if (batches.length > 0) {
      for (const batch of batches) {
        if (remainingToSell <= 0) break;

        const sellQty = Math.min(batch.quantityRemaining, remainingToSell);

        batch.quantityRemaining -= sellQty;
        remainingToSell -= sellQty;
        await batch.save();

        const totalPrice = sellQty * batch.sellingPrice;
        const balance = isCredit ? totalPrice : 0;

        const sale = await Sale.create({
          productId,
          batchId: batch._id,
          customerId: customer?._id,
          quantitySold: sellQty,
          costPrice: batch.costPrice,
          sellingPrice: batch.sellingPrice,
          totalPrice,
          balance,
          isPaid: !isCredit,
        });

        salesRecords.push(sale);

        // Update customer debt if credit
        if (isCredit && customer) {
          customer.totalDebt = (customer.totalDebt || 0) + balance;
        }
      }

      if (remainingToSell > 0) {
        return res.status(400).json({ message: "Not enough stock" });
      }
    } else {
      // -----------------------------
      // 2. Fallback: Product.quantity
      // -----------------------------
      if (product.quantity < quantity)
        return res.status(400).json({ message: "Out of stock" });

      const totalPrice = quantity * product.sellingPrice;
      const balance = isCredit ? totalPrice : 0;

      const sale = await Sale.create({
        productId,
        quantitySold: quantity,
        customerId: customer?._id,
        costPrice: product.costPrice,
        sellingPrice: product.sellingPrice,
        totalPrice,
        balance,
        isPaid: !isCredit,
      });

      salesRecords.push(sale);

      if (isCredit && customer) {
        customer.totalDebt = (customer.totalDebt || 0) + balance;
      }
    }

    // -----------------------------
    // 3. Update Product quantity
    // -----------------------------
    product.quantity -= quantity;
    await product.save();

    if (isCredit && customer) await customer.save();

    // -----------------------------
    // 4. Stock alerts
    // -----------------------------
    if (product.quantity === 0) {
      await Alert.create({ productId, type: "OUT_OF_STOCK" });
    } else if (product.quantity <= 5) {
      await Alert.create({ productId, type: "LOW_STOCK" });
    }

    res.status(201).json({
      message: "Sale completed successfully",
      sales: salesRecords,
      remainingStock: product.quantity,
      customerDebt: customer?.totalDebt || 0, // send debt info for frontend toast
    });
  } catch (error) {
    console.error("Sale error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
