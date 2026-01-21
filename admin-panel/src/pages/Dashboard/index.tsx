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
  totalDebtors: number;
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

interface StatCardProps {
  label: string;
  value: string | number;
}

const StatCard: React.FC<StatCardProps> = ({ label, value }) => (
  <div className="bg-white shadow rounded p-4 flex justify-between items-center">
    <span className="font-medium">{label}</span>
    <span className="text-xl font-bold">{value}</span>
  </div>
);

// Pie chart colors
const PIE_COLORS = ["#60a5fa", "#facc15", "#4ade80", "#f87171", "#a78bfa"];

// Format date for trend charts (e.g. Jan 21)
const formatDate = (value: string) => {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

// Generate an array of last 7 days in YYYY-MM-DD format
const getLast7Days = (): string[] => {
  const result: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push(d.toISOString().split("T")[0]); // "YYYY-MM-DD"
  }
  return result;
};

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalSales: 0,
    totalRevenue: 0,
    totalProfit: 0,
    totalReplenishment: 0,
    totalDebtors: 0,
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
        totalDebtors: data.totalDebtors ?? 0,
      });

      // 2️⃣ Sales trends - Last 7 days with missing days filled
      const trendsRes = await api.get("/dashboard/line");
      const rawData = Array.isArray(trendsRes.data)
        ? trendsRes.data.map((item: any) => ({
            date: item.date || item._id, // date from backend
            sales: item.sales ?? 0,
            revenue: item.revenue ?? 0,
            profit: item.profit ?? 0,
          }))
        : [];

      // Generate last 7 days
      const last7Days = getLast7Days();

      // Map backend data to last 7 days
      const trends = last7Days.map((date) => {
        const found = rawData.find((d) => d.date === date);
        return found || { date, sales: 0, revenue: 0, profit: 0 };
      });

      setSalesTrend(trends);

      setSalesTrend(trends);

      // 3️⃣ Stock pie chart

      const stockRes = await api.get("/dashboard/pie");
      const pieData = Array.isArray(stockRes.data)
        ? stockRes.data.map((item: any) => ({
            name: item.name || "Unknown",
            value: Number(item.value) ?? 0, // use correct field
          }))
        : [];
      setStockPie(pieData);

      // 4️⃣ Products sold bar chart
      const productsRes = await api.get("/dashboard/products");
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
        <StatCard label="Total Products" value={stats.totalProducts} />
        <StatCard label="Total Sales" value={stats.totalSales} />
        <StatCard
          label="Total Revenue"
          value={`MK ${stats.totalRevenue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
          })}`}
        />
        <StatCard
          label="Total Profit"
          value={`MK ${stats.totalProfit.toLocaleString(undefined, {
            minimumFractionDigits: 2,
          })}`}
        />
        <StatCard
          label="Total Replenishment"
          value={stats.totalReplenishment}
        />
        <StatCard label="Total Debtors" value={stats.totalDebtors} />{" "}
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
                label={false}
                stroke="none"
              >
                {stockPie.map((_, index) => (
                  <Cell
                    key={index}
                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${value ?? 0} units`]} />
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
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 12 }}
              />

              <YAxis />
              <Tooltip
                formatter={(value) => `MK ${(value ?? 0).toLocaleString()}`}
              />
              <Legend />
              <Line
                type="natural"
                dataKey="sales"
                stroke="#4ade80"
                strokeWidth={2}
                activeDot={{ r: 8 }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#60a5fa"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="profit"
                stroke="#facc15"
                strokeWidth={2}
              />
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
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 12 }}
              />

              <YAxis />
              <Tooltip
                formatter={(value) => `MK ${(value ?? 0).toLocaleString()}`}
                cursor={false}
              />
              <Legend />
              <Bar dataKey="revenue" fill="#60a5fa" radius={[8, 8, 0, 0]} />
              <Bar dataKey="profit" fill="#facc15" radius={[8, 8, 0, 0]} />
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
                formatter={(value) => `${value ?? 0} units`}
                cursor={false}
              />
              <Legend />
              <Bar
                dataKey="totalQty"
                fill="#60a5fa" // modern blue
                name="Total Qty"
                radius={[8, 8, 0, 0]}
              />
              <Bar
                dataKey="soldQty"
                fill="#22c55e" // modern green
                name="Sold Qty"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
