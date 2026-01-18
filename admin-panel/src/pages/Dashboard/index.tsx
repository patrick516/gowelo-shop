// src/pages/Dashboard/index.tsx
import React, { useEffect, useState, useCallback } from "react";
import api from "../../services/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// Dashboard stats interface
interface DashboardStats {
  totalProducts: number;
  totalSales: number;
  totalRevenue: number;
  totalProfit: number;
  totalReplenishment: number;
}

// Chart data interfaces
interface SalesTrend {
  date: string;
  sales: number;
  revenue: number;
  profit: number;
}

// StockPie with index signature for Recharts
interface StockPie {
  name: string;
  value: number;
  [key: string]: any;
}

// Product Bar chart data interface
interface ProductBar {
  name: string;
  totalQty: number;
  soldQty: number;
}

// Pie chart colors
const PIE_COLORS = ["#60a5fa", "#facc15", "#4ade80", "#f87171", "#a78bfa"];

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalSales: 0,
    totalRevenue: 0,
    totalProfit: 0,
    totalReplenishment: 0,
  });

  const [salesTrend, setSalesTrend] = useState<SalesTrend[]>([]);
  const [stockPie, setStockPie] = useState<StockPie[]>([]);
  const [productBars, setProductBars] = useState<ProductBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      // 1️⃣ Summary stats
      const statsRes = await api.get("/dashboard/summary");
      const data = statsRes.data || {};
      setStats({
        totalProducts: data.totalProducts ?? 0,
        totalSales: data.totalSales ?? 0,
        totalRevenue: data.totalRevenue ?? 0,
        totalProfit: data.totalProfit ?? 0,
        totalReplenishment: data.totalReplenishment ?? 0,
      });

      // 2️⃣ Sales trends
      const trendsRes = await api.get("/dashboard/line");
      const trends = Array.isArray(trendsRes.data)
        ? trendsRes.data.map((item: any) => ({
            date: item._id,
            sales: item.sold ?? 0,
            revenue: item.revenue ?? 0,
            profit: item.profit ?? 0,
          }))
        : [];
      setSalesTrend(trends);

      // 3️⃣ Stock pie chart
      const stockRes = await api.get("/dashboard/pie");
      const pieData = Array.isArray(stockRes.data)
        ? stockRes.data.map((item: any) => ({
            name: item.name || "Unknown",
            value: Math.max(Number(item.quantity) || 0, 1),
          }))
        : [];
      setStockPie(pieData);

      // 4️⃣ Products sold bar chart
      const productsRes = await api.get("/dashboard/products"); // new backend endpoint
      const bars = Array.isArray(productsRes.data)
        ? productsRes.data.map((p: any) => ({
            name: p.name,
            totalQty: p.quantity ?? 0,
            soldQty: p.sold ?? 0,
          }))
        : [];
      setProductBars(bars);
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
      setError("Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (loading)
    return (
      <div className="p-4 text-center text-gray-500">Loading dashboard...</div>
    );

  if (error) return <div className="p-4 text-red-500 text-center">{error}</div>;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold mb-2">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(stats).map(([key, value]) => (
          <div
            key={key}
            className="bg-white shadow rounded p-4 flex justify-between items-center"
          >
            <span className="font-medium">
              {key
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (str) => str.toUpperCase())}
            </span>
            <span className="text-xl font-bold">
              {typeof value === "number" &&
              (key.toLowerCase().includes("revenue") ||
                key.toLowerCase().includes("profit"))
                ? `MK ${value.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : value}
            </span>
          </div>
        ))}
      </div>

      {/* Stock Pie Chart */}
      <div className="bg-white shadow rounded p-4 mt-4">
        <h2 className="font-semibold mb-2">Stock Distribution</h2>
        {stockPie.length === 0 ? (
          <p className="text-gray-500">No stock data available</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stockPie}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, value }) => `${name}: ${value} units`}
              >
                {stockPie.map((_, index) => (
                  <Cell
                    key={index}
                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `${value} units`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Sales Trends Line Chart */}
      <div className="bg-white shadow rounded p-4 mt-4">
        <h2 className="font-semibold mb-2">Sales Trends</h2>
        {salesTrend.length === 0 ? (
          <p className="text-gray-500">No sales trend data available</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip
                formatter={(value: number) => `MK ${value.toLocaleString()}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="sales"
                stroke="#4ade80"
                activeDot={{ r: 8 }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#60a5fa" />
              <Line type="monotone" dataKey="profit" stroke="#facc15" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Revenue vs Profit Bar Chart */}
      <div className="bg-white shadow rounded p-4 mt-4">
        <h2 className="font-semibold mb-2">Revenue vs Profit</h2>
        {salesTrend.length === 0 ? (
          <p className="text-gray-500">No revenue/profit data available</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={salesTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip
                formatter={(value: number) => `MK ${value.toLocaleString()}`}
              />
              <Legend />
              <Bar dataKey="revenue" fill="#60a5fa" />
              <Bar dataKey="profit" fill="#facc15" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* New: Products Sold Bar Chart */}
      <div className="bg-white shadow rounded p-4 mt-4">
        <h2 className="font-semibold mb-2">Products Sold Progress</h2>
        {productBars.length === 0 ? (
          <p className="text-gray-500">No product data available</p>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={productBars}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip
                formatter={(value: number, name: string) => `${value} units`}
              />
              <Legend />
              <Bar dataKey="totalQty" fill="#e5e7eb" name="Total Qty" />
              <Bar dataKey="soldQty" fill="#4ade80" name="Sold Qty" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
