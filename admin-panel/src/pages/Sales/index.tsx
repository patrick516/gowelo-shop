import React, { useEffect, useState } from "react";
import api from "../../services/api";
import { toast } from "react-hot-toast"; // Make sure you have react-hot-toast installed

interface Product {
  _id: string;
  name: string;
  sellingPrice: number;
  costPrice: number;
  quantity: number;
}

interface Customer {
  _id: string;
  name: string;
  debt: number;
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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [creditAmount, setCreditAmount] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [selling, setSelling] = useState(false);

  const selectedProductData = products.find((p) => p._id === selectedProduct);
  const selectedCustomerData = customers.find(
    (c) => c._id === selectedCustomer,
  );

  // Fetch products & customers
  const fetchData = async () => {
    try {
      setLoading(true);
      const [prodRes, custRes] = await Promise.all([
        api.get("/products"),
        api.get("/customers"),
      ]);
      setProducts(prodRes.data);
      setCustomers(custRes.data);
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Calculate sale details
  const saleDetails =
    selectedProductData && quantity
      ? {
          revenue: selectedProductData.sellingPrice * quantity,
          cost: selectedProductData.costPrice * quantity,
          profit:
            selectedProductData.sellingPrice * quantity -
            selectedProductData.costPrice * quantity,
          margin: (
            ((selectedProductData.sellingPrice * quantity -
              selectedProductData.costPrice * quantity) /
              (selectedProductData.sellingPrice * quantity)) *
            100
          ).toFixed(1),
        }
      : null;

  // Handle sale (with optional credit)
  const handleSell = async () => {
    if (!selectedProduct || !quantity || quantity <= 0) {
      return toast.error("Select product and valid quantity");
    }

    if (selectedProductData && quantity > selectedProductData.quantity) {
      return toast.error(
        `Only ${selectedProductData.quantity} units available`,
      );
    }

    if (
      selectedCustomerData &&
      creditAmount !== "" &&
      creditAmount > saleDetails!.revenue
    ) {
      return toast.error("Credit cannot exceed total sale amount");
    }

    setSelling(true);

    try {
      // Prepare payload
      const payload: any = { productId: selectedProduct, quantity };
      if (selectedCustomer) payload.customerId = selectedCustomer;
      if (creditAmount && creditAmount > 0) payload.creditAmount = creditAmount;

      const res = await api.post("/sales", payload);

      toast.success(res.data.message || "Sale completed!");

      // Reset form
      setSelectedProduct("");
      setQuantity("");
      setSelectedCustomer("");
      setCreditAmount("");

      // Refresh data
      await fetchData();
      onUpdate?.();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to sell product");
    } finally {
      setSelling(false);
    }
  };

  // Real-time remaining debt calculation
  const remainingDebt =
    selectedCustomerData && creditAmount !== ""
      ? Math.max(
          selectedCustomerData.debt +
            Number(creditAmount) -
            saleDetails!.revenue,
          0,
        )
      : selectedCustomerData?.debt || 0;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Sales Form */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4">Make a Sale</h2>

          {/* Product */}
          <div className="mb-4">
            <label className="block font-medium mb-2">Select Product</label>
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="w-full border rounded-xl p-3"
              disabled={selling}
            >
              <option value="">-- Choose product --</option>
              {products.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} - {formatMK(p.sellingPrice)} ({p.quantity} in stock)
                </option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div className="mb-4">
            <label className="block font-medium mb-2">Quantity</label>
            <input
              type="number"
              value={quantity}
              min={1}
              max={selectedProductData?.quantity}
              onChange={(e) =>
                setQuantity(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="w-full border rounded-xl p-3"
              disabled={selling}
            />
          </div>

          {/* Customer */}
          <div className="mb-4">
            <label className="block font-medium mb-2">
              Customer (Optional)
            </label>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="w-full border rounded-xl p-3"
              disabled={selling}
            >
              <option value="">-- No Customer (Cash Sale) --</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} (Owes: {formatMK(c.debt)})
                </option>
              ))}
            </select>
          </div>

          {/* Credit Amount */}
          {selectedCustomer && (
            <div className="mb-4">
              <label className="block font-medium mb-2">Credit Amount</label>
              <input
                type="number"
                value={creditAmount}
                min={0}
                max={saleDetails?.revenue || 0}
                onChange={(e) =>
                  setCreditAmount(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                className="w-full border rounded-xl p-3"
                disabled={selling}
              />
              <p className="text-gray-600 mt-1">
                Remaining debt after this sale: {formatMK(remainingDebt)}
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSell}
            disabled={selling || !selectedProduct || !quantity}
            className="w-full bg-green-500 text-white py-3 rounded-xl font-semibold hover:bg-green-600 transition"
          >
            {selling ? "Processing..." : "Complete Sale"}
          </button>
        </div>

        {/* Sale Summary */}
        {saleDetails && selectedProductData && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-lg font-bold mb-3">Sale Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Unit Price:</span>
                <span>{formatMK(selectedProductData.sellingPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span>Quantity:</span>
                <span>{quantity}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Revenue:</span>
                <span>{formatMK(saleDetails.revenue)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Cost:</span>
                <span>{formatMK(saleDetails.cost)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Profit:</span>
                <span
                  className={`${
                    saleDetails.profit >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {formatMK(saleDetails.profit)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesPage;
