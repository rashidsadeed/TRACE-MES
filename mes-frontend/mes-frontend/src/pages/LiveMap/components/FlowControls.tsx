import React from "react";
import { Input, Select, Space, Button, Tag, Typography, Tooltip } from "antd";
import {
  SearchOutlined,
  AimOutlined,
  FilterOutlined,
  FullscreenOutlined,
} from "@ant-design/icons";
import type { MachineStatus } from "../../../services/mockData";

const { Text } = Typography;

interface FlowControlsProps {
  statusFilter: MachineStatus | "All";
  onStatusFilterChange: (value: MachineStatus | "All") => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  lineFilter: string;
  onLineFilterChange: (value: string) => void;
  lineOptions: { value: string; label: string }[];
  onFitView: () => void;
  stats: {
    total: number;
    running: number;
    idle: number;
    error: number;
    maintenance: number;
  };
}

const LEGEND_ITEMS = [
  { color: "#52c41a", label: "Running" },
  { color: "#1890ff", label: "Idle" },
  { color: "#faad14", label: "Maintenance" },
  { color: "#ff4d4f", label: "Error" },
];

const FlowControls: React.FC<FlowControlsProps> = ({
  statusFilter,
  onStatusFilterChange,
  searchValue,
  onSearchChange,
  lineFilter,
  onLineFilterChange,
  lineOptions,
  onFitView,
  stats,
}) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        padding: "12px 20px",
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        marginBottom: 12,
      }}
    >
      {/* Left: Title & Stats */}
      <Space size="middle" align="center">
        <Text strong style={{ fontSize: 18 }}>
          🏭 Live Factory Map
        </Text>
        <Space size={4}>
          <Tag color="green">{stats.running} Running</Tag>
          <Tag color="blue">{stats.idle} Idle</Tag>
          <Tag color="orange">{stats.maintenance} Maint</Tag>
          <Tag color="red">{stats.error} Error</Tag>
        </Space>
      </Space>

      {/* Center: Filters */}
      <Space size="small" wrap>
        <Input
          placeholder="Search order / machine…"
          prefix={<SearchOutlined />}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          allowClear
          style={{ width: 220 }}
        />

        <Select
          value={statusFilter}
          onChange={onStatusFilterChange}
          style={{ width: 140 }}
          suffixIcon={<FilterOutlined />}
          options={[
            { value: "All", label: "All Status" },
            { value: "In Use", label: "🟢 Running" },
            { value: "Available", label: "🔵 Idle" },
            { value: "Maintenance", label: "🟡 Maintenance" },
            { value: "Error", label: "🔴 Error" },
          ]}
        />

        <Select
          value={lineFilter}
          onChange={onLineFilterChange}
          style={{ width: 180 }}
          options={[{ value: "all", label: "All Lines" }, ...lineOptions]}
        />
      </Space>

      {/* Right: Actions & Legend */}
      <Space size="middle">
        {/* Legend */}
        <Space size={8}>
          {LEGEND_ITEMS.map((item) => (
            <Space key={item.label} size={4}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: item.color,
                  display: "inline-block",
                }}
              />
              <Text style={{ fontSize: 11, color: "#8c8c8c" }}>{item.label}</Text>
            </Space>
          ))}
        </Space>

        <Tooltip title="Fit to view">
          <Button
            icon={<FullscreenOutlined />}
            size="small"
            onClick={onFitView}
          />
        </Tooltip>
        <Tooltip title="Center all">
          <Button
            icon={<AimOutlined />}
            size="small"
            onClick={onFitView}
          />
        </Tooltip>
      </Space>
    </div>
  );
};

export default FlowControls;
