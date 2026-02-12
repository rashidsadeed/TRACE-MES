import React, { useState, useMemo } from "react";
import {
  Table,
  Card,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Typography,
  Row,
  Col,
  Statistic,
  Progress,
  message,
  Popconfirm,
  Tooltip,
  Badge,
  List,
  Avatar,
  Alert,
  Checkbox,
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
  UserOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";

const { Title, Text } = Typography;
const { Option } = Select;

// --- Interfaces ---

interface WorkOrder {
  key: string;
  id: string;
  product: string;
  quantity: number;
  completed: number;
  priority: "High" | "Normal" | "Low";
  status: "Pending" | "In Progress" | "Completed" | "Delayed";
  dueDate: string;
  assignedLine: string;
}

interface OrderRequest {
  key: string;
  client: string;
  product: string;
  quantity: number;
  requestedDate: string;
}

// --- Mock Data ---

const initialData: WorkOrder[] = [
  {
    key: "1",
    id: "WO-2024-001",
    product: "Industrial Pump X500",
    quantity: 500,
    completed: 320,
    priority: "High",
    status: "In Progress",
    dueDate: dayjs().add(1, "day").format("YYYY-MM-DD"), // Due tomorrow (for testing alert)
    assignedLine: "LINE-01",
  },
  {
    key: "2",
    id: "WO-2024-002",
    product: "Circuit Board V2",
    quantity: 2000,
    completed: 0,
    priority: "Normal",
    status: "Pending",
    dueDate: "2024-03-20",
    assignedLine: "LINE-02",
  },
];

const initialRequests: OrderRequest[] = [
  {
    key: "101",
    client: "Tesla Inc.",
    product: "Battery Casing Model Y",
    quantity: 5000,
    requestedDate: "2024-04-01",
  },
  {
    key: "102",
    client: "Samsung",
    product: 'OLED Screen 55"',
    quantity: 200,
    requestedDate: "2024-03-25",
  },
];

const WorkOrders: React.FC = () => {
  // --- State ---
  const [data, setData] = useState<WorkOrder[]>(initialData);
  const [requests, setRequests] = useState<OrderRequest[]>(initialRequests);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRequestListOpen, setIsRequestListOpen] = useState(false);
  const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);

  // Conflict Handling State
  const [dateConflicts, setDateConflicts] = useState<WorkOrder[]>([]);
  const [conflictAcknowledged, setConflictAcknowledged] = useState(false);

  // Selection
  const [targetRequest, setTargetRequest] = useState<OrderRequest | null>(null);

  const [form] = Form.useForm();
  const [acceptForm] = Form.useForm();

  // --- Logic: Check for Upcoming Deadlines (Top Alert) ---
  const upcomingDeadlines = useMemo(() => {
    const today = dayjs();
    const threeDaysFromNow = dayjs().add(3, "day");

    return data.filter((order) => {
      const due = dayjs(order.dueDate);
      return (
        order.status !== "Completed" &&
        due.isAfter(today) &&
        due.isBefore(threeDaysFromNow)
      );
    });
  }, [data]);

  // --- Logic: Check for Conflicts on Date Selection ---
  const checkDateConflicts = (date: Dayjs | null) => {
    setConflictAcknowledged(false); // Reset acknowledgement
    if (!date) {
      setDateConflicts([]);
      return;
    }

    const selectedDateStr = date.format("YYYY-MM-DD");
    const conflicts = data.filter(
      (order) =>
        order.dueDate === selectedDateStr && order.status !== "Completed",
    );
    setDateConflicts(conflicts);
  };

  // --- Handlers ---

  const handleCreateOrder = (values: any) => {
    const newOrder: WorkOrder = {
      key: Date.now().toString(),
      id: `WO-2024-${Math.floor(1000 + Math.random() * 9000)}`,
      product: values.product,
      quantity: values.quantity,
      completed: 0,
      priority: values.priority,
      status: "Pending",
      dueDate: values.dueDate ? values.dueDate.format("YYYY-MM-DD") : "TBD",
      assignedLine: values.assignedLine,
    };

    setData([newOrder, ...data]);
    closeCreateModal();
    message.success("Work Order created manually");
  };

  const handleDelete = (key: string) => {
    setData(data.filter((item) => item.key !== key));
    message.success("Work Order deleted");
  };

  const handleDeclineRequest = (key: string) => {
    setRequests(requests.filter((r) => r.key !== key));
    message.info("Request declined and removed.");
  };

  const openAcceptModal = (request: OrderRequest) => {
    setTargetRequest(request);
    setIsRequestListOpen(false);
    setIsAcceptModalOpen(true);
    setDateConflicts([]); // Reset conflicts
    setConflictAcknowledged(false);

    acceptForm.setFieldsValue({
      product: request.product,
      quantity: request.quantity,
      dueDate: dayjs(request.requestedDate),
      priority: "Normal",
    });
    // Run check immediately on the pre-filled date
    checkDateConflicts(dayjs(request.requestedDate));
  };

  const finalizeAcceptance = (values: any) => {
    if (!targetRequest) return;

    const newOrder: WorkOrder = {
      key: Date.now().toString(),
      id: `WO-REQ-${targetRequest.key}`,
      product: targetRequest.product,
      quantity: targetRequest.quantity,
      completed: 0,
      priority: values.priority,
      status: "Pending",
      dueDate: values.dueDate ? values.dueDate.format("YYYY-MM-DD") : "TBD",
      assignedLine: values.assignedLine,
    };

    setData([newOrder, ...data]);
    setRequests(requests.filter((r) => r.key !== targetRequest.key));

    closeAcceptModal();
    message.success(
      `Request from ${targetRequest.client} accepted into production.`,
    );
  };

  // Helper to close and reset modals
  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    form.resetFields();
    setDateConflicts([]);
    setConflictAcknowledged(false);
  };

  const closeAcceptModal = () => {
    setIsAcceptModalOpen(false);
    acceptForm.resetFields();
    setTargetRequest(null);
    setDateConflicts([]);
    setConflictAcknowledged(false);
  };

  // --- Table Columns ---
  const columns: TableProps<WorkOrder>["columns"] = [
    {
      title: "Order ID",
      dataIndex: "id",
      key: "id",
      render: (text) => <Text strong>{text}</Text>,
    },
    { title: "Product", dataIndex: "product", key: "product" },
    {
      title: "Priority",
      dataIndex: "priority",
      key: "priority",
      render: (priority) => (
        <Tag
          color={
            priority === "High" ? "red" : priority === "Low" ? "green" : "blue"
          }
        >
          {priority.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => {
        let icon = <ClockCircleOutlined />;
        let color = "default";
        if (status === "In Progress") {
          icon = <SyncOutlined spin />;
          color = "processing";
        }
        if (status === "Completed") {
          icon = <CheckCircleOutlined />;
          color = "success";
        }
        if (status === "Delayed") {
          icon = <ClockCircleOutlined />;
          color = "error";
        }
        return (
          <Tag icon={icon} color={color}>
            {status}
          </Tag>
        );
      },
    },
    {
      title: "Progress",
      key: "progress",
      width: 200,
      render: (_, record) => (
        <Tooltip title={`${record.completed} / ${record.quantity} units`}>
          <Progress
            percent={Math.round((record.completed / record.quantity) * 100)}
            size="small"
            status={record.status === "Delayed" ? "exception" : "active"}
          />
        </Tooltip>
      ),
    },
    { title: "Due Date", dataIndex: "dueDate", key: "dueDate" },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Space>
          <Button type="text" icon={<EditOutlined />} size="small" />
          <Popconfirm
            title="Delete order?"
            onConfirm={() => handleDelete(record.key)}
          >
            <Button type="text" danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // --- Statistics ---
  const totalOrders = data.length;
  const activeOrders = data.filter((o) => o.status === "In Progress").length;
  const delayedOrders = data.filter((o) => o.status === "Delayed").length;

  // --- Reusable Conflict Alert Component ---
  const ConflictAlert = () => {
    if (dateConflicts.length === 0) return null;
    return (
      <div style={{ marginBottom: 16 }}>
        <Alert
          message="Schedule Conflict Detected"
          description={
            <div>
              <p>The following orders are already scheduled for this date:</p>
              <ul style={{ paddingLeft: 20, margin: "5px 0" }}>
                {dateConflicts.map((c) => (
                  <li key={c.key}>
                    <b>{c.product}</b> -{" "}
                    <Tag color={c.priority === "High" ? "red" : "blue"}>
                      {c.priority}
                    </Tag>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 10 }}>
                <Checkbox
                  checked={conflictAcknowledged}
                  onChange={(e) => setConflictAcknowledged(e.target.checked)}
                >
                  <span style={{ fontWeight: 600 }}>
                    Are you sure? I acknowledge the schedule conflict.
                  </span>
                </Checkbox>
              </div>
            </div>
          }
          type="warning"
          showIcon
          icon={<ExclamationCircleOutlined />}
        />
      </div>
    );
  };

  return (
    <div>
      {/* Header Stats */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title="Total Orders"
              value={totalOrders}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title="In Progress"
              value={activeOrders}
              valueStyle={{ color: "#1890ff" }}
              prefix={<SyncOutlined spin />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title="Delayed / Critical"
              value={delayedOrders}
              valueStyle={{ color: "#cf1322" }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Content Header with SMART ALERT */}
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

        {/* --- THE ALERT IN THE MARKED PLACE --- */}
        <div style={{ flex: 1, margin: "0 24px" }}>
          {upcomingDeadlines.length > 0 && (
            <Alert
              message={
                <span style={{ fontWeight: 600 }}>
                  ⚠️ Production Alert: {upcomingDeadlines.length} orders are due
                  within 72 hours. Check priorities immediately.
                </span>
              }
              type="warning"
              showIcon
              closable
              style={{
                border: "1px solid #ffe58f",
                backgroundColor: "#fffbe6",
              }}
            />
          )}
        </div>

        <Space>
          <Badge count={requests.length} offset={[-5, 5]}>
            <Button
              icon={<BellOutlined />}
              onClick={() => setIsRequestListOpen(true)}
            >
              Order Requests
            </Button>
          </Badge>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsCreateModalOpen(true)}
          >
            Create Order
          </Button>
        </Space>
      </div>

      <Card bordered={false}>
        <Table<WorkOrder>
          columns={columns}
          dataSource={data}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* --- MODAL 1: Manual Create --- */}
      <Modal
        title="Create New Work Order (Manual)"
        open={isCreateModalOpen}
        onCancel={closeCreateModal}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateOrder}>
          <Form.Item
            name="product"
            label="Product Name"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="quantity"
                label="Quantity"
                rules={[{ required: true }]}
              >
                <InputNumber style={{ width: "100%" }} min={1} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="priority" label="Priority" initialValue="Normal">
                <Select>
                  <Option value="High">High</Option>
                  <Option value="Normal">Normal</Option>
                  <Option value="Low">Low</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="assignedLine"
            label="Assigned Line"
            rules={[{ required: true }]}
          >
            <Select>
              <Option value="LINE-01">LINE-01</Option>
              <Option value="LINE-02">LINE-02</Option>
            </Select>
          </Form.Item>

          {/* Date Picker with Conflict Check */}
          <Form.Item
            name="dueDate"
            label="Due Date"
            rules={[{ required: true }]}
          >
            <DatePicker
              style={{ width: "100%" }}
              onChange={checkDateConflicts}
            />
          </Form.Item>

          {/* Conflict Alert Component */}
          <ConflictAlert />

          <Form.Item style={{ textAlign: "right" }}>
            <Button
              type="primary"
              htmlType="submit"
              // Disable button if conflicts exist AND user hasn't checked the box
              disabled={dateConflicts.length > 0 && !conflictAcknowledged}
            >
              Create
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* --- MODAL 2: Request List --- */}
      <Modal
        title="Incoming Order Requests"
        open={isRequestListOpen}
        onCancel={() => setIsRequestListOpen(false)}
        footer={null}
        width={600}
      >
        <List
          itemLayout="horizontal"
          dataSource={requests}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  type="link"
                  danger
                  onClick={() => handleDeclineRequest(item.key)}
                >
                  Decline
                </Button>,
                <Button
                  type="primary"
                  size="small"
                  onClick={() => openAcceptModal(item)}
                >
                  Accept & Plan
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={
                  <Avatar
                    icon={<UserOutlined />}
                    style={{ backgroundColor: "#87d068" }}
                  />
                }
                title={<Text strong>{item.client}</Text>}
                description={
                  <div>
                    <div>
                      Product: <b>{item.product}</b>
                    </div>
                    <div>
                      Qty: {item.quantity} | Req. Date: {item.requestedDate}
                    </div>
                  </div>
                }
              />
            </List.Item>
          )}
        />
        {requests.length === 0 && (
          <div style={{ textAlign: "center", padding: 20, color: "#999" }}>
            No pending requests.
          </div>
        )}
      </Modal>

      {/* --- MODAL 3: Accept & Configure --- */}
      <Modal
        title={`Plan Order: ${targetRequest?.product}`}
        open={isAcceptModalOpen}
        onCancel={closeAcceptModal}
        footer={null}
      >
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: "#f5f5f5",
            borderRadius: 4,
          }}
        >
          <Text type="secondary">Client: {targetRequest?.client}</Text>
          <br />
          <Text type="secondary">Requested Qty: {targetRequest?.quantity}</Text>
        </div>

        <Form form={acceptForm} layout="vertical" onFinish={finalizeAcceptance}>
          <Form.Item name="product" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="quantity" hidden>
            <InputNumber />
          </Form.Item>
          <Form.Item
            name="assignedLine"
            label="Assign Production Line"
            rules={[{ required: true }]}
          >
            <Select placeholder="Select Line">
              <Option value="LINE-01">LINE-01</Option>
              <Option value="LINE-02">LINE-02</Option>
              <Option value="LINE-03">LINE-03</Option>
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="priority"
                label="Set Priority"
                rules={[{ required: true }]}
              >
                <Select>
                  <Option value="High">High</Option>
                  <Option value="Normal">Normal</Option>
                  <Option value="Low">Low</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="dueDate"
                label="Confirm Due Date"
                rules={[{ required: true }]}
              >
                <DatePicker
                  style={{ width: "100%" }}
                  onChange={checkDateConflicts}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Conflict Alert Component */}
          <ConflictAlert />

          <Form.Item style={{ textAlign: "right", marginTop: 16 }}>
            <Space>
              <Button onClick={closeAcceptModal}>Cancel</Button>
              <Button
                type="primary"
                htmlType="submit"
                disabled={dateConflicts.length > 0 && !conflictAcknowledged}
              >
                Confirm & Schedule
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default WorkOrders;
