import React from "react";
import {
  RocketOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  AlertOutlined,
} from "@ant-design/icons";
import type { MachineStatus, KPIData, MachineLog } from "./types";

// --- Status color mapping ---

export const MACHINE_STATUS_COLOR: Record<MachineStatus, string> = {
  Running: "success",
  Idle: "default",
  Error: "error",
  Maintenance: "warning",
};

// --- Temperature thresholds ---

export const TEMP_DANGER_THRESHOLD = 80;

// --- Mock Data ---

export const KPI_DATA: KPIData[] = [
  {
    key: "production",
    title: "Total Production",
    value: 12840,
    suffix: "units",
    icon: <RocketOutlined style={{ color: "#1890ff", fontSize: 24 }} />,
    trend: "up",
    percent: 12,
  },
  {
    key: "oee",
    title: "OEE (Efficiency)",
    value: 87.5,
    suffix: "%",
    icon: <ThunderboltOutlined style={{ color: "#52c41a", fontSize: 24 }} />,
    trend: "up",
    percent: 2.4,
  },
  {
    key: "machines",
    title: "Active Machines",
    value: 24,
    suffix: "/ 26",
    icon: <ToolOutlined style={{ color: "#faad14", fontSize: 24 }} />,
    trend: "down",
    percent: 1,
  },
  {
    key: "alerts",
    title: "Active Alerts",
    value: 3,
    suffix: "Critical",
    icon: <AlertOutlined style={{ color: "#ff4d4f", fontSize: 24 }} />,
    trend: "up",
    percent: 1,
  },
];

export const MACHINE_LOG_DATA: MachineLog[] = [
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
