import type { Dayjs } from "dayjs";

export type Priority = "High" | "Normal" | "Low";

// --- Machine ---

export type MachineType =
  | "CNC"
  | "Press"
  | "Assembly"
  | "Welding"
  | "Painting"
  | "Testing"
  | "Packaging"
  | "Soldering"
  | "Molding";

export type MachineStatus = "Available" | "In Use" | "Maintenance" | "Error";

export interface Machine {
  key: string;
  id: string;
  name: string;
  type: MachineType;
  status: MachineStatus;
  currentLineId?: string;
  currentJobId?: string;
  location: string;
  temp: number;
  lastMaint: string;
}

// --- Production Line ---

export type LineStatus = "Active" | "Idle" | "Maintenance";

export interface ProductionLine {
  key: string;
  id: string;
  name: string;
  isCustom: boolean;
  machineIds: string[];
  status: LineStatus;
  activeJobId?: string;
}

// --- Production Job ---

export type JobStatus =
  | "Running"
  | "Paused"
  | "Scheduled"
  | "Stopped"
  | "Completed";

export interface ProductionJob {
  key: string;
  id: string;
  productName: string;
  assignmentType: AssignmentType;
  lineId?: string;                 // Set when assigned to a line (existing or custom)
  assignedMachineIds?: string[];   // Set when assigned directly to machine(s)
  status: JobStatus;
  priority?: Priority;
  dueDate?: string;
  targetQty: number;
  actualQty: number;
  startTime: string;
  modelUrl?: string;
  currentStageIndex: number;
  stages: string[];
  defects: number;
  estimatedTimeRemaining: string;
}

// --- Pending Order (from WorkOrders or external) ---

export interface PendingOrder {
  key: string;
  orderId: string;
  client: string;
  product: string;
  quantity: number;
  priority: "High" | "Normal" | "Low";
  dueDate: string;
}

// --- Form Types ---

export type AssignmentType = "existing-line" | "machine" | "custom-line";

export interface StartJobFormValues {
  assignmentType: AssignmentType;
  lineId?: string;
  machineIds?: string[];
  customLineName?: string;
  customMachineIds?: string[];
  productName: string;
  targetQty: number;
  priority: Priority;
  dueDate: Dayjs;
}

export interface AcceptOrderFormValues {
  assignmentType: AssignmentType;
  lineId?: string;
  machineIds?: string[];
  customLineName?: string;
  customMachineIds?: string[];
}

// --- Modal State ---

export type ModalState =
  | { type: "closed" }
  | { type: "startJob" }
  | { type: "pendingOrders" }
  | { type: "acceptOrder"; order: PendingOrder };
