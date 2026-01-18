import React, { useEffect, useState } from "react";
import api from "../../services/api";

interface ReportItem {
  product: string;
  soldQty: number;
  revenue: number;
  cost: number;
  actualProfit: number;
  remainingQty: number;
  expectedProfit: number;
  totalPotentialProfit: number;
}

// Helper to format numbers as MK currency with commas
const formatMK = (value: number) =>
  new Intl.NumberFormat("en-MW", {
    style: "currency",
    currency: "MWK",
    minimumFractionDigits: 2,
  }).format(value);

const ReportsPage: React.FC = () => {
  const [report, setReport] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Calculate totals
  const totals = {
    totalRevenue: report.reduce((sum, item) => sum + item.revenue, 0),
    totalCost: report.reduce((sum, item) => sum + item.cost, 0),
    totalActualProfit: report.reduce((sum, item) => sum + item.actualProfit, 0),
    totalExpectedProfit: report.reduce(
      (sum, item) => sum + item.expectedProfit,
      0,
    ),
    totalPotentialProfit: report.reduce(
      (sum, item) => sum + item.totalPotentialProfit,
      0,
    ),
    totalSold: report.reduce((sum, item) => sum + item.soldQty, 0),
    totalRemaining: report.reduce((sum, item) => sum + item.remainingQty, 0),
  };

  // Fetch report from backend
  const fetchReport = async () => {
    try {
      setLoading(true);
      const res = await api.get("/reports/products");
      setReport(res.data);
      setError("");
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to fetch report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  // Helper to download files (PDF / Excel) via Axios with token
  const downloadFile = async (endpoint: string, filename: string) => {
    try {
      const res = await api.get(endpoint, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err: any) {
      console.error(`Download error (${filename}):`, err);
      alert(err.response?.data?.message || `Failed to download ${filename}`);
    }
  };

  const downloadExcel = () =>
    downloadFile("/reports/export/excel", "GOWELO_SHOP_Report.xlsx");
  const downloadPDF = () =>
    downloadFile("/reports/export/pdf", "GOWELO_SHOP_Report.pdf");

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-2 sm:p-4 md:p-6 pb-4">
      <div className="max-w-7xl mx-auto">
        {/* Header Section with Shop Branding */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 rounded-lg sm:rounded-xl md:rounded-2xl shadow-xl mb-4 sm:mb-6 md:mb-8 overflow-hidden">
          <div className="p-4 sm:p-6 md:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3 sm:space-x-4 w-full sm:w-auto">
              <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-white p-1 shadow-lg flex-shrink-0">
                <img
                  src="/images/chicken.jpg"
                  alt="GOWELO SHOP"
                  className="w-full h-full rounded-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src =
                      "https://via.placeholder.com/80/4F46E5/FFFFFF?text=G";
                  }}
                />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white truncate">
                  GOWELO SHOP
                </h1>
                <p className="text-blue-100 text-xs sm:text-sm md:text-base">
                  Product Performance Analytics
                </p>
              </div>
            </div>
            <div className="text-center sm:text-right w-full sm:w-auto">
              <p className="text-white text-xs sm:text-sm mb-1 sm:mb-2">
                Generated Report
              </p>
              <p className="text-yellow-300 font-semibold text-sm sm:text-base md:text-lg">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Download Controls Card */}
        <div className="bg-white rounded-lg sm:rounded-xl md:rounded-2xl shadow-lg p-4 sm:p-5 md:p-6 mb-4 sm:mb-6 md:mb-8">
          <div className="flex flex-col gap-4">
            <div className="text-center sm:text-left">
              <h2 className="text-lg sm:text-xl font-bold text-gray-800">
                Export Reports
              </h2>
              <p className="text-sm sm:text-base text-gray-600">
                Download detailed reports in multiple formats
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                onClick={downloadExcel}
                className="w-full sm:w-auto group bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl font-semibold transition-all duration-200 transform hover:-translate-y-1 shadow-md hover:shadow-lg flex items-center justify-center text-sm sm:text-base"
              >
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Download Excel
              </button>
              <button
                onClick={downloadPDF}
                className="w-full sm:w-auto group bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl font-semibold transition-all duration-200 transform hover:-translate-y-1 shadow-md hover:shadow-lg flex items-center justify-center text-sm sm:text-base"
              >
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                Download PDF
              </button>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg sm:rounded-xl p-4 sm:p-5 shadow">
            <div className="text-blue-600 text-xs sm:text-sm font-medium mb-1 sm:mb-2">
              Total Revenue
            </div>
            <div className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 break-words">
              {formatMK(totals.totalRevenue)}
            </div>
            <div className="text-green-600 text-xs sm:text-sm mt-1 sm:mt-2">
              🎯 From all sales
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg sm:rounded-xl p-4 sm:p-5 shadow">
            <div className="text-green-600 text-xs sm:text-sm font-medium mb-1 sm:mb-2">
              Actual Profit
            </div>
            <div className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 break-words">
              {formatMK(totals.totalActualProfit)}
            </div>
            <div className="text-green-700 text-xs sm:text-sm mt-1 sm:mt-2">
              💰 Realized earnings
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg sm:rounded-xl p-4 sm:p-5 shadow">
            <div className="text-purple-600 text-xs sm:text-sm font-medium mb-1 sm:mb-2">
              Expected Profit
            </div>
            <div className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 break-words">
              {formatMK(totals.totalExpectedProfit)}
            </div>
            <div className="text-purple-700 text-xs sm:text-sm mt-1 sm:mt-2">
              📈 From remaining stock
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg sm:rounded-xl p-4 sm:p-5 shadow">
            <div className="text-orange-600 text-xs sm:text-sm font-medium mb-1 sm:mb-2">
              Total Potential
            </div>
            <div className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 break-words">
              {formatMK(totals.totalPotentialProfit)}
            </div>
            <div className="text-orange-700 text-xs sm:text-sm mt-1 sm:mt-2">
              🚀 Maximum possible
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="bg-white rounded-lg sm:rounded-xl md:rounded-2xl shadow-lg p-8 sm:p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 sm:h-16 sm:w-16 border-t-2 border-b-2 border-blue-600 mb-4 sm:mb-6"></div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">
              Generating Report
            </h3>
            <p className="text-sm sm:text-base text-gray-500">
              Please wait while we fetch your performance data...
            </p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg sm:rounded-xl md:rounded-2xl shadow-lg p-8 sm:p-12 text-center">
            <div className="text-4xl sm:text-5xl mb-4 sm:mb-6">⚠️</div>
            <h3 className="text-lg sm:text-xl font-semibold text-red-600 mb-2">
              Error Loading Report
            </h3>
            <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
              {error}
            </p>
            <button
              onClick={fetchReport}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl font-medium transition text-sm sm:text-base"
            >
              Retry Loading
            </button>
          </div>
        ) : report.length === 0 ? (
          <div className="bg-white rounded-lg sm:rounded-xl md:rounded-2xl shadow-lg p-8 sm:p-12 text-center">
            <div className="text-4xl sm:text-5xl mb-4 sm:mb-6">📊</div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">
              No Report Data Available
            </h3>
            <p className="text-sm sm:text-base text-gray-500">
              Start making sales to generate performance reports
            </p>
          </div>
        ) : (
          <>
            {/* Product Performance Table */}
            <div className="bg-white rounded-lg sm:rounded-xl md:rounded-2xl shadow-lg overflow-hidden mb-4 sm:mb-6 md:mb-8">
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b bg-gradient-to-r from-gray-50 to-gray-100">
                <h2 className="text-lg sm:text-xl font-bold text-gray-800">
                  Product Performance Breakdown
                </h2>
                <p className="text-gray-600 text-xs sm:text-sm">
                  Detailed analysis of each product's sales and profitability
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Product
                      </th>
                      <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Sold
                      </th>
                      <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Left
                      </th>
                      <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Revenue
                      </th>
                      <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Cost
                      </th>
                      <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Actual
                      </th>
                      <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Expected
                      </th>
                      <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Potential
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {report.map((item, index) => (
                      <tr
                        key={index}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap">
                          <div className="font-medium text-gray-900 text-xs sm:text-sm">
                            {item.product}
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap">
                          <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                            {item.soldQty.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap">
                          <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">
                            {item.remainingQty.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap font-medium text-gray-900 text-xs sm:text-sm">
                          {formatMK(item.revenue)}
                        </td>
                        <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap font-medium text-gray-700 text-xs sm:text-sm">
                          {formatMK(item.cost)}
                        </td>
                        <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap">
                          <span
                            className={`font-bold text-xs sm:text-sm ${item.actualProfit >= 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            {formatMK(item.actualProfit)}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap">
                          <span
                            className={`font-medium text-xs sm:text-sm ${item.expectedProfit >= 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            {formatMK(item.expectedProfit)}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap">
                          <span
                            className={`font-bold text-xs sm:text-sm ${item.totalPotentialProfit >= 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            {formatMK(item.totalPotentialProfit)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Additional Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-lg sm:rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 shadow">
                <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">
                  Sales Overview
                </h3>
                <div className="space-y-2 sm:space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-xs sm:text-sm">
                      Total Products Sold
                    </span>
                    <span className="font-bold text-blue-600 text-xs sm:text-sm">
                      {totals.totalSold.toLocaleString()} units
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-xs sm:text-sm">
                      Stock Remaining
                    </span>
                    <span className="font-bold text-gray-700 text-xs sm:text-sm">
                      {totals.totalRemaining.toLocaleString()} units
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-xs sm:text-sm">
                      Total Cost
                    </span>
                    <span className="font-bold text-gray-700 text-xs sm:text-sm">
                      {formatMK(totals.totalCost)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-xs sm:text-sm">
                      Profit Margin
                    </span>
                    <span
                      className={`font-bold text-xs sm:text-sm ${totals.totalRevenue > 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {totals.totalRevenue > 0
                        ? (
                            (totals.totalActualProfit / totals.totalRevenue) *
                            100
                          ).toFixed(1)
                        : "0.0"}
                      %
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg sm:rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 shadow">
                <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">
                  Performance Insights
                </h3>
                <div className="space-y-2 sm:space-y-3">
                  <div className="flex items-center">
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 rounded-full mr-2 sm:mr-3 flex-shrink-0"></div>
                    <span className="text-gray-700 text-xs sm:text-sm">
                      {report.filter((item) => item.actualProfit > 0).length}{" "}
                      profitable products
                    </span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-yellow-500 rounded-full mr-2 sm:mr-3 flex-shrink-0"></div>
                    <span className="text-gray-700 text-xs sm:text-sm truncate">
                      Top seller:{" "}
                      {report.length > 0
                        ? report.reduce(
                            (max, item) =>
                              item.soldQty > max.soldQty ? item : max,
                            report[0],
                          ).product
                        : "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-blue-500 rounded-full mr-2 sm:mr-3 flex-shrink-0"></div>
                    <span className="text-gray-700 text-xs sm:text-sm truncate">
                      Highest margin:{" "}
                      {report.length > 0
                        ? report.reduce((max, item) => {
                            const margin =
                              item.revenue > 0
                                ? (item.actualProfit / item.revenue) * 100
                                : 0;
                            const maxMargin =
                              max.revenue > 0
                                ? (max.actualProfit / max.revenue) * 100
                                : 0;
                            return margin > maxMargin ? item : max;
                          }, report[0]).product
                        : "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-purple-500 rounded-full mr-2 sm:mr-3 flex-shrink-0"></div>
                    <span className="text-gray-700 text-xs sm:text-sm truncate">
                      Most remaining stock:{" "}
                      {report.length > 0
                        ? report.reduce(
                            (max, item) =>
                              item.remainingQty > max.remainingQty ? item : max,
                            report[0],
                          ).product
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Note */}
            <div className="text-center text-gray-500 text-xs sm:text-sm pb-2 sm:pb-3">
              <p className="px-2">
                Report generated by GOWELO SHOP Analytics System • All amounts
                in MWK (Malawian Kwacha)
              </p>
              <p className="mt-1 px-2">
                For questions, contact shop management • Updated:{" "}
                {new Date().toLocaleString()}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
