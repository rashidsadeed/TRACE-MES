import React from "react";
import dayjs from "dayjs";
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  SettingOutlined,
  StopOutlined,
  ToolOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import type {
  Machine,
  ProductionLine,
  ProductionJob,
  PendingOrder,
  MachineStatus,
  MachineType,
  LineStatus,
  JobStatus,
} from "./types";

// --- Status Visual Configs ---

export const JOB_STATUS_CONFIG: Record<
  JobStatus,
  { icon: React.ReactNode; color: string }
> = {
  Running: { icon: <PlayCircleOutlined />, color: "success" },
  Paused: { icon: <PauseCircleOutlined />, color: "warning" },
  Waiting: { icon: <ClockCircleOutlined />, color: "processing" },
  Stopped: { icon: <StopOutlined />, color: "error" },
  Completed: { icon: <CheckCircleOutlined />, color: "default" },
    Cancelled: { icon: <StopOutlined />, color: "default" },
};

export const MACHINE_STATUS_CONFIG: Record<
  MachineStatus,
  { color: string; badge: "success" | "warning" | "error" | "default" }
> = {
  Available: { color: "success", badge: "success" },
  "In Use": { color: "processing", badge: "success" },
  Maintenance: { color: "warning", badge: "warning" },
  Error: { color: "error", badge: "error" },
};

export const LINE_STATUS_CONFIG: Record<LineStatus, string> = {
  Active: "success",
  Idle: "default",
  Maintenance: "warning",
};

export const PRIORITY_COLOR: Record<"High" | "Medium" | "Low", string> = {
  High: "red",
  Medium: "blue",
  Low: "default",
};

export const PRIORITY_RANK: Record<"High" | "Medium" | "Low", number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

export const JOB_STATUS_RANK: Record<JobStatus, number> = {
  Running: 0,
  Waiting: 1,
  Paused: 2,
  Stopped: 3,
  Completed: 4,
    Cancelled: 5,
};

export const MACHINE_TYPE_COLOR: Record<MachineType, string> = {
  CNC: "blue",
  Press: "purple",
  Assembly: "cyan",
  Welding: "orange",
  Painting: "green",
  Testing: "geekblue",
  Packaging: "lime",
  Soldering: "volcano",
  Molding: "magenta",
};

// --- Mock: Machines ---

export const INITIAL_MACHINES: Machine[] = [
  {
    key: "m1",
    id: "CNC-001",
    slug: "CNC-001",
    name: "CNC Lathe Alpha",
    type: "CNC",
    status: "In Use",
    currentLineId: "LINE-01",
    currentJobId: "JOB-001",
    location: "Zone A",
    temp: 65,
    lastMaint: "2024-10-01",
  },
  {
    key: "m2",
    id: "CNC-002",
    slug: "CNC-002",
    name: "CNC Mill Beta",
    type: "CNC",
    status: "Available",
    location: "Zone A",
    temp: 28,
    lastMaint: "2024-09-20",
  },
  {
    key: "m3",
    id: "PRESS-001",
    slug: "PRESS-001",
    name: "Hydraulic Press X",
    type: "Press",
    status: "In Use",
    currentLineId: "LINE-01",
    currentJobId: "JOB-001",
    location: "Zone A",
    temp: 72,
    lastMaint: "2024-10-15",
  },
  {
    key: "m4",
    id: "WELD-001",
    slug: "WELD-001",
    name: "MIG Welder Station",
    type: "Welding",
    status: "In Use",
    currentLineId: "LINE-01",
    currentJobId: "JOB-001",
    location: "Zone A",
    temp: 85,
    lastMaint: "2024-10-10",
  },
  {
    key: "m5",
    id: "SOLDER-001",
    slug: "SOLDER-001",
    name: "Reflow Oven",
    type: "Soldering",
    status: "In Use",
    currentLineId: "LINE-02",
    currentJobId: "JOB-002",
    location: "Zone B",
    temp: 58,
    lastMaint: "2024-09-28",
  },
  {
    key: "m6",
    id: "TEST-001",
    slug: "TEST-001",
    name: "ICT Tester",
    type: "Testing",
    status: "In Use",
    currentLineId: "LINE-02",
    currentJobId: "JOB-002",
    location: "Zone B",
    temp: 32,
    lastMaint: "2024-10-18",
  },
  {
    key: "m7",
    id: "MOLD-001",
    slug: "MOLD-001",
    name: "Injection Molder A",
    type: "Molding",
    status: "Available",
    location: "Zone C",
    temp: 25,
    lastMaint: "2024-10-20",
  },
  {
    key: "m8",
    id: "PAINT-001",
    slug: "PAINT-001",
    name: "Spray Booth 1",
    type: "Painting",
    status: "Maintenance",
    location: "Zone D",
    temp: 22,
    lastMaint: "2024-10-25",
  },
  {
    key: "m9",
    id: "PACK-001",
    slug: "PACK-001",
    name: "Auto Packer",
    type: "Packaging",
    status: "Available",
    location: "Zone E",
    temp: 24,
    lastMaint: "2024-10-22",
  },
  {
    key: "m10",
    id: "ASM-001",
    slug: "ASM-001",
    name: "Assembly Robot Arm",
    type: "Assembly",
    status: "Error",
    location: "Zone A",
    temp: 90,
    lastMaint: "2024-09-15",
  },
];

