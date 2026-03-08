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

// --- READ ---

export const getWorkOrders = async (): Promise<MockWorkOrder[]> => {
  if (isMockMode()) {
    await delay();
    return structuredClone(MOCK_WORK_ORDERS);
  }
  const { data } = await apiClient.get<MockWorkOrder[]>("/work-orders");
  return data;
};

export const getOrderRequests = async (): Promise<MockOrderRequest[]> => {
  if (isMockMode()) {
    await delay();
    return structuredClone(MOCK_ORDER_REQUESTS);
  }
  const { data } = await apiClient.get<MockOrderRequest[]>("/work-orders/requests");
  return data;
};

export const getLines = async (): Promise<MockWOLineInfo[]> => {
  if (isMockMode()) {
    await delay();
    return MOCK_WO_LINES;
  }
  const { data } = await apiClient.get<MockWOLineInfo[]>("/work-orders/lines");
  return data;
};

export const getMachines = async (): Promise<MockWOMachineInfo[]> => {
  if (isMockMode()) {
    await delay();
    return MOCK_WO_MACHINES;
  }
  const { data } = await apiClient.get<MockWOMachineInfo[]>("/work-orders/machines");
  return data;
};

// --- WRITE ---

export const createWorkOrder = async (order: MockWorkOrder): Promise<MockWorkOrder> => {
  if (isMockMode()) {
    await delay(200);
    return order;
  }
  const { data } = await apiClient.post<MockWorkOrder>("/work-orders", order);
  return data;
};

export const deleteWorkOrder = async (orderId: string): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    return;
  }
  await apiClient.delete(`/work-orders/${orderId}`);
};

export const acceptRequest = async (requestId: string, order: MockWorkOrder): Promise<MockWorkOrder> => {
  if (isMockMode()) {
    await delay(200);
    return order;
  }
  const { data } = await apiClient.post<MockWorkOrder>(`/work-orders/requests/${requestId}/accept`, order);
  return data;
};

export const declineRequest = async (requestId: string): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    return;
  }
  await apiClient.delete(`/work-orders/requests/${requestId}`);
};
