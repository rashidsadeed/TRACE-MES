import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  Table, Card, Tag, Typography, Button, Space, message, Drawer,
  Row, Col, Statistic, Progress, Tooltip, Empty, Descriptions, Badge, Tabs
} from "antd";
import {
  PlusOutlined, EyeOutlined, FileTextOutlined,
  CheckCircleOutlined, ClockCircleOutlined, SyncOutlined,
  CloseCircleOutlined, ShoppingCartOutlined, RocketOutlined,
  CalendarOutlined, ReloadOutlined, PauseCircleOutlined, BellOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_BASE_URL } from "../../services/config";
import ProductVisualizer from "../Production/components/ProductVisualizer";

const { Title, Text } = Typography;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WorkOrderDetails {
  status: string;
  raw_status: string;
  target_qty: number;
  good_qty: number;
  progress_percentage: number;
  due_date: string | null;
  priority: number;
}

interface OrderRequest {
  id: string;
  description: string;
  quantity: number;
  status: string;
  created_at: string;
  updated_at: string;
  file_3d_url: string | null;
  file_glb_url: string | null;
  work_order_code: string | null;
  work_order_details: WorkOrderDetails | null;
  rejection_reason?: string | null;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Status / Priority visual config (mirrors admin panel)              */
/* ------------------------------------------------------------------ */

const ORDER_STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  PENDING:   { icon: <ClockCircleOutlined />, color: "gold",       label: "Pending Review" },
  APPROVED:  { icon: <CheckCircleOutlined />, color: "green",      label: "Approved" },
  REJECTED:  { icon: <CloseCircleOutlined />, color: "red",        label: "Rejected" },
};

const PRODUCTION_STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  Queued:          { icon: <ClockCircleOutlined />,  color: "default" },
  "In Production": { icon: <SyncOutlined spin />,    color: "processing" },
  Paused:          { icon: <PauseCircleOutlined />,   color: "warning" },
  Completed:       { icon: <CheckCircleOutlined />,   color: "success" },
  Cancelled:       { icon: <CloseCircleOutlined />,   color: "error" },
};

const PRIORITY_MAP: Record<number, { label: string; color: string }> = {
  3: { label: "High",   color: "red" },
  2: { label: "Medium", color: "blue" },
  1: { label: "Low",    color: "green" },
};



