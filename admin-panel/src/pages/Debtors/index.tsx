import React, { useEffect, useState } from "react";
import api from "../../services/api";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

interface Product {
  _id: string;
  name: string;
  sellingPrice: number;
}

interface BorrowRecord {
  productName: string;
  quantity: number;
  date: string;
}

interface Debtor {
  _id: string;
  name: string;
  balance: number;
}

interface DebtorDetails {
  customer?: {
    _id: string;
    name: string;
    balance: number;
  };
  borrowHistory?: BorrowRecord[];
}

const DebtorsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);

  // New credit sale
  const [customerName, setCustomerName] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [amountPaid, setAmountPaid] = useState(0);

  // Per-debtor actions
  const [payments, setPayments] = useState<Record<string, number>>({});
  const [borrowQty, setBorrowQty] = useState<Record<string, number>>({});
  const [borrowProduct, setBorrowProduct] = useState<Record<string, string>>(
    {},
  );

  // Modal state
  const [selectedDebtor, setSelectedDebtor] = useState<DebtorDetails | null>(
    null,
  );
  const [showModal, setShowModal] = useState(false);

  const selectedProduct = products.find((p) => p._id === productId);
  const totalAmount = selectedProduct
    ? selectedProduct.sellingPrice * quantity
    : 0;
  const remainingDebt = Math.max(totalAmount - amountPaid, 0);

  // Fetch all products & debtors
  const fetchAll = async () => {
    try {
      setLoading(true);
      const [pRes, dRes] = await Promise.all([
        api.get("/products"),
        api.get("/customers/debtors"),
      ]);
      setProducts(pRes.data);
      setDebtors(dRes.data);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // Add debtor via credit sale
  const handleCreditSale = async () => {
    if (!customerName.trim()) return toast.error("Customer name required");
    if (!productId) return toast.error("Select product");
    if (quantity <= 0) return toast.error("Invalid quantity");
    if (amountPaid > totalAmount)
      return toast.error("Cannot pay more than total");

    try {
      await api.post("/customers/credit-sale", {
        name: customerName.trim(),
        productId,
        quantity,
        amountPaid,
      });
      toast.success("Debtor added successfully");
      setCustomerName("");
      setProductId("");
      setQuantity(1);
      setAmountPaid(0);
      fetchAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add debtor");
    }
  };

  // Pay debt
  const handlePay = async (debtor: Debtor) => {
    const amount = payments[debtor._id] || 0;
    if (amount <= 0) return toast.error("Invalid amount");
    if (amount > debtor.balance)
      return toast.error("Cannot pay more than balance");

    try {
      await api.post("/customers/pay-debt", {
        customerId: debtor._id,
        amount,
      });
      toast.success("Payment recorded");
      setPayments({ ...payments, [debtor._id]: 0 });
      fetchAll();
    } catch {
      toast.error("Payment failed");
    }
  };

  // Borrow again
  const handleBorrow = async (debtor: Debtor) => {
    const qty = borrowQty[debtor._id];
    const pId = borrowProduct[debtor._id];
    const prod = products.find((p) => p._id === pId);

    if (!prod || !qty || qty <= 0)
      return toast.error("Select product & quantity");

    try {
      await api.post("/customers/borrow", {
        customerId: debtor._id,
        productId: pId,
        quantity: qty,
      });
      toast.success("Debt increased");
      fetchAll();
    } catch {
      toast.error("Borrow failed");
    }
  };

  // View debtor details
  const fetchDebtorDetails = async (debtorId: string) => {
    try {
      const res = await api.get(`/customers/${debtorId}/history`);
      setSelectedDebtor(res.data);
      setShowModal(true);
    } catch {
      toast.error("Failed to fetch debtor details");
    }
  };

  return (
    <div className="p-4 space-y-6">
      <ToastContainer />
      <h1 className="text-xl font-bold text-center">Debtors Management</h1>

      {/* ADD DEBTOR */}
      <div className="bg-white p-4 rounded shadow space-y-3">
        <h2 className="font-semibold">Add Debtor (Credit Sale)</h2>

        <input
          className="border p-2 w-full"
          placeholder="Customer name"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
        />

        <select
          className="border p-2 w-full"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          <option value="">Select product</option>
          {products.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name} (MK {p.sellingPrice})
            </option>
          ))}
        </select>

        <input
          type="number"
          min={1}
          className="border p-2 w-full"
          placeholder="Quantity"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />

        <p>
          Total: <strong>MK {totalAmount?.toLocaleString() ?? 0}</strong>
        </p>

        <input
          type="number"
          min={0}
          max={totalAmount}
          className="border p-2 w-full"
          placeholder="Amount paid now"
          value={amountPaid}
          onChange={(e) => setAmountPaid(Number(e.target.value))}
        />

        <p>
          Remaining debt:{" "}
          <strong className="text-red-600">
            MK {remainingDebt?.toLocaleString() ?? 0}
          </strong>
        </p>

        <button
          onClick={handleCreditSale}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Save Debtor
        </button>
      </div>

      {/* DEBTORS TABLE */}
      {loading ? (
        <p className="text-center">Loading...</p>
      ) : debtors.length === 0 ? (
        <p className="text-center text-gray-500">No debtors found</p>
      ) : (
        <table className="w-full border mt-4">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2">Customer</th>
              <th className="border p-2">Balance</th>
              <th className="border p-2">Pay</th>
              <th className="border p-2">Borrow Again</th>
              <th className="border p-2">View Details</th>
            </tr>
          </thead>
          <tbody>
            {debtors.map((d) => (
              <tr key={d._id} className="text-center">
                <td className="border p-2">{d.name}</td>
                <td className="border p-2">
                  MK {d.balance?.toLocaleString() ?? 0}
                </td>
                <td className="border p-2">
                  <input
                    type="number"
                    className="border p-1 w-24"
                    value={payments[d._id] || ""}
                    onChange={(e) =>
                      setPayments({
                        ...payments,
                        [d._id]: Number(e.target.value),
                      })
                    }
                  />
                  <button
                    onClick={() => handlePay(d)}
                    className="ml-2 bg-green-600 text-white px-2 py-1 rounded"
                  >
                    Pay
                  </button>
                </td>
                <td className="border p-2">
                  <select
                    className="border p-1"
                    onChange={(e) =>
                      setBorrowProduct({
                        ...borrowProduct,
                        [d._id]: e.target.value,
                      })
                    }
                  >
                    <option value="">Product</option>
                    {products.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="border p-1 w-16 mx-1"
                    placeholder="Qty"
                    onChange={(e) =>
                      setBorrowQty({
                        ...borrowQty,
                        [d._id]: Number(e.target.value),
                      })
                    }
                  />
                  <button
                    onClick={() => handleBorrow(d)}
                    className="bg-yellow-500 text-white px-2 py-1 rounded"
                  >
                    Borrow
                  </button>
                </td>
                <td className="border p-2">
                  <button
                    onClick={() => fetchDebtorDetails(d._id)}
                    className="bg-blue-500 text-white px-2 py-1 rounded"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* DEBTOR DETAILS MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-96 max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">
              {selectedDebtor?.customer?.name ?? "Customer"} - Debt Details
            </h2>

            <p>
              Current Balance:{" "}
              <strong>
                MK {selectedDebtor?.customer?.balance?.toLocaleString() ?? 0}
              </strong>
            </p>

            <h3 className="mt-4 font-semibold">Borrow History</h3>
            {selectedDebtor?.borrowHistory?.length ? (
              <table className="w-full border mt-2">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border p-2">Product</th>
                    <th className="border p-2">Quantity</th>
                    <th className="border p-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDebtor.borrowHistory.map((b, idx) => (
                    <tr key={idx} className="text-center">
                      <td className="border p-2">{b.productName}</td>
                      <td className="border p-2">{b.quantity}</td>
                      <td className="border p-2">
                        {new Date(b.date).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-gray-500">No borrow history found.</p>
            )}

            <button
              onClick={() => setShowModal(false)}
              className="mt-4 bg-red-500 text-white px-4 py-2 rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DebtorsPage;
