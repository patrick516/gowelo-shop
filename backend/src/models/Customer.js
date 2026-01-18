const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    balance: {
      type: Number,
      default: 0, // total debt
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Customer", customerSchema);
