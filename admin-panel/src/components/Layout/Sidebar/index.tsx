import React from "react";
import { NavLink } from "react-router-dom";

const Sidebar: React.FC = () => {
  const links = [
    { name: "Dashboard", path: "/dashboard" },
    // { name: "Categories", path: "/categories" },
    { name: "Products", path: "/products" },
    { name: "Sales", path: "/sales" },
    { name: "Replenishment", path: "/replenishment" },
    { name: "Reports", path: "/reports" },
    { name: "Debtors", path: "/debtors" }, // <-- Added Debtors link
  ];

  return (
    <div className="w-64 bg-white border-r shadow-md flex flex-col">
      <div className="p-4 text-xl font-bold">Gowelo Shop</div>
      <nav className="flex-1 flex flex-col p-2">
        {links.map((link) => (
          <NavLink
            key={link.name}
            to={link.path}
            className={({ isActive }) =>
              `p-2 my-1 rounded hover:bg-gray-200 ${
                isActive ? "bg-gray-200 font-bold" : ""
              }`
            }
          >
            {link.name}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default Sidebar;
