import { isMockMode } from "./config";
import apiClient from "./apiClient";
import { simulator } from "./mockSimulator";
import {
  MOCK_PENDING_ORDERS,
} from "./mockData";
import type {
  MockMachine,
  MockProductionLine,
  MockProductionJob,
  MockPendingOrder,
} from "./mockData";

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/*  Backend response types                                             */
/* ------------------------------------------------------------------ */

/** From MachineSerializer. */
interface BackendMachine {
  id: string;
  name: string;
  type: string;
  status: string;
  slug: string;
}

/** From WorkOrderExecutionSerializer. */
interface BackendExecution {
  id: string;
  work_order: string;
  machine: BackendMachine;
  operator: { id: string; username: string } | null;
  status: string;
  started_at: string;
  paused_at: string | null;
  completed_at: string | null;
  work_order_code?: string;
  part_name?: string;
  target_qty?: number;
  actual_qty?: number;
  priority?: number;
  due_date?: string | null;
  production_line_id?: string | null;
  production_line_slug?: string | null;
  production_line_name?: string | null;
  part_model_url?: string | null;
}

/** From ProductionLineSerializer. */
interface BackendProductionLine {
  id: string;
  name: string;
  slug: string;
  status: string;
  machines: BackendMachine[];
}

/* ------------------------------------------------------------------ */
/*  READ                                                               */
/* ------------------------------------------------------------------ */

export const getMachines = async (): Promise<MockMachine[]> => {
  if (isMockMode()) {
    await delay(100);
    return simulator.getMachines();
  }
  const { data } = await apiClient.get<BackendMachine[]>("/machines/");
  return data.map((m) => ({
    key: m.id,
    id: m.slug || m.id,
    name: m.name,
    type: m.type as MockMachine["type"],
    status: m.status === "RUNNING" ? "In Use"
      : m.status === "IDLE" ? "Available"
      : m.status === "DOWN" ? "Error"
      : "Maintenance",
    location: "—",
    temp: 0,
    lastMaint: "—",
  }));
};

export const getLines = async (): Promise<MockProductionLine[]> => {
  if (isMockMode()) {
    await delay(100);
    return simulator.getLines();
  }
  const [linesRes, execsRes] = await Promise.all([
    apiClient.get<BackendProductionLine[]>("/production-lines/"),
    apiClient.get<BackendExecution[]>("/executions/", { params: { status: "RUNNING" } }),
  ]);

  // Map line UUID → first running execution's WO code (display id).
  const activeByLine = new Map<string, string>();
  for (const e of execsRes.data) {
    if (e.production_line_id && !activeByLine.has(e.production_line_id)) {
      activeByLine.set(
        e.production_line_id,
        e.work_order_code || e.id.substring(0, 8).toUpperCase(),
      );
    }
  }

  return linesRes.data.map((line) => ({
    key: line.id,
    id: line.slug || line.id,
    name: line.name,
    isCustom: false,
    machineIds: line.machines.map((m) => m.slug || m.id),
    status: line.status === "ACTIVE" ? "Active"
      : line.status === "MAINTENANCE" ? "Maintenance"
      : "Idle",
    activeJobId: activeByLine.get(line.id),
  }));
};

export const getJobs = async (): Promise<MockProductionJob[]> => {
  if (isMockMode()) {
    await delay(100);
    return simulator.getJobs();
  }
  // Jobs map to "executions" on the backend.
  // Each part (product) follows a realistic manufacturing route — a sequence
  // of machine types it must pass through.  The current execution's machine
  // type determines which step is active in the progress bar.

  const PART_ROUTES: Record<string, string[]> = {
    "Auto Part X-200":        ["CNC", "Press", "Welding", "Testing", "Packaging"],
    "Circuit Board V2":       ["CNC", "Soldering", "Testing", "Packaging"],
    "Battery Casing Model Y": ["Press", "Welding", "Assembly", "Testing"],
    "Sensor Housing V3":      ["Molding", "Welding", "Testing", "Packaging"],
    "Hydraulic Bracket A":    ["CNC", "Press", "Assembly", "Testing"],
  };

  const FALLBACK_ROUTE = ["Prep", "Processing", "QC", "Output"];

  const { data } = await apiClient.get<BackendExecution[]>("/executions/");
  return data
    .filter((e) => e.status !== "COMPLETED" && e.status !== "STOPPED")
    .map((e) => {
      const actual = e.actual_qty || 0;
    const target = e.target_qty || 0;
    const partName = e.part_name || "Unknown Product";
    const machineType = e.machine?.type ?? "";

    // Resolve the manufacturing route for this part
    const route = PART_ROUTES[partName] ?? FALLBACK_ROUTE;

    // Find which step the current machine corresponds to
    let stageIdx = route.indexOf(machineType);
    if (stageIdx === -1) stageIdx = 0;
    if (e.status === "COMPLETED") stageIdx = route.length;

    // Determine the assignment type
    const assignmentType: "existing-line" | "machine" = e.production_line_id
      ? "existing-line"
      : "machine";

    // Use slug-based ids so this matches the slug-keyed `machines` / `lines`
    // arrays the UI joins against (display tags expect "CNC-001", not a UUID).
    const machineSlug = e.machine?.slug || e.machine?.id || "";

    let prio: "High" | "Normal" | "Low" = "Normal";
    if (e.priority === 1) prio = "High";
    else if (e.priority === 3) prio = "Low";

    return {
      key: e.id,
      id: e.work_order_code || e.id.substring(0, 8).toUpperCase(),
      productName: partName,
      assignmentType,
      lineId: e.production_line_slug ?? e.production_line_id ?? undefined,
      assignedMachineIds: [machineSlug],
      status: e.status === "RUNNING" ? "Running"
        : e.status === "AWAITING_START" ? "Waiting"
        : e.status === "PAUSED" ? "Paused"
        : e.status === "STOPPED" ? "Stopped"
        : "Completed",
      priority: prio,
      dueDate: e.due_date ? e.due_date.split("T")[0] : undefined,
      targetQty: target,
      actualQty: actual,
      startTime: e.started_at,
      modelUrl: e.part_model_url ?? undefined,
      workOrderId: e.work_order ?? undefined,
      currentStageIndex: stageIdx,
      stages: [...route],
      defects: 0,
      estimatedTimeRemaining: target > 0 && actual < target
        ? `~${Math.ceil(((target - actual) / Math.max(actual, 1)) * 5)}m`
        : "—",
    };
  });
};

