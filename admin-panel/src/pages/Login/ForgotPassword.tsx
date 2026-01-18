import React, { useState } from "react";
import api from "@/services/api";

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleForgotPassword = async () => {
    try {
      const res = await api.post("/auth/forgot-password", { email });
      setMessage(res.data.message);
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to send reset email");
      setMessage("");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold mb-6 text-center">Forgot Password</h1>
        {error && <p className="text-red-500 mb-4 text-center">{error}</p>}
        {message && (
          <p className="text-green-500 mb-4 text-center">{message}</p>
        )}
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 mb-4 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
        <button
          onClick={handleForgotPassword}
          className="w-full bg-yellow-600 text-white p-3 rounded hover:bg-yellow-700 transition"
        >
          Send Reset Email
        </button>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
