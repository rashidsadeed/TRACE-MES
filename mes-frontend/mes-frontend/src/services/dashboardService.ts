import { isMockMode } from "./config";
import apiClient from "./apiClient";
import {
  MOCK_KPI_DATA,
  MOCK_MACHINE_LOGS,
  MOCK_MACHINE_DETAILS,
  MOCK_TELEMETRY_BASE,
  MOCK_ERROR_LOGS,
} from "./mockData";
import type { MockKPIData, MockMachineLog, MockMachineDetail, MockErrorLog } from "./mockData";

/** Simulates network delay for mock mode */
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

// --- KPI ---

export const getKPIs = async (): Promise<MockKPIData[]> => {
  if (isMockMode()) {
    await delay();
    return MOCK_KPI_DATA;
  }
  const { data } = await apiClient.get<MockKPIData[]>("/dashboard/kpis");
  return data;
};

// --- Machine Logs ---

export const getMachineLogs = async (): Promise<MockMachineLog[]> => {
  if (isMockMode()) {
    await delay();
    return MOCK_MACHINE_LOGS;
  }
  const { data } = await apiClient.get<MockMachineLog[]>("/dashboard/machine-logs");
  return data;
};

// --- Machine Detail ---

export const getMachineDetail = async (machineId: string): Promise<MockMachineDetail | null> => {
  if (isMockMode()) {
    await delay(200);
    return MOCK_MACHINE_DETAILS[machineId] ?? null;
  }
  const { data } = await apiClient.get<MockMachineDetail>(`/dashboard/machines/${machineId}/detail`);
  return data;
};

// --- Telemetry Base (for simulation) ---

export const getTelemetryBase = async (
  machineId: string,
): Promise<{ rpm: number; load: number; temp: number; vibration: number; coolant: number } | null> => {
  if (isMockMode()) {
    return MOCK_TELEMETRY_BASE[machineId] ?? null;
  }
  const { data } = await apiClient.get(`/dashboard/machines/${machineId}/telemetry-base`);
  return data;
};

// --- Machine Error Logs ---

export const getMachineErrorLogs = async (machineId: string): Promise<MockErrorLog[]> => {
  if (isMockMode()) {
    await delay(200);
    return MOCK_ERROR_LOGS[machineId] ?? [];
  }
  const { data } = await apiClient.get<MockErrorLog[]>(`/dashboard/machines/${machineId}/errors`);
  return data;
};

// --- Acknowledge / Reset Alarm ---

export const resetMachineAlarm = async (machineId: string): Promise<void> => {
  if (isMockMode()) {
    await delay(500);
    // In mock mode, just simulate success
    return;
  }
  await apiClient.post(`/dashboard/machines/${machineId}/reset-alarm`);
};
