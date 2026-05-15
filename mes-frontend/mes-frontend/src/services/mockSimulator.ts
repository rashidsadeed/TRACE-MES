/**
 * Mock Simulator — Realistic Factory Data Engine
 *
 * Singleton that holds mutable state for all 10 machines.
 * Updates temperatures, production counters, and telemetry
 * every tick (1s) so all pages see the same live data.
 */

import type {
  MockMachine,
  MockProductionLine,
  MockProductionJob,
  MockMachineDetail,
  MockMachineLog,
  MockKPIData,
  MachineStatus,
  CNCStatus,
} from "./mockData";
import {
  MOCK_MACHINES,
  MOCK_LINES,
  MOCK_JOBS,
  MOCK_MACHINE_DETAILS,
  MOCK_TELEMETRY_BASE,
  MOCK_ERROR_LOGS,
} from "./mockData";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const jitter = (base: number, range: number) =>
  Math.max(0, +(base + (Math.random() - 0.5) * 2 * range).toFixed(2));

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const statusToCNC = (s: MachineStatus): CNCStatus => {
  switch (s) {
    case "In Use": return "RUNNING";
    case "Available": return "IDLE";
    case "Maintenance": return "MAINTENANCE";
    case "Error": return "ALARM";
  }
};

const statusToDashboard = (s: MachineStatus): MockMachineLog["status"] => {
  switch (s) {
    case "In Use": return "Running";
    case "Available": return "Idle";
    case "Maintenance": return "Maintenance";
    case "Error": return "Error";
  }
};

/* ------------------------------------------------------------------ */
/*  Per-machine telemetry profile (realistic base values by type)      */
/* ------------------------------------------------------------------ */

interface TelemetryProfile {
  rpm: number; load: number; temp: number; vibration: number; coolant: number;
  rpmJitter: number; loadJitter: number; tempJitter: number; vibJitter: number;
}

const PROFILES: Record<string, TelemetryProfile> = {
  "CNC-001":      { rpm: 8500,  load: 55, temp: 52, vibration: 0.08, coolant: 4.5, rpmJitter: 200, loadJitter: 4, tempJitter: 1.2, vibJitter: 0.02 },
  "CNC-002":      { rpm: 0,     load: 0,  temp: 26, vibration: 0.01, coolant: 0,   rpmJitter: 0,   loadJitter: 0, tempJitter: 0.3, vibJitter: 0.005 },
  "PRESS-001":    { rpm: 0,     load: 72, temp: 68, vibration: 0.35, coolant: 0,   rpmJitter: 0,   loadJitter: 5, tempJitter: 2.0, vibJitter: 0.08 },
  "WELD-001":     { rpm: 0,     load: 65, temp: 82, vibration: 0.15, coolant: 0,   rpmJitter: 0,   loadJitter: 6, tempJitter: 3.0, vibJitter: 0.04 },
  "SOLDER-001":   { rpm: 0,     load: 40, temp: 245,vibration: 0.02, coolant: 0,   rpmJitter: 0,   loadJitter: 3, tempJitter: 5.0, vibJitter: 0.01 },
  "TEST-001":     { rpm: 0,     load: 15, temp: 30, vibration: 0.01, coolant: 0,   rpmJitter: 0,   loadJitter: 2, tempJitter: 0.5, vibJitter: 0.005 },
  "MOLD-001":     { rpm: 0,     load: 0,  temp: 24, vibration: 0.00, coolant: 0,   rpmJitter: 0,   loadJitter: 0, tempJitter: 0.2, vibJitter: 0 },
  "PAINT-001":    { rpm: 0,     load: 0,  temp: 22, vibration: 0.00, coolant: 0,   rpmJitter: 0,   loadJitter: 0, tempJitter: 0.2, vibJitter: 0 },
  "PACK-001":     { rpm: 0,     load: 10, temp: 25, vibration: 0.01, coolant: 0,   rpmJitter: 0,   loadJitter: 1, tempJitter: 0.3, vibJitter: 0.005 },
  "ASM-001":      { rpm: 1200,  load: 30, temp: 88, vibration: 0.45, coolant: 0,   rpmJitter: 50,  loadJitter: 3, tempJitter: 2.0, vibJitter: 0.1 },
};

/* ------------------------------------------------------------------ */
/*  Simulator State                                                    */
/* ------------------------------------------------------------------ */

interface LiveMachineState {
  machine: MockMachine;
  temp: number;       // drifting temperature
  output: number;     // cumulative daily output
  profile: TelemetryProfile;
}

class MockSimulator {
  private states: Map<string, LiveMachineState> = new Map();
  private jobs: MockProductionJob[];
  private lines: MockProductionLine[];
  private started = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Deep clone initial data
    this.jobs = structuredClone(MOCK_JOBS);
    this.lines = structuredClone(MOCK_LINES);

