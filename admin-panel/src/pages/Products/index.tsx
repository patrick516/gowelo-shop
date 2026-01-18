import React, { useEffect, useState } from "react";
import api from "../../services/api";

interface Product {
  _id: string;
  name: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
}

// Format numbers as MK currency
const formatMK = (value: number) =>
  new Intl.NumberFormat("en-MW", {
    style: "currency",
    currency: "MWK",
    minimumFractionDigits: 2,
  }).format(value);

const ProductsPage: React.FC<{ onUpdate?: () => void }> = ({ onUpdate }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [costPrice, setCostPrice] = useState<number | "">("");
  const [sellingPrice, setSellingPrice] = useState<number | "">("");
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);

  // Fetch products from backend
  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await api.get("/products");
      setProducts(res.data || []);
      setError("");
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!name || quantity === "" || costPrice === "" || sellingPrice === "") {
      setFormError("All fields are required and must be positive numbers.");
      return;
    }
    if (
      Number(quantity) <= 0 ||
      Number(costPrice) <= 0 ||
      Number(sellingPrice) <= 0
    ) {
      setFormError("All fields must be positive numbers.");
      return;
    }

    try {
      setFormLoading(true);
      await api.post("/products", {
        name,
        quantity: Number(quantity),
        costPrice: Number(costPrice),
        sellingPrice: Number(sellingPrice),
      });

      // Reset form
      setName("");
      setQuantity("");
      setCostPrice("");
      setSellingPrice("");

      // Close modal
      setShowModal(false);

      // Refresh table and dashboard charts
      fetchProducts();
      onUpdate?.();
    } catch (err: any) {
      console.error(err);
      setFormError(err.response?.data?.message || "Failed to add product");
    } finally {
      setFormLoading(false);
    }
  };

  // Calculate totals for summary
  const totalCost = products.reduce(
    (acc, p) => acc + (p.quantity * p.costPrice || 0),
    0,
  );
  const expectedRevenue = products.reduce(
    (acc, p) => acc + (p.quantity * p.sellingPrice || 0),
    0,
  );
  const expectedProfit = expectedRevenue - totalCost;

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold text-center">Chicken Parts Name</h1>

      {/* Add Product Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
        >
          Add Product
        </button>
      </div>

      {/* Modal for Add Product Form */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Add New Product</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleAddProduct} className="space-y-4">
                {formError && (
                  <p className="text-red-500 bg-red-50 p-2 rounded">
                    {formError}
                  </p>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Product Name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter Product Name"
                    className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    placeholder="Enter Quantity"
                    className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    required
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Cost Price (MK)
                  </label>
                  <input
                    type="number"
                    placeholder="Enter Cost Price"
                    className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={costPrice}
                    onChange={(e) =>
                      setCostPrice(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    required
                    min="0.01"
                    step="0.01"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Selling Price (MK)
                  </label>
                  <input
                    type="number"
                    placeholder="Enter Selling Price"
                    className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={sellingPrice}
                    onChange={(e) =>
                      setSellingPrice(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    required
                    min="0.01"
                    step="0.01"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition"
                    disabled={formLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition disabled:opacity-50"
                    disabled={formLoading}
                  >
                    {formLoading ? "Adding..." : "Add Product"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Product List Table */}
      {loading ? (
        <p className="text-center text-gray-500">Loading products...</p>
      ) : error ? (
        <p className="text-center text-red-500">{error}</p>
      ) : products.length === 0 ? (
        <p className="text-center text-gray-500">No products added yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white shadow rounded border">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-right">Quantity</th>
                <th className="p-2 text-right">Cost Price</th>
                <th className="p-2 text-right">Selling Price</th>
                <th className="p-2 text-right">Total Cost</th>
                <th className="p-2 text-right">Expected Revenue</th>
                <th className="p-2 text-right">Expected Profit</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const totalCostPerProduct = p.quantity * p.costPrice;
                const expectedRevenuePerProduct = p.quantity * p.sellingPrice;
                const profitPerProduct =
                  expectedRevenuePerProduct - totalCostPerProduct;

                return (
                  <tr key={p._id} className="border-t">
                    <td className="p-2">{p.name}</td>
                    <td className="p-2 text-right">{p.quantity ?? 0}</td>
                    <td className="p-2 text-right">
                      {formatMK(p.costPrice ?? 0)}
                    </td>
                    <td className="p-2 text-right">
                      {formatMK(p.sellingPrice ?? 0)}
                    </td>
                    <td className="p-2 text-right">
                      {formatMK(totalCostPerProduct)}
                    </td>
                    <td className="p-2 text-right">
                      {formatMK(expectedRevenuePerProduct)}
                    </td>
                    <td className="p-2 text-right">
                      {formatMK(profitPerProduct)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Summary below table */}
          <div className="mt-4 p-2 bg-gray-50 rounded shadow">
            <p>Total Products: {products.length}</p>
            <p>Total Cost: {formatMK(totalCost)}</p>
            <p>Expected Revenue: {formatMK(expectedRevenue)}</p>
            <p>Expected Profit: {formatMK(expectedProfit)}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductsPage;