/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const CustomerDashboard: React.FC = () => {
  const [orders, setOrders] = useState<OrderRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [expandedRowKeys, setExpandedRowKeys] = useState<readonly React.Key[]>([]);
  const [tableParams, setTableParams] = useState({ current: 1, pageSize: 10 });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();

  const fetchOrders = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await apiClient.get("/orders/requests/");
      setOrders(data);
    } catch {
      if (!silent) message.error("Failed to load orders");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleRetryConversion = async (id: string) => {
    try {
      await apiClient.post(`/orders/requests/${id}/retry-conversion/`);
      message.success("3D model conversion queued");
      fetchOrders();
    } catch (error) {
      message.error("Failed to convert 3D model");
    }
  };

  // Tracks already-seen notification ids so polling can toast only new ones.
  const seenNotificationIds = useRef<Set<string> | null>(null);
  // Latest notifications, readable inside the SSE callback set up once below.
  const notificationsRef = useRef<NotificationItem[]>([]);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const fetchNotifications = async () => {
    try {
      const { data } = await apiClient.get<NotificationItem[]>("/notifications/");
      if (seenNotificationIds.current) {
        data
          .filter((n) => !n.is_read && !seenNotificationIds.current!.has(n.id))
          .forEach((n) => message.info(n.title));
      }
      seenNotificationIds.current = new Set(data.map((n) => n.id));
      setNotifications(data);
    } catch {
      // ignore silently
    }
  };

  const markNotificationRead = async (id: string) => {
    try {
      await apiClient.post(`/notifications/${id}/mark_read/`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch {
      message.error("Failed to mark notification as read");
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchNotifications();
    // Orders keep polling (also refreshes the access token); notifications
    // now come live over SSE.
    const interval = setInterval(() => fetchOrders(true), 15000);

    // Live notifications via SSE
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      if (closed) return;
      const token = localStorage.getItem("access_token");
      if (!token) return;
      // Resume from the newest one we have so a reconnect leaves no gap.
      const since = notificationsRef.current.reduce(
        (max, n) => (n.created_at > max ? n.created_at : max),
        "",
      );
      const url =
        `${API_BASE_URL}/notifications/stream/?token=${encodeURIComponent(token)}` +
        (since ? `&since=${encodeURIComponent(since)}` : "");
      es = new EventSource(url);

      es.addEventListener("notification", (event) => {
        try {
          const n: NotificationItem = JSON.parse((event as MessageEvent).data);
          setNotifications((prev) =>
            prev.some((p) => p.id === n.id) ? prev : [n, ...prev],
          );
          if (seenNotificationIds.current) seenNotificationIds.current.add(n.id);
          if (!n.is_read) message.info(n.title);
        } catch {
          /* ignore bad payload */
        }
      });

      es.onerror = () => {
        // Token expired or network dropped — reconnect with a fresh token.
        es?.close();
        if (closed) return;
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 5000);
      };
    };
    connect();

    return () => {
      closed = true;
      clearInterval(interval);
      clearTimeout(reconnectTimer);
      es?.close();
    };
  }, []);

  /* ---------- Computed Stats ---------- */
  const stats = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((o) => o.status === "PENDING").length;
    const approved = orders.filter((o) => o.status === "APPROVED").length;
    const inProduction = orders.filter(
      (o) => o.work_order_details?.raw_status === "IN_PROGRESS" || o.work_order_details?.raw_status === "PENDING" || o.work_order_details?.raw_status === "PAUSED"
    ).length;
    const completed = orders.filter(
      (o) => o.work_order_details?.raw_status === "COMPLETED" || o.status === "REJECTED" || o.work_order_details?.raw_status === "CANCELLED"
    ).length;
    const unreadNotifications = notifications.filter(n => !n.is_read).length;
    return { total, pending, approved, inProduction, completed, unreadNotifications };
  }, [orders, notifications]);

  /* ---------- Filtered Data ---------- */
  const filteredOrders = useMemo(() => {
    if (!activeFilter) return orders;
    switch (activeFilter) {
      case "total": return orders;
      case "pending": return orders.filter(o => o.status === "PENDING");
      case "inProduction": return orders.filter(o => o.work_order_details?.raw_status === "IN_PROGRESS" || o.work_order_details?.raw_status === "PENDING" || o.work_order_details?.raw_status === "PAUSED");
      case "completed": return orders.filter(o => o.work_order_details?.raw_status === "COMPLETED" || o.status === "REJECTED" || o.work_order_details?.raw_status === "CANCELLED");
      default: return orders;
    }
  }, [orders, activeFilter]);

  const activeOrders = filteredOrders.filter(o => !(o.work_order_details?.raw_status === "COMPLETED" || o.status === "REJECTED" || o.work_order_details?.raw_status === "CANCELLED"));
  const historyOrders = filteredOrders.filter(o => (o.work_order_details?.raw_status === "COMPLETED" || o.status === "REJECTED" || o.work_order_details?.raw_status === "CANCELLED"));

  /* ---------- Table Columns ---------- */
  const columns = [
    {
      title: "Order ID",
      dataIndex: "id",
      key: "id",
      width: 120,
      render: (text: string) => (
        <Text strong copyable={{ text }}>
          {text.split("-")[0]}
        </Text>
      ),
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      render: (val: string) => val || <Text type="secondary">—</Text>,
    },
    {
      title: "Qty",
      dataIndex: "quantity",
      key: "quantity",
      width: 80,
      align: "center" as const,
    },
    {
      title: "Order Date",
      dataIndex: "created_at",
      key: "created_at",
      width: 120,
      sorter: (a: OrderRequest, b: OrderRequest) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      render: (val: string) => new Date(val).toLocaleDateString("tr-TR"),
    },
    {
      title: "Request Status",
      dataIndex: "status",
      key: "status",
      width: 160,
      filters: [
        { text: "Pending", value: "PENDING" },
        { text: "Approved", value: "APPROVED" },
        { text: "Rejected", value: "REJECTED" },
      ],
      onFilter: (value: any, record: OrderRequest) => record.status === value,
      render: (status: string, record: OrderRequest) => {
        const config = ORDER_STATUS_CONFIG[status] ?? {
          icon: null, color: "default", label: status,
        };
        const tag = (
          <Tag icon={config.icon} color={config.color}>
            {config.label}
          </Tag>
        );
        if (status === "REJECTED") {
          return (
            <Tooltip title={record.rejection_reason ? `Reason: ${record.rejection_reason}` : "No reason provided"}>
              {tag}
            </Tooltip>
          );
        }
        return tag;
      },
    },
    {
      title: "Production",
      key: "production",
      width: 160,
      render: (_: any, record: OrderRequest) => {
        const details = record.work_order_details;
        if (!details) return <Text type="secondary">—</Text>;
        const cfg = PRODUCTION_STATUS_CONFIG[details.status] ?? {
          icon: null, color: "default",
        };
        const tag = (
          <Tag icon={cfg.icon} color={cfg.color}>
            {details.status}
          </Tag>
        );
        if (details.status === "Cancelled" || details.raw_status === "CANCELLED") {
          return (
            <Tooltip title={record.rejection_reason ? `Reason: ${record.rejection_reason}` : "No reason provided"}>
              {tag}
            </Tooltip>
          );
        }
        return tag;
      },
    },
    {
      title: "Progress",
      key: "progress",
      width: 180,
      render: (_: any, record: OrderRequest) => {
        const details = record.work_order_details;
        if (!details) return <Text type="secondary">—</Text>;

        const pct = details.progress_percentage;
        const progressStatus =
          pct >= 100
            ? "success"
            : details.raw_status === "CANCELLED"
              ? "exception"
              : "active";
        return (
          <Tooltip title={`${details.good_qty} / ${details.target_qty} units`}>
            <Progress percent={pct} size="small" status={progressStatus} />
          </Tooltip>
        );
      },
    },
    {
      title: "Due Date",
      key: "due_date",
      width: 120,
      render: (_: any, record: OrderRequest) => {
        const dueDate = record.work_order_details?.due_date;
        if (!dueDate) return <Text type="secondary">—</Text>;

        const due = new Date(dueDate);
        const now = new Date();
        const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const isUrgent = daysLeft <= 3 && daysLeft >= 0;
        const isOverdue = daysLeft < 0;

        return (
          <Tooltip title={isOverdue ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days remaining`}>
            <Space size={4}>
              <CalendarOutlined style={{ color: isOverdue ? "#ff4d4f" : isUrgent ? "#faad14" : "#1890ff" }} />
              <Text type={isOverdue ? "danger" : isUrgent ? "warning" : undefined}>
                {due.toLocaleDateString("tr-TR")}
              </Text>
            </Space>
          </Tooltip>
        );
      },
    },
    {
      title: "3D File",
      key: "file",
      width: 140,
      render: (_: any, record: OrderRequest) => (
        <Space>
          {record.file_3d_url ? (
            <Button type="link" size="small" href={record.file_3d_url} target="_blank">
              Download
            </Button>
          ) : (
            <Text type="secondary">No file</Text>
          )}
        </Space>
      ),
    },
  ];

  /* ---------- Expandable Row ---------- */
  const expandedRowRender = (record: OrderRequest) => {
    const details = record.work_order_details;
    return (
      <Card
        size="small"
        style={{ background: "#fafafa", border: "none" }}
        styles={{ body: { padding: "12px 16px" } }}
      >
        <Row gutter={[32, 32]}>
          <Col xs={24} lg={14}>
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2 }}
              labelStyle={{ fontWeight: 600 }}
            >
              <Descriptions.Item label="Work Order Code">
                {record.work_order_code ? (
                  <Tag color="geekblue">{record.work_order_code}</Tag>
                ) : (
                  "—"
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Requested Qty">
                {record.quantity} units
              </Descriptions.Item>
              <Descriptions.Item label="Order Date">
                {new Date(record.created_at).toLocaleString("tr-TR")}
              </Descriptions.Item>

              {details && (
                <>
                  <Descriptions.Item label="Production Target">
                    {details.target_qty} units
                  </Descriptions.Item>
                  <Descriptions.Item label="Produced">
                    <Text strong style={{ color: "#52c41a" }}>
                      {details.good_qty}
                    </Text>{" "}
                    / {details.target_qty} units
                  </Descriptions.Item>
                  <Descriptions.Item label="Priority">
                    <Tag color={PRIORITY_MAP[details.priority]?.color ?? "default"}>
                      {PRIORITY_MAP[details.priority]?.label ?? `P${details.priority}`}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Due Date">
                    {details.due_date
                      ? new Date(details.due_date).toLocaleDateString("tr-TR")
                      : "Not set"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Progress">
                    <Progress
                      percent={details.progress_percentage}
                      size="small"
                      status={details.progress_percentage >= 100 ? "success" : "active"}
                      style={{ width: 200 }}
                    />
                  </Descriptions.Item>
                </>
              )}

              {record.description && (
                <Descriptions.Item label="Notes" span={2}>
                  {record.description}
                </Descriptions.Item>
              )}
            </Descriptions>
          </Col>
          <Col xs={24} lg={10}>
            {record.file_glb_url ? (
              <>
                <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>3D Preview</Title>
                <ProductVisualizer 
                  status={details?.raw_status === "IN_PROGRESS" ? "Running" : "Paused"} 
                  modelUrl={record.file_glb_url} 
                />
                <div style={{ textAlign: "center", marginTop: 8, color: "#8c8c8c", fontSize: 12 }}>
                  Interactive 3D Model • Rotate to inspect
                </div>
              </>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  record.file_3d_url ? (
                    <Space direction="vertical" align="center">
                      <Text>No 3D Model available</Text>
                      <Button size="small" type="dashed" icon={<ReloadOutlined />} onClick={() => handleRetryConversion(record.id)}>
                        Retry Conversion
                      </Button>
                    </Space>
                  ) : (
                    "No 3D Model available"
                  )
                }
              />
            )}
          </Col>
        </Row>
      </Card>
    );
  };

  /* ---------- Render ---------- */
  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Stats Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} hoverable onClick={() => setActiveFilter(activeFilter === "total" ? null : "total")} style={{ border: activeFilter === "total" ? "2px solid #1890ff" : undefined }}>
            <Statistic
              title="Total Orders"
              value={stats.total}
              prefix={<ShoppingCartOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} hoverable onClick={() => setActiveFilter(activeFilter === "pending" ? null : "pending")} style={{ border: activeFilter === "pending" ? "2px solid #faad14" : undefined }}>
            <Statistic
              title="Pending"
              value={stats.pending}
              valueStyle={{ color: "#faad14" }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bordered={false} hoverable onClick={() => setActiveFilter(activeFilter === "inProduction" ? null : "inProduction")} style={{ border: activeFilter === "inProduction" ? "2px solid #1890ff" : undefined }}>
            <Statistic
              title="In Production"
              value={stats.inProduction}
              valueStyle={{ color: "#1890ff" }}
              prefix={<SyncOutlined spin={stats.inProduction > 0} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} lg={4}>
          <Card bordered={false} hoverable onClick={() => setActiveFilter(activeFilter === "completed" ? null : "completed")} style={{ border: activeFilter === "completed" ? "2px solid #52c41a" : undefined }}>
            <Statistic
              title="History / Completed"
              value={stats.completed}
              valueStyle={{ color: "#52c41a" }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} lg={8}>
          <Card 
            bordered={false} 
            hoverable 
            onClick={() => setDrawerOpen(true)} 
            style={{ border: stats.unreadNotifications > 0 ? "2px solid #ff4d4f" : undefined }}
          >
            <Statistic
              title="Notifications"
              value={stats.unreadNotifications}
              valueStyle={{ color: stats.unreadNotifications > 0 ? "#ff4d4f" : "inherit" }}
              prefix={<BellOutlined />}
              suffix="unread"
            />
          </Card>
        </Col>
      </Row>

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          <FileTextOutlined style={{ marginRight: 8 }} />
          My Orders
        </Title>
        <Space>
          <Button onClick={() => {
            const dataSource = document.querySelector('.ant-tabs-tab-active')?.textContent?.includes('History') ? historyOrders : activeOrders;
            const currentData = dataSource.slice((tableParams.current - 1) * tableParams.pageSize, tableParams.current * tableParams.pageSize);
            const newKeys = new Set([...expandedRowKeys, ...currentData.map(o => o.id)]);
            setExpandedRowKeys(Array.from(newKeys));
          }}>Expand Page</Button>
          <Button onClick={() => {
            const dataSource = document.querySelector('.ant-tabs-tab-active')?.textContent?.includes('History') ? historyOrders : activeOrders;
            const currentData = dataSource.slice((tableParams.current - 1) * tableParams.pageSize, tableParams.current * tableParams.pageSize);
            const keysToRemove = new Set(currentData.map(o => o.id));
            setExpandedRowKeys(expandedRowKeys.filter(k => !keysToRemove.has(k as string)));
          }}>Collapse Page</Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchOrders()} loading={loading}>
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate("/customer/new-order")}
          >
            New Order
          </Button>
        </Space>
      </div>

      {/* Tabs */}
      <Card bordered={false}>
        <Tabs
          defaultActiveKey="active"
          onChange={() => setTableParams({ current: 1, pageSize: 10 })}
          items={[
            {
              key: "active",
              label: "Active Orders",
              children: (
                <Table
                  dataSource={activeOrders}
                  columns={columns}
                  rowKey="id"
                  loading={loading}
                  pagination={{ current: tableParams.current, pageSize: tableParams.pageSize, showSizeChanger: true, showTotal: (t) => `${t} orders` }}
                  onChange={(pagination) => setTableParams({ current: pagination.current || 1, pageSize: pagination.pageSize || 10 })}
                  expandable={{
                    expandedRowRender,
                    expandedRowKeys,
                    onExpandedRowsChange: setExpandedRowKeys,
                  }}
                  locale={{
                    emptyText: (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="No active orders"
                      >
                        <Button
                          type="primary"
                          icon={<RocketOutlined />}
                          onClick={() => navigate("/customer/new-order")}
                        >
                          Create Your First Order
                        </Button>
                      </Empty>
                    ),
                  }}
                  scroll={{ x: 1100 }}
                />
              )
            },
            {
              key: "history",
              label: "Order History",
              children: (
                <Table
                  dataSource={historyOrders}
                  columns={columns}
                  rowKey="id"
                  loading={loading}
                  pagination={{ current: tableParams.current, pageSize: tableParams.pageSize, showSizeChanger: true, showTotal: (t) => `${t} orders` }}
                  onChange={(pagination) => setTableParams({ current: pagination.current || 1, pageSize: pagination.pageSize || 10 })}
                  expandable={{
                    expandedRowRender,
                    expandedRowKeys,
                    onExpandedRowsChange: setExpandedRowKeys,
                  }}
                  locale={{
                    emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No completed or rejected orders yet" />
                  }}
                  scroll={{ x: 1100 }}
                />
              )
            }
          ]}
        />
      </Card>

      <Drawer
        title="Notifications"
        placement="right"
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        width={400}
      >
        {notifications.length === 0 ? (
          <Empty description="No notifications" />
        ) : (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            {notifications.map((n) => (
              <Card
                key={n.id}
                size="small"
                style={{ opacity: n.is_read ? 0.6 : 1 }}
                actions={
                  !n.is_read
                    ? [<Button type="link" size="small" onClick={() => markNotificationRead(n.id)}>Mark as read</Button>]
                    : undefined
                }
              >
                <Card.Meta
                  avatar={<BellOutlined style={{ color: n.is_read ? "#d9d9d9" : "#1890ff" }} />}
                  title={n.title}
                  description={
                    <div>
                      <div style={{ marginBottom: 4 }}>{n.message}</div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(n.created_at).toLocaleString("tr-TR")}
                      </Text>
                    </div>
                  }
                />
              </Card>
            ))}
          </Space>
        )}
      </Drawer>

    </div>
  );
};

export default CustomerDashboard;
