import React from "react";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { OrderStatus, Priority, WorkOrder, OrderRequest } from "./types";

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

// --- Select options as data ---

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "High", label: "High" },
  { value: "Normal", label: "Normal" },
  { value: "Low", label: "Low" },
];

export const LINE_OPTIONS: { value: string; label: string }[] = [
  { value: "LINE-01", label: "LINE-01" },
  { value: "LINE-02", label: "LINE-02" },
  { value: "LINE-03", label: "LINE-03" },
];

// --- Deadline threshold (days) ---

export const DEADLINE_THRESHOLD_DAYS = 3;

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

export const INITIAL_ORDER_REQUESTS: OrderRequest[] = [
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
