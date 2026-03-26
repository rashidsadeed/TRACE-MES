import React from "react";
import {
  RocketOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  AlertOutlined,
} from "@ant-design/icons";
import type { MachineStatus, KPIData, MachineLog, MachineDetail, CNCStatus } from "./types";

// --- Status color mapping ---

export const MACHINE_STATUS_COLOR: Record<MachineStatus, string> = {
  Running: "success",
  Idle: "default",
  Error: "error",
  Maintenance: "warning",
};

export const CNC_STATUS_COLOR: Record<CNCStatus, string> = {
  RUNNING: "green",
  IDLE: "default",
  ALARM: "red",
  MAINTENANCE: "orange",
  SETUP: "blue",
};

// --- Temperature thresholds ---

export const TEMP_DANGER_THRESHOLD = 80;
export const TOOL_LIFE_WARNING = 30;
export const TOOL_LIFE_DANGER = 15;

// --- Mock KPI Data ---

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

// --- Mock Machine Logs ---

export const MACHINE_LOG_DATA: MachineLog[] = [
  { key: "1", machine: "CNC-001", status: "Running", output: 1200, temp: 65, lastMaint: "2023-10-01" },
  { key: "2", machine: "CNC-002", status: "Idle", output: 850, temp: 40, lastMaint: "2023-09-15" },
  { key: "3", machine: "Press-A1", status: "Error", output: 0, temp: 85, lastMaint: "2023-10-20" },
  { key: "4", machine: "Assembly-Line-4", status: "Running", output: 3400, temp: 55, lastMaint: "2023-10-05" },
  { key: "5", machine: "Paint-Booth-2", status: "Maintenance", output: 0, temp: 22, lastMaint: "2023-10-26" },
];

// --- Mock Machine Detail Data ---
// Simulates the JSON payload from CNC machines

export const MACHINE_DETAIL_MAP: Record<string, MachineDetail> = {
  "CNC-001": {
    machineId: "CNC-001",
    factorySection: "Milling-Dept",
    status: "RUNNING",
    production: {
      jobOrderId: "WO-2024-0015",
      operatorId: "OP-45",
      activeProgram: "CYLINDER_HEAD_V4.nc",
      partCounter: { total: 550, good: 542, scrap: 8 },
      cycleTimeSeconds: 124.5,
    },
    activeTool: { id: "T05", type: "EndMill-10mm", lifeRemainingPercent: 62.4 },
    override: { feed: 100, spindle: 90 },
  },
  "CNC-002": {
    machineId: "CNC-002",
    factorySection: "Milling-Dept",
    status: "IDLE",
    production: {
      jobOrderId: "—",
      operatorId: "OP-12",
      activeProgram: "—",
      partCounter: { total: 0, good: 0, scrap: 0 },
      cycleTimeSeconds: 0,
    },
    activeTool: { id: "T02", type: "DrillBit-8mm", lifeRemainingPercent: 85.0 },
    override: { feed: 100, spindle: 100 },
  },
  "Press-A1": {
    machineId: "Press-A1",
    factorySection: "Press-Shop",
    status: "ALARM",
    production: {
      jobOrderId: "WO-2024-0022",
      operatorId: "OP-08",
      activeProgram: "BRACKET_STAMP_V2.prg",
      partCounter: { total: 200, good: 187, scrap: 13 },
      cycleTimeSeconds: 45.2,
    },
    activeTool: { id: "D01", type: "StampDie-50T", lifeRemainingPercent: 11.2 },
    override: { feed: 80, spindle: 0 },
  },
  "Assembly-Line-4": {
    machineId: "Assembly-Line-4",
    factorySection: "Assembly-Hall",
    status: "RUNNING",
    production: {
      jobOrderId: "WO-2024-0018",
      operatorId: "OP-33",
      activeProgram: "MOTOR_ASM_SEQUENCE.seq",
      partCounter: { total: 120, good: 118, scrap: 2 },
      cycleTimeSeconds: 340.0,
    },
    activeTool: { id: "G03", type: "TorqueDriver-M8", lifeRemainingPercent: 44.8 },
    override: { feed: 100, spindle: 100 },
  },
  "Paint-Booth-2": {
    machineId: "Paint-Booth-2",
    factorySection: "Finishing-Dept",
    status: "MAINTENANCE",
    production: {
      jobOrderId: "—",
      operatorId: "—",
      activeProgram: "—",
      partCounter: { total: 0, good: 0, scrap: 0 },
      cycleTimeSeconds: 0,
    },
    activeTool: { id: "N01", type: "SprayNozzle-2mm", lifeRemainingPercent: 28.0 },
    override: { feed: 0, spindle: 0 },
  },
};

// --- Telemetry simulation base values ---

export const TELEMETRY_BASE: Record<string, { rpm: number; load: number; temp: number; vibration: number; coolant: number }> = {
  "CNC-001":        { rpm: 12000, load: 45, temp: 42.1, vibration: 0.05, coolant: 4.2 },
  "CNC-002":        { rpm: 0,     load: 0,  temp: 28.0, vibration: 0.01, coolant: 0 },
  "Press-A1":       { rpm: 0,     load: 78, temp: 85.0, vibration: 1.20, coolant: 0 },
  "Assembly-Line-4":{ rpm: 800,   load: 22, temp: 38.5, vibration: 0.03, coolant: 2.1 },
  "Paint-Booth-2":  { rpm: 0,     load: 0,  temp: 22.0, vibration: 0.00, coolant: 0 },
};
