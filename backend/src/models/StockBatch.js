// backend/src/models/StockBatch.js
const mongoose = require("mongoose");

const stockBatchSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantityRemaining: {
      type: Number,
      required: true,
      min: 0,
    },
    costPrice: {
      type: Number,
      required: true,
    },
    sellingPrice: {
      type: Number,
      required: true,
    },
    replenishedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["PENDING", "ACTIVE", "SOLD_OUT"],
      default: "ACTIVE", // default batch is active and available for selling
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("StockBatch", stockBatchSchema);