export const getPendingOrders = async (): Promise<MockPendingOrder[]> => {
  if (isMockMode()) {
    await delay();
    return structuredClone(MOCK_PENDING_ORDERS);
  }
  // Pending orders = PENDING work orders
  const { data } = await apiClient.get<Array<{
    id: string;
    code: string;
    part: { name: string } | null;
    target_qty: number;
    priority: number;
    created_by: { username: string; first_name?: string; last_name?: string } | null;
    customer: { username: string; first_name?: string; last_name?: string } | null;
    product_title: string | null;
    file_3d_url: string | null;
    file_glb_url: string | null;
    due_date: string | null;
    created_at: string;
    production_line: string | null;
    machine_ids: string[];
  }>>("/workorders/", { params: { status: "PENDING" } });

  return data.map((wo) => {
    let clientName = undefined;
    if (wo.customer) {
      if (wo.customer.first_name || wo.customer.last_name) {
        clientName = `${wo.customer.first_name || ""} ${wo.customer.last_name || ""}`.trim();
      } else {
        clientName = wo.customer.username;
      }
    }

    let approvedBy = undefined;
    if (wo.created_by) {
      if (wo.created_by.first_name || wo.created_by.last_name) {
        approvedBy = `${wo.created_by.first_name || ""} ${wo.created_by.last_name || ""}`.trim();
      } else {
        approvedBy = wo.created_by.username;
      }
    }

    return {
      key: wo.id,
      orderId: wo.code,
      client: wo.customer?.username ?? "Unknown",
      clientName,
      approvedBy,
      product: wo.product_title ?? wo.part?.name ?? "Unknown",
      quantity: wo.target_qty,
      priority: wo.priority >= 3 ? "High" : wo.priority === 2 ? "Normal" : "Low",
      dueDate: wo.due_date ?? wo.created_at,
      productionLineId: wo.production_line ?? undefined,
      machineIds: wo.machine_ids,
      file3dUrl: wo.file_3d_url ?? undefined,
      fileGlbUrl: wo.file_glb_url ?? undefined,
    };
  });
};

/* ------------------------------------------------------------------ */
/*  WRITE                                                              */
/* ------------------------------------------------------------------ */

export const createJob = async (job: MockProductionJob): Promise<MockProductionJob> => {
  if (isMockMode()) {
    await delay(200);
    const newJob = { ...job, status: "Waiting" as const };
    simulator.addJob(newJob);
    return newJob;
  }
  // Creating a job = starting an execution
  const { data } = await apiClient.post<BackendExecution>("/executions/start/", {
    work_order: job.id,
    machine: job.assignedMachineIds?.[0],
    operator: null,
  });
  return {
    ...job,
    id: data.id,
    status: "Waiting",
  };
};

export const runJob = async (jobId: string): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    simulator.runJob(jobId);
    return;
  }
  await apiClient.post(`/executions/${jobId}/resume/`);
};

export const cancelJob = async (jobId: string): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    simulator.cancelJob(jobId);
    return;
  }
  // No explicit cancel on executions — just stop it
  await apiClient.post(`/workorders/${jobId}/cancel/`);
};

export const stopJob = async (jobId: string): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    simulator.stopJob(jobId);
    return;
  }
  // Pause the execution instead of cancelling the work order
  await apiClient.post(`/executions/${jobId}/pause/`);
};

export const stopAll = async (): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    simulator.stopAll();
    return;
  }
  // No batch emergency stop in backend. This is a best-effort operation.
  // Fetch all running executions and stop each.
  const { data } = await apiClient.get<BackendExecution[]>("/executions/");
  const running = data.filter((e) => e.status === "RUNNING");
  await Promise.allSettled(
    running.map((e) => apiClient.post(`/executions/${e.id}/pause/`)),
  );
};

export const acceptOrder = async (
  orderId: string,
  job: MockProductionJob,
): Promise<MockProductionJob> => {
  if (isMockMode()) {
    await delay(200);
    const newJob = { ...job, status: "Waiting" as const };
    simulator.addJob(newJob);
    return newJob;
  }
  // Accept = start an execution (goes to AWAITING_START)
  const { data } = await apiClient.post<BackendExecution>("/executions/start/", {
    work_order: orderId,
    machine: job.assignedMachineIds?.[0],
    operator: null,
  });
  return { ...job, id: data.id, status: "Waiting" };
};