// --- Mock: Lines ---

export const INITIAL_LINES: ProductionLine[] = [
  {
    key: "l1",
    id: "LINE-01",
    slug: "LINE-01",
    name: "Auto Parts Assembly",
    isCustom: false,
    machineIds: ["CNC-001", "PRESS-001", "WELD-001"],
    status: "Active",
    activeJobId: "JOB-001",
  },
  {
    key: "l2",
    id: "LINE-02",
    slug: "LINE-02",
    name: "PCB Manufacturing",
    isCustom: false,
    machineIds: ["SOLDER-001", "TEST-001"],
    status: "Active",
    activeJobId: "JOB-002",
  },
  {
    key: "l3",
    id: "LINE-03",
    slug: "LINE-03",
    name: "Injection Molding Line",
    isCustom: false,
    machineIds: ["MOLD-001"],
    status: "Idle",
  },
];

// --- Mock: Jobs ---

export const INITIAL_JOBS: ProductionJob[] = [
  {
    key: "j1",
    id: "JOB-001",
    productName: "Auto Part X-200",
    assignmentType: "existing-line",
    lineId: "LINE-01",
    status: "Running",
    targetQty: 5000,
    actualQty: 3250,
    startTime: "08:00 AM",
    currentStageIndex: 2,
    stages: ["Raw Material", "Pressing", "Welding", "Quality Check", "Output"],
    defects: 12,
    estimatedTimeRemaining: "2h 15m",
  },
  {
    key: "j2",
    id: "JOB-002",
    productName: "Circuit Board V2",
    assignmentType: "existing-line",
    lineId: "LINE-02",
    status: "Paused",
    targetQty: 2000,
    actualQty: 1800,
    startTime: "08:15 AM",
    currentStageIndex: 3,
    stages: ["PCB Print", "Component Place", "Soldering", "Testing", "Boxing"],
    defects: 5,
    estimatedTimeRemaining: "45m",
  },
  {
    key: "j3",
    id: "JOB-003",
    productName: "Housing Unit A",
    assignmentType: "existing-line",
    lineId: "LINE-03",
    status: "Waiting",
    targetQty: 1000,
    actualQty: 0,
    startTime: "-",
    currentStageIndex: 0,
    stages: ["Molding", "Cooling", "Trimming", "Inspection"],
    defects: 0,
    estimatedTimeRemaining: "4h 00m",
  },
];

// --- Mock: Pending Orders (from WorkOrders system) ---

export const INITIAL_PENDING_ORDERS: PendingOrder[] = [
  {
    key: "po1",
    orderId: "WO-2024-001",
    client: "Tesla Inc.",
    product: "Battery Casing Model Y",
    quantity: 5000,
    priority: "High",
    dueDate: dayjs().add(5, "day").format("YYYY-MM-DD"),
  },
  {
    key: "po2",
    orderId: "WO-2024-003",
    client: "Bosch GmbH",
    product: "Sensor Housing V3",
    quantity: 3000,
    priority: "Medium",
    dueDate: dayjs().add(14, "day").format("YYYY-MM-DD"),
  },
  {
    key: "po3",
    orderId: "WO-2024-005",
    client: "Samsung",
    product: "OLED Frame 55\"",
    quantity: 800,
    priority: "Low",
    dueDate: dayjs().add(30, "day").format("YYYY-MM-DD"),
  },
];

// --- Temp threshold ---

export const TEMP_DANGER_THRESHOLD = 80;
