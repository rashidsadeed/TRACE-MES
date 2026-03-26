import { isMockMode } from "./config";
import apiClient from "./apiClient";
import {
  MOCK_WORK_ORDERS,
  MOCK_ORDER_REQUESTS,
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
  created_by: { id: string; username: string } | null;
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------------------ */
/*  READ                                                               */
/* ------------------------------------------------------------------ */

export const getWorkOrders = async (): Promise<MockWorkOrder[] | BackendWorkOrder[]> => {
  if (isMockMode()) {
    await delay();
    return structuredClone(MOCK_WORK_ORDERS);
  }
  const { data } = await apiClient.get<BackendWorkOrder[]>("/workorders/");
  return data;
};

export const getOrderRequests = async (): Promise<MockOrderRequest[]> => {
  if (isMockMode()) {
    await delay();
    return structuredClone(MOCK_ORDER_REQUESTS);
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
    id: m.id,
    name: m.name,
    type: m.type as MockWOMachineInfo["type"],
    status: m.status === "RUNNING" ? "In Use"
      : m.status === "IDLE" ? "Available"
      : m.status === "DOWN" ? "Maintenance"
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
    return order as MockWorkOrder;
  }
  const { data } = await apiClient.post<BackendWorkOrder>("/workorders/", order);
  return data;
};

export const deleteWorkOrder = async (orderId: string): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
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
    return order as MockWorkOrder;
  }
  // "Accepting" a request = creating a new work order from it
  const { data } = await apiClient.post<BackendWorkOrder>("/workorders/", order);
  return data;
};

export const declineRequest = async (requestId: string): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    return;
  }
  // Decline = cancel the pending work order
  await apiClient.patch(`/workorders/${requestId}/`, { status: "CANCELLED" });
};
