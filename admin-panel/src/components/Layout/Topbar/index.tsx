import React from "react";
import { FiLogOut } from "react-icons/fi";

interface TopbarProps {
  onMenuClick?: () => void;
}

const Topbar: React.FC<TopbarProps> = ({ onMenuClick }) => {
  const handleLogout = () => {
    // 🔒 hook your real logout logic here later
    console.log("Logout clicked");
  };

  return (
    <header className="h-16 w-full bg-white border-b shadow flex items-center justify-between px-4 lg:px-6">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden p-2 rounded hover:bg-gray-200"
          onClick={onMenuClick}
        ></button>
        <h2 className="text-xl font-semibold">Admin Panel</h2>
      </div>

      {/* Right */}
      <button
        onClick={handleLogout}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 rounded hover:bg-red-50 transition"
      >
        <FiLogOut size={18} />
        <span className="hidden sm:inline">Logout</span>
      </button>
    </header>
  );
};

export default Topbar;
