import React, { useState } from "react";
import { Card, Form, Input, Button, Typography, message, Space } from "antd";
import { UserOutlined, LockOutlined, LoginOutlined } from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const { Title, Text } = Typography;

interface LoginFormValues {
  username: string;
  password: string;
}

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname;

  const handleLogin = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const loggedInUser = await login(values.username, values.password);
      message.success("Login successful!");
      
      let redirectPath = from;
      if (!redirectPath || redirectPath === "/") {
        const isCustomer = loggedInUser?.role === "Customer" || loggedInUser?.role?.toLowerCase() === "customer";
        redirectPath = isCustomer ? "/customer/orders" : "/dashboard";
      }
      
      navigate(redirectPath, { replace: true });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Login failed";
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0c1421 0%, #1a2a42 50%, #0d1b2a 100%)",
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <Card
        style={{
          width: 420,
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.4), 0 0 40px rgba(24, 144, 255, 0.1)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          background: "rgba(255, 255, 255, 0.97)",
        }}
      >
        <Space direction="vertical" size="large" style={{ width: "100%", textAlign: "center" }}>
          {/* Logo */}
          <div style={{ padding: "8px 0" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "linear-gradient(135deg, #1890ff 0%, #096dd9 100%)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
                boxShadow: "0 8px 24px rgba(24, 144, 255, 0.3)",
              }}
            >
              <LoginOutlined style={{ fontSize: 24, color: "#fff" }} />
            </div>
            <Title level={3} style={{ margin: 0 }}>
              TRACE-MES
            </Title>
            <Text type="secondary">Manufacturing Execution System</Text>
          </div>

          {/* Form */}
          <Form<LoginFormValues>
            layout="vertical"
            size="large"
            onFinish={handleLogin}
            autoComplete="off"
            initialValues={{ username: "", password: "" }}
          >
            <Form.Item
              name="username"
              rules={[{ required: true, message: "Username is required" }]}
            >
              <Input prefix={<UserOutlined />} placeholder="Username" />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: "Password is required" }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="Password" />
            </Form.Item>

            <Form.Item style={{ marginBottom: 8 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                style={{
                  height: 48,
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 15,
                  background: "linear-gradient(135deg, #1890ff 0%, #096dd9 100%)",
                  boxShadow: "0 4px 16px rgba(24, 144, 255, 0.3)",
                }}
              >
                Sign In
              </Button>
            </Form.Item>
          </Form>

          <Text type="secondary" style={{ fontSize: 12 }}>
            Manufacturing Execution System v1.0
          </Text>
        </Space>
      </Card>
    </div>
  );
};

export default LoginPage;
