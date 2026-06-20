import React, { useEffect, useState, useMemo } from "react";
import {
  Table, Card, Tag, Typography, Button, Space, message, Drawer,
  Modal, Form, Input, InputNumber, DatePicker, Select, Tabs,
  Progress, Tooltip,
} from "antd";
import {
  CheckOutlined, CloseOutlined, EyeOutlined,
  ClockCircleOutlined, SyncOutlined, CheckCircleOutlined, PauseCircleOutlined,
  CalendarOutlined, PlusSquareOutlined, MinusSquareOutlined, ReloadOutlined,
  UpOutlined, DownOutlined, SearchOutlined
} from "@ant-design/icons";
import type { InputRef } from "antd";
import type { ColumnType } from "antd/es/table";
import type { FilterDropdownProps } from "antd/es/table/interface";
import apiClient from "../../services/apiClient";
import ProductVisualizer from "../Production/components/ProductVisualizer";
import AssignmentFields from "../Production/components/AssignmentFields";
import { Empty, Row, Col } from "antd";

const { Title, Text } = Typography;
const { TabPane } = Tabs;

interface WorkOrderDetails {
  status: string;
  raw_status: string;
  target_qty: number;
  good_qty: number;
  progress_percentage: number;
  due_date: string | null;
  priority: number;
}


interface Notification {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface OrderRequest {
  id: string;
  customer: { id: string; username: string };
  title: string;
  description: string;
  quantity: number;
  status: string;
  created_at: string;
  file_3d_url: string | null;
  file_glb_url: string | null;
  work_order_code: string | null;
  work_order_details: WorkOrderDetails | null;
  rejection_reason?: string | null;
  /** True for work orders without a customer order request (seed/manual jobs). */
  is_internal?: boolean;
}

/** Subset of WorkOrderSerializer used to surface internal jobs as orders. */
interface BackendWorkOrder {
  id: string;
  code: string;
  description: string;
  part: { name: string } | null;
  product_title: string | null;
  customer: { id: string; username: string } | null;
  target_qty: number;
  status: string;
  created_at: string;
  file_3d_url: string | null;
  file_glb_url: string | null;
  production_details: WorkOrderDetails | null;
}

/** Map a customer-less WorkOrder into the OrderRequest row shape. */
const internalWorkOrderToRow = (wo: BackendWorkOrder): OrderRequest => ({
  id: wo.id,
  customer: { id: "internal", username: "Internal" },
  title: wo.product_title ?? wo.part?.name ?? wo.code,
  description: wo.description,
  quantity: wo.target_qty,
  // APPROVED keeps internal jobs out of the pending Requests tab; the
  // active/history split below is driven by work_order_details.raw_status.
  status: "APPROVED",
  created_at: wo.created_at,
  file_3d_url: wo.file_3d_url,
  file_glb_url: wo.file_glb_url,
  work_order_code: wo.code,
  work_order_details: wo.production_details,
  rejection_reason: null,
  is_internal: true,
});

const PRODUCTION_STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  Queued:          { icon: <ClockCircleOutlined />,  color: "default" },
  "In Production": { icon: <SyncOutlined spin />,    color: "processing" },
  Paused:          { icon: <PauseCircleOutlined />,   color: "warning" },
  Completed:       { icon: <CheckCircleOutlined />,   color: "success" },
  Cancelled:       { icon: <CloseOutlined />,         color: "error" },
};


