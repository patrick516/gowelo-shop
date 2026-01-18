const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

// Models
const Product = require("../models/Product");
const Sale = require("../models/Sale");
const StockBatch = require("../models/StockBatch");

/**
 * Helper function: fetch report data for all products
 */
const fetchReportData = async () => {
  const products = await Product.find();

  // Aggregate sold data from sales
  const sales = await Sale.aggregate([
    {
      $group: {
        _id: "$productId",
        soldQty: { $sum: "$quantitySold" },
        revenue: { $sum: { $multiply: ["$quantitySold", "$sellingPrice"] } },
        cost: { $sum: { $multiply: ["$quantitySold", "$costPrice"] } },
      },
    },
    {
      $addFields: { actualProfit: { $subtract: ["$revenue", "$cost"] } },
    },
  ]);

  // Aggregate expected data from stock batches
  const expected = await StockBatch.aggregate([
    {
      $group: {
        _id: "$productId",
        remainingQty: { $sum: "$quantityRemaining" },
        expectedRevenue: {
          $sum: { $multiply: ["$quantityRemaining", "$sellingPrice"] },
        },
        expectedCost: {
          $sum: { $multiply: ["$quantityRemaining", "$costPrice"] },
        },
      },
    },
    {
      $addFields: {
        expectedProfit: { $subtract: ["$expectedRevenue", "$expectedCost"] },
      },
    },
  ]);

  // Merge data
  return products.map((product) => {
    const sale = sales.find((s) => s._id.toString() === product._id.toString());
    const exp = expected.find(
      (e) => e._id.toString() === product._id.toString(),
    );

    return {
      product: product.name,
      soldQty: sale?.soldQty || 0,
      revenue: sale?.revenue || 0,
      cost: sale?.cost || 0,
      actualProfit: sale?.actualProfit || 0,
      remainingQty: exp?.remainingQty || 0,
      expectedProfit: exp?.expectedProfit || 0,
      totalPotentialProfit:
        (sale?.actualProfit || 0) + (exp?.expectedProfit || 0),
    };
  });
};

/**
 * GET /products
 * Return JSON report
 */
const productPerformance = async (req, res) => {
  try {
    const report = await fetchReportData();
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /export/excel
 * Export report as Excel file
 */
const exportExcel = async (req, res) => {
  try {
    const report = await fetchReportData();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Product Report");

    // Define columns
    sheet.columns = [
      { header: "Product", key: "product", width: 20 },
      { header: "Sold Quantity", key: "soldQty", width: 15 },
      { header: "Revenue", key: "revenue", width: 15 },
      { header: "Cost", key: "cost", width: 15 },
      { header: "Actual Profit", key: "actualProfit", width: 15 },
      { header: "Remaining Quantity", key: "remainingQty", width: 15 },
      { header: "Expected Profit", key: "expectedProfit", width: 15 },
      {
        header: "Total Potential Profit",
        key: "totalPotentialProfit",
        width: 20,
      },
    ];

    // Add rows
    report.forEach((row) => sheet.addRow(row));

    // Send file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", "attachment; filename=report.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /export/pdf
 * Export report as PDF file
 */
const exportPDF = async (req, res) => {
  try {
    const report = await fetchReportData();

    const doc = new PDFDocument({ margin: 30, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=report.pdf");
    doc.pipe(res);

    doc.fontSize(20).text("Product Report", { align: "center" }).moveDown();

    report.forEach((row) => {
      doc
        .fontSize(12)
        .text(`Product: ${row.product}`)
        .text(`Sold Qty: ${row.soldQty}`)
        .text(`Revenue: ${row.revenue}`)
        .text(`Cost: ${row.cost}`)
        .text(`Actual Profit: ${row.actualProfit}`)
        .text(`Remaining Qty: ${row.remainingQty}`)
        .text(`Expected Profit: ${row.expectedProfit}`)
        .text(`Total Potential Profit: ${row.totalPotentialProfit}`)
        .moveDown();
    });

    doc.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const dailySalesSummary = async (req, res) => {
  try {
    const summary = await Sale.aggregate([
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
          },
          totalQuantity: { $sum: "$quantitySold" },
          revenue: {
            $sum: { $multiply: ["$quantitySold", "$sellingPrice"] },
          },
          cost: {
            $sum: { $multiply: ["$quantitySold", "$costPrice"] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id.date",
          totalQuantity: 1,
          revenue: 1,
          cost: 1,
          profit: { $subtract: ["$revenue", "$cost"] },
        },
      },
      { $sort: { date: -1 } },
    ]);

    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Export functions
module.exports = {
  productPerformance,
  exportExcel,
  exportPDF,
  dailySalesSummary,
};
