const express = require("express");
const router = express.Router();

const {
  getDashboardStats,
  pieChart,
  barChart,
  lineChart,
  summary,
  getProductsSold,
} = require("../controllers/dashboard.controller");

router.get("/pie", pieChart);
router.get("/bar", barChart);
router.get("/line", lineChart);
router.get("/summary", summary);
router.get("/stats", getDashboardStats);
router.get("/products", getProductsSold);
module.exports = router;
