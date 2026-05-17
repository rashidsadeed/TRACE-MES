/**
 * Centralized Mock Data Store
 *
 * All mock/seed data lives here. When VITE_API_MODE=mock, services
 * return data from this file. When switching to real backend, this
 * file is simply bypassed — no other changes needed.
 *
 * UI configuration (colors, icons, thresholds) remain in page-level
 * constants.tsx files since they are presentation concerns.
 */

// dayjs removed — use native Date utilities instead

// ============================================================
// Dashboard
// ============================================================

export interface MockKPIData {
  key: string;
  title: string;
  value: number;
  suffix: string;
  trend: "up" | "down";
  percent: number;
}

export const MOCK_KPI_DATA: MockKPIData[] = [
  { key: "production", title: "Total Production", value: 12840, suffix: "units", trend: "up", percent: 12 },
  { key: "oee", title: "OEE (Efficiency)", value: 87.5, suffix: "%", trend: "up", percent: 2.4 },
  { key: "machines", title: "Active Machines", value: 24, suffix: "/ 26", trend: "down", percent: 1 },
  { key: "alerts", title: "Active Alerts", value: 3, suffix: "Critical", trend: "up", percent: 1 },
];

export interface MockMachineLog {
  key: string;
  machine: string;
  status: "Running" | "Idle" | "Error" | "Maintenance";
  output: number;
  temp: number;
  lastMaint: string;
}

export const MOCK_MACHINE_LOGS: MockMachineLog[] = [
  { key: "CNC-001",          machine: "CNC-001",          status: "Running",     output: 1200, temp: 65, lastMaint: "2023-10-01" },
  { key: "CNC-002",          machine: "CNC-002",          status: "Idle",        output: 850,  temp: 40, lastMaint: "2023-09-15" },
  { key: "Press-A1",         machine: "Press-A1",         status: "Error",       output: 0,    temp: 85, lastMaint: "2023-10-20" },
  { key: "Assembly-Line-4",  machine: "Assembly-Line-4",  status: "Running",     output: 3400, temp: 55, lastMaint: "2023-10-05" },
  { key: "Paint-Booth-2",    machine: "Paint-Booth-2",    status: "Maintenance", output: 0,    temp: 22, lastMaint: "2023-10-26" },
];

export type CNCStatus = "RUNNING" | "IDLE" | "ALARM" | "MAINTENANCE" | "SETUP";

export interface MockMachineDetail {
  machineId: string;
  machineName?: string;
  factorySection: string;
  status: CNCStatus;
  production: {
    jobOrderId: string;
    operatorId: string;
    activeProgram: string;
    partCounter: { total: number; good: number; scrap: number };
    cycleTimeSeconds: number;
  };
  activeTool: {
    id: string;
    type: string;
    lifeRemainingPercent: number;
  };
  override: {
    feed: number;
    spindle: number;
  };
}

