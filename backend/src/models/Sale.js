// backend/src/models/Sale.js
const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockBatch",
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer", // link to customer if it's a loan
    },
    quantitySold: {
      type: Number,
      required: true,
      min: 1,
    },
    costPrice: Number,
    sellingPrice: Number,
    totalPrice: { type: Number }, // sellingPrice * quantitySold
    balance: { type: Number, default: 0 }, // remaining debt if loan
    isPaid: { type: Boolean, default: true }, // false if sold on credit
    soldAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Sale", saleSchema);
