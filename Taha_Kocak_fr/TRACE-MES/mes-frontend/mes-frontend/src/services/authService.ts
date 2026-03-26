import { isMockMode } from "./config";
import apiClient from "./apiClient";
import { MOCK_USERS } from "./mockData";
import type { MockUser } from "./mockData";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Shape returned by the backend's /auth/login/ (SimpleJWT TokenObtainPair). */
interface JWTLoginResponse {
  access: string;
  refresh: string;
}

/** Shape returned by /users/me/ — backend's UserSerializer. */
export interface BackendUser {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  role: { id: string; name: string } | null;
  is_staff: boolean;
}

/** Unified user object used across the frontend. */
export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  email: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

/** Convert backend user shape to the frontend AuthUser shape. */
const toAuthUser = (u: BackendUser): AuthUser => ({
  id: u.id,
  username: u.username,
  fullName: `${u.first_name} ${u.last_name}`.trim() || u.username,
  role: u.role?.name ?? (u.is_staff ? "Admin" : "Operator"),
  email: u.email,
});

/* ------------------------------------------------------------------ */
/*  Auth API                                                           */
/* ------------------------------------------------------------------ */

/**
 * Login — in mock mode, accepts "admin/admin" or "operator/operator".
 * In real mode, POSTs to /auth/login/ (SimpleJWT) and then fetches
 * the user profile from /users/me/.
 */
export const login = async (
  username: string,
  password: string,
): Promise<AuthResponse> => {
  if (isMockMode()) {
    await delay(500);
    const user = MOCK_USERS.find((u) => u.username === username);
    if (!user || password !== username) {
      throw new Error("Invalid username or password");
    }
    const token = `mock-jwt-${Date.now()}`;
    return {
      accessToken: token,
      refreshToken: `mock-refresh-${Date.now()}`,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        email: user.email,
      },
    };
  }

  // 1. Obtain JWT tokens
  const { data: tokens } = await apiClient.post<JWTLoginResponse>(
    "/auth/login/",
    { username, password },
  );

  // Store tokens so subsequent requests are authenticated
  localStorage.setItem("access_token", tokens.access);
  localStorage.setItem("refresh_token", tokens.refresh);

  // 2. Fetch the user profile
  const { data: backendUser } = await apiClient.get<BackendUser>("/users/me/");
  const user = toAuthUser(backendUser);

  return {
    accessToken: tokens.access,
    refreshToken: tokens.refresh,
    user,
  };
};

/**
 * Logout — clears local storage.
 * In real mode, also calls /auth/logout/ with the refresh token.
 */
export const logout = async (): Promise<void> => {
  if (!isMockMode()) {
    try {
      const refreshToken = localStorage.getItem("refresh_token");
      await apiClient.post("/auth/logout/", {
        refresh: refreshToken,
      });
    } catch {
      // Ignore — token may already be expired
    }
  }
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("auth_user");
};

/**
 * Returns the currently stored user, or null.
 */
export const getCurrentUser = (): AuthUser | null => {
  const raw = localStorage.getItem("auth_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
};
