const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Product = require("../models/Product");
const StockBatch = require("../models/StockBatch");
const Sale = require("../models/Sale");
const DebtTransaction = require("../models/DebtTransaction");

/**
 * GET /customers/debtors
 * Returns all customers with non-zero balance
 */
exports.getDebtors = async (req, res) => {
  try {
    const debtors = await Customer.find({ balance: { $gt: 0 } }).sort({
      updatedAt: -1,
    });
    res.json(debtors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch debtors" });
  }
};

/**
 * POST /customers/credit-sale
 * Add a credit sale for a customer
 */
exports.creditSale = async (req, res) => {
  try {
    const { name, productId, quantity, amountPaid = 0 } = req.body;

    if (!name || !productId || quantity <= 0)
      return res.status(400).json({ message: "Invalid input" });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const totalAmount = product.sellingPrice * quantity;
    if (amountPaid > totalAmount)
      return res.status(400).json({ message: "Overpayment not allowed" });

    // Find or create customer
    let customer = await Customer.findOne({ name });
    if (!customer) customer = await Customer.create({ name });

    // --- STOCK REDUCTION (FIFO) ---
    let remainingQty = quantity;
    const batches = await StockBatch.find({
      productId,
      quantityRemaining: { $gt: 0 },
    }).sort({ replenishedAt: 1 });

    for (const batch of batches) {
      if (remainingQty <= 0) break;

      const sellQty = Math.min(batch.quantityRemaining, remainingQty);
      batch.quantityRemaining -= sellQty;
      remainingQty -= sellQty;
      await batch.save();

      await Sale.create({
        productId,
        batchId: batch._id,
        quantitySold: sellQty,
        costPrice: batch.costPrice,
        sellingPrice: batch.sellingPrice,
      });
    }

    if (remainingQty > 0)
      return res.status(400).json({ message: "Insufficient stock" });

    // Update product quantity
    product.quantity -= quantity;
    await product.save();

    // Update customer debt
    const debt = totalAmount - amountPaid;
    customer.balance += debt;
    await customer.save();

    // Record debt / payment
    if (debt > 0) {
      await DebtTransaction.create({
        customerId: customer._id,
        productId,
        quantity,
        amount: debt,
        type: "BORROW",
        createdAt: new Date(),
      });
    }

    if (amountPaid > 0) {
      await DebtTransaction.create({
        customerId: customer._id,
        amount: amountPaid,
        type: "PAYMENT",
        createdAt: new Date(),
      });
    }

    res.status(201).json({ message: "Credit sale recorded", customer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to record credit sale" });
  }
};

/**
 * POST /customers/pay-debt
 */
exports.payDebt = async (req, res) => {
  try {
    const { customerId, amount } = req.body;
    const customer = await Customer.findById(customerId);
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    if (amount <= 0 || amount > customer.balance)
      return res.status(400).json({ message: "Invalid payment amount" });

    customer.balance -= amount;
    await customer.save();

    await DebtTransaction.create({
      customerId,
      amount,
      type: "PAYMENT",
      createdAt: new Date(),
    });

    res.json({ message: "Payment successful", balance: customer.balance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Payment failed" });
  }
};

/**
 * POST /customers/borrow
 */
exports.borrowAgain = async (req, res) => {
  try {
    const { customerId, productId, quantity } = req.body;

    const product = await Product.findById(productId);
    const customer = await Customer.findById(customerId);

    if (!product || !customer || quantity <= 0)
      return res.status(400).json({ message: "Invalid request" });

    const amount = product.sellingPrice * quantity;
    customer.balance += amount;
    await customer.save();

    await DebtTransaction.create({
      customerId,
      productId,
      quantity,
      amount,
      type: "BORROW",
      createdAt: new Date(),
    });

    res.json({ message: "Debt increased", balance: customer.balance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Borrow failed" });
  }
};

exports.getCustomerHistory = async (req, res) => {
  try {
    const { customerId } = req.params;

    if (!customerId)
      return res.status(400).json({ message: "Missing customerId" });

    const customer = await Customer.findById(customerId);
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    // Convert customerId string to ObjectId
    const transactions = await DebtTransaction.find({
      customerId: new mongoose.Types.ObjectId(customerId),
    }).sort({ createdAt: -1 });

    // Map product names
    const detailedTransactions = await Promise.all(
      transactions.map(async (tx) => {
        let productName = null;
        if (tx.productId) {
          const product = await Product.findById(tx.productId);
          if (product) productName = product.name;
        }
        return {
          _id: tx._id,
          type: tx.type,
          amount: tx.amount,
          quantity: tx.quantity || null,
          productName,
          date: tx.createdAt,
        };
      }),
    );

    res.json({
      customer: {
        _id: customer._id,
        name: customer.name,
        balance: customer.balance,
      },
      transactions: detailedTransactions,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch history" });
  }
};
