// backend/controllers/payment.controller.js
const Sale = require("../models/Sale");
const Customer = require("../models/Customer");
const { sendToastNotification } = require("../utils/toast"); // optional helper

// Record a payment for a debtor
exports.payDebt = async (req, res) => {
  try {
    const { saleId, amountPaid } = req.body;

    if (!saleId || !amountPaid) {
      return res.status(400).json({ message: "Sale ID and amount required" });
    }

    // Fetch the sale
    const sale = await Sale.findById(saleId);
    if (!sale) return res.status(404).json({ message: "Sale not found" });

    // Reduce outstanding amount
    sale.balance = (sale.balance || sale.totalPrice) - amountPaid;

    // Mark as fully paid if balance is 0
    if (sale.balance <= 0) {
      sale.isPaid = true;

      // Update customer debtor status
      const customer = await Customer.findById(sale.customerId);
      if (customer) {
        customer.isDebtor = false;
        await customer.save();
      }
    }

    await sale.save();

    res.json({ message: "Payment recorded successfully", sale });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to process payment" });
  }
};
