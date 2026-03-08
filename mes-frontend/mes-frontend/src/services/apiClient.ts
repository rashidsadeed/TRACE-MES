import axios from "axios";
import { API_BASE_URL } from "./config";

/**
 * Centralized Axios instance.
 *
 * - Automatically attaches Authorization header when a token exists.
 * - Intercepts 401 responses to redirect to login.
 * - Base URL comes from .env (VITE_API_BASE_URL).
 */
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

// --- Request Interceptor: Attach auth token ---
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("auth_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// --- Response Interceptor: Handle 401 ---
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default apiClient;
