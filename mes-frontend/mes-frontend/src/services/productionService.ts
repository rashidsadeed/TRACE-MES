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

// --- READ ---

export const getMachines = async (): Promise<MockMachine[]> => {
  if (isMockMode()) {
    await delay();
    return structuredClone(MOCK_MACHINES);
  }
  const { data } = await apiClient.get<MockMachine[]>("/production/machines");
  return data;
};

export const getLines = async (): Promise<MockProductionLine[]> => {
  if (isMockMode()) {
    await delay();
    return structuredClone(MOCK_LINES);
  }
  const { data } = await apiClient.get<MockProductionLine[]>("/production/lines");
  return data;
};

export const getJobs = async (): Promise<MockProductionJob[]> => {
  if (isMockMode()) {
    await delay();
    return structuredClone(MOCK_JOBS);
  }
  const { data } = await apiClient.get<MockProductionJob[]>("/production/jobs");
  return data;
};

export const getPendingOrders = async (): Promise<MockPendingOrder[]> => {
  if (isMockMode()) {
    await delay();
    return structuredClone(MOCK_PENDING_ORDERS);
  }
  const { data } = await apiClient.get<MockPendingOrder[]>("/production/pending-orders");
  return data;
};

// --- WRITE ---

export const createJob = async (job: MockProductionJob): Promise<MockProductionJob> => {
  if (isMockMode()) {
    await delay(200);
    return job;
  }
  const { data } = await apiClient.post<MockProductionJob>("/production/jobs", job);
  return data;
};

export const runJob = async (jobId: string): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    return;
  }
  await apiClient.patch(`/production/jobs/${jobId}/run`);
};

export const cancelJob = async (jobId: string): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    return;
  }
  await apiClient.patch(`/production/jobs/${jobId}/cancel`);
};

export const stopJob = async (jobId: string): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    return;
  }
  await apiClient.patch(`/production/jobs/${jobId}/stop`);
};

export const stopAll = async (): Promise<void> => {
  if (isMockMode()) {
    await delay(200);
    return;
  }
  await apiClient.post("/production/emergency-stop");
};

export const acceptOrder = async (orderId: string, job: MockProductionJob): Promise<MockProductionJob> => {
  if (isMockMode()) {
    await delay(200);
    return job;
  }
  const { data } = await apiClient.post<MockProductionJob>(`/production/orders/${orderId}/accept`, job);
  return data;
};