const OrdersList: React.FC = () => {
  const [orders, setOrders] = useState<OrderRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("requests");
  const [expandedRowKeys, setExpandedRowKeys] = useState<readonly React.Key[]>([]);
  const [tableParams, setTableParams] = useState({ current: 1, pageSize: 10 });
  
  // Approval Modal State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [approvingOrder, setApprovingOrder] = useState<OrderRequest | null>(null);
  const [form] = Form.useForm();
  
  // Reject Modal State
  const [isRejectModalVisible, setIsRejectModalVisible] = useState(false);
  const [rejectingOrder, setRejectingOrder] = useState<OrderRequest | null>(null);
  const [rejectForm] = Form.useForm();

  const [productionLines, setProductionLines] = useState<{ id: string; name: string; status: string; isCustom: boolean; machineIds: string[] }[]>([]);
  const [machines, setMachines] = useState<{ id: string; name: string; type: string; status: string }[]>([]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const [requestsRes, workOrdersRes] = await Promise.all([
        apiClient.get<OrderRequest[]>("/orders/requests/"),
        apiClient.get<BackendWorkOrder[]>("/workorders/"),
      ]);
      // Work orders without a customer are internal (seed/manual) jobs —
      // surface them alongside customer orders in Active/History.
      const internal = workOrdersRes.data
        .filter((wo) => !wo.customer)
        .map(internalWorkOrderToRow);
      setOrders([...requestsRes.data, ...internal]);
    } catch (error) {
      message.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  const fetchProductionLines = async () => {
    try {
      const { data } = await apiClient.get("/production-lines/");
      const mapped = data.map((l: any) => ({
        ...l,
        status: l.status === "ACTIVE" ? "Active" : l.status === "MAINTENANCE" ? "Maintenance" : "Idle"
      }));
      setProductionLines(mapped);
    } catch (error) {
      console.error("Failed to load production lines", error);
    }
  };

  const fetchMachines = async () => {
    try {
      const { data } = await apiClient.get("/machines/");
      const mapped = data.map((m: any) => ({
        ...m,
        status: m.status === "RUNNING" ? "In Use" : m.status === "IDLE" ? "Available" : m.status === "DOWN" ? "Error" : "Maintenance"
      }));
      setMachines(mapped);
    } catch (error) {
      console.error("Failed to load machines", error);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchProductionLines();
    fetchMachines();
    
    // Poll every 5 seconds to automatically detect machines added by simulator_gui
    const interval = setInterval(() => {
      fetchOrders();
      fetchProductionLines();
      fetchMachines();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Filter Data
  const requestsData = useMemo(() => orders.filter(o => o.status === "PENDING"), [orders]);
  
  const activeOrdersData = useMemo(() => orders.filter(o => 
    o.status === "APPROVED" && 
    o.work_order_details && 
    ["PENDING", "IN_PROGRESS", "PAUSED"].includes(o.work_order_details.raw_status)
  ), [orders]);

  const historyData = useMemo(() => orders.filter(o => 
    o.status === "REJECTED" || 
    (o.status === "APPROVED" && o.work_order_details && ["COMPLETED", "CANCELLED"].includes(o.work_order_details.raw_status))
  ), [orders]);

  // Actions
  const handleApproveClick = (record: OrderRequest) => {
    setApprovingOrder(record);
    form.setFieldsValue({
      part_name: record.title || `Part for ${record.customer.username} - ${record.id.substring(0, 4)}`,
      part_sku: `SKU-${record.id.substring(0, 8).toUpperCase()}`,
      target_qty: record.quantity,
      priority: 2, // Medium priority by default
      assignmentType: "existing-line", // default
    });
    setIsModalVisible(true);
  };

  const handleRejectClick = (record: OrderRequest) => {
    setRejectingOrder(record);
    rejectForm.resetFields();
    setIsRejectModalVisible(true);
  };

  const handleRejectSubmit = async (values: any) => {
    if (!rejectingOrder) return;
    try {
      await apiClient.post(`/orders/requests/${rejectingOrder.id}/reject/`, {
        rejection_reason: values.rejection_reason,
      });
      message.success("Order request rejected");
      setIsRejectModalVisible(false);
      fetchOrders();
    } catch (error) {
      message.error("Failed to reject order request");
    }
  };

  const handleApproveSubmit = async (values: any) => {
    if (!approvingOrder) return;
    try {
      await apiClient.post(`/orders/requests/${approvingOrder.id}/approve/`, {
        ...values,
        due_date: values.due_date ? values.due_date.toISOString() : null,
      });
      message.success("Order approved and moved to Backlog!");
      setIsModalVisible(false);
      fetchOrders();
    } catch (error: any) {
      console.error("Approve error:", error?.response?.status, error?.response?.data, error);
      message.error(`Failed to approve order: ${error?.response?.data?.detail || error?.message || 'Unknown error'}`);
    }
  };

  const handleRetryConversion = async (id: string) => {
    try {
      await apiClient.post(`/orders/requests/${id}/retry-conversion/`);
      message.success("3D model converted successfully");
      fetchOrders();
    } catch (error) {
      message.error("Failed to convert 3D model");
    }
  };

  // Shared columns
  const fileColumn = {
    title: "3D File",
    key: "file",
    width: 150,
    render: (_: any, record: OrderRequest) => (
      <Space>
        {record.file_3d_url ? (
          <Button type="link" size="small" href={record.file_3d_url} target="_blank">Download</Button>
        ) : (
          <Text type="secondary">No file</Text>
        )}
      </Space>
    ),
  };

  const expandedRowRender = (record: OrderRequest) => (
      <div style={{ padding: '24px 48px', backgroundColor: '#fafafa', borderTop: '1px solid #f0f0f0' }}>
        <Row gutter={24}>
          <Col span={12}>
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">Work Order Code: </Text>
              <Text strong>{record.work_order_code || "—"}</Text>
            </div>
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">Description: </Text>
              <Text>{record.description}</Text>
            </div>
          </Col>
          <Col span={12}>
            {record.file_glb_url ? (
              <ProductVisualizer status={record.work_order_details?.status || "Pending Review"} modelUrl={record.file_glb_url} />
            ) : (
              <Empty
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
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )}
          </Col>
        </Row>
      </div>
    );

  const expandableProps = {
    expandedRowRender,
    expandedRowKeys,
    onExpandedRowsChange: setExpandedRowKeys,
    rowExpandable: (record: OrderRequest) => true,
  };

  const searchInput = React.useRef<InputRef>(null);

  const getColumnSearchProps = (dataIndex: string | string[]): ColumnType<any> => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: FilterDropdownProps) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder="Search..."
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => confirm()}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button type="primary" onClick={() => confirm()} icon={<SearchOutlined />} size="small" style={{ width: 90 }}>
            Search
          </Button>
          <Button onClick={() => { clearFilters?.(); confirm(); }} size="small" style={{ width: 90 }}>
            Reset
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered: boolean) => <SearchOutlined style={{ color: filtered ? "#1890ff" : undefined }} />,
    onFilter: (value, record) => {
      let val = record;
      if (Array.isArray(dataIndex)) {
        dataIndex.forEach(key => { val = val?.[key]; });
      } else {
        val = val?.[dataIndex];
      }
      return String(val ?? "").toLowerCase().includes((value as string).toLowerCase());
    },
    onFilterDropdownOpenChange: (visible) => {
      if (visible) setTimeout(() => searchInput.current?.select(), 100);
    },
  });

  // Columns for Requests Tab
  const requestColumns = [
    { title: "Customer", dataIndex: ["customer", "username"], key: "customer", sorter: (a: OrderRequest, b: OrderRequest) => a.customer.username.localeCompare(b.customer.username), ...getColumnSearchProps(["customer", "username"]) },
    { title: "Product Name", dataIndex: "title", key: "title", ellipsis: true, sorter: (a: OrderRequest, b: OrderRequest) => (a.title || "").localeCompare(b.title || ""), ...getColumnSearchProps("title") },
    { title: "Req. Qty", dataIndex: "quantity", key: "quantity", width: 100, sorter: (a: OrderRequest, b: OrderRequest) => a.quantity - b.quantity },
    { title: "Date", dataIndex: "created_at", key: "created_at", render: (val: string) => new Date(val).toLocaleDateString(), sorter: (a: OrderRequest, b: OrderRequest) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() },
    fileColumn,
    {
      title: "Actions",
      key: "actions",
      render: (_: any, record: OrderRequest) => (
        <Space>
          <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => handleApproveClick(record)}>Approve</Button>
          <Button danger size="small" icon={<CloseOutlined />} onClick={() => handleRejectClick(record)}>Reject</Button>
        </Space>
      ),
    },
  ];

  // Columns for Active Orders Tab
  const activeColumns = [
    { title: "WO Code", dataIndex: "work_order_code", key: "work_order_code", render: (val: string) => <Tag color="geekblue">{val}</Tag>, sorter: (a: OrderRequest, b: OrderRequest) => (a.work_order_code || "").localeCompare(b.work_order_code || ""), ...getColumnSearchProps("work_order_code") },
    { title: "Customer", dataIndex: ["customer", "username"], key: "customer", sorter: (a: OrderRequest, b: OrderRequest) => a.customer.username.localeCompare(b.customer.username), ...getColumnSearchProps(["customer", "username"]) },
    { title: "Product Name", dataIndex: "title", key: "title", ellipsis: true, sorter: (a: OrderRequest, b: OrderRequest) => (a.title || "").localeCompare(b.title || ""), ...getColumnSearchProps("title") },
    { 
      title: "Production Status", 
      key: "production", 
      render: (_: any, record: OrderRequest) => {
        const details = record.work_order_details;
        if (!details) return null;
        const cfg = PRODUCTION_STATUS_CONFIG[details.status] ?? { icon: null, color: "default" };
        return <Tag icon={cfg.icon} color={cfg.color}>{details.status}</Tag>;
      }
    },
    {
      title: "Progress",
      key: "progress",
      width: 180,
      render: (_: any, record: OrderRequest) => {
        const details = record.work_order_details;
        if (!details) return null;
        return (
          <Tooltip title={`${details.good_qty} / ${details.target_qty} units`}>
            <Progress percent={details.progress_percentage} size="small" status={details.progress_percentage >= 100 ? "success" : "active"} />
          </Tooltip>
        );
      },
    },
    {
      title: "Due Date",
      key: "due_date",
      sorter: (a: OrderRequest, b: OrderRequest) => {
        const da = a.work_order_details?.due_date ? new Date(a.work_order_details.due_date).getTime() : 0;
        const db = b.work_order_details?.due_date ? new Date(b.work_order_details.due_date).getTime() : 0;
        return da - db;
      },
      render: (_: any, record: OrderRequest) => {
        const dueDate = record.work_order_details?.due_date;
        if (!dueDate) return <Text type="secondary">—</Text>;
        const due = new Date(dueDate);
        const daysLeft = Math.ceil((due.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        const isOverdue = daysLeft < 0;
        const isUrgent = daysLeft <= 3 && daysLeft >= 0;
        return (
          <Space size={4}>
            <CalendarOutlined style={{ color: isOverdue ? "#ff4d4f" : isUrgent ? "#faad14" : "#1890ff" }} />
            <Text type={isOverdue ? "danger" : isUrgent ? "warning" : undefined}>{due.toLocaleDateString()}</Text>
          </Space>
        );
      }
    },
    fileColumn,
  ];

  // Columns for History Tab
  const historyColumns = [
    { title: "Customer", dataIndex: ["customer", "username"], key: "customer", sorter: (a: OrderRequest, b: OrderRequest) => a.customer.username.localeCompare(b.customer.username), ...getColumnSearchProps(["customer", "username"]) },
    { title: "Product Name", dataIndex: "title", key: "title", ellipsis: true, sorter: (a: OrderRequest, b: OrderRequest) => (a.title || "").localeCompare(b.title || ""), ...getColumnSearchProps("title") },
    { 
      title: "Final Status", 
      key: "status", 
      render: (_: any, record: OrderRequest) => {
        if (record.status === "REJECTED") {
          return (
            <Tooltip title={record.rejection_reason || "No reason provided"}>
              <Tag color="red">Rejected</Tag>
            </Tooltip>
          );
        }
        const status = record.work_order_details?.status;
        const cfg = PRODUCTION_STATUS_CONFIG[status || ""] ?? { icon: null, color: "default" };
        
        if (status === "Cancelled" && record.rejection_reason) {
          return (
            <Tooltip title={`Reason: ${record.rejection_reason}`}>
              <Tag icon={cfg.icon} color={cfg.color}>{status}</Tag>
            </Tooltip>
          );
        }
        return <Tag icon={cfg.icon} color={cfg.color}>{status}</Tag>;
      }
    },
    {
      title: "Target / Good Qty",
      key: "qty",
      render: (_: any, record: OrderRequest) => {
        if (!record.work_order_details) return "—";
        return `${record.work_order_details.good_qty} / ${record.work_order_details.target_qty}`;
      }
    },
    { title: "Order Date", dataIndex: "created_at", key: "created_at", render: (val: string) => new Date(val).toLocaleDateString(), sorter: (a: OrderRequest, b: OrderRequest) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() },
    fileColumn,
  ];

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>Orders</Title>
        <Space>
          <Button onClick={() => {
            const dataSource = activeTab === 'requests' ? requestsData : activeTab === 'active' ? activeOrdersData : historyData;
            const currentData = dataSource.slice((tableParams.current - 1) * tableParams.pageSize, tableParams.current * tableParams.pageSize);
            const newKeys = new Set([...expandedRowKeys, ...currentData.map(o => o.id)]);
            setExpandedRowKeys(Array.from(newKeys));
          }}>Expand Page</Button>
          <Button onClick={() => {
            const dataSource = activeTab === 'requests' ? requestsData : activeTab === 'active' ? activeOrdersData : historyData;
            const currentData = dataSource.slice((tableParams.current - 1) * tableParams.pageSize, tableParams.current * tableParams.pageSize);
            const keysToRemove = new Set(currentData.map(o => o.id));
            setExpandedRowKeys(expandedRowKeys.filter(k => !keysToRemove.has(k as string)));
          }}>Collapse Page</Button>
          <Button icon={<ReloadOutlined />} onClick={fetchOrders} loading={loading}>Refresh</Button>
        </Space>
      </div>

      <Card bordered={false}>
        <Tabs activeKey={activeTab} onChange={(key) => { setActiveTab(key); setTableParams({ current: 1, pageSize: 10 }); }}>
          <TabPane tab={`Requests (${requestsData.length})`} key="requests">
            <Table 
              dataSource={requestsData} columns={requestColumns} rowKey="id" loading={loading} 
              expandable={expandableProps}
              pagination={{ current: tableParams.current, pageSize: tableParams.pageSize, showSizeChanger: true }}
              onChange={(pagination) => setTableParams({ current: pagination.current || 1, pageSize: pagination.pageSize || 10 })}
            />
          </TabPane>
          <TabPane tab={`Active Orders (${activeOrdersData.length})`} key="active">
            <Table 
              dataSource={activeOrdersData} columns={activeColumns} rowKey="id" loading={loading} 
              expandable={expandableProps} 
              pagination={{ current: tableParams.current, pageSize: tableParams.pageSize, showSizeChanger: true }}
              onChange={(pagination) => setTableParams({ current: pagination.current || 1, pageSize: pagination.pageSize || 10 })}
            />
          </TabPane>
          <TabPane tab="History" key="history">
            <Table 
              dataSource={historyData} columns={historyColumns} rowKey="id" loading={loading} 
              expandable={expandableProps} 
              pagination={{ current: tableParams.current, pageSize: tableParams.pageSize, showSizeChanger: true }}
              onChange={(pagination) => setTableParams({ current: pagination.current || 1, pageSize: pagination.pageSize || 10 })}
            />
          </TabPane>
        </Tabs>
      </Card>



      <Modal title="Approve Order & Plan Production" open={isModalVisible} onCancel={() => setIsModalVisible(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleApproveSubmit}>
          <Form.Item name="part_name" label="Part Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="part_sku" label="Part SKU" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="target_qty" label="Target Quantity" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="priority" label="Priority (1=Low, 2=Medium, 3=High)" rules={[{ required: true }]}><InputNumber min={1} max={3} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="due_date" label="Due Date"><DatePicker style={{ width: "100%" }} showTime /></Form.Item>
          
          <div style={{ background: "#e6f4ff", padding: 16, borderRadius: 8, marginBottom: 24, border: "1px solid #91caff" }}>
            <Text strong>Pre-assign Production Setup (Optional)</Text>
            <p style={{ margin: "4px 0 12px 0", fontSize: 12, color: "#5c5c5c" }}>
              If you pre-assign machines or a line here, they will automatically populate when the operator pulls this order into Production.
            </p>
            <AssignmentFields
              assignmentType={Form.useWatch("assignmentType", form)}
              lines={productionLines as any}
              availableMachines={machines.filter((m) => m.status === "Available") as any}
            />
          </div>

          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={() => setIsModalVisible(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit">Approve & Send to Backlog</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Reject Order Request" open={isRejectModalVisible} onCancel={() => setIsRejectModalVisible(false)} footer={null} destroyOnClose>
        <Form form={rejectForm} layout="vertical" onFinish={handleRejectSubmit}>
          <p style={{ marginBottom: 16 }}>Are you sure you want to reject this order? You may optionally provide a reason.</p>
          <Form.Item name="rejection_reason" label="Rejection Reason (Optional)">
            <Input.TextArea rows={3} placeholder="e.g., Cannot manufacture this geometry, invalid file, etc." />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={() => setIsRejectModalVisible(false)}>Cancel</Button>
              <Button danger htmlType="submit">Confirm Reject</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default OrdersList;
