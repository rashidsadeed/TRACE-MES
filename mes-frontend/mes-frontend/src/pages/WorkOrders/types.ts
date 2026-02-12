import type { Dayjs } from "dayjs";

// --- Domain Types ---

export type Priority = "High" | "Normal" | "Low";
export type OrderStatus = "Pending" | "In Progress" | "Completed" | "Delayed";

export interface WorkOrder {
  key: string;
  id: string;
  product: string;
  quantity: number;
  completed: number;
  priority: Priority;
  status: OrderStatus;
  dueDate: string;
  assignedLine: string;
}

export interface OrderRequest {
  key: string;
  client: string;
  product: string;
  quantity: number;
  requestedDate: string;
}

// --- Form Types ---

export interface CreateOrderFormValues {
  product: string;
  quantity: number;
  priority: Priority;
  dueDate: Dayjs;
  assignedLine: string;
}

export interface AcceptOrderFormValues {
  product: string;
  quantity: number;
  priority: Priority;
  dueDate: Dayjs;
  assignedLine: string;
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
