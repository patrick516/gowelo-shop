// src/controllers/dashboard.controller.js
const Product = require("../models/Product");
const StockBatch = require("../models/StockBatch");
const Sale = require("../models/Sale");
const Customer = require("../models/Customer"); // ✅ NEW for debtors

exports.getDashboardStats = async (req, res) => {
  try {
    const stats = await Sale.aggregate([
      {
        $group: {
          _id: null,
          totalQuantitySold: { $sum: "$quantitySold" },
          totalRevenue: {
            $sum: { $multiply: ["$quantitySold", "$sellingPrice"] },
          },
          totalCost: {
            $sum: { $multiply: ["$quantitySold", "$costPrice"] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalQuantitySold: 1,
          totalRevenue: 1,
          totalCost: 1,
          profit: { $subtract: ["$totalRevenue", "$totalCost"] },
        },
      },
    ]);

    res.json(
      stats[0] || {
        totalQuantitySold: 0,
        totalRevenue: 0,
        totalCost: 0,
        profit: 0,
      },
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.pieChart = async (req, res) => {
  try {
    const products = await Product.find({}, { name: 1, quantity: 1 }).sort({
      name: 1,
    });

    const data = products.map((p) => ({
      name: p.name,
      value: p.quantity,
      status:
        p.quantity === 0
          ? "OUT_OF_STOCK"
          : p.quantity <= 5
            ? "LOW_STOCK"
            : "AVAILABLE",
    }));

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.barChart = async (req, res) => {
  try {
    const { range = "today" } = req.query;

    const startDate = new Date();
    if (range === "yesterday") {
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
    } else if (range === "week") {
      startDate.setDate(startDate.getDate() - 7);
    } else if (range === "month") {
      startDate.setMonth(startDate.getMonth() - 1);
    } else {
      startDate.setHours(0, 0, 0, 0);
    }

    const data = await Sale.aggregate([
      { $match: { soldAt: { $gte: startDate } } },
      {
        $group: {
          _id: "$productId",
          sold: { $sum: "$quantitySold" },
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $project: {
          product: "$product.name",
          sold: 1,
        },
      },
      { $sort: { sold: -1 } },
    ]);

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.lineChart = async (req, res) => {
  try {
    const { period = "daily" } = req.query;

    let dateFormat = "%Y-%m-%d";
    if (period === "weekly") dateFormat = "%Y-%U";
    if (period === "monthly") dateFormat = "%Y-%m";

    const data = await Sale.aggregate([
      {
        $group: {
          _id: {
            $dateToString: {
              format: dateFormat,
              date: "$soldAt",
            },
          },
          sold: { $sum: "$quantitySold" },
          revenue: { $sum: { $multiply: ["$quantitySold", "$sellingPrice"] } },
          cost: { $sum: { $multiply: ["$quantitySold", "$costPrice"] } },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
          sales: "$sold",
          revenue: 1,
          profit: { $subtract: ["$revenue", "$cost"] },
        },
      },
      { $sort: { date: 1 } },
    ]);

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.summary = async (req, res) => {
  try {
    // Total products
    const totalProducts = await Product.countDocuments({});

    // Total sales and profit
    const salesData = await Sale.aggregate([
      {
        $group: {
          _id: null,
          totalSold: { $sum: "$quantitySold" },
          totalRevenue: {
            $sum: { $multiply: ["$quantitySold", "$sellingPrice"] },
          },
          totalCost: { $sum: { $multiply: ["$quantitySold", "$costPrice"] } },
        },
      },
    ]);

    const totalSales = salesData[0]?.totalSold || 0;
    const totalRevenue = salesData[0]?.totalRevenue || 0;
    const totalProfit =
      (salesData[0]?.totalRevenue || 0) - (salesData[0]?.totalCost || 0);

    // Total replenishment
    const totalReplenishment = await StockBatch.aggregate([
      { $group: { _id: null, total: { $sum: "$quantityAdded" } } },
    ]);

    // ✅ Total debtors
    const totalDebtors = await Customer.countDocuments({ balance: { $gt: 0 } });

    res.json({
      totalProducts,
      totalSales,
      totalRevenue,
      totalProfit,
      totalReplenishment: totalReplenishment[0]?.total || 0,
      totalDebtors, // ✅ added to summary
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getProductsSold = async (req, res) => {
  try {
    const products = await Product.find();

    const result = await Promise.all(
      products.map(async (product) => {
        const soldAgg = await Sale.aggregate([
          { $match: { productId: product._id } },
          { $group: { _id: null, totalSold: { $sum: "$quantitySold" } } },
        ]);

        const soldQty = soldAgg[0]?.totalSold || 0;

        return {
          name: product.name,
          quantity: product.quantity,
          sold: soldQty,
        };
      }),
    );

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch products sold" });
  }
};
