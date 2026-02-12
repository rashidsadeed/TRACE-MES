import React from "react";
import {
  Row,
  Col,
  Card,
  Statistic,
  Table,
  Tag,
  Typography,
  Progress,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  RocketOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  AlertOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from "@ant-design/icons";

const { Title } = Typography;

// --- Interfaces ---

interface KPIData {
  title: string;
  value: number;
  suffix: string;
  icon: React.ReactNode;
  trend: "up" | "down";
  percent: number;
}

interface MachineLog {
  key: string;
  machine: string;
  status: "Running" | "Idle" | "Error" | "Maintenance";
  output: number;
  temp: number;
  lastMaint: string;
}

const Dashboard: React.FC = () => {
  // --- Data ---

  const kpiData: KPIData[] = [
    {
      title: "Total Production",
      value: 12840,
      suffix: "units",
      icon: <RocketOutlined style={{ color: "#1890ff", fontSize: 24 }} />,
      trend: "up",
      percent: 12,
    },
    {
      title: "OEE (Efficiency)",
      value: 87.5,
      suffix: "%",
      icon: <ThunderboltOutlined style={{ color: "#52c41a", fontSize: 24 }} />,
      trend: "up",
      percent: 2.4,
    },
    {
      title: "Active Machines",
      value: 24,
      suffix: "/ 26",
      icon: <ToolOutlined style={{ color: "#faad14", fontSize: 24 }} />,
      trend: "down",
      percent: 1,
    },
    {
      title: "Active Alerts",
      value: 3,
      suffix: "Critical",
      icon: <AlertOutlined style={{ color: "#ff4d4f", fontSize: 24 }} />,
      trend: "up",
      percent: 1,
    },
  ];

  const tableData: MachineLog[] = [
    {
      key: "1",
      machine: "CNC-001",
      status: "Running",
      output: 1200,
      temp: 65,
      lastMaint: "2023-10-01",
    },
    {
      key: "2",
      machine: "CNC-002",
      status: "Idle",
      output: 850,
      temp: 40,
      lastMaint: "2023-09-15",
    },
    {
      key: "3",
      machine: "Press-A1",
      status: "Error",
      output: 0,
      temp: 85,
      lastMaint: "2023-10-20",
    },
    {
      key: "4",
      machine: "Assembly-Line-4",
      status: "Running",
      output: 3400,
      temp: 55,
      lastMaint: "2023-10-05",
    },
    {
      key: "5",
      machine: "Paint-Booth-2",
      status: "Maintenance",
      output: 0,
      temp: 22,
      lastMaint: "2023-10-26",
    },
  ];

  // --- Column Definitions ---

  const columns: ColumnsType<MachineLog> = [
    {
      title: "Machine ID",
      dataIndex: "machine",
      key: "machine",
      render: (text: string) => <span style={{ fontWeight: 600 }}>{text}</span>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: MachineLog["status"]) => {
        let color = "default";
        if (status === "Running") color = "success";
        if (status === "Error") color = "error";
        if (status === "Maintenance") color = "warning";
        return <Tag color={color}>{status.toUpperCase()}</Tag>;
      },
    },
    {
      title: "Daily Output",
      dataIndex: "output",
      key: "output",
      render: (val: number) => `${val.toLocaleString()} units`,
    },
    {
      title: "Temperature (°C)",
      dataIndex: "temp",
      key: "temp",
      render: (temp: number) => (
        <div style={{ width: 100 }}>
          <Progress
            percent={temp}
            steps={5}
            size="small"
            strokeColor={temp > 80 ? "#ff4d4f" : "#1890ff"}
            showInfo={false}
          />
          <span style={{ fontSize: 12, color: "#888" }}>{temp}°C</span>
        </div>
      ),
    },
    {
      title: "Last Maintenance",
      dataIndex: "lastMaint",
      key: "lastMaint",
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>Plant Overview</Title>
        <span style={{ color: "#8c8c8c" }}>
          Real-time production metrics and machine status.
        </span>
      </div>

      {/* KPI Cards */}
      <Row gutter={[24, 24]}>
        {kpiData.map((kpi, index) => (
          <Col xs={24} sm={12} lg={6} key={index}>
            <Card bordered={false} hoverable style={{ height: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <Statistic
                  title={kpi.title}
                  value={kpi.value}
                  suffix={
                    <span style={{ fontSize: 14, color: "#8c8c8c" }}>
                      {kpi.suffix}
                    </span>
                  }
                />
                <div
                  style={{
                    padding: 8,
                    background: "#f5f5f5",
                    borderRadius: "50%",
                  }}
                >
                  {kpi.icon}
                </div>
              </div>
              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <span
                  style={{
                    color: kpi.trend === "up" ? "#52c41a" : "#ff4d4f",
                    marginRight: 8,
                  }}
                >
                  {kpi.trend === "up" ? (
                    <ArrowUpOutlined />
                  ) : (
                    <ArrowDownOutlined />
                  )}{" "}
                  {kpi.percent}%
                </span>
                <span style={{ color: "#8c8c8c" }}>vs last week</span>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Main Data Table */}
      <Row style={{ marginTop: 24 }}>
        <Col span={24}>
          <Card
            title="Recent Machine Logs"
            bordered={false}
            extra={<a href="#">View All History</a>}
          >
            <Table<MachineLog>
              columns={columns}
              dataSource={tableData}
              pagination={{ pageSize: 5 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
