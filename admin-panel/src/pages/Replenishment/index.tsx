import React, { useEffect, useState } from "react";
import api from "../../services/api";

interface Product {
  _id: string;
  name: string;
}

interface ReplenishmentItem {
  _id: string;
  product: string;
  quantityRemaining: number;
  costPrice: number;
  sellingPrice: number;
  expiryDate: string;
  productId: string;
}

const ReplenishmentPage: React.FC<{ onUpdate?: () => void }> = ({
  onUpdate,
}) => {
  const [batches, setBatches] = useState<ReplenishmentItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [costPrice, setCostPrice] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [expiryDate, setExpiryDate] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Fetch all batches
  const fetchBatches = async () => {
    try {
      setLoading(true);
      const res = await api.get("/replenish");
      setBatches(res.data || []);
      setError("");
    } catch (err) {
      setError("Failed to fetch batches");
    } finally {
      setLoading(false);
    }
  };

  // Fetch all products
  const fetchProducts = async () => {
    try {
      const res = await api.get("/products");
      setProducts(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchBatches();
  }, []);

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);

    if (
      !selectedProductId ||
      quantity <= 0 ||
      costPrice <= 0 ||
      sellingPrice <= 0
    ) {
      alert("All fields required and must be positive numbers.");
      setFormSubmitting(false);
      return;
    }

    try {
      await api.post("/replenish", {
        productId: selectedProductId,
        quantity,
        costPrice,
        sellingPrice,
        expiryDate,
      });

      // Reset form
      setSelectedProductId("");
      setQuantity(0);
      setCostPrice(0);
      setSellingPrice(0);
      setExpiryDate("");

      // Close modal and refresh
      setShowModal(false);
      fetchBatches();
      onUpdate?.();
    } catch (err) {
      console.error(err);
      alert("Failed to add stock. Please try again.");
    } finally {
      setFormSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedProductId("");
    setQuantity(0);
    setCostPrice(0);
    setSellingPrice(0);
    setExpiryDate("");
  };

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MW", {
      style: "currency",
      currency: "MWK",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Helper function to format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Check if date is expired
  const isExpired = (dateString: string) => {
    const today = new Date();
    const expiryDate = new Date(dateString);
    return expiryDate < today;
  };

  // Calculate days until expiry
  const daysUntilExpiry = (dateString: string) => {
    const today = new Date();
    const expiryDate = new Date(dateString);
    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header with Add Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">
              Stock Replenishment
            </h1>
            <p className="text-gray-600 mt-2">
              Manage inventory batches and stock levels
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 sm:mt-0 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 transform hover:-translate-y-0.5 shadow-md hover:shadow-lg flex items-center"
          >
            <span className="mr-2">+</span> Add New Batch
          </button>
        </div>

        {/* Modal for Add Stock Form */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="sticky top-0 bg-white px-6 py-4 border-b flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800">
                  Add New Stock Batch
                </h2>
                <button
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  &times;
                </button>
              </div>

              {/* Modal Body - Form */}
              <div className="p-6">
                <form onSubmit={handleAddStock} className="space-y-5">
                  {/* Product Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Product <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                      required
                    >
                      <option value="" className="text-gray-400">
                        Select a product...
                      </option>
                      {products.map((p) => (
                        <option key={p._id} value={p._id} className="py-2">
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Quantity <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="Enter quantity"
                        value={quantity || ""}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                        min="1"
                        required
                      />
                      <div className="absolute right-3 top-3 text-gray-400">
                        units
                      </div>
                    </div>
                  </div>

                  {/* Price Inputs Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Cost Price <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={costPrice || ""}
                          onChange={(e) => setCostPrice(Number(e.target.value))}
                          className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                          min="0.01"
                          step="0.01"
                          required
                        />
                        <div className="absolute right-3 top-3 text-gray-400">
                          MWK
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Selling Price <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={sellingPrice || ""}
                          onChange={(e) =>
                            setSellingPrice(Number(e.target.value))
                          }
                          className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                          min="0.01"
                          step="0.01"
                          required
                        />
                        <div className="absolute right-3 top-3 text-gray-400">
                          MWK
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expiry Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Expiry Date
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                      />
                      <div className="absolute right-3 top-3 text-gray-400">
                        📅
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-2">
                      Leave empty if product doesn't expire
                    </p>
                  </div>

                  {/* Form Actions */}
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowModal(false);
                        resetForm();
                      }}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-3 px-4 rounded-lg transition duration-200"
                      disabled={formSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={formSubmitting}
                    >
                      {formSubmitting ? (
                        <span className="flex items-center justify-center">
                          <svg
                            className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          Adding...
                        </span>
                      ) : (
                        "Add Stock Batch"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Stock Batches Section */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center mb-6 pb-3 border-b">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">
                Stock Batches
              </h2>
              <p className="text-gray-600 text-sm mt-1">
                Current inventory batches and their details
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                {batches.length} batches
              </span>
              <button
                onClick={fetchBatches}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
                title="Refresh batches"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Loading State */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600">Loading stock batches...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-500 text-4xl mb-4">⚠️</div>
              <p className="text-red-600 font-medium">{error}</p>
              <button
                onClick={fetchBatches}
                className="mt-4 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg transition font-medium"
              >
                Try Again
              </button>
            </div>
          ) : batches.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-4xl mb-4">📦</div>
              <p className="text-gray-500 font-medium">
                No stock batches found.
              </p>
              <p className="text-gray-400 text-sm mt-1">
                Add your first batch by clicking "Add New Batch"
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
              >
                Add Your First Batch
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {batches.map((b) => {
                const isExpiredBatch = isExpired(b.expiryDate);
                const daysToExpiry = daysUntilExpiry(b.expiryDate);

                return (
                  <div
                    key={b._id}
                    className={`border rounded-xl p-5 transition-all duration-200 hover:shadow-lg ${
                      isExpiredBatch
                        ? "border-red-200 bg-red-50"
                        : "border-gray-200 hover:border-blue-200"
                    }`}
                  >
                    {/* Product Header */}
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-bold text-lg text-gray-800 truncate">
                        {b.product}
                      </h3>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          isExpiredBatch
                            ? "bg-red-100 text-red-800"
                            : daysToExpiry <= 7
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-green-100 text-green-800"
                        }`}
                      >
                        {isExpiredBatch
                          ? "Expired"
                          : b.expiryDate
                            ? `${daysToExpiry} days`
                            : "No expiry"}
                      </span>
                    </div>

                    {/* Stock Information */}
                    <div className="space-y-3">
                      {/* Quantity */}
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Quantity</span>
                        <span className="font-semibold text-gray-800">
                          {b.quantityRemaining.toLocaleString()} units
                        </span>
                      </div>

                      {/* Prices */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Cost Price</span>
                          <span className="font-medium text-gray-700">
                            {formatCurrency(b.costPrice)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Selling Price</span>
                          <span className="font-medium text-green-600">
                            {formatCurrency(b.sellingPrice)}
                          </span>
                        </div>
                      </div>

                      {/* Total Values */}
                      <div className="pt-3 border-t">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Total Cost</span>
                          <span className="font-medium">
                            {formatCurrency(b.quantityRemaining * b.costPrice)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Total Value</span>
                          <span className="font-medium text-green-600">
                            {formatCurrency(
                              b.quantityRemaining * b.sellingPrice,
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Expiry Date */}
                      {b.expiryDate && (
                        <div className="pt-3 border-t">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">Expires</span>
                            <span
                              className={`font-medium ${
                                isExpiredBatch
                                  ? "text-red-600"
                                  : "text-gray-700"
                              }`}
                            >
                              {formatDate(b.expiryDate)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Profit Margin */}
                      <div className="pt-3 border-t">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Margin</span>
                          <span
                            className={`font-semibold ${
                              b.sellingPrice > b.costPrice
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {(
                              ((b.sellingPrice - b.costPrice) / b.costPrice) *
                              100
                            ).toFixed(1)}
                            %
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {!loading && !error && batches.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-sm text-gray-500">Total Batches</div>
              <div className="text-2xl font-bold text-gray-800">
                {batches.length}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-sm text-gray-500">Total Units</div>
              <div className="text-2xl font-bold text-blue-600">
                {batches
                  .reduce((sum, b) => sum + b.quantityRemaining, 0)
                  .toLocaleString()}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-sm text-gray-500">Total Value</div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(
                  batches.reduce(
                    (sum, b) => sum + b.quantityRemaining * b.sellingPrice,
                    0,
                  ),
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-sm text-gray-500">Avg. Margin</div>
              <div className="text-2xl font-bold text-purple-600">
                {(
                  batches.reduce((sum, b) => {
                    const margin =
                      ((b.sellingPrice - b.costPrice) / b.costPrice) * 100;
                    return sum + margin;
                  }, 0) / batches.length
                ).toFixed(1)}
                %
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReplenishmentPage;
