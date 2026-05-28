import { useState, useCallback, useMemo, useEffect } from "react";
import type { Edge, OnNodesChange, OnEdgesChange } from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges, MarkerType } from "@xyflow/react";
import type { MachineNodeType, MachineNodeData } from "../components/MachineNode";
import {
  getMachines,
  getLines,
  getJobs,
} from "../../../services/productionService";
import type {
  MockMachine,
  MockProductionLine,
  MockProductionJob,
  MachineStatus,
} from "../../../services/mockData";

/* ------------------------------------------------------------------ */
/*  Layout helpers                                                     */
/* ------------------------------------------------------------------ */

const NODE_W = 200;
const NODE_H = 180;
const LINE_GAP_Y = 260;
const MACHINE_GAP_X = 260;
const LINE_START_X = 80;
const LINE_START_Y = 80;
const STANDALONE_START_Y_OFFSET = 40;

/**
 * Positions machines inside a production line left-to-right,
 * standalone machines go into a separate "unassigned" row at the bottom.
 */
const buildNodesAndEdges = (
  machines: MockMachine[],
  lines: MockProductionLine[],
  jobs: MockProductionJob[],
  statusFilter: MachineStatus | "All",
  lineFilter: string,
  searchValue: string,
): { nodes: MachineNodeType[]; edges: Edge[] } => {
  const nodes: MachineNodeType[] = [];
  const edges: Edge[] = [];

  const jobByLine = new Map<string, MockProductionJob>();
  const jobByMachine = new Map<string, MockProductionJob>();
  for (const job of jobs) {
    if (job.lineId) jobByLine.set(job.lineId, job);
    if (job.assignedMachineIds) {
      for (const mid of job.assignedMachineIds) {
        jobByMachine.set(mid, job);
      }
    }
  }

  const machineMap = new Map<string, MockMachine>();
  for (const m of machines) machineMap.set(m.id, m);

  const assignedMachineIds = new Set<string>();

  // Determine which order is being searched (for highlight)
  const searchLower = searchValue.toLowerCase().trim();

  // ----- Lines -----
  let filteredLines =
    lineFilter === "all" ? lines : lines.filter((l) => l.id === lineFilter);

  // A line is visually rendered as a line ONLY if it has an active job.
  // Otherwise, the line "dissolves" and its machines are rendered as standalone machines.
  filteredLines = filteredLines.filter((l) => jobByLine.has(l.id));

  filteredLines.forEach((line, lineIdx) => {
    const lineY = LINE_START_Y + lineIdx * LINE_GAP_Y;
    const job = jobByLine.get(line.id);
    const progress =
      job && job.targetQty > 0
        ? Math.round((job.actualQty / job.targetQty) * 100)
        : 0;

    line.machineIds.forEach((mid, machineIdx) => {
      assignedMachineIds.add(mid);
      const machine = machineMap.get(mid);
      if (!machine) return;

      // Status filter
      if (statusFilter !== "All" && machine.status !== statusFilter) return;

      // Search highlight logic
      let highlighted: boolean | undefined;
      if (searchLower) {
        const matches =
          machine.name.toLowerCase().includes(searchLower) ||
          machine.id.toLowerCase().includes(searchLower) ||
          (job?.id ?? "").toLowerCase().includes(searchLower) ||
          (job?.productName ?? "").toLowerCase().includes(searchLower);
        highlighted = matches;
      }

      const x = LINE_START_X + machineIdx * MACHINE_GAP_X;
      const y = lineY;

      nodes.push({
        id: machine.id,
        type: "machine",
        position: { x, y },
        data: {
          machineId: machine.key,
          displayId: machine.id,
          name: machine.name,
          type: machine.type,
          status: machine.status,
          temp: machine.temp,
          jobId: job?.id,
          jobName: job?.productName,
          progress,
          highlighted,
        },
      });

      // Pipeline edges between consecutive machines in the line
      if (machineIdx > 0) {
        const prevMid = line.machineIds[machineIdx - 1];
        // Only draw edge if prev machine was also rendered
        if (nodes.some((n) => n.id === prevMid)) {
          const isActive = line.status === "Active" && job?.status === "Running";
          edges.push({
            id: `${prevMid}->${mid}`,
            source: prevMid,
            target: mid,
            type: "default",
            animated: isActive,
            style: {
              stroke: isActive ? "#52c41a" : "#d9d9d9",
              strokeWidth: isActive ? 3 : 2,
              strokeDasharray: isActive ? undefined : "6 4",
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: isActive ? "#52c41a" : "#d9d9d9",
              width: 16,
              height: 16,
            },
          });
        }
      }
    });
  });

  // ----- Standalone machines (not in any line) -----
  const standalones = machines.filter((m) => !assignedMachineIds.has(m.id));
  const standY =
    LINE_START_Y + filteredLines.length * LINE_GAP_Y + STANDALONE_START_Y_OFFSET;

  standalones.forEach((machine, idx) => {
    if (statusFilter !== "All" && machine.status !== statusFilter) return;

    let highlighted: boolean | undefined;
    if (searchLower) {
      const jobForMachine = jobByMachine.get(machine.id);
      const matches =
        machine.name.toLowerCase().includes(searchLower) ||
        machine.id.toLowerCase().includes(searchLower) ||
        (jobForMachine?.id ?? "").toLowerCase().includes(searchLower) ||
        (jobForMachine?.productName ?? "").toLowerCase().includes(searchLower);
      highlighted = matches;
    }

    nodes.push({
      id: machine.id,
      type: "machine",
      position: { x: LINE_START_X + idx * MACHINE_GAP_X, y: standY },
      data: {
        machineId: machine.key,
        displayId: machine.id,
        name: machine.name,
        type: machine.type,
        status: machine.status,
        temp: machine.temp,
        highlighted,
      },
    });
  });

  return { nodes, edges };
};

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export const useDigitalTwin = () => {
  const [machines, setMachines] = useState<MockMachine[]>([]);
  const [lines, setLines] = useState<MockProductionLine[]>([]);
  const [jobs, setJobs] = useState<MockProductionJob[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<MachineStatus | "All">("All");
  const [lineFilter, setLineFilter] = useState("all");
  const [searchValue, setSearchValue] = useState("");

  // React Flow state
  const [nodes, setNodes] = useState<MachineNodeType[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // Fetch data on mount + poll every 5s
  useEffect(() => {
    const fetchAll = async () => {
      const [m, l, j] = await Promise.all([getMachines(), getLines(), getJobs()]);
      setMachines(m);
      setLines(l);
      setJobs(j);
      setDataLoaded(true);
    };
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, []);

  // Rebuild graph when data or filters change
  useEffect(() => {
    if (!dataLoaded) return;
    const { nodes: n, edges: e } = buildNodesAndEdges(
      machines,
      lines,
      jobs,
      statusFilter,
      lineFilter,
      searchValue,
    );
    setNodes(n);
    setEdges(e);
  }, [machines, lines, jobs, statusFilter, lineFilter, searchValue, dataLoaded]);

  // React Flow callbacks for interactivity (dragging)
  const onNodesChange: OnNodesChange<MachineNodeType> = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  // Stats
  const stats = useMemo(
    () => ({
      total: machines.length,
      running: machines.filter((m) => m.status === "In Use").length,
      idle: machines.filter((m) => m.status === "Available").length,
      error: machines.filter((m) => m.status === "Error").length,
      maintenance: machines.filter((m) => m.status === "Maintenance").length,
    }),
    [machines],
  );

  // Line options for filter dropdown
  const lineOptions = useMemo(
    () => lines.map((l) => ({ value: l.id, label: l.name })),
    [lines],
  );

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    dataLoaded,

    // Filters
    statusFilter,
    setStatusFilter,
    lineFilter,
    setLineFilter,
    searchValue,
    setSearchValue,

    // Derived
    stats,
    lineOptions,
  };
};
