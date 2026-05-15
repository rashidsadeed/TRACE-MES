import React, { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import { Progress, Tooltip } from "antd";
import {
  ToolOutlined,
  ThunderboltOutlined,
  ExperimentOutlined,
  FormatPainterOutlined,
  BoxPlotOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  PauseCircleOutlined,
} from "@ant-design/icons";
import type { MachineStatus, MachineType } from "../../../services/mockData";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MachineNodeData {
  machineId: string;
  name: string;
  type: MachineType;
  status: MachineStatus;
  temp: number;
  jobId?: string;
  jobName?: string;
  progress?: number; // 0-100
  highlighted?: boolean; // order-filter highlight
  [key: string]: unknown;
}

export type MachineNodeType = Node<MachineNodeData, "machine">;

/* ------------------------------------------------------------------ */
/*  Icon helpers                                                       */
/* ------------------------------------------------------------------ */

const MACHINE_ICON: Record<string, React.ReactNode> = {
  CNC: <ToolOutlined />,
  Press: <ThunderboltOutlined />,
  Assembly: <ExperimentOutlined />,
  Welding: <ThunderboltOutlined />,
  Painting: <FormatPainterOutlined />,
  Testing: <CheckCircleOutlined />,
  Packaging: <BoxPlotOutlined />,
  Soldering: <ThunderboltOutlined />,
  Molding: <ExperimentOutlined />,
};

const STATUS_META: Record<
  MachineStatus,
  { color: string; bg: string; border: string; icon: React.ReactNode; label: string }
> = {
  "In Use": {
    color: "#52c41a",
    bg: "rgba(82,196,26,0.08)",
    border: "#52c41a",
    icon: <ThunderboltOutlined style={{ color: "#52c41a" }} />,
    label: "Running",
  },
  Available: {
    color: "#1890ff",
    bg: "rgba(24,144,255,0.06)",
    border: "#d9d9d9",
    icon: <PauseCircleOutlined style={{ color: "#1890ff" }} />,
    label: "Idle",
  },
  Maintenance: {
    color: "#faad14",
    bg: "rgba(250,173,20,0.08)",
    border: "#faad14",
    icon: <WarningOutlined style={{ color: "#faad14" }} />,
    label: "Maintenance",
  },
  Error: {
    color: "#ff4d4f",
    bg: "rgba(255,77,79,0.10)",
    border: "#ff4d4f",
    icon: <CloseCircleOutlined style={{ color: "#ff4d4f" }} />,
    label: "Error",
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const MachineNode: React.FC<NodeProps<MachineNodeType>> = ({ data }) => {
  const meta = STATUS_META[data.status];
  const icon = MACHINE_ICON[data.type] ?? <ToolOutlined />;
  const dimmed = data.highlighted === false;

  return (
    <>
      {/* Input handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{
          width: 10,
          height: 10,
          background: "#8c8c8c",
          border: "2px solid #fff",
        }}
      />

      <Tooltip
        title={
          <div>
            <div><b>{data.name}</b> ({data.machineId})</div>
            <div>Type: {data.type}</div>
            <div>Status: {meta.label}</div>
            {data.jobName && <div>Job: {data.jobName}</div>}
            <div>Temp: {data.temp.toFixed(1)}°C</div>
          </div>
        }
      >
        <div
          style={{
            width: 180,
            background: dimmed ? "#f5f5f5" : meta.bg,
            border: `2px solid ${dimmed ? "#e8e8e8" : meta.border}`,
            borderRadius: 12,
            padding: "10px 12px",
            fontFamily: "Inter, sans-serif",
            opacity: dimmed ? 0.35 : 1,
            transition: "all 0.3s ease",
            cursor: "pointer",
            boxShadow: data.highlighted
              ? `0 0 12px 2px ${meta.color}40`
              : "0 2px 8px rgba(0,0,0,0.06)",
          }}
          className={data.status === "Error" ? "machine-node-error" : ""}
        >
          {/* Header row: icon + name + status dot */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 16, color: meta.color }}>{icon}</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#262626",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 110,
                }}
              >
                {data.name}
              </span>
            </div>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: meta.color,
                display: "inline-block",
                boxShadow: data.status === "Error" ? `0 0 6px ${meta.color}` : "none",
              }}
            />
          </div>

          {/* Status label */}
          <div
            style={{
              fontSize: 10,
              color: meta.color,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 4,
            }}
          >
            {meta.icon} {meta.label}
          </div>

          {/* Job info & progress */}
          {data.jobName ? (
            <div style={{ marginTop: 6 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "#595959",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                🏭 {data.jobName}
              </div>
              <Progress
                percent={data.progress ?? 0}
                size="small"
                strokeColor={meta.color}
                style={{ marginTop: 4 }}
                format={(pct) => (
                  <span style={{ fontSize: 10 }}>{pct}%</span>
                )}
              />
            </div>
          ) : (
            <div style={{ fontSize: 10, color: "#bfbfbf", marginTop: 6 }}>
              No active job
            </div>
          )}

          {/* Temperature badge */}
          <div
            style={{
              marginTop: 6,
              fontSize: 10,
              color: data.temp > 80 ? "#ff4d4f" : "#8c8c8c",
              fontWeight: data.temp > 80 ? 700 : 400,
            }}
          >
            🌡 {data.temp.toFixed(1)}°C
          </div>
        </div>
      </Tooltip>

      {/* Output handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{
          width: 10,
          height: 10,
          background: "#8c8c8c",
          border: "2px solid #fff",
        }}
      />
    </>
  );
};

export default memo(MachineNode);
