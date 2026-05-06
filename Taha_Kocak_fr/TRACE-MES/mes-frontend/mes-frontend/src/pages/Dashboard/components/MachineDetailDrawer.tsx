import React, { useState } from "react";
import {
  Drawer,
  Badge,
  Tag,
  Progress,
  Typography,
  Row,
  Col,
  Card,
  Statistic,
  Space,
  Descriptions,
  Divider,
  Tooltip,
  Table,
  Button,
  message,
  Empty,
} from "antd";
import {
  CodeOutlined,
  FileTextOutlined,
  UserOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  ToolOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { MachineDetail, TelemetryPoint, ErrorLog } from "../types";
import {
  CNC_STATUS_COLOR,
  TOOL_LIFE_WARNING,
  TOOL_LIFE_DANGER,
} from "../constants";
import { resetMachineAlarm } from "../../../services/dashboardService";

const { Text, Title } = Typography;

// --- Helpers ---

const getToolLifeColor = (pct: number): string => {
  if (pct <= TOOL_LIFE_DANGER) return "#ff4d4f";
  if (pct <= TOOL_LIFE_WARNING) return "#faad14";
  return "#52c41a";
};

const getGaugeColor = (value: number, max: number): string => {
  const ratio = value / max;
  if (ratio > 0.85) return "#ff4d4f";
  if (ratio > 0.65) return "#faad14";
  return "#1890ff";
};

// --- Sub-components ---

interface GaugeCardProps {
  title: string;
  value: number;
  max: number;
  unit: string;
  icon: React.ReactNode;
}

const GaugeCard: React.FC<GaugeCardProps> = ({ title, value, max, unit, icon }) => {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  const color = getGaugeColor(value, max);

  return (
    <Card
      size="small"
      bordered={false}
      style={{
        background: "#fafafa",
        borderRadius: 12,
        textAlign: "center",
      }}
    >
      <div style={{ marginBottom: 8, color: "#8c8c8c", fontSize: 12 }}>
        {icon} {title}
      </div>
      <Progress
        type="dashboard"
        percent={percent}
        strokeColor={color}
        size={120}
        format={() => (
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{value.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: "#8c8c8c" }}>{unit}</div>
          </div>
        )}
      />
    </Card>
  );
};

// --- Main Component ---

interface MachineDetailDrawerProps {
  open: boolean;
  detail: MachineDetail | null;
  telemetryData: TelemetryPoint[];
  latestTelemetry: TelemetryPoint | null;
  errorLogs?: ErrorLog[];
  onClose: () => void;
  onResetAlarm?: (machineId: string) => void;
}

