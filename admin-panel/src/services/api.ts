// src/services/api.ts
import axios from "axios";
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL, // frontend env
  withCredentials: true, // send cookies or credentials if needed
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token"); // or sessionStorage
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
