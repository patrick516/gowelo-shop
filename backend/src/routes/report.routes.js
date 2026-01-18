const express = require("express");
const router = express.Router();
const {
  productPerformance,
  exportExcel,
  exportPDF,
  dailySalesSummary,
} = require("../controllers/report.controller");

// GET JSON report
router.get("/products", productPerformance);

// Export to Excel
router.get("/export/excel", exportExcel);

// Export to PDF
router.get("/export/pdf", exportPDF);
router.get("/daily-sales", dailySalesSummary);

module.exports = router;
