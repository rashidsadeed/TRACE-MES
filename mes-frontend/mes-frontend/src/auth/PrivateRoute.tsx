import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Spin } from "antd";
import { useAuth } from "./AuthContext";

/**
 * Wraps protected routes. Redirects unauthenticated users to /login.
 */
const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const isCustomer = user?.role === "Customer" || user?.role?.toLowerCase() === "customer";

  if (isCustomer) {
    return <Navigate to="/customer/orders" replace />;
  }

  return <>{children}</>;
};

export default PrivateRoute;