    for (const m of structuredClone(MOCK_MACHINES)) {
      const profile = PROFILES[m.id] ?? {
        rpm: 0, load: 0, temp: 25, vibration: 0, coolant: 0,
        rpmJitter: 0, loadJitter: 0, tempJitter: 0.3, vibJitter: 0,
      };
      this.states.set(m.id, {
        machine: m,
        temp: profile.temp,
        output: m.status === "In Use" ? Math.floor(Math.random() * 800 + 200) : 0,
        profile,
      });
    }
  }

  /** Start the 1-second simulation loop */
  start() {
    if (this.started) return;
    this.started = true;
    this.intervalId = setInterval(() => this.tick(), 1000);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.started = false;
  }

  private tick() {
    for (const [, state] of this.states) {
      const { machine, profile } = state;
      if (machine.status === "In Use") {
        // Temperature drifts slowly toward base with noise
        state.temp = clamp(
          state.temp + (Math.random() - 0.48) * profile.tempJitter * 0.5,
          profile.temp - 8,
          profile.temp + 12,
        );
        machine.temp = +state.temp.toFixed(1);
        // Output increases
        state.output += Math.random() > 0.3 ? 1 : 0;
      } else if (machine.status === "Available") {
        // Idle machine cools down toward ambient
        state.temp = clamp(state.temp + (22 - state.temp) * 0.01, 20, 30);
        machine.temp = +state.temp.toFixed(1);
      }
      // Error machine stays hot
    }

    // Advance running job counters
    for (const job of this.jobs) {
      if (job.status === "Running" && job.actualQty < job.targetQty) {
        const increment = Math.random() > 0.4 ? 1 : 0;
        job.actualQty = Math.min(job.targetQty, job.actualQty + increment);
        if (Math.random() < 0.02) job.defects += 1;
      }
    }
  }

  /* ---- Public API (used by services) ---- */

  getMachines(): MockMachine[] {
    return Array.from(this.states.values()).map((s) => ({ ...s.machine }));
  }

  getLines(): MockProductionLine[] {
    return structuredClone(this.lines);
  }

  getJobs(): MockProductionJob[] {
    return structuredClone(this.jobs);
  }

  getMachineLogs(): MockMachineLog[] {
    return Array.from(this.states.values()).map((s) => ({
      key: s.machine.id,
      machine: s.machine.name,
      status: statusToDashboard(s.machine.status),
      output: s.output,
      temp: s.machine.temp,
      lastMaint: s.machine.lastMaint,
    }));
  }

  getMachineDetail(machineId: string): MockMachineDetail | null {
    const state = this.states.get(machineId);
    if (!state) return null;

    const { machine, profile } = state;
    const job = this.jobs.find(
      (j) =>
        (j.lineId && this.lines.find((l) => l.id === j.lineId)?.machineIds.includes(machineId)) ||
        j.assignedMachineIds?.includes(machineId),
    );

    // Use static detail if exists, otherwise generate
    const base = MOCK_MACHINE_DETAILS[machineId];

    return {
      machineId,
      machineName: machine.name,
      factorySection: base?.factorySection ?? `${machine.type}-Dept`,
      status: statusToCNC(machine.status),
      production: {
        jobOrderId: job?.id ?? "—",
        operatorId: base?.production.operatorId ?? `OP-${Math.floor(Math.random() * 50 + 1).toString().padStart(2, "0")}`,
        activeProgram: base?.production.activeProgram ?? (job ? `${machine.type.toUpperCase()}_PROG.nc` : "—"),
        partCounter: job
          ? { total: job.targetQty, good: job.actualQty - job.defects, scrap: job.defects }
          : { total: 0, good: 0, scrap: 0 },
        cycleTimeSeconds: base?.production.cycleTimeSeconds ?? (machine.status === "In Use" ? +(45 + Math.random() * 200).toFixed(1) : 0),
      },
      activeTool: base?.activeTool ?? { id: "T01", type: machine.type, lifeRemainingPercent: +(30 + Math.random() * 60).toFixed(1) },
      override: {
        feed: machine.status === "In Use" ? jitter(profile.load * 8, 20) : 0,
        spindle: machine.status === "In Use" ? jitter(profile.rpm, profile.rpmJitter) : 0,
      },
    };
  }

  getTelemetryBase(machineId: string): TelemetryProfile | null {
    const state = this.states.get(machineId);
    if (!state) return null;
    const { profile, machine } = state;
    if (machine.status !== "In Use" && machine.status !== "Error") {
      // Idle/Maintenance → near-zero readings
      return { rpm: 0, load: 0, temp: state.temp, vibration: 0.01, coolant: 0, rpmJitter: 0, loadJitter: 0, tempJitter: 0.3, vibJitter: 0.005 };
    }
    return { ...profile, temp: state.temp };
  }

  getKPIs(): MockKPIData[] {
    const machines = this.getMachines();
    const total = machines.length;
    const active = machines.filter((m) => m.status === "In Use").length;
    const alerts = machines.filter((m) => m.status === "Error" || m.status === "Maintenance").length;
    const totalOutput = Array.from(this.states.values()).reduce((s, v) => s + v.output, 0);

    return [
      { key: "production", title: "Total Production", value: totalOutput, suffix: "units", trend: "up", percent: 12 },
      { key: "oee", title: "OEE (Efficiency)", value: +(active / Math.max(1, total) * 100).toFixed(1), suffix: "%", trend: active > total / 2 ? "up" : "down", percent: 2.4 },
      { key: "machines", title: "Active Machines", value: active, suffix: `/ ${total}`, trend: active > total / 2 ? "up" : "down", percent: Math.round((active / total) * 100) },
      { key: "alerts", title: "Active Alerts", value: alerts, suffix: alerts === 1 ? "Issue" : "Issues", trend: alerts > 0 ? "up" : "down", percent: alerts },
    ];
  }

  getErrorLogs(machineId: string) {
    return structuredClone(MOCK_ERROR_LOGS[machineId] ?? []);
  }
}

/* ------------------------------------------------------------------ */
/*  Singleton                                                          */
/* ------------------------------------------------------------------ */

export const simulator = new MockSimulator();
simulator.start();
