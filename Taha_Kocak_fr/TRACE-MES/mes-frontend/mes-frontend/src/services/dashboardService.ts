import { isMockMode } from "./config";
import apiClient from "./apiClient";
import {
  MOCK_KPI_DATA,
  MOCK_MACHINE_LOGS,
  MOCK_MACHINE_DETAILS,
  MOCK_TELEMETRY_BASE,
  MOCK_ERROR_LOGS,
} from "./mockData";
import type { MockKPIData, MockMachineLog, MockMachineDetail, MockErrorLog, CNCStatus } from "./mockData";

/** Simulates network delay for mock mode */
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/*  Backend response types                                             */
/* ------------------------------------------------------------------ */

interface MachineOverview {
  id: string;
  name: string;
  type: string;
  status: string;
  slug: string;
  latest_telemetry: {
    id: number;
    machine: string;
    execution: string | null;
    timestamp: string;
    spindle_speed: number;
    feed_rate: number;
    temperature: number;
    vibration: number;
  } | null;
}

interface BackendMachineEvent {
  id: string;
  machine: string;
  event_type: string;
  timestamp: string;
  details: Record<string, unknown> | null;
}

interface BackendTelemetryPacket {
  id: number;
  machine: string;
  execution: string | null;
  timestamp: string;
  spindle_speed: number;
  feed_rate: number;
  temperature: number;
  vibration: number;
}

interface BackendExecution {
  id: string;
  work_order: string;
  work_order_code?: string;
  machine: { id: string; name: string; type: string; status: string; slug: string };
  operator: { id: string; username: string } | null;
  status: string;
  started_at: string;
  paused_at: string | null;
  completed_at: string | null;
}

/* ------------------------------------------------------------------ */
/*  KPI (computed from live/overview data)                             */
/* ------------------------------------------------------------------ */

export const getKPIs = async (): Promise<MockKPIData[]> => {
  if (isMockMode()) {
    await delay();
    return MOCK_KPI_DATA;
  }
  // Backend does not have a dedicated KPI endpoint.
  // Derive KPIs from the live overview data.
  const { data: machines } = await apiClient.get<MachineOverview[]>("/live/overview/");

  const total = machines.length;
  const active = machines.filter((m) => m.status === "RUNNING").length;
  const alerts = machines.filter((m) => m.status === "DOWN").length;

  return [
    {
      key: "machines",
      title: "Active Machines",
      value: active,
      suffix: `/ ${total}`,
      trend: active > total / 2 ? "up" : "down",
      percent: total > 0 ? Math.round((active / total) * 100) : 0,
    },
    {
      key: "alerts",
      title: "Active Alerts",
      value: alerts,
      suffix: "Critical",
      trend: alerts > 0 ? "up" : "down",
      percent: alerts,
    },
  ];
};

/* ------------------------------------------------------------------ */
/*  Machine Logs (from live/overview)                                  */
/* ------------------------------------------------------------------ */

export const getMachineLogs = async (): Promise<MockMachineLog[]> => {
  if (isMockMode()) {
    await delay();
    return MOCK_MACHINE_LOGS;
  }
  // Fetch machines + active executions in parallel
  const [overviewRes, executionsRes] = await Promise.all([
    apiClient.get<MachineOverview[]>("/live/overview/"),
    apiClient.get<BackendExecution[]>("/executions/", { params: { status: "RUNNING" } }),
  ]);

  // Build machine → execution map for quick lookup
  const execByMachine = new Map<string, BackendExecution>();
  for (const exc of executionsRes.data) {
    execByMachine.set(exc.machine.id, exc);
  }

  return overviewRes.data.map((m) => {
    const exc = execByMachine.get(m.id);
    const statusLabel: MockMachineLog["status"] =
      m.status === "RUNNING" ? "Running"
      : m.status === "IDLE"  ? "Idle"
      : m.status === "DOWN"  ? "Error"
      : "Maintenance";

    return {
      key: m.id,
      machine: m.name,
      status: statusLabel,
      output: 0,  // Cumulative totals require a dedicated summary endpoint
      temp: m.latest_telemetry?.temperature ?? 0,
      lastMaint: exc
        ? new Date(exc.started_at).toLocaleDateString("en-GB")
        : "—",
    };
  });
};

/* ------------------------------------------------------------------ */
/*  Machine Detail                                                     */
/* ------------------------------------------------------------------ */

/** Map backend machine status → frontend CNCStatus */
const _toCNCStatus = (backendStatus: string): CNCStatus => {
  switch (backendStatus) {
    case "RUNNING":  return "RUNNING";
    case "IDLE":     return "IDLE";
    case "DOWN":     return "ALARM";
    case "OFFLINE":  return "MAINTENANCE";
    default:         return "IDLE";
  }
};

