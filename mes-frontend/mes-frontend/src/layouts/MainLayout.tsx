import React, { useState } from "react";
import { Layout, Menu, Avatar, Dropdown, Space, Typography, theme } from "antd";
import type { MenuProps } from "antd";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  DashboardOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  InboxOutlined,
  SettingOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  RadarChartOutlined,
  OrderedListOutlined,
  ApiOutlined,
} from "@ant-design/icons";
import { useAuth } from "../auth/AuthContext";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const {
    token: { colorBgContainer, colorBgLayout },
  } = theme.useToken();

  const isCustomer = user?.role === "Customer" || user?.role?.toLowerCase() === "customer";

  const adminMenuItems: MenuProps["items"] = [
    { key: "/dashboard", icon: <DashboardOutlined />, label: "Dashboard" },
    { key: "/order-requests", icon: <InboxOutlined />, label: "Orders" },
    {
      key: "/production",
      icon: <ExperimentOutlined />,
      label: "Productions",
    },
    { key: "/backlog", icon: <OrderedListOutlined />, label: "Backlog" },
    { key: "/live-map", icon: <RadarChartOutlined />, label: "Live Map" },
    { key: "/erp-integration", icon: <ApiOutlined />, label: "SAP ERP" },
    { key: "/inventory", icon: <InboxOutlined />, label: "Inventory" },
    { key: "/settings", icon: <SettingOutlined />, label: "Settings" },
  ];

  const customerMenuItems: MenuProps["items"] = [
    { key: "/customer/orders", icon: <DashboardOutlined />, label: "My Orders" },
    { key: "/customer/new-order", icon: <FileTextOutlined />, label: "New Order" },
  ];

  const menuItems = isCustomer ? customerMenuItems : adminMenuItems;

  const userMenuItems: MenuProps["items"] = [
    { key: "profile", label: "My Profile", icon: <UserOutlined /> },
    { type: "divider" },
    {
      key: "logout",
      label: "Logout",
      icon: <LogoutOutlined />,
      danger: true,
    },
  ];

  const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
    navigate(key);
  };

  const handleUserMenuClick: MenuProps["onClick"] = async ({ key }) => {
    if (key === "logout") {
      await logout();
      navigate("/login", { replace: true });
    }
  };

  return (
    <Layout style={{ height: "100vh" }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        style={{ boxShadow: "2px 0 8px 0 rgba(29,35,41,.05)", zIndex: 10 }}
      >
        <div
          style={{
            height: 64,
            margin: 16,
            background: "rgba(255, 255, 255, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
          }}
        >
          <Text
            strong
            style={{
              color: "#fff",
              fontSize: collapsed ? 12 : 18,
              transition: "all 0.2s",
            }}
          >
            {collapsed ? "TM" : "TRACEMES"}
          </Text>
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>

      <Layout style={{ background: colorBgLayout, minWidth: 0 }}>
        <Header
          style={{
            padding: "0 24px",
            background: colorBgContainer,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {React.createElement(
            collapsed ? MenuUnfoldOutlined : MenuFoldOutlined,
            {
              className: "trigger",
              onClick: () => setCollapsed(!collapsed),
              style: { fontSize: "18px", cursor: "pointer" },
            },
          )}

          {/* Portal target — pages can inject navbar actions here */}
          <div
            id="navbar-actions"
            style={{ flex: 1, display: "flex", justifyContent: "center" }}
          />

          <Space size="large">
            <div style={{ textAlign: "right", lineHeight: "1.2" }}>
              <Text strong style={{ display: "block" }}>
                {user?.fullName ?? "User"}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {user?.role ?? "—"}
              </Text>
            </div>
            <Dropdown
              menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
              trigger={["click"]}
            >
              <Avatar
                style={{ backgroundColor: "#1890ff", cursor: "pointer" }}
                icon={<UserOutlined />}
                size="large"
              />
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            margin: "24px 16px",
            padding: 24,
            minHeight: 280,
            minWidth: 0,
            background: colorBgLayout,
            overflowY: "auto",
            overflowX: "auto",
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