const MachineDetailDrawer: React.FC<MachineDetailDrawerProps> = ({
  open,
  detail,
  telemetryData,
  latestTelemetry,
  errorLogs = [],
  onClose,
  onResetAlarm,
}) => {
  const [resetting, setResetting] = useState(false);

  if (!detail) return null;

  const { production, activeTool, override } = detail;
  const { partCounter } = production;

  const completionPct =
    partCounter.total > 0
      ? Math.round((partCounter.good / partCounter.total) * 100)
      : 0;

  const scrapRate =
    partCounter.total > 0
      ? +((partCounter.scrap / partCounter.total) * 100).toFixed(1)
      : 0;

  const toolColor = getToolLifeColor(activeTool.lifeRemainingPercent);

  return (
    <Drawer
      title={null}
      placement="right"
      width={720}
      open={open}
      onClose={onClose}
      styles={{
        body: { padding: 0, background: "#f5f5f5" },
      }}
    >
      {/* ===== TOP STATUS BAR ===== */}
      <div
        style={{
          padding: "16px 24px",
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Space size="middle" align="center">
          <Title level={4} style={{ margin: 0 }}>
            {detail.machineName || detail.machineId}
          </Title>
          <Tag
            color={CNC_STATUS_COLOR[detail.status]}
            style={{ fontSize: 13, fontWeight: 700, padding: "2px 12px" }}
          >
            {detail.status}
          </Tag>
          <Text type="secondary">{detail.factorySection}</Text>
        </Space>

        <Space split={<Divider type="vertical" />} size={4}>
          <Tooltip title="Active Program">
            <Text style={{ fontSize: 12 }}>
              <CodeOutlined style={{ marginRight: 4 }} />
              {production.activeProgram}
            </Text>
          </Tooltip>
          <Tooltip title="Work Order">
            <Text style={{ fontSize: 12 }}>
              <FileTextOutlined style={{ marginRight: 4 }} />
              {production.jobOrderId}
            </Text>
          </Tooltip>
          <Tooltip title="Operator">
            <Text style={{ fontSize: 12 }}>
              <UserOutlined style={{ marginRight: 4 }} />
              {production.operatorId}
            </Text>
          </Tooltip>
        </Space>
      </div>

      <div style={{ padding: 20 }}>
        <Row gutter={[16, 16]}>
          {/* ===== LEFT COLUMN: PRODUCTION & TOOL ===== */}
          <Col xs={24} md={10}>
            {/* Production Progress */}
            <Card
              size="small"
              title="Production Progress"
              bordered={false}
              style={{ borderRadius: 12, marginBottom: 16 }}
            >
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <Progress
                  type="circle"
                  percent={completionPct}
                  size={140}
                  strokeColor={{
                    "0%": "#1890ff",
                    "100%": "#52c41a",
                  }}
                  format={(pct) => (
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>{pct}%</div>
                      <div style={{ fontSize: 11, color: "#8c8c8c" }}>Complete</div>
                    </div>
                  )}
                />
              </div>

              <Row gutter={8} style={{ marginTop: 16 }}>
                <Col span={8}>
                  <Statistic
                    title="Target"
                    value={partCounter.total}
                    valueStyle={{ fontSize: 18 }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Good"
                    value={partCounter.good}
                    valueStyle={{ fontSize: 18, color: "#52c41a" }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Scrap"
                    value={partCounter.scrap}
                    valueStyle={{ fontSize: 18, color: "#ff4d4f" }}
                    suffix={
                      <Text
                        type="danger"
                        style={{ fontSize: 11 }}
                      >
                        ({scrapRate}%)
                      </Text>
                    }
                  />
                </Col>
              </Row>
            </Card>

            {/* Tool Life */}
            <Card
              size="small"
              title={
                <span>
                  <ToolOutlined style={{ marginRight: 6 }} />
                  Tool Status
                </span>
              }
              bordered={false}
              style={{ borderRadius: 12, marginBottom: 16 }}
            >
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Active Tool">
                  <Tag>{activeTool.id}</Tag> {activeTool.type}
                </Descriptions.Item>
              </Descriptions>

              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <Text style={{ fontSize: 12 }}>Tool Life Remaining</Text>
                  <Text strong style={{ color: toolColor }}>
                    {activeTool.lifeRemainingPercent}%
                  </Text>
                </div>
                <Progress
                  percent={activeTool.lifeRemainingPercent}
                  strokeColor={toolColor}
                  showInfo={false}
                  size={["100%", 10]}
                />
                {activeTool.lifeRemainingPercent <= TOOL_LIFE_WARNING && (
                  <Text
                    type={activeTool.lifeRemainingPercent <= TOOL_LIFE_DANGER ? "danger" : "warning"}
                    style={{ fontSize: 11, marginTop: 4, display: "block" }}
                  >
                    ⚠ Tool replacement{" "}
                    {activeTool.lifeRemainingPercent <= TOOL_LIFE_DANGER
                      ? "critical"
                      : "recommended soon"}
                  </Text>
                )}
              </div>
            </Card>

            {/* Quick Stats */}
            <Card
              size="small"
              bordered={false}
              style={{ borderRadius: 12 }}
            >
              <Row gutter={8}>
                <Col span={12}>
                  <Statistic
                    title={
                      <span>
                        <ClockCircleOutlined style={{ marginRight: 4 }} />
                        Cycle Time
                      </span>
                    }
                    value={production.cycleTimeSeconds}
                    suffix="s"
                    valueStyle={{ fontSize: 18 }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title={
                      <span>
                        <DashboardOutlined style={{ marginRight: 4 }} />
                        Feed Rate
                      </span>
                    }
                    value={override.feed}
                    precision={1}
                    suffix="mm/min"
                    valueStyle={{ fontSize: 18 }}
                  />
                </Col>
              </Row>

              {latestTelemetry && (
                <Row gutter={8} style={{ marginTop: 12 }}>
                  <Col span={12}>
                    <Statistic
                      title="Coolant Pressure"
                      value={latestTelemetry.coolantPressure}
                      suffix="bar"
                      precision={1}
                      valueStyle={{ fontSize: 18 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="Spindle Speed"
                      value={override.spindle}
                      precision={0}
                      suffix="RPM"
                      valueStyle={{ fontSize: 18 }}
                    />
                  </Col>
                </Row>
              )}
            </Card>
          </Col>

          {/* ===== RIGHT COLUMN: GAUGES & LIVE CHARTS ===== */}
          <Col xs={24} md={14}>
            {/* Spindle Gauges */}
            <Row gutter={12} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <GaugeCard
                  title="Spindle Speed"
                  value={latestTelemetry?.spindleRpm ?? 0}
                  max={15000}
                  unit="RPM"
                  icon={<ThunderboltOutlined />}
                />
              </Col>
              <Col span={12}>
                <GaugeCard
                  title="Spindle Load"
                  value={latestTelemetry?.spindleLoad ?? 0}
                  max={100}
                  unit="% Load"
                  icon={<DashboardOutlined />}
                />
              </Col>
            </Row>

            {/* Live Temperature Chart */}
            <Card
              size="small"
              title="Temperature (°C)"
              bordered={false}
              style={{ borderRadius: 12, marginBottom: 16 }}
              extra={
                <Badge
                  status="processing"
                  text={<Text style={{ fontSize: 11, color: "#8c8c8c" }}>Live</Text>}
                />
              }
            >
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={telemetryData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ff7a45" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ff7a45" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: "#bbb" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#bbb" }} domain={[20, (dataMax: number) => Math.max(100, dataMax)]} />
                  <RTooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(val: number | undefined) => [`${val ?? 0} °C`, "Temp"]}
                  />
                  <ReferenceLine y={80} stroke="#ff4d4f" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'High Temp', fill: '#ff4d4f', fontSize: 10 }} />
                  <Area
                    type="monotone"
                    dataKey="tempC"
                    stroke="#ff7a45"
                    strokeWidth={2}
                    fill="url(#tempGradient)"
                    isAnimationActive={false}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            {/* Live Vibration Chart */}
            <Card
              size="small"
              title="Vibration (m/s²)"
              bordered={false}
              style={{ borderRadius: 12 }}
              extra={
                <Badge
                  status="processing"
                  text={<Text style={{ fontSize: 11, color: "#8c8c8c" }}>Live</Text>}
                />
              }
            >
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={telemetryData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: "#bbb" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#bbb" }} domain={[0, (dataMax: number) => Math.max(1.0, dataMax)]} />
                  <RTooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(val: number | undefined) => [`${val ?? 0} m/s²`, "Vibration"]}
                  />
                  <ReferenceLine y={0.5} stroke="#ff4d4f" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'High Vib', fill: '#ff4d4f', fontSize: 10 }} />
                  <Line
                    type="monotone"
                    dataKey="vibration"
                    stroke="#722ed1"
                    strokeWidth={2}
                    isAnimationActive={false}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>

        {/* ===== ERROR LOGS & DIAGNOSTICS ===== */}
        <Card
          size="small"
          title={
            <span>
              <WarningOutlined style={{ marginRight: 6, color: "#faad14" }} />
              Alerts & Error Logs
            </span>
          }
          bordered={false}
          style={{ borderRadius: 12, marginTop: 16 }}
          extra={
            errorLogs.some((e) => e.status === "Active") && onResetAlarm ? (
              <Button
                type="primary"
                danger
                size="small"
                icon={<ReloadOutlined />}
                loading={resetting}
                onClick={async () => {
                  setResetting(true);
                  try {
                    await onResetAlarm(detail.machineId);
                    message.success(`Alarms reset for ${detail.machineId}`);
                  } catch {
                    message.error("Failed to reset alarms.");
                  } finally {
                    setResetting(false);
                  }
                }}
              >
                Reset All Alarms
              </Button>
            ) : null
          }
        >
          {errorLogs.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No error logs recorded"
              style={{ padding: "16px 0" }}
            />
          ) : (
            <Table
              dataSource={errorLogs}
              rowKey="key"
              size="small"
              pagination={false}
              scroll={{ y: 180 }}
              columns={[
                {
                  title: "Time",
                  dataIndex: "timestamp",
                  key: "timestamp",
                  width: 90,
                  render: (t: string) => <Text style={{ fontSize: 12 }}>{t}</Text>,
                },
                {
                  title: "Code",
                  dataIndex: "errorCode",
                  key: "errorCode",
                  width: 140,
                  render: (code: string) => (
                    <Tooltip title={code}>
                      <Tag style={{ fontFamily: "monospace", fontSize: 11, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "bottom" }}>
                        {code}
                      </Tag>
                    </Tooltip>
                  ),
                },
                {
                  title: "Message",
                  dataIndex: "message",
                  key: "message",
                  render: (msg: string) => (
                    <Text
                      style={{ fontSize: 12, width: 250, display: "block" }}
                      ellipsis={{ tooltip: msg }}
                    >
                      {msg}
                    </Text>
                  ),
                },
                {
                  title: "Severity",
                  dataIndex: "severity",
                  key: "severity",
                  width: 90,
                  render: (sev: string) => {
                    const colorMap: Record<string, string> = {
                      Critical: "red",
                      Warning: "orange",
                      Info: "blue",
                    };
                    const iconMap: Record<string, React.ReactNode> = {
                      Critical: <ExclamationCircleOutlined />,
                      Warning: <WarningOutlined />,
                      Info: <CheckCircleOutlined />,
                    };
                    return (
                      <Tag
                        color={colorMap[sev] || "default"}
                        icon={iconMap[sev]}
                        style={{ fontSize: 11 }}
                      >
                        {sev}
                      </Tag>
                    );
                  },
                },
                {
                  title: "Status",
                  dataIndex: "status",
                  key: "status",
                  width: 80,
                  render: (status: string) => (
                    <Badge
                      status={status === "Active" ? "error" : "success"}
                      text={
                        <Text
                          style={{
                            fontSize: 11,
                            color: status === "Active" ? "#ff4d4f" : "#52c41a",
                          }}
                        >
                          {status}
                        </Text>
                      }
                    />
                  ),
                },
              ]}
            />
          )}
        </Card>
      </div>
    </Drawer>
  );
};

export default React.memo(MachineDetailDrawer);
