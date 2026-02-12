import React, { useMemo } from "react";
import {
  Table,
  Card,
  Tag,
  Button,
  Space,
  Row,
  Col,
  Statistic,
  Progress,
  Typography,
  Popconfirm,
  Tooltip,
  Badge,
  Alert,
} from "antd";
import type { TableProps } from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  BellOutlined,
} from "@ant-design/icons";
import { useWorkOrders, PRIORITY_COLOR } from "./useWorkOrders";
import type { WorkOrder, OrderStatus } from "./useWorkOrders";
import {
  CreateOrderModal,
  RequestListModal,
  AcceptOrderModal,
} from "./WorkOrderModals";

const { Title, Text } = Typography;

// --- Status config (sabit, render dışında) ---

const STATUS_CONFIG: Record<OrderStatus, { icon: React.ReactNode; color: string }> = {
  Pending: { icon: <ClockCircleOutlined />, color: "default" },
  "In Progress": { icon: <SyncOutlined spin />, color: "processing" },
  Completed: { icon: <CheckCircleOutlined />, color: "success" },
  Delayed: { icon: <ClockCircleOutlined />, color: "error" },
};

// === Component ===

const WorkOrders: React.FC = () => {
  const {
    orders,
    requests,
    stats,
    upcomingDeadlines,
    modal,
    openCreateModal,
    openRequestList,
    openAcceptModal,
    closeModal,
    dateConflicts,
    conflictAcknowledged,
    setConflictAcknowledged,
    checkDateConflicts,
    isSubmitBlocked,
    createForm,
    acceptForm,
    handleCreateOrder,
    handleAcceptRequest,
    handleDeleteOrder,
    handleDeclineRequest,
  } = useWorkOrders();

  // --- Columns (memoized, handleDeleteOrder stable via useCallback) ---

  const columns: TableProps<WorkOrder>["columns"] = useMemo(
    () => [
      {
        title: "Order ID",
        dataIndex: "id",
        key: "id",
        render: (text: string) => <Text strong>{text}</Text>,
      },
      { title: "Product", dataIndex: "product", key: "product" },
      {
        title: "Priority",
        dataIndex: "priority",
        key: "priority",
        render: (priority: WorkOrder["priority"]) => (
          <Tag color={PRIORITY_COLOR[priority]}>{priority.toUpperCase()}</Tag>
        ),
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        render: (status: OrderStatus) => {
          const cfg = STATUS_CONFIG[status];
          return (
            <Tag icon={cfg.icon} color={cfg.color}>
              {status}
            </Tag>
          );
        },
      },
      {
        title: "Progress",
        key: "progress",
        width: 200,
        render: (_: unknown, record: WorkOrder) => {
          const pct =
            record.quantity > 0
              ? Math.round((record.completed / record.quantity) * 100)
              : 0;
          return (
            <Tooltip title={`${record.completed} / ${record.quantity} units`}>
              <Progress
                percent={pct}
                size="small"
                status={record.status === "Delayed" ? "exception" : "active"}
              />
            </Tooltip>
          );
        },
      },
      { title: "Due Date", dataIndex: "dueDate", key: "dueDate" },
      {
        title: "Actions",
        key: "actions",
        render: (_: unknown, record: WorkOrder) => (
          <Space>
            <Button type="text" icon={<EditOutlined />} size="small" />
            <Popconfirm
              title="Delete this order?"
              onConfirm={() => handleDeleteOrder(record.key)}
            >
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                size="small"
              />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [handleDeleteOrder],
  );

  // --- Shared conflict props ---

  const conflictProps = {
    dateConflicts,
    conflictAcknowledged,
    onConflictAcknowledge: setConflictAcknowledged,
    onDateChange: checkDateConflicts,
    isSubmitBlocked,
  };

  return (
    <div>
      {/* Stats */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title="Total Orders"
              value={stats.total}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title="In Progress"
              value={stats.active}
              valueStyle={{ color: "#1890ff" }}
              prefix={<SyncOutlined spin />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title="Delayed / Critical"
              value={stats.delayed}
              valueStyle={{ color: "#cf1322" }}
              prefix={<ClockCircleOutlined />}
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
        <Title level={3} style={{ margin: 0, whiteSpace: "nowrap" }}>
          Work Orders
        </Title>

        <div style={{ flex: 1, margin: "0 24px" }}>
          {upcomingDeadlines.length > 0 && (
            <Alert
              message={
                <span style={{ fontWeight: 600 }}>
                  ⚠️ Production Alert: {upcomingDeadlines.length} order(s) due
                  within 72 hours.
                </span>
              }
              type="warning"
              showIcon
              closable
              style={{ border: "1px solid #ffe58f", backgroundColor: "#fffbe6" }}
            />
          )}
        </div>

        <Space>
          <Badge count={requests.length} offset={[-5, 5]}>
            <Button icon={<BellOutlined />} onClick={openRequestList}>
              Order Requests
            </Button>
          </Badge>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreateModal}
          >
            Create Order
          </Button>
        </Space>
      </div>

      {/* Table */}
      <Card bordered={false}>
        <Table<WorkOrder>
          columns={columns}
          dataSource={orders}
          pagination={{ pageSize: 10 }}
          rowKey="key"
        />
      </Card>

      {/* Modals */}
      <CreateOrderModal
        open={modal.type === "create"}
        form={createForm}
        onFinish={handleCreateOrder}
        onCancel={closeModal}
        {...conflictProps}
      />

      <RequestListModal
        open={modal.type === "requestList"}
        requests={requests}
        onCancel={closeModal}
        onAccept={openAcceptModal}
        onDecline={handleDeclineRequest}
      />

      <AcceptOrderModal
        open={modal.type === "accept"}
        request={modal.type === "accept" ? modal.request : null}
        form={acceptForm}
        onFinish={handleAcceptRequest}
        onCancel={closeModal}
        {...conflictProps}
      />
    </div>
  );
};

export default WorkOrders;
