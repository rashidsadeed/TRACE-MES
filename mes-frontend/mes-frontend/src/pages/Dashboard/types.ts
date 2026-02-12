import type React from "react";

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
