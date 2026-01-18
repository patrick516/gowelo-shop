import React, { useEffect, useState } from "react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import api from "../../services/api";

interface Product {
  _id: string;
  name: string;
  sellingPrice: number;
  costPrice: number;
  quantity: number;
}

// Format numbers as MK currency
const formatMK = (value: number) =>
  new Intl.NumberFormat("en-MW", {
    style: "currency",
    currency: "MWK",
    minimumFractionDigits: 2,
  }).format(value);

const SalesPage: React.FC<{ onUpdate?: () => void }> = ({ onUpdate }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [selling, setSelling] = useState(false);

  // Selected product details
  const selectedProductData = products.find((p) => p._id === selectedProduct);

  // Fetch products from backend
  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await api.get("/products");
      setProducts(res.data);
    } catch (err: any) {
      console.error("Failed to fetch products:", err);
      alert(err.response?.data?.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Handle selling a product
  const handleSell = async () => {
    if (!selectedProduct || !quantity || quantity <= 0) {
      return alert("Please select a product and enter a valid quantity");
    }

    if (selectedProductData && quantity > selectedProductData.quantity) {
      return alert(
        `Only ${selectedProductData.quantity} units available in stock!`,
      );
    }

    setSelling(true);

    try {
      const res = await api.post("/sales", {
        productId: selectedProduct,
        quantity: quantity,
      });

      // Show success toast
      const successMessage = res.data.message || "Product sold successfully!";
      toast.success(successMessage, {
        position: "top-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });

      // Reset form
      setSelectedProduct("");
      setQuantity("");

      // Refresh products & dashboard
      await fetchProducts();
      onUpdate?.();
    } catch (err: any) {
      console.error("Sale error:", err);
      alert("❌ " + (err.response?.data?.message || "Failed to sell product"));
    } finally {
      setSelling(false);
    }
  };

  // Calculate sale details
  const calculateSaleDetails = () => {
    if (!selectedProductData || !quantity || quantity <= 0) return null;

    const revenue = selectedProductData.sellingPrice * quantity;
    const cost = selectedProductData.costPrice * quantity;
    const profit = revenue - cost;
    const margin = ((profit / revenue) * 100).toFixed(1);

    return { revenue, cost, profit, margin };
  };

  const saleDetails = calculateSaleDetails();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-4 md:p-6">
      <ToastContainer />
      <div className="max-w-4xl mx-auto">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Make a Sale</h1>
              <p className="text-gray-600">
                Quickly sell products from GOWELO SHOP inventory
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Sales Form */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
              <h2 className="text-xl font-bold text-gray-800">Sales Form</h2>
              <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                {products.length} products
              </div>
            </div>

            {/* Product Selection */}
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Product <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
                  disabled={selling}
                >
                  <option value="" className="text-gray-400">
                    Choose a product to sell...
                  </option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id} className="py-2">
                      {p.name} - {formatMK(p.sellingPrice)} ({p.quantity} in
                      stock)
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity <span className="text-red-500">*</span>
                  {selectedProductData && (
                    <span className="text-gray-500 ml-2">
                      (Max: {selectedProductData.quantity} available)
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="Enter quantity"
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
                    disabled={selling}
                    min="1"
                    max={selectedProductData?.quantity}
                  />
                  <div className="absolute right-3 top-3 text-gray-400">
                    units
                  </div>
                </div>
              </div>

              {/* Quick Quantity Buttons */}
              <div className="flex space-x-2">
                {[1, 5, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setQuantity(num)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition font-medium"
                    disabled={selling}
                  >
                    {num} unit{num > 1 ? "s" : ""}
                  </button>
                ))}
              </div>

              {/* Sell Button */}
              <button
                onClick={handleSell}
                disabled={selling || !selectedProduct || !quantity}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 transform hover:-translate-y-0.5 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center"
              >
                {selling ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5 mr-3"
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
                    Processing Sale...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Complete Sale
                  </>
                )}
              </button>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <div className="flex items-center">
                  <svg
                    className="animate-spin h-5 w-5 text-blue-600 mr-3"
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
                  <span className="text-blue-600 font-medium">
                    Loading products...
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Sale Details & Product Info */}
          <div className="space-y-6">
            {/* Sale Calculation Card */}
            {saleDetails && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl shadow-lg p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Sale Calculation
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Unit Price</span>
                    <span className="font-bold text-gray-800">
                      {formatMK(selectedProductData!.sellingPrice)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Quantity</span>
                    <span className="font-bold text-gray-800">
                      {quantity} units
                    </span>
                  </div>
                  <div className="pt-3 border-t">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-600">Total Revenue</span>
                      <span className="font-bold text-green-600 text-lg">
                        {formatMK(saleDetails.revenue)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-600">Total Cost</span>
                      <span className="font-bold text-gray-700">
                        {formatMK(saleDetails.cost)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t">
                      <span className="text-gray-600 font-medium">Profit</span>
                      <span
                        className={`font-bold text-lg ${saleDetails.profit >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {formatMK(saleDetails.profit)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-gray-600">Margin</span>
                      <span
                        className={`font-bold ${saleDetails.profit >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {saleDetails.margin}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Selected Product Details */}
            {selectedProductData && (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Product Details
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Product Name</span>
                    <span className="font-semibold text-gray-800">
                      {selectedProductData.name}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Stock Available</span>
                    <span
                      className={`font-bold ${selectedProductData.quantity > 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {selectedProductData.quantity} units
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Cost Price</span>
                    <span className="font-medium text-gray-700">
                      {formatMK(selectedProductData.costPrice)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Selling Price</span>
                    <span className="font-medium text-green-600">
                      {formatMK(selectedProductData.sellingPrice)}
                    </span>
                  </div>
                  <div className="pt-3 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Profit per Unit</span>
                      <span
                        className={`font-bold ${selectedProductData.sellingPrice > selectedProductData.costPrice ? "text-green-600" : "text-red-600"}`}
                      >
                        {formatMK(
                          selectedProductData.sellingPrice -
                            selectedProductData.costPrice,
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Products Quick Access */}
        {products.length > 0 && (
          <div className="mt-8 bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              Quick Product Access
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {products.slice(0, 4).map((product) => (
                <button
                  key={product._id}
                  onClick={() => {
                    setSelectedProduct(product._id);
                    setQuantity(1);
                  }}
                  className={`p-3 rounded-xl border transition-all ${
                    selectedProduct === product._id
                      ? "border-green-500 bg-green-50"
                      : "border-gray-200 hover:border-green-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="text-left">
                    <div className="font-medium text-gray-800 truncate">
                      {product.name}
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm text-green-600 font-medium">
                        {formatMK(product.sellingPrice)}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          product.quantity > 0
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {product.quantity} left
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesPage;
