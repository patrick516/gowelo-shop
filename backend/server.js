const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Routes
const productRoutes = require("./src/routes/product.routes");
const replenishRoutes = require("./src/routes/replenishment.routes");
const saleRoutes = require("./src/routes/sale.routes");
const dashboardRoutes = require("./src/routes/dashboard.routes");
const reportRoutes = require("./src/routes/report.routes");
const authRoutes = require("./src/routes/auth.routes");
const customerRoutes = require("./src/routes/customer.routes");

// JWT middleware
const { protect } = require("./src/middleware/auth");

// Public routes (no auth required)
app.use("/api/auth", authRoutes);

// Protected routes (require login)
app.use("/api/products", protect, productRoutes);
app.use("/api/replenish", protect, replenishRoutes);
app.use("/api/sales", protect, saleRoutes);
app.use("/api/dashboard", protect, dashboardRoutes);
app.use("/api/reports", protect, reportRoutes);
app.use("/api/customers", customerRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("Chicken Shop API running...");
});

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
