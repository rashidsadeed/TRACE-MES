import type React from "react";

export const styles: Record<string, React.CSSProperties> = {
  pageHeader: {
    marginBottom: 24,
  },
  subtitle: {
    color: "#8c8c8c",
  },
  // KPI Card
  kpiCardBody: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  kpiIconWrapper: {
    padding: 8,
    background: "#f5f5f5",
    borderRadius: "50%",
  },
  kpiSuffix: {
    fontSize: 14,
    color: "#8c8c8c",
  },
  kpiTrendRow: {
    marginTop: 16,
    display: "flex",
    alignItems: "center",
    fontSize: 12,
  },
  kpiTrendLabel: {
    color: "#8c8c8c",
  },
  // Machine Table
  machineName: {
    fontWeight: 600,
  },
  tempBar: {
    width: 100,
  },
  tempLabel: {
    fontSize: 12,
    color: "#888",
  },
  tableSection: {
    marginTop: 24,
  },
};

/**
 * Returns trend color based on direction.
 * When `invertColor` is true the semantics are flipped — useful for metrics
 * where "up" is bad (e.g. Active Alerts).
 */
export const getTrendColor = (trend: "up" | "down", invertColor = false): string => {
  if (invertColor) return trend === "up" ? "#ff4d4f" : "#52c41a";
  return trend === "up" ? "#52c41a" : "#ff4d4f";
};

/**
 * Returns temp bar color based on threshold.
 */
export const getTempColor = (temp: number, threshold: number): string =>
  temp > threshold ? "#ff4d4f" : "#1890ff";
