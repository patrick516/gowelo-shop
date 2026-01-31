const StockBatch = require("../models/StockBatch");
const Product = require("../models/Product");
const Alert = require("../models/Alert");
const Admin = require("../models/Admin");
const Brevo = require("@getbrevo/brevo"); // Brevo transactional emails

// Initialize Brevo
const brevoClient = new Brevo.TransactionalEmailsApi();
brevoClient.setApiKey(
  Brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY,
);

/**
 * Replenish stock for a product
 * - If current stock exists → new batch is PENDING
 * - If no current stock → new batch is ACTIVE
 * - Clears old LOW_STOCK / OUT_OF_STOCK alerts
 * - Sends alert & email if batch becomes ACTIVE
 */
exports.replenishStock = async (req, res) => {
  try {
    const { productId, quantity, costPrice, sellingPrice } = req.body;

    // -----------------------------
    // 1. Validation
    // -----------------------------
    if (
      !productId ||
      quantity == null ||
      costPrice == null ||
      sellingPrice == null
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (quantity <= 0 || costPrice <= 0 || sellingPrice <= 0) {
      return res
        .status(400)
        .json({ message: "Quantity and prices must be greater than zero" });
    }

    // -----------------------------
    // 2. Product check
    // -----------------------------
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // -----------------------------
    // 3. Determine batch status
    // -----------------------------
    const hasActiveStock = product.quantity > 0;
    const status = hasActiveStock ? "PENDING" : "ACTIVE";

    // -----------------------------
    // 4. Create stock batch
    // -----------------------------
    const batch = await StockBatch.create({
      productId,
      quantityRemaining: quantity,
      costPrice,
      sellingPrice,
      status,
    });

    // -----------------------------
    // 5. If no active stock, activate batch immediately
    // -----------------------------
    if (!hasActiveStock) {
      product.quantity = (product.quantity || 0) + quantity;
      product.costPrice = costPrice;
      product.sellingPrice = sellingPrice;
      await product.save();

      // -----------------------------
      // 5a. Create alert
      // -----------------------------
      await Alert.create({
        productId,
        type: "REPLENISH_READY",
        quantityRemainingAtTrigger: quantity,
        replenishmentId: batch._id,
      });

      // -----------------------------
      // 5b. Send email to all admins
      // -----------------------------
      const admins = await Admin.find({}, "email");
      const adminEmails = admins.map((a) => a.email);

      if (adminEmails.length > 0) {
        await brevoClient.sendTransacEmail({
          sender: {
            email: "no-reply@yourdomain.com",
            name: "Inventory System",
          },
          to: adminEmails.map((email) => ({ email })),
          subject: `Product ${product.name} Replenishment Ready`,
          htmlContent: `<p>The replenished batch for <b>${product.name}</b> is now <b>ACTIVE</b> and ready to be sold. Quantity: ${batch.quantityRemaining}</p>`,
        });
      }
    }

    // -----------------------------
    // 6. Clear old LOW_STOCK / OUT_OF_STOCK alerts
    // -----------------------------
    await Alert.deleteMany({
      productId,
      type: { $in: ["LOW_STOCK", "OUT_OF_STOCK"] },
    });

    res.status(201).json({
      message: "Stock replenished successfully",
      batch,
      currentStock: product.quantity,
      status,
    });
  } catch (error) {
    console.error("Replenish error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get all stock batches
 */
exports.getReplenishments = async (req, res) => {
  try {
    const batches = await StockBatch.find()
      .populate("productId", "name")
      .sort({ replenishedAt: -1 });

    const result = batches.map((b) => ({
      product: b.productId?.name || "Deleted product",
      quantityRemaining: b.quantityRemaining,
      costPrice: b.costPrice,
      sellingPrice: b.sellingPrice,
      status: b.status,
      replenishedAt: b.replenishedAt,
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
