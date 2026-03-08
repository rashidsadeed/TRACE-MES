import { isMockMode } from "./config";
import apiClient from "./apiClient";
import { MOCK_USERS } from "./mockData";
import type { MockUser } from "./mockData";

export interface AuthResponse {
  token: string;
  user: MockUser;
}

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

/**
 * Login — in mock mode, accepts "admin/admin" or "operator/operator".
 * In real mode, POSTs to /auth/login.
 */
export const login = async (username: string, password: string): Promise<AuthResponse> => {
  if (isMockMode()) {
    await delay(500);
    const user = MOCK_USERS.find((u) => u.username === username);
    if (!user || password !== username) {
      throw new Error("Invalid username or password");
    }
    const token = `mock-jwt-${Date.now()}`;
    return { token, user };
  }
  const { data } = await apiClient.post<AuthResponse>("/auth/login", { username, password });
  return data;
};

/**
 * Logout — clears local storage.
 * In real mode, also calls /auth/logout.
 */
export const logout = async (): Promise<void> => {
  if (!isMockMode()) {
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // Ignore — token may already be expired
    }
  }
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_user");
};

/**
 * Returns the currently stored user, or null.
 */
export const getCurrentUser = (): MockUser | null => {
  const raw = localStorage.getItem("auth_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MockUser;
  } catch {
    return null;
  }
};
