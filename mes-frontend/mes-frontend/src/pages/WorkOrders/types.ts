import type { Dayjs } from "dayjs";

// --- Domain Types ---

export type Priority = "High" | "Normal" | "Low";
export type OrderStatus = "Pending" | "In Progress" | "Completed" | "Delayed";
export type AssignmentType = "existing-line" | "machine" | "custom-line";

export interface WorkOrder {
  key: string;
  id: string;
  product: string;
  quantity: number;
  completed: number;
  priority: Priority;
  status: OrderStatus;
  dueDate: string;
  // Assignment
  assignmentType: AssignmentType;
  assignedLine?: string;          // line id (existing or custom)
  assignedMachineIds?: string[];  // direct machine or custom-line machines
}

export interface OrderRequest {
  key: string;
  client: string;
  product: string;
  quantity: number;
  requestedDate: string;
}

// --- Shared resource types (mirrors Production) ---

export type MachineType = "CNC" | "Press" | "Assembly" | "Welding" | "Mold" | "Paint";
export type MachineStatus = "Available" | "In Use" | "Maintenance" | "Error";
export type LineStatus = "Active" | "Idle" | "Maintenance";

export interface MachineInfo {
  id: string;
  name: string;
  type: MachineType;
  status: MachineStatus;
}

export interface LineInfo {
  id: string;
  name: string;
  status: LineStatus;
  isCustom?: boolean;
}

// --- Form Types ---

export interface CreateOrderFormValues {
  product: string;
  quantity: number;
  priority: Priority;
  dueDate: Dayjs;
  // Assignment fields
  assignmentType: AssignmentType;
  lineId?: string;
  machineIds?: string[];
  customLineName?: string;
  customMachineIds?: string[];
}

export interface AcceptOrderFormValues {
  product: string;
  quantity: number;
  priority: Priority;
  dueDate: Dayjs;
  // Assignment fields
  assignmentType: AssignmentType;
  lineId?: string;
  machineIds?: string[];
  customLineName?: string;
  customMachineIds?: string[];
}

// --- Modal State ---

export type ModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "requestList" }
  | { type: "accept"; request: OrderRequest };

// --- Stats ---

export interface OrderStats {
  total: number;
  active: number;
  delayed: number;
}
