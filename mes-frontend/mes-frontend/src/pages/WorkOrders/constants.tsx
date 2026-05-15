import React from "react";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type {
  OrderStatus, Priority, WorkOrder, OrderRequest,
  MachineInfo, LineInfo, MachineType,
} from "./types";

// --- Status visual configuration ---

export const STATUS_CONFIG: Record<
  OrderStatus,
  { icon: React.ReactNode; color: string }
> = {
  Pending: { icon: <ClockCircleOutlined />, color: "default" },
  "In Progress": { icon: <SyncOutlined spin />, color: "processing" },
  Completed: { icon: <CheckCircleOutlined />, color: "success" },
  Delayed: { icon: <ClockCircleOutlined />, color: "error" },
};

// --- Priority color mapping ---

export const PRIORITY_COLOR: Record<Priority, string> = {
  High: "red",
  Normal: "blue",
  Low: "green",
};

export const MACHINE_TYPE_COLOR: Record<MachineType, string> = {
  CNC: "blue",
  Press: "volcano",
  Assembly: "green",
  Welding: "orange",
  Mold: "purple",
  Paint: "cyan",
};

// --- Select options ---

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "High", label: "High" },
  { value: "Normal", label: "Normal" },
  { value: "Low", label: "Low" },
];

// --- Deadline threshold (days) ---

export const DEADLINE_THRESHOLD_DAYS = 3;

// --- Shared Lines & Machines (mirrors Production data) ---

export const LINES: LineInfo[] = [
  { id: "LINE-01", name: "Auto Parts Assembly", status: "Active" },
  { id: "LINE-02", name: "Electronic Board Line", status: "Idle" },
  { id: "LINE-03", name: "Heavy Press Line", status: "Idle" },
];

export const MACHINES: MachineInfo[] = [
  { id: "CNC-001", name: "Haas VF-2SS", type: "CNC", status: "In Use" },
  { id: "CNC-002", name: "DMG Mori CMX 50", type: "CNC", status: "Available" },
  { id: "PRESS-001", name: "Hydraulic Press 200T", type: "Press", status: "Available" },
  { id: "PRESS-002", name: "Stamping Press A", type: "Press", status: "Available" },
  { id: "ASM-001", name: "Robot Assembly Cell", type: "Assembly", status: "In Use" },
  { id: "ASM-002", name: "Manual Assembly Station", type: "Assembly", status: "Available" },
  { id: "WELD-001", name: "MIG Welder R500", type: "Welding", status: "Available" },
  { id: "MOLD-001", name: "Injection Molder 300T", type: "Mold", status: "Available" },
  { id: "PAINT-001", name: "Spray Booth A", type: "Paint", status: "Maintenance" },
];

// --- Mock Data ---

export const INITIAL_WORK_ORDERS: WorkOrder[] = [
  {
    key: "1",
    id: "WO-2024-001",
    product: "Industrial Pump X500",
    quantity: 500,
    completed: 320,
    priority: "High",
    status: "In Progress",
    dueDate: dayjs().add(1, "day").format("YYYY-MM-DD"),
    assignmentType: "existing-line",
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
    dueDate: dayjs().add(7, "day").format("YYYY-MM-DD"),
    assignmentType: "machine",
    assignedMachineIds: ["CNC-002", "PRESS-001"],
  },
];

export const INITIAL_ORDER_REQUESTS: OrderRequest[] = [
  {
    key: "101",
    client: "Tesla Inc.",
    product: "Battery Casing Model Y",
    quantity: 5000,
    requestedDate: dayjs().add(10, "day").format("YYYY-MM-DD"),
  },
  {
    key: "102",
    client: "Samsung",
    product: 'OLED Screen 55"',
    quantity: 200,
    requestedDate: dayjs().add(3, "day").format("YYYY-MM-DD"),
  },
];
