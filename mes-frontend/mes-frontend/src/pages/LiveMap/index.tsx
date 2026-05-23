import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  Controls,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";

import { MachineNode, FlowControls } from "./components";
import type { MachineNodeType } from "./components/MachineNode";
import { useDigitalTwin } from "./hooks/useDigitalTwin";
import { MachineDetailDrawer } from "../Dashboard/components";
import { useLiveTelemetry } from "../Dashboard/hooks/useLiveTelemetry";
import {
  getMachineDetail,
  getMachineErrorLogs,
  resetMachineAlarm,
} from "../../services/dashboardService";
import type { MachineDetail, ErrorLog } from "../Dashboard/types";

/* ------------------------------------------------------------------ */
/*  Node type registry                                                 */
/* ------------------------------------------------------------------ */

const nodeTypes = { machine: MachineNode };

/* ------------------------------------------------------------------ */
/*  Inner Canvas (needs ReactFlowProvider above it)                    */
/* ------------------------------------------------------------------ */

const LiveMapCanvas: React.FC = () => {
  const { fitView } = useReactFlow();

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    dataLoaded,
    statusFilter,
    setStatusFilter,
    lineFilter,
    setLineFilter,
    searchValue,
    setSearchValue,
    stats,
    lineOptions,
  } = useDigitalTwin();

  // Machine detail drawer
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [detail, setDetail] = useState<MachineDetail | null>(null);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const { data: telemetryData, latest: latestTelemetry } =
    useLiveTelemetry(selectedMachine);

  useEffect(() => {
    if (!selectedMachine) {
      setDetail(null);
      return;
    }
    const fetchDetail = async () => {
      const [d, logs] = await Promise.all([
        getMachineDetail(selectedMachine),
        getMachineErrorLogs(selectedMachine),
      ]);
      setDetail(d);
      setErrorLogs(logs);
    };
    fetchDetail();
  }, [selectedMachine]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: MachineNodeType) => {
      setSelectedMachine(node.data.displayId);
    },
    [],
  );

  const handleCloseDrawer = useCallback(() => {
    setSelectedMachine(null);
    setErrorLogs([]);
  }, []);

  const handleResetAlarm = useCallback(async (machineId: string) => {
    await resetMachineAlarm(machineId);
    const updatedLogs = await getMachineErrorLogs(machineId);
    setErrorLogs(updatedLogs);
  }, []);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 400 });
  }, [fitView]);

  // Fit view once data loads
  useEffect(() => {
    if (dataLoaded && nodes.length > 0) {
      setTimeout(() => fitView({ padding: 0.2, duration: 600 }), 200);
    }
  }, [dataLoaded, nodes.length, fitView]);

  // Minimap color helper
  const minimapNodeColor = useCallback((node: MachineNodeType) => {
    const status = node.data?.status;
    if (status === "In Use") return "#52c41a";
    if (status === "Error") return "#ff4d4f";
    if (status === "Maintenance") return "#faad14";
    return "#1890ff";
  }, []);

  return (
    <>
      <FlowControls
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        lineFilter={lineFilter}
        onLineFilterChange={setLineFilter}
        lineOptions={lineOptions}
        onFitView={handleFitView}
        stats={stats}
      />

      <div className="live-map-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.3}
          maxZoom={2}
          defaultEdgeOptions={{
            style: { strokeWidth: 2 },
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#e0e0e0"
          />
          <Controls
            position="bottom-left"
            showInteractive={false}
            style={{ borderRadius: 8 }}
          />
          <MiniMap
            position="bottom-right"
            nodeColor={minimapNodeColor}
            nodeStrokeWidth={2}
            pannable
            zoomable
            style={{ width: 160, height: 100 }}
          />
        </ReactFlow>
      </div>

      {/* Detail Drawer — reused from Dashboard */}
      <MachineDetailDrawer
        open={selectedMachine !== null}
        detail={detail}
        telemetryData={telemetryData}
        latestTelemetry={latestTelemetry}
        errorLogs={errorLogs}
        onClose={handleCloseDrawer}
        onResetAlarm={handleResetAlarm}
      />
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Page Wrapper (provides ReactFlowProvider)                          */
/* ------------------------------------------------------------------ */

const LiveMap: React.FC = () => {
  return (
    <ReactFlowProvider>
      <LiveMapCanvas />
    </ReactFlowProvider>
  );
};

export default LiveMap;
