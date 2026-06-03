import React, { Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ConfigProvider, Spin } from "antd";
import { AuthProvider } from "./auth/AuthContext";
import PrivateRoute, { AdminRoute } from "./auth/PrivateRoute";
import MainLayout from "./layouts/MainLayout";

// --- Lazy-loaded pages (code splitting) ---
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const ProductionLine = React.lazy(() => import("./pages/Production"));
const Backlog = React.lazy(() => import("./pages/Backlog"));
const LiveMap = React.lazy(() => import("./pages/LiveMap"));
const LoginPage = React.lazy(() => import("./pages/LoginPage"));
const OrderRequests = React.lazy(() => import("./pages/OrderRequests"));
const CustomerDashboard = React.lazy(() => import("./pages/Customer/Dashboard"));
const NewOrder = React.lazy(() => import("./pages/Customer/NewOrder"));
const ERPIntegration = React.lazy(() => import("./pages/ERPIntegration"));

import { useAuth } from "./auth/AuthContext";

const IndexRedirect: React.FC = () => {
  const { user } = useAuth();
  const isCustomer = user?.role === "Customer" || user?.role?.toLowerCase() === "customer";
  return <Navigate to={isCustomer ? "/customer/orders" : "/dashboard"} replace />;
};

// --- Loading fallback ---
const PageLoader: React.FC = () => (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
    <Spin size="large" tip="Loading..." />
  </div>
);

interface PlaceholderProps {
  title: string;
}
const Placeholder: React.FC<PlaceholderProps> = ({ title }) => (
  <div style={{ padding: 24 }}>
    <h1>{title}</h1>
    <p>Module under construction.</p>
  </div>
);

const App: React.FC = () => {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#1890ff",
          borderRadius: 4,
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial',
        },
      }}
    >
      <AuthProvider>
        <Router>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public route */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected routes */}
              <Route
                path="/"
                element={
                  <PrivateRoute>
                    <MainLayout />
                  </PrivateRoute>
                }
              >
                <Route index element={<IndexRedirect />} />
                <Route path="dashboard" element={<AdminRoute><Dashboard /></AdminRoute>} />
                <Route path="order-requests" element={<AdminRoute><OrderRequests /></AdminRoute>} />
                <Route path="production" element={<AdminRoute><ProductionLine /></AdminRoute>} />
                <Route path="backlog" element={<AdminRoute><Backlog /></AdminRoute>} />
                <Route path="live-map" element={<AdminRoute><LiveMap /></AdminRoute>} />
                <Route path="customer/orders" element={<CustomerDashboard />} />
                <Route path="customer/new-order" element={<NewOrder />} />
                <Route path="erp-integration" element={<AdminRoute><ERPIntegration /></AdminRoute>} />
                <Route
                  path="inventory"
                  element={<AdminRoute><Placeholder title="Inventory" /></AdminRoute>}
                />
                <Route path="settings" element={<AdminRoute><Placeholder title="Settings" /></AdminRoute>} />
              </Route>
            </Routes>
          </Suspense>
        </Router>
      </AuthProvider>
    </ConfigProvider>
  );
};

export default App;
