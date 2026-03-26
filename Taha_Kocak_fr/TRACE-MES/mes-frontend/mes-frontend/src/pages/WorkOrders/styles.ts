import type React from "react";

export const styles: Record<string, React.CSSProperties> = {
  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  pageTitle: {
    margin: 0,
    whiteSpace: "nowrap",
  },
  alertContainer: {
    flex: 1,
    margin: "0 24px",
  },
  alertBorder: {
    border: "1px solid #ffe58f",
    backgroundColor: "#fffbe6",
  },
  alertText: {
    fontWeight: 600,
  },
  clientInfoBox: {
    marginBottom: 16,
    padding: 12,
    background: "#f5f5f5",
    borderRadius: 4,
  },
  submitRight: {
    textAlign: "right" as const,
  },
  submitRightWithMargin: {
    textAlign: "right" as const,
    marginTop: 16,
  },
  statsRow: {
    marginBottom: 24,
  },
  activeStatValue: {
    color: "#1890ff",
  },
  delayedStatValue: {
    color: "#cf1322",
  },
  emptyState: {
    textAlign: "center" as const,
    padding: 20,
    color: "#999",
  },
};
