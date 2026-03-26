import { isMockMode } from "./config";
import apiClient from "./apiClient";
import {
  MOCK_MACHINES,
  MOCK_LINES,
  MOCK_JOBS,
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
}

/* ------------------------------------------------------------------ */
/*  READ                                                               */
/* ------------------------------------------------------------------ */

export const getMachines = async (): Promise<MockMachine[]> => {
  if (isMockMode()) {
    await delay();
    return structuredClone(MOCK_MACHINES);
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
    await delay();
    return structuredClone(MOCK_LINES);
  }
  // Backend does not have production lines. Return empty for real mode.
  return [];
};

export const getJobs = async (): Promise<MockProductionJob[]> => {
  if (isMockMode()) {
    await delay();
    return structuredClone(MOCK_JOBS);
  }
  // Jobs map to "executions" on the backend
  const { data } = await apiClient.get<BackendExecution[]>("/executions/");
  return data.map((e) => ({
    key: e.id,
    id: e.id,
    productName: e.work_order,
    assignmentType: "machine" as const,
    assignedMachineIds: [e.machine?.id ?? ""],
    status: e.status === "RUNNING" ? "Running"
      : e.status === "PAUSED" ? "Paused"
      : "Completed",
    targetQty: 0,
    actualQty: 0,
    startTime: e.started_at,
    currentStageIndex: 0,
    stages: [],
    defects: 0,
    estimatedTimeRemaining: "—",
  }));
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
    created_by: { username: string } | null;
    created_at: string;
  }>>("/workorders/", { params: { status: "PENDING" } });

  return data.map((wo) => ({
    key: wo.id,
    orderId: wo.code,
    client: wo.created_by?.username ?? "—",
    product: wo.part?.name ?? "—",
    quantity: wo.target_qty,
    priority: wo.priority >= 3 ? "High" : wo.priority === 2 ? "Normal" : "Low",
    dueDate: wo.created_at,
  }));
};

/* ------------------------------------------------------------------ */
/*  WRITE                                                              */
/* ------------------------------------------------------------------ */

export const createJob = async (job: MockProductionJob): Promise<MockProductionJob> => {
  if (isMockMode()) {
    await delay(200);
    return job;
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
    status: "Running",
  };
};

export const runJob = async (jobId: string): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    return;
  }
  await apiClient.post(`/executions/${jobId}/resume/`);
};

export const cancelJob = async (jobId: string): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    return;
  }
  // No explicit cancel on executions — just stop it
  await apiClient.post(`/executions/${jobId}/stop/`);
};

export const stopJob = async (jobId: string): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    return;
  }
  await apiClient.post(`/executions/${jobId}/stop/`);
};

export const stopAll = async (): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    return;
  }
  // No batch emergency stop in backend. This is a best-effort operation.
  // Fetch all running executions and stop each.
  const { data } = await apiClient.get<BackendExecution[]>("/executions/");
  const running = data.filter((e) => e.status === "RUNNING");
  await Promise.allSettled(
    running.map((e) => apiClient.post(`/executions/${e.id}/stop/`)),
  );
};

export const acceptOrder = async (
  orderId: string,
  job: MockProductionJob,
): Promise<MockProductionJob> => {
  if (isMockMode()) {
    await delay(200);
    return job;
  }
  // Accept = start an execution
  const { data } = await apiClient.post<BackendExecution>("/executions/start/", {
    work_order: orderId,
    machine: job.assignedMachineIds?.[0],
    operator: null,
  });
  return { ...job, id: data.id, status: "Running" };
};
