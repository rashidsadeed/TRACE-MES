import React, { Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ConfigProvider, Spin } from "antd";
import { AuthProvider } from "./auth/AuthContext";
import PrivateRoute from "./auth/PrivateRoute";
import MainLayout from "./layouts/MainLayout";

// --- Lazy-loaded pages (code splitting) ---
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const ProductionLine = React.lazy(() => import("./pages/Production"));
const WorkOrders = React.lazy(() => import("./pages/WorkOrders"));
const LoginPage = React.lazy(() => import("./pages/LoginPage"));

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
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="production" element={<ProductionLine />} />
                <Route path="work-orders" element={<WorkOrders />} />
                <Route
                  path="inventory"
                  element={<Placeholder title="Inventory" />}
                />
                <Route path="settings" element={<Placeholder title="Settings" />} />
              </Route>
            </Routes>
          </Suspense>
        </Router>
      </AuthProvider>
    </ConfigProvider>
  );
};

export default App;
