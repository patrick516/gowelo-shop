import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  TrendingUp,
  RefreshCw,
  BarChart3,
  Users,
} from "lucide-react";

const Sidebar: React.FC = () => {
  const links = [
    { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { name: "Products", path: "/products", icon: Package },
    { name: "Sales", path: "/sales", icon: TrendingUp },
    { name: "Replenishment", path: "/replenishment", icon: RefreshCw },
    { name: "Reports", path: "/reports", icon: BarChart3 },
    { name: "Debtors", path: "/debtors", icon: Users },
  ];

  // State for user info
  const [user, setUser] = useState<{ name: string; email: string }>({
    name: "",
    email: "",
  });

  useEffect(() => {
    // Fetch user from localStorage (assumes a JSON string is stored)
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
      // Fallback if no user in localStorage
      setUser({ name: "Admin User", email: "admin@goweloshop.com" });
    }
  }, []);

  return (
    <aside className="w-64 h-screen bg-gradient-to-b from-gray-50 to-white border-r border-gray-100 shadow-lg flex flex-col">
      {/* Logo / Title */}
      <div className="h-20 flex items-center px-6 border-b border-gray-100">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">G</span>
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
            Gowelo Shop
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.name}
            to={link.path}
            className={({ isActive }) =>
              `flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                isActive
                  ? "bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-100 text-blue-700 shadow-sm"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:shadow-sm"
              }`
            }
          >
            <link.icon
              className={`w-5 h-5 transition-colors ${
                window.location.pathname.includes(link.path.toLowerCase())
                  ? "text-blue-600"
                  : "text-gray-400 group-hover:text-gray-600"
              }`}
            />
            <span className="font-medium">{link.name}</span>
            {window.location.pathname.includes(link.path.toLowerCase()) && (
              <div className="ml-auto w-2 h-2 bg-blue-500 rounded-full"></div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer">
          <div className="w-8 h-8 bg-gradient-to-br from-gray-300 to-gray-400 rounded-full"></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user.name || "Admin User"}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {user.email || "admin@goweloshop.com"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
