const mongoose = require("mongoose");

const debtTransactionSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    quantity: Number,
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ["BORROW", "PAYMENT"],
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("DebtTransaction", debtTransactionSchema);
