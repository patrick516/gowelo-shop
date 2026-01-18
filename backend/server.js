const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();

const app = express();

// ✅ CORS configuration
const allowedOrigins = [
  "https://gowelo-shop.vercel.app",
  "http://localhost:5173",
]; // frontend URL
app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = `The CORS policy for this site does not allow access from the specified Origin.`;
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true, // allow cookies, authorization headers
  }),
);

// Middlewares
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
