const StockBatch = require("../models/StockBatch");
const Sale = require("../models/Sale");
const Alert = require("../models/Alert");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const Admin = require("../models/Admin");
const Brevo = require("@getbrevo/brevo"); // Brevo transactional emails

const brevoClient = new Brevo.TransactionalEmailsApi();
brevoClient.setApiKey(
  Brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY,
);

/**
 * Sell product (FIFO)
 * @body productId, quantity, customerId?, isCredit?
 */
exports.sellProduct = async (req, res) => {
  try {
    const { productId, quantity, customerId, isCredit = false } = req.body;

    // -----------------------------
    // 1. Validation
    // -----------------------------
    if (!productId || quantity == null || quantity <= 0) {
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
    // 2. Stock availability check
    // -----------------------------
    if (product.quantity < quantity)
      return res.status(400).json({ message: "Not enough stock available" });

    // -----------------------------
    // 3. FIFO batch selling
    // -----------------------------
    const batches = await StockBatch.find({
      productId,
      quantityRemaining: { $gt: 0 },
    }).sort({ replenishedAt: 1 });
    let remainingToSell = quantity;
    const salesRecords = [];

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

      if (isCredit && customer) {
        customer.totalDebt = (customer.totalDebt || 0) + balance;
      }
    }

    // -----------------------------
    // 4. Final safety check
    // -----------------------------
    if (remainingToSell > 0)
      return res.status(400).json({ message: "Stock inconsistency detected" });

    // -----------------------------
    // 5. Update product quantity
    // -----------------------------
    product.quantity -= quantity;
    await product.save();
    if (isCredit && customer) await customer.save();

    // -----------------------------
    // 6. Get all admin emails
    // -----------------------------
    const admins = await Admin.find({}, "email");
    const adminEmails = admins.map((a) => a.email);

    // -----------------------------
    // 7. Stock alerts & emails
    // -----------------------------
    if (product.quantity === 0) {
      await Alert.create({ productId, type: "OUT_OF_STOCK" });

      const pendingBatches = await StockBatch.find({
        productId,
        status: "PENDING",
      });
      for (const batch of pendingBatches) {
        batch.status = "ACTIVE";
        await batch.save();

        await Alert.create({
          productId,
          type: "REPLENISH_READY",
          quantityRemainingAtTrigger: batch.quantityRemaining,
          replenishmentId: batch._id,
        });

        // Send email to all admins
        if (adminEmails.length > 0) {
          await brevoClient.sendTransacEmail({
            sender: {
              email: "no-reply@yourdomain.com",
              name: "Inventory System",
            },
            to: adminEmails.map((email) => ({ email })),
            subject: `Product ${product.name} Replenishment Ready`,
            htmlContent: `<p>The previously replenished batch for <b>${product.name}</b> is now ACTIVE and ready to be sold. Quantity: ${batch.quantityRemaining}</p>`,
          });
        }
      }
    } else if (product.quantity === 1) {
      await Alert.create({
        productId,
        type: "LOW_STOCK",
        message: "Only 1 left, please replenish",
      });

      if (adminEmails.length > 0) {
        await brevoClient.sendTransacEmail({
          sender: {
            email: "no-reply@yourdomain.com",
            name: "Inventory System",
          },
          to: adminEmails.map((email) => ({ email })),
          subject: `Product ${product.name} Low Stock`,
          htmlContent: `<p>Only 1 unit of <b>${product.name}</b> is remaining. Please replenish stock.</p>`,
        });
      }
    } else if (product.quantity <= 5) {
      await Alert.create({ productId, type: "LOW_STOCK" });
    }

    res.status(201).json({
      message: "Sale completed successfully",
      sales: salesRecords,
      remainingStock: product.quantity,
      customerDebt: customer?.totalDebt || 0,
    });
  } catch (error) {
    console.error("Sale error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
