const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    type: {
      type: String,
      enum: ["LOW_STOCK", "OUT_OF_STOCK", "REPLENISH_READY"],
      required: true,
    },
    quantityRemainingAtTrigger: {
      type: Number,
      default: 0,
    },
    replenishmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockBatch",
      default: null,
    },
    isEmailSent: {
      type: Boolean,
      default: false,
    },
    resolved: {
      type: Boolean,
      default: false,
    },
    triggeredAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Alert", alertSchema);
