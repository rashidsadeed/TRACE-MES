import React, { useState } from "react";
import { Layout, Menu, Avatar, Dropdown, Space, Typography, theme } from "antd";
import type { MenuProps } from "antd"; // Import MenuProps
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
} from "@ant-design/icons";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const navigate = useNavigate();
  const location = useLocation();

  const {
    token: { colorBgContainer, colorBgLayout },
  } = theme.useToken();

  const menuItems: MenuProps["items"] = [
    { key: "/dashboard", icon: <DashboardOutlined />, label: "Dashboard" },
    {
      key: "/production",
      icon: <ExperimentOutlined />,
      label: "Productions",
    },
    { key: "/work-orders", icon: <FileTextOutlined />, label: "Work Orders" },
    { key: "/inventory", icon: <InboxOutlined />, label: "Inventory" },
    { key: "/settings", icon: <SettingOutlined />, label: "Settings" },
  ];

  const userMenuItems: MenuProps["items"] = [
    { key: "1", label: "My Profile", icon: <UserOutlined /> },
    { type: "divider" },
    { key: "2", label: "Logout", icon: <LogoutOutlined />, danger: true },
  ];

  // FIX: Explicitly type the click handler
  const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
    navigate(key);
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
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

      <Layout style={{ background: colorBgLayout }}>
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
                Admin User
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Plant Manager
              </Text>
            </div>
            <Dropdown menu={{ items: userMenuItems }} trigger={["click"]}>
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
            background: colorBgLayout,
            overflowY: "auto",
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
