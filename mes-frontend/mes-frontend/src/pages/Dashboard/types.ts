import type React from "react";

// --- Dashboard KPI ---

export type MachineStatus = "Running" | "Idle" | "Error" | "Maintenance";
export type TrendDirection = "up" | "down";

export interface KPIData {
  key: string;
  title: string;
  value: number;
  suffix: string;
  icon: React.ReactNode;
  trend: TrendDirection;
  percent: number;
}

export interface MachineLog {
  key: string;
  machine: string;
  status: MachineStatus;
  output: number;
  temp: number;
  lastMaint: string;
}

// --- Error Logs ---

export type ErrorSeverity = "Critical" | "Warning" | "Info";
export type ErrorStatus = "Active" | "Resolved";

export interface ErrorLog {
  key: string;
  timestamp: string;
  errorCode: string;
  message: string;
  severity: ErrorSeverity;
  status: ErrorStatus;
}

// --- Machine Detail (from CNC JSON payload) ---

export type CNCStatus = "RUNNING" | "IDLE" | "ALARM" | "MAINTENANCE" | "SETUP";

export interface MachineDetail {
  machineId: string;
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
  errorLogs?: ErrorLog[];
}

// --- Telemetry (real-time data point) ---

export interface TelemetryPoint {
  time: string;        // "HH:mm:ss"
  spindleRpm: number;
  spindleLoad: number;
  tempC: number;
  vibration: number;
  coolantPressure: number;
}
