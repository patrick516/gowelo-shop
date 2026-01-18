import React, { useState } from "react";
import api from "@/services/api";
import { useNavigate } from "react-router-dom";

const RegisterPage: React.FC = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async () => {
    setIsLoading(true);
    setError("");

    try {
      await api.post("/auth/register", { name, email, password });
      navigate("/login");
    } catch (err: any) {
      setError(err.response?.data?.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) handleRegister();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl hover:shadow-2xl transition-shadow duration-300">
        <h1 className="text-3xl font-bold mb-8 text-center text-gray-800">
          Register
        </h1>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg animate-pulse">
            <p className="text-red-600 text-center">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            className="w-full p-4 rounded-xl border-2 border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-200 focus:outline-none transition-all duration-200 disabled:opacity-60"
          />
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            className="w-full p-4 rounded-xl border-2 border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-200 focus:outline-none transition-all duration-200 disabled:opacity-60"
          />
          <input
            type="password"
            placeholder="Create Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            className="w-full p-4 rounded-xl border-2 border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-200 focus:outline-none transition-all duration-200 disabled:opacity-60"
          />

          <button
            onClick={handleRegister}
            disabled={isLoading}
            className={`w-full p-4 rounded-xl font-semibold text-white transition-all duration-300 transform ${isLoading ? "bg-green-400 cursor-wait" : "bg-green-600 hover:bg-green-700 hover:scale-[1.02] active:scale-[0.98]"} shadow-lg hover:shadow-xl disabled:opacity-70`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
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
                Creating Account...
              </span>
            ) : (
              "Register"
            )}
          </button>
        </div>

        <div className="mt-8 text-center">
          <span
            className="text-green-600 hover:text-green-800 cursor-pointer font-medium transition-colors"
            onClick={() => !isLoading && navigate("/login")}
          >
            Already have an account? Sign in
          </span>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