export const MOCK_MACHINE_DETAILS: Record<string, MockMachineDetail> = {
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

export const MOCK_TELEMETRY_BASE: Record<string, { rpm: number; load: number; temp: number; vibration: number; coolant: number }> = {
  "CNC-001": { rpm: 12000, load: 45, temp: 42.1, vibration: 0.05, coolant: 4.2 },
  "CNC-002": { rpm: 0, load: 0, temp: 28.0, vibration: 0.01, coolant: 0 },
  "Press-A1": { rpm: 0, load: 78, temp: 85.0, vibration: 1.20, coolant: 0 },
  "Assembly-Line-4": { rpm: 800, load: 22, temp: 38.5, vibration: 0.03, coolant: 2.1 },
  "Paint-Booth-2": { rpm: 0, load: 0, temp: 22.0, vibration: 0.00, coolant: 0 },
};

// --- Machine Error Logs ---

export type ErrorSeverity = "Critical" | "Warning" | "Info";
export type ErrorLogStatus = "Active" | "Resolved";

export interface MockErrorLog {
  key: string;
  timestamp: string;
  errorCode: string;
  message: string;
  severity: ErrorSeverity;
  status: ErrorLogStatus;
}

export const MOCK_ERROR_LOGS: Record<string, MockErrorLog[]> = {
  "CNC-001": [
    { key: "e1", timestamp: "14:32:10", errorCode: "E-1001", message: "Spindle overload detected — feed rate reduced automatically.", severity: "Warning", status: "Resolved" },
    { key: "e2", timestamp: "15:10:45", errorCode: "E-2003", message: "Coolant pressure below threshold (< 2 bar).", severity: "Info", status: "Resolved" },
  ],
  "CNC-002": [],
  "Press-A1": [
    { key: "e3", timestamp: "09:15:22", errorCode: "E-4010", message: "Hydraulic pressure sensor failure — machine halted.", severity: "Critical", status: "Active" },
    { key: "e4", timestamp: "09:15:23", errorCode: "E-4011", message: "Emergency stop triggered by operator.", severity: "Critical", status: "Active" },
    { key: "e5", timestamp: "08:42:05", errorCode: "E-3005", message: "Die temperature exceeded 90°C limit.", severity: "Warning", status: "Resolved" },
  ],
  "Assembly-Line-4": [
    { key: "e6", timestamp: "11:05:33", errorCode: "E-5001", message: "Torque driver calibration drift detected (+2.1%).", severity: "Info", status: "Resolved" },
  ],
  "Paint-Booth-2": [
    { key: "e7", timestamp: "07:30:00", errorCode: "E-6001", message: "Scheduled maintenance — spray nozzle replacement due.", severity: "Info", status: "Active" },
    { key: "e8", timestamp: "06:55:12", errorCode: "E-6010", message: "Air compressor pressure drop below operating range.", severity: "Warning", status: "Active" },
  ],
};

// ============================================================
// Production
// ============================================================

export type MachineType = "CNC" | "Press" | "Assembly" | "Welding" | "Painting" | "Testing" | "Packaging" | "Soldering" | "Molding";
export type MachineStatus = "Available" | "In Use" | "Maintenance" | "Error";

export interface MockMachine {
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

export const MOCK_MACHINES: MockMachine[] = [
  { key: "m1", id: "CNC-001", name: "CNC Lathe Alpha", type: "CNC", status: "In Use", currentLineId: "LINE-01", currentJobId: "JOB-001", location: "Zone A", temp: 65, lastMaint: "2024-10-01" },
  { key: "m2", id: "CNC-002", name: "CNC Mill Beta", type: "CNC", status: "Available", location: "Zone A", temp: 28, lastMaint: "2024-09-20" },
  { key: "m3", id: "PRESS-001", name: "Hydraulic Press X", type: "Press", status: "In Use", currentLineId: "LINE-01", currentJobId: "JOB-001", location: "Zone A", temp: 72, lastMaint: "2024-10-15" },
  { key: "m4", id: "WELD-001", name: "MIG Welder Station", type: "Welding", status: "In Use", currentLineId: "LINE-01", currentJobId: "JOB-001", location: "Zone A", temp: 85, lastMaint: "2024-10-10" },
  { key: "m5", id: "SOLDER-001", name: "Reflow Oven", type: "Soldering", status: "In Use", currentLineId: "LINE-02", currentJobId: "JOB-002", location: "Zone B", temp: 58, lastMaint: "2024-09-28" },
  { key: "m6", id: "TEST-001", name: "ICT Tester", type: "Testing", status: "In Use", currentLineId: "LINE-02", currentJobId: "JOB-002", location: "Zone B", temp: 32, lastMaint: "2024-10-18" },
  { key: "m7", id: "MOLD-001", name: "Injection Molder A", type: "Molding", status: "Available", location: "Zone C", temp: 25, lastMaint: "2024-10-20" },
  { key: "m8", id: "PAINT-001", name: "Spray Booth 1", type: "Painting", status: "Maintenance", location: "Zone D", temp: 22, lastMaint: "2024-10-25" },
  { key: "m9", id: "PACK-001", name: "Auto Packer", type: "Packaging", status: "Available", location: "Zone E", temp: 24, lastMaint: "2024-10-22" },
  { key: "m10", id: "ASM-001", name: "Assembly Robot Arm", type: "Assembly", status: "Error", location: "Zone A", temp: 90, lastMaint: "2024-09-15" },
];

export type LineStatus = "Active" | "Idle" | "Maintenance";

export interface MockProductionLine {
  key: string;
  id: string;
  name: string;
  isCustom: boolean;
  machineIds: string[];
  status: LineStatus;
  activeJobId?: string;
}

export const MOCK_LINES: MockProductionLine[] = [
  { key: "l1", id: "LINE-01", name: "Auto Parts Assembly", isCustom: false, machineIds: ["CNC-001", "PRESS-001", "WELD-001"], status: "Active", activeJobId: "JOB-001" },
  { key: "l2", id: "LINE-02", name: "PCB Manufacturing", isCustom: false, machineIds: ["SOLDER-001", "TEST-001"], status: "Active", activeJobId: "JOB-002" },
  { key: "l3", id: "LINE-03", name: "Injection Molding Line", isCustom: false, machineIds: ["MOLD-001"], status: "Idle" },
];

export type AssignmentType = "existing-line" | "machine" | "custom-line";
export type JobStatus =
  | "Running"
  | "Paused"
  | "Scheduled"
  | "Stopped"
  | "Completed";

export interface MockProductionJob {
  key: string;
  id: string;
  productName: string;
  assignmentType: AssignmentType;
  lineId?: string;
  assignedMachineIds?: string[];
  status: JobStatus;
  targetQty: number;
  actualQty: number;
  startTime: string;
  modelUrl?: string;
  currentStageIndex: number;
  stages: string[];
  defects: number;
  estimatedTimeRemaining: string;
}

export const MOCK_JOBS: MockProductionJob[] = [
  { key: "j1", id: "JOB-001", productName: "Auto Part X-200", assignmentType: "existing-line", lineId: "LINE-01", status: "Running", targetQty: 5000, actualQty: 3250, startTime: "08:00 AM", currentStageIndex: 2, stages: ["Raw Material", "Pressing", "Welding", "Quality Check", "Output"], defects: 12, estimatedTimeRemaining: "2h 15m" },
  { key: "j2", id: "JOB-002", productName: "Circuit Board V2", assignmentType: "existing-line", lineId: "LINE-02", status: "Paused", targetQty: 2000, actualQty: 1800, startTime: "08:15 AM", currentStageIndex: 3, stages: ["PCB Print", "Component Place", "Soldering", "Testing", "Boxing"], defects: 5, estimatedTimeRemaining: "45m" },
  { key: "j3", id: "JOB-003", productName: "Housing Unit A", assignmentType: "existing-line", lineId: "LINE-03", status: "Scheduled", targetQty: 1000, actualQty: 0, startTime: "-", currentStageIndex: 0, stages: ["Molding", "Cooling", "Trimming", "Inspection"], defects: 0, estimatedTimeRemaining: "4h 00m" },
];

export interface MockPendingOrder {
  key: string;
  orderId: string;
  client: string;
  product: string;
  quantity: number;
  priority: "High" | "Normal" | "Low";
  dueDate: string;
}

export const MOCK_PENDING_ORDERS: MockPendingOrder[] = [
  { key: "po1", orderId: "WO-2024-001", client: "Tesla Inc.", product: "Battery Casing Model Y", quantity: 5000, priority: "High", dueDate: "2024-04-01" },
  { key: "po2", orderId: "WO-2024-003", client: "Bosch GmbH", product: "Sensor Housing V3", quantity: 3000, priority: "Normal", dueDate: "2024-04-10" },
  { key: "po3", orderId: "WO-2024-005", client: "Samsung", product: 'OLED Frame 55"', quantity: 800, priority: "Low", dueDate: "2024-05-01" },
];

// ============================================================
// Work Orders
// ============================================================

export type OrderStatus = "Pending" | "In Progress" | "Completed" | "Delayed";
export type Priority = "High" | "Normal" | "Low";

export interface MockWorkOrder {
  key: string;
  id: string;
  product: string;
  quantity: number;
  completed: number;
  priority: Priority;
  status: OrderStatus;
  dueDate: string;
  assignmentType: AssignmentType;
  assignedLine?: string;
  assignedMachineIds?: string[];
}

export const MOCK_WORK_ORDERS: MockWorkOrder[] = [
  { key: "1", id: "WO-2024-001", product: "Industrial Pump X500", quantity: 500, completed: 320, priority: "High", status: "In Progress", dueDate: new Date(Date.now() + 86400000).toISOString().split("T")[0], assignmentType: "existing-line", assignedLine: "LINE-01" },
  { key: "2", id: "WO-2024-002", product: "Circuit Board V2", quantity: 2000, completed: 0, priority: "Normal", status: "Pending", dueDate: "2024-03-20", assignmentType: "machine", assignedMachineIds: ["CNC-002", "PRESS-001"] },
];

export interface MockOrderRequest {
  key: string;
  client: string;
  product: string;
  quantity: number;
  requestedDate: string;
}

export const MOCK_ORDER_REQUESTS: MockOrderRequest[] = [
  { key: "101", client: "Tesla Inc.", product: "Battery Casing Model Y", quantity: 5000, requestedDate: "2024-04-01" },
  { key: "102", client: "Samsung", product: 'OLED Screen 55"', quantity: 200, requestedDate: "2024-03-25" },
];

export type WOMachineType = "CNC" | "Press" | "Assembly" | "Welding" | "Mold" | "Paint";

export interface MockWOMachineInfo {
  key?: string;       // Backend UUID — used for API calls (real mode only)
  id: string;         // Slug — used for display
  name: string;
  type: WOMachineType;
  status: MachineStatus;
}

export const MOCK_WO_MACHINES: MockWOMachineInfo[] = [
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

export interface MockWOLineInfo {
  id: string;
  name: string;
  status: LineStatus;
}

export const MOCK_WO_LINES: MockWOLineInfo[] = [
  { id: "LINE-01", name: "Auto Parts Assembly", status: "Active" },
  { id: "LINE-02", name: "Electronic Board Line", status: "Idle" },
  { id: "LINE-03", name: "Heavy Press Line", status: "Idle" },
];

// ============================================================
// Auth
// ============================================================

export interface MockUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  email: string;
}

export const MOCK_USERS: MockUser[] = [
  { id: "1", username: "admin", fullName: "Admin User", role: "Plant Manager", email: "admin@tracemes.com" },
  { id: "2", username: "operator", fullName: "Operator User", role: "Operator", email: "operator@tracemes.com" },
];