export const getMachineDetail = async (machineId: string): Promise<MockMachineDetail | null> => {
  if (isMockMode()) {
    await delay(200);
    return MOCK_MACHINE_DETAILS[machineId] ?? null;
  }
  try {
    // Run all three fetches in parallel for speed
    const [overviewRes, telemetryRes, executionsRes] = await Promise.all([
      apiClient.get<MachineOverview[]>("/live/overview/"),
      apiClient.get<BackendTelemetryPacket[]>(`/live/telemetry/${machineId}/`, { params: { limit: 1 } }),
      apiClient.get<BackendExecution[]>("/executions/", { params: { machine: machineId, status: "RUNNING" } }),
    ]);

    const machine   = overviewRes.data.find((m) => m.id === machineId) ?? null;
    const latest    = telemetryRes.data[0] ?? null;
    const execution = executionsRes.data[0] ?? null;

    // Build a realistic active program name from work order code
    const woCode = execution?.work_order_code ?? null;
    const machineType = machine?.type?.toUpperCase().replace(/\s+/g, "_") ?? "MACHINE";
    const activeProgram = woCode
      ? `${machineType}_${woCode.replace(/-/g, "_")}.nc`
      : "—";

    // Compute total parts from production logs via execution start offset
    // (backend doesn't expose totals directly — use 0 as baseline, real data via ProductionLog)
    const partCounter = { total: 0, good: 0, scrap: 0 };

    return {
      machineId,
      machineName: machine?.name ?? machineId,
      factorySection: machine ? `${machine.type}-Dept` : "—",
      status: _toCNCStatus(machine?.status ?? "IDLE"),
      production: {
        jobOrderId:       woCode ?? execution?.work_order?.slice(0, 8) ?? "—",
        operatorId:       execution?.operator?.username ?? "—",
        activeProgram,
        partCounter,
        cycleTimeSeconds: 0,
      },
      activeTool: { id: "—", type: machine?.type ?? "—", lifeRemainingPercent: 0 },
      override: {
        feed:    latest?.feed_rate    ?? 0,
        spindle: latest?.spindle_speed ?? 0,
      },
    };
  } catch {
    return null;
  }
};

/* ------------------------------------------------------------------ */
/*  Telemetry Base (for simulation)                                    */
/* ------------------------------------------------------------------ */

export const getTelemetryBase = async (
  machineId: string,
): Promise<{ rpm: number; load: number; temp: number; vibration: number; coolant: number } | null> => {
  if (isMockMode()) {
    return MOCK_TELEMETRY_BASE[machineId] ?? null;
  }
  try {
    const { data: packets } = await apiClient.get<BackendTelemetryPacket[]>(
      `/live/telemetry/${machineId}/`,
      { params: { limit: 1 } },
    );
    if (packets.length === 0) return null;
    const p = packets[0];
    return {
      rpm: p.spindle_speed,
      load: p.feed_rate,
      temp: p.temperature,
      vibration: p.vibration,
      coolant: 0, // Backend does not track coolant
    };
  } catch {
    return null;
  }
};

/* ------------------------------------------------------------------ */
/*  Machine Error Logs (from live/events)                              */
/* ------------------------------------------------------------------ */

export const getMachineErrorLogs = async (machineId: string): Promise<MockErrorLog[]> => {
  if (isMockMode()) {
    await delay(200);
    return MOCK_ERROR_LOGS[machineId] ?? [];
  }
  const { data: events } = await apiClient.get<BackendMachineEvent[]>("/live/events/", {
    params: { machine: machineId, limit: 50 },
  });
  return events.map((e, idx) => ({
    key: `evt-${idx}`,
    timestamp: new Date(e.timestamp).toLocaleTimeString(),
    errorCode: e.event_type,
    message: JSON.stringify(e.details ?? {}),
    severity: e.event_type === "HEARTBEAT_LOST" ? "Critical"
      : e.event_type === "STATUS_CHANGE" ? "Warning"
      : "Info" as MockErrorLog["severity"],
    status: "Active" as MockErrorLog["status"],
  }));
};

/* ------------------------------------------------------------------ */
/*  Acknowledge / Reset Alarm                                          */
/* ------------------------------------------------------------------ */

export const resetMachineAlarm = async (machineId: string): Promise<void> => {
  if (isMockMode()) {
    await delay(500);
    return;
  }
  // Set machine status to IDLE via PATCH
  await apiClient.patch(`/machines/${machineId}/`, { status: "IDLE" });
};
