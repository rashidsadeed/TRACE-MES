import React, { useState } from "react";
import {
  Table,
  Button,
  Card,
  Tag,
  Progress,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Typography,
  message,
  Steps,
  Descriptions,
  Badge,
  Popconfirm,
  Row,
  Col,
} from "antd";
import type { TableProps } from "antd";
import {
  PlusOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  SettingOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;
const { Option } = Select;

// --- Interfaces ---

interface ProductionJob {
  key: string;
  lineId: string;
  productName: string;
  status: "Running" | "Paused" | "Maintenance" | "Scheduled";
  targetQty: number;
  actualQty: number;
  startTime: string;
  // Detailed Info Fields
  currentStageIndex: number; // 0 to 3
  stages: string[];
  defects: number;
  estimatedTimeRemaining: string;
  location: string;
}

// --- Mock Data ---

const initialData: ProductionJob[] = [
  {
    key: "1",
    lineId: "LINE-01",
    productName: "Auto Part X-200",
    status: "Running",
    targetQty: 5000,
    actualQty: 3250,
    startTime: "08:00 AM",
    currentStageIndex: 2,
    stages: [
      "Raw Material",
      "Casting",
      "Machining",
      "Quality Check",
      "Packaging",
    ],
    defects: 12,
    estimatedTimeRemaining: "2h 15m",
    location: "Zone A - CNC Sector",
  },
  {
    key: "2",
    lineId: "LINE-02",
    productName: "Circuit Board V2",
    status: "Paused",
    targetQty: 2000,
    actualQty: 1800,
    startTime: "08:15 AM",
    currentStageIndex: 3,
    stages: [
      "PCB Printing",
      "Component Placement",
      "Soldering",
      "Testing",
      "Boxing",
    ],
    defects: 5,
    estimatedTimeRemaining: "45m",
    location: "Zone B - Clean Room",
  },
  {
    key: "3",
    lineId: "LINE-03",
    productName: "Housing Unit A",
    status: "Scheduled",
    targetQty: 1000,
    actualQty: 0,
    startTime: "-",
    currentStageIndex: 0,
    stages: ["Molding", "Cooling", "Trimming", "Inspection"],
    defects: 0,
    estimatedTimeRemaining: "4h 00m",
    location: "Zone C - Injection Molding",
  },
];

// --- 3D Visualizer Placeholder Component ---
// In a real app, you would use <Canvas> from @react-three/fiber here.
const ProductVisualizer: React.FC<{ status: string }> = ({ status }) => {
  const isRunning = status === "Running";

  return (
    <div
      style={{
        height: "250px",
        background: "#1f1f1f",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        border: "1px solid #303030",
      }}
    >
      {/* CSS 3D Cube Simulation */}
      <div
        className="cube-container"
        style={{
          width: 80,
          height: 80,
          transformStyle: "preserve-3d",
          animation: isRunning ? "spin 4s infinite linear" : "none",
          transform: "rotateX(-30deg) rotateY(45deg)",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            background: "rgba(24, 144, 255, 0.5)",
            border: "2px solid #1890ff",
            transform: "translateZ(40px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            background: "rgba(24, 144, 255, 0.5)",
            border: "2px solid #1890ff",
            transform: "rotateY(180deg) translateZ(40px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            background: "rgba(24, 144, 255, 0.5)",
            border: "2px solid #1890ff",
            transform: "rotateY(90deg) translateZ(40px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            background: "rgba(24, 144, 255, 0.5)",
            border: "2px solid #1890ff",
            transform: "rotateY(-90deg) translateZ(40px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            background: "rgba(24, 144, 255, 0.5)",
            border: "2px solid #1890ff",
            transform: "rotateX(90deg) translateZ(40px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            background: "rgba(24, 144, 255, 0.5)",
            border: "2px solid #1890ff",
            transform: "rotateX(-90deg) translateZ(40px)",
          }}
        />
      </div>

      <div style={{ position: "absolute", bottom: 10, right: 10 }}>
        <Tag color="blue">3D Live View</Tag>
      </div>
      <style>{`
        @keyframes spin {
          from { transform: rotateX(-30deg) rotateY(0deg); }
          to { transform: rotateX(-30deg) rotateY(360deg); }
        }
      `}</style>
    </div>
  );
};

const ProductionLine: React.FC = () => {
  const [data, setData] = useState<ProductionJob[]>(initialData);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  // --- Handlers ---

  const handleAddProduction = (values: any) => {
    const newJob: ProductionJob = {
      key: Date.now().toString(),
      lineId: values.lineId,
      productName: values.productName,
      status: "Scheduled",
      targetQty: values.targetQty,
      actualQty: 0,
      startTime: "-",
      currentStageIndex: 0,
      stages: ["Prep", "Assembly", "QC", "Packing"],
      defects: 0,
      estimatedTimeRemaining: "TBD",
      location: "Staging Area",
    };

    setData([...data, newJob]);
    setIsModalOpen(false);
    form.resetFields();
    message.success("New production job scheduled successfully");
  };

  const handleCancelJob = (key: string) => {
    setData((prevData) => prevData.filter((item) => item.key !== key));
    message.info("Scheduled job cancelled.");
  };

  // --- Expanded Row Render (The Details Tab) ---

  const expandedRowRender = (record: ProductionJob) => {
    return (
      <div
        style={{ padding: "10px 24px", background: "#fafafa", borderRadius: 8 }}
      >
        <Row gutter={[32, 32]}>
          {/* Left Column: Stats & Steps */}
          <Col xs={24} lg={14}>
            <Title level={5} style={{ marginTop: 0 }}>
              Real-time Process Tracking
            </Title>

            <Steps
              current={record.currentStageIndex}
              size="small"
              status={record.status === "Paused" ? "error" : "process"}
              items={record.stages.map((stage) => ({ title: stage }))}
              style={{ marginBottom: 24 }}
            />

            <Descriptions
              title="Diagnostic Data"
              bordered
              size="small"
              column={2}
            >
              <Descriptions.Item label="Current Location">
                {record.location}
              </Descriptions.Item>
              <Descriptions.Item label="Est. Completion">
                {record.estimatedTimeRemaining}
              </Descriptions.Item>
              <Descriptions.Item label="Defect Rate">
                <Badge
                  status={record.defects > 10 ? "error" : "success"}
                  text={`${record.defects} units detected`}
                />
              </Descriptions.Item>
              <Descriptions.Item label="Cycle Time">
                45s / unit
              </Descriptions.Item>
              <Descriptions.Item label="Operator">
                John Doe (ID: 4421)
              </Descriptions.Item>
              <Descriptions.Item label="Last Maintenance">
                2 days ago
              </Descriptions.Item>
            </Descriptions>
          </Col>

          {/* Right Column: 3D Model */}
          <Col xs={24} lg={10}>
            <Title level={5} style={{ marginTop: 0 }}>
              Digital Twin
            </Title>
            <ProductVisualizer status={record.status} />
            <div
              style={{
                marginTop: 12,
                textAlign: "center",
                color: "#888",
                fontSize: 12,
              }}
            >
              Interactive 3D Model • Rotate to inspect
            </div>
          </Col>
        </Row>
      </div>
    );
  };

  // --- Table Columns ---

  const columns: TableProps<ProductionJob>["columns"] = [
    {
      title: "Line ID",
      dataIndex: "lineId",
      key: "lineId",
      render: (text) => <span style={{ fontWeight: 600 }}>{text}</span>,
    },
    {
      title: "Product",
      dataIndex: "productName",
      key: "productName",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => {
        let color = "default";
        let icon = <StopOutlined />;

        if (status === "Running") {
          color = "success";
          icon = <PlayCircleOutlined />;
        }
        if (status === "Paused") {
          color = "warning";
          icon = <PauseCircleOutlined />;
        }
        if (status === "Maintenance") {
          color = "error";
          icon = <SettingOutlined />;
        }
        if (status === "Scheduled") {
          color = "processing";
          icon = <ClockCircleOutlined />;
        }

        return (
          <Tag icon={icon} color={color}>
            {status.toUpperCase()}
          </Tag>
        );
      },
    },
    {
      title: "Progress",
      key: "progress",
      render: (_, record) => {
        if (record.targetQty === 0)
          return <span style={{ color: "#ccc" }}>N/A</span>;
        const percent = Math.round((record.actualQty / record.targetQty) * 100);
        return (
          <div style={{ width: 180 }}>
            <Progress
              percent={percent}
              size="small"
              status={percent >= 100 ? "success" : "active"}
            />
          </div>
        );
      },
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) => (
        <Space size="middle">
          {/* Only show Cancel button if status is Scheduled */}
          {record.status === "Scheduled" ? (
            <Popconfirm
              title="Cancel Job"
              description="Are you sure you want to remove this schedule?"
              onConfirm={() => handleCancelJob(record.key)}
              okText="Yes"
              cancelText="No"
            >
              <Button type="text" danger icon={<DeleteOutlined />}>
                Cancel
              </Button>
            </Popconfirm>
          ) : (
            <Button type="link" size="small" disabled>
              Locked
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Header Section */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          <Title level={2} style={{ margin: 0 }}>
            Production Lines
          </Title>
          <span style={{ color: "#8c8c8c" }}>
            Manage active jobs and machine assignments.
          </span>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={() => setIsModalOpen(true)}
        >
          Start New Job
        </Button>
      </div>

      {/* Main Table */}
      <Card
        bordered={false}
        style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.03)" }}
      >
        <Table<ProductionJob>
          columns={columns}
          dataSource={data}
          pagination={{ pageSize: 10 }}
          expandable={{
            expandedRowRender,
            expandRowByClick: true, // Click anywhere on row to open
            rowExpandable: (record) => record.status !== "Maintenance",
          }}
        />
      </Card>

      {/* Add Production Modal */}
      <Modal
        title="Start New Production Job"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAddProduction}
          initialValues={{ status: "Scheduled" }}
        >
          <Form.Item
            name="lineId"
            label="Production Line"
            rules={[{ required: true, message: "Please select a line" }]}
          >
            <Select placeholder="Select Line">
              <Option value="LINE-01">LINE-01 (Assembly)</Option>
              <Option value="LINE-02">LINE-02 (PCB)</Option>
              <Option value="LINE-03">LINE-03 (Packaging)</Option>
              <Option value="LINE-04">LINE-04 (Testing)</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="productName"
            label="Product Name"
            rules={[{ required: true, message: "Please enter product name" }]}
          >
            <Input placeholder="e.g. Widget X-500" />
          </Form.Item>

          <Form.Item
            name="targetQty"
            label="Target Quantity"
            rules={[
              { required: true, message: "Please enter target quantity" },
            ]}
          >
            <InputNumber style={{ width: "100%" }} min={1} placeholder="1000" />
          </Form.Item>

          <Form.Item
            style={{ marginTop: 24, marginBottom: 0, textAlign: "right" }}
          >
            <Space>
              <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit">
                Start Production
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProductionLine;
