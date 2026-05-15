import type React from "react";

export const styles: Record<string, React.CSSProperties> = {
  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  pageTitle: {
    margin: 0,
  },
  subtitle: {
    color: "#8c8c8c",
  },
  cardShadow: {
    boxShadow: "0 1px 2px 0 rgba(0,0,0,0.03)",
  },
  expandedRow: {
    padding: "10px 24px",
    background: "#fafafa",
    borderRadius: 8,
  },
  sectionTitle: {
    marginTop: 0,
  },
  visualizerFooter: {
    marginTop: 12,
    textAlign: "center" as const,
    color: "#888",
    fontSize: 12,
  },
  formSubmit: {
    marginTop: 24,
    marginBottom: 0,
    textAlign: "right" as const,
  },
  lineBold: {
    fontWeight: 600,
  },
  progressBar: {
    width: 180,
  },
  tempBar: {
    width: 100,
  },
  tempLabel: {
    fontSize: 12,
    color: "#888",
  },
  machineListInLine: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 4,
  },
  orderInfoBox: {
    marginBottom: 16,
    padding: 12,
    background: "#f5f5f5",
    borderRadius: 4,
  },
};

export const getTempColor = (temp: number): string =>
  temp > 80 ? "#ff4d4f" : "#1890ff";
