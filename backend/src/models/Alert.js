const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    type: {
      type: String,
      enum: ["LOW_STOCK", "OUT_OF_STOCK"],
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
