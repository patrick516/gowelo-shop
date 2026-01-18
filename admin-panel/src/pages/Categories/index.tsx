import React, { useEffect, useState } from "react";
import api from "../../services/api";

interface Category {
  _id: string;
  name: string;
}

const CategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch categories from backend
  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await api.get("/categories"); // Adjust endpoint if needed
      setCategories(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to fetch categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  return (
    <div className="flex flex-col space-y-4">
      <h1 className="text-xl font-bold">Categories</h1>

      {loading && <p>Loading categories...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {!loading && !error && (
        <ul className="flex flex-col space-y-2">
          {categories.map((category) => (
            <li
              key={category._id}
              className="p-4 bg-white rounded shadow flex justify-between items-center"
            >
              <span>{category.name}</span>
              <button className="text-blue-500 text-sm">Edit</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CategoriesPage;
