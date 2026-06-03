import { isMockMode } from "./config";
import apiClient from "./apiClient";
import { simulator } from "./mockSimulator";
import {
  MOCK_WO_LINES,
  MOCK_WO_MACHINES,
} from "./mockData";
import type {
  MockWorkOrder,
  MockOrderRequest,
  MockWOLineInfo,
  MockWOMachineInfo,
} from "./mockData";

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/*  Backend response types (from WorkOrderSerializer)                  */
/* ------------------------------------------------------------------ */

export interface BackendWorkOrder {
  id: string;
  code: string;
  description: string;
  part: { id: string; name: string; sku: string; description: string | null };
  target_qty: number;
  priority: number;
  status: string;
  due_date: string | null;
  created_by: { id: string; username: string } | null;
  created_at: string;
  updated_at: string;
}

export interface BackendPart {
  id: string;
  name: string;
  sku: string;
  description: string | null;
}

/* ------------------------------------------------------------------ */
/*  READ                                                               */
/* ------------------------------------------------------------------ */

interface BackendExecutionMini {
  id: string;
  work_order: string;
  status: string;
  actual_qty?: number;
  production_line_id?: string | null;
}

export const getWorkOrders = async (): Promise<MockWorkOrder[] | BackendWorkOrder[]> => {
  if (isMockMode()) {
    await delay();
    return simulator.getWorkOrders();
  }
  const [wosRes, execsRes] = await Promise.all([
    apiClient.get<BackendWorkOrder[]>("/workorders/"),
    apiClient.get<BackendExecutionMini[]>("/executions/"),
  ]);

  // PENDING WOs surface separately as "order requests" (see getOrderRequests);
  // excluding them here avoids showing the same WO in both lists.
  const activeWos = wosRes.data.filter((wo) => wo.status !== "PENDING");

  // Aggregate per-WO: sum actual_qty across executions and detect line assignment.
  const aggByWo = new Map<string, { completed: number; hasLine: boolean }>();
  for (const e of execsRes.data) {
    const cur = aggByWo.get(e.work_order) ?? { completed: 0, hasLine: false };
    cur.completed += e.actual_qty ?? 0;
    if (e.production_line_id) cur.hasLine = true;
    aggByWo.set(e.work_order, cur);
  }

  return activeWos.map((wo) => {
    let prioStr: MockWorkOrder["priority"] = "Medium";
    if (wo.priority === 1) prioStr = "Low";
    if (wo.priority === 3) prioStr = "High";

    let statStr: MockWorkOrder["status"] = "Pending";
    if (wo.status === "IN_PROGRESS") statStr = "In Progress";
    if (wo.status === "COMPLETED") statStr = "Completed";
    if (wo.status === "CANCELLED") statStr = "Delayed";

    const agg = aggByWo.get(wo.id);

    // Prefer the real customer-facing deadline; fall back to created_at if absent.
    const dueIso = wo.due_date ?? wo.created_at;

    return {
      key: wo.id,
      id: wo.code || wo.id.substring(0, 8),
      product: wo.part?.name || wo.description || "Unknown",
      quantity: wo.target_qty,
      completed: agg?.completed ?? 0,
      priority: prioStr,
      status: statStr,
      dueDate: dueIso ? dueIso.split("T")[0] : "",
      assignmentType: agg?.hasLine ? ("existing-line" as const) : ("machine" as const),
    };
  });
};

export const getOrderRequests = async (): Promise<MockOrderRequest[]> => {
  if (isMockMode()) {
    await delay();
    return simulator.getOrderRequests();
  }
  // Backend does not have a separate "order requests" endpoint yet.
  // Pending work orders serve as order requests.
  const { data } = await apiClient.get<BackendWorkOrder[]>("/workorders/", {
    params: { status: "PENDING" },
  });
  // Map backend shape to MockOrderRequest for compatibility
  return data.map((wo) => ({
    key: wo.id,
    client: wo.created_by?.username ?? "—",
    product: wo.part?.name ?? wo.description,
    quantity: wo.target_qty,
    requestedDate: wo.created_at,
  }));
};

export const getLines = async (): Promise<MockWOLineInfo[]> => {
  if (isMockMode()) {
    await delay();
    return MOCK_WO_LINES;
  }
  // Backend does not have a "lines" concept. Return empty for real mode.
  // Lines are a frontend-only grouping abstraction.
  return [];
};

export const getParts = async (): Promise<BackendPart[]> => {
  if (isMockMode()) {
    await delay(50);
    return [];
  }
  const { data } = await apiClient.get<BackendPart[]>("/parts/");
  return data;
};

export const getMachines = async (): Promise<MockWOMachineInfo[]> => {
  if (isMockMode()) {
    await delay();
    return MOCK_WO_MACHINES;
  }
  const { data } = await apiClient.get<Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    slug: string;
  }>>("/machines/");
  return data.map((m) => ({
    key: m.id,
    id: m.slug || m.id,
    name: m.name,
    type: m.type as MockWOMachineInfo["type"],
    status: m.status === "RUNNING" ? "In Use"
      : m.status === "IDLE" ? "Available"
      : m.status === "DOWN" ? "Error"
      : "Maintenance",
  }));
};

/* ------------------------------------------------------------------ */
/*  WRITE                                                              */
/* ------------------------------------------------------------------ */

export interface CreateWorkOrderPayload {
  code: string;
  description: string;
  part: string;       // Part UUID
  target_qty: number;
  priority: number;
}

export const createWorkOrder = async (
  order: MockWorkOrder | CreateWorkOrderPayload,
): Promise<MockWorkOrder | BackendWorkOrder> => {
  if (isMockMode()) {
    await delay(200);
    simulator.createWorkOrder(order as MockWorkOrder);
    return order as MockWorkOrder;
  }
  const { data } = await apiClient.post<BackendWorkOrder>("/workorders/", order);
  return data;
};

export const deleteWorkOrder = async (orderId: string): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    simulator.deleteWorkOrder(orderId);
    return;
  }
  // Backend does not support DELETE on workorders; PATCH status to CANCELLED instead
  await apiClient.patch(`/workorders/${orderId}/`, { status: "CANCELLED" });
};

export const acceptRequest = async (
  requestId: string,
  order: MockWorkOrder | CreateWorkOrderPayload,
): Promise<MockWorkOrder | BackendWorkOrder> => {
  if (isMockMode()) {
    await delay(200);
    simulator.acceptRequest(requestId, order as MockWorkOrder);
    return order as MockWorkOrder;
  }
  // "Accepting" a request = creating a new work order from it
  const { data } = await apiClient.post<BackendWorkOrder>("/workorders/", order);
  return data;
};

export const declineRequest = async (requestId: string, reason?: string): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    simulator.declineRequest(requestId);
    return;
  }
  // Decline = cancel the pending work order with optional reason
  const payload: Record<string, string> = { reason: reason || "Declined by admin" };
  await apiClient.post(`/workorders/${requestId}/cancel/`, payload);
};
