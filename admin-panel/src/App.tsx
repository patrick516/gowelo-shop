import React from "react";
import { Routes, Route } from "react-router-dom";
import LoginPage from "./pages/Login/Login";
import RegisterPage from "./pages/Login/Register";
import ForgotPasswordPage from "./pages/Login/ForgotPassword";
import DashboardPage from "./pages/Dashboard/index";
import CategoriesPage from "./pages/Debtors/index";
import ProductsPage from "./pages/Products/index";
import SalesPage from "./pages/Sales/index";
import DebtorsPage from "./pages/Debtors";
import ReplenishmentPage from "./pages/Replenishment/index";
import ReportsPage from "./pages/Reports/index";
import Protected from "./components/Protected";
import Layout from "./components/Layout/Layout";

const App: React.FC = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/* Protected routes */}
      <Route
        path="/dashboard"
        element={
          <Protected>
            <Layout>
              <DashboardPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/categories"
        element={
          <Protected>
            <Layout>
              <CategoriesPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/products"
        element={
          <Protected>
            <Layout>
              <ProductsPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/sales"
        element={
          <Protected>
            <Layout>
              <SalesPage />
            </Layout>
          </Protected>
        }
      />

      <Route
        path="/debtors"
        element={
          <Protected>
            <Layout>
              <DebtorsPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/replenishment"
        element={
          <Protected>
            <Layout>
              <ReplenishmentPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/reports"
        element={
          <Protected>
            <Layout>
              <ReportsPage />
            </Layout>
          </Protected>
        }
      />

      {/* Catch-all redirect */}
      <Route path="*" element={<LoginPage />} />
    </Routes>
  );
};

export default App;
