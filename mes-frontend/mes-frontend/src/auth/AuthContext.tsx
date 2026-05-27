import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { AuthUser } from "../services/authService";
import * as authService from "../services/authService";

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const stored = authService.getCurrentUser();
    const token = localStorage.getItem("access_token");
    if (stored && token) {
      setUser(stored);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await authService.login(username, password);
    localStorage.setItem("access_token", result.accessToken);
    localStorage.setItem("refresh_token", result.refreshToken);
    localStorage.setItem("auth_user", JSON.stringify(result.user));
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
