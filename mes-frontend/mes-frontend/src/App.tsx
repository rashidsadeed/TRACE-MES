import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ConfigProvider } from "antd";
import MainLayout from "./layouts/MainLayout";
import Dashboard from "./pages/Dashboard";
import ProductionLine from "./pages/ProductionLine";
import WorkOrders from "./pages/WorkOrders"; // <--- 1. IMPORT THIS

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
      <Router>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="production" element={<ProductionLine />} />

            {/* 2. UPDATE THIS LINE */}
            <Route path="work-orders" element={<WorkOrders />} />

            <Route
              path="inventory"
              element={<Placeholder title="Inventory" />}
            />
            <Route path="settings" element={<Placeholder title="Settings" />} />
          </Route>
        </Routes>
      </Router>
    </ConfigProvider>
  );
};

export default App;
