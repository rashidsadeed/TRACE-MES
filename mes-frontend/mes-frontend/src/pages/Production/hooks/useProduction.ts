import { useState, useEffect, useMemo, useCallback } from "react";
import { Form, message } from "antd";
import type {
  Machine,
  ProductionLine,
  ProductionJob,
  PendingOrder,
  ModalState,
  AssignmentType,
  StartJobFormValues,
  AcceptOrderFormValues,
  Priority,
} from "../types";
import * as productionService from "../../../services/productionService";
import * as workOrderService from "../../../services/workOrderService";
import type {
  BackendPart,
  CreateWorkOrderPayload,
} from "../../../services/workOrderService";

const PRIORITY_TO_NUMBER: Record<Priority, number> = {
  High: 1,
  Normal: 2,
  Low: 3,
};

const findPartByProductName = (
  parts: BackendPart[],
  productName: string,
): BackendPart | undefined => {
  const lower = productName.trim().toLowerCase();
  return (
    parts.find((p) => p.name.toLowerCase() === lower) ??
    parts.find((p) => p.name.toLowerCase().includes(lower)) ??
    parts.find((p) => p.sku.toLowerCase() === lower)
  );
};

/** Result of resolving form values into job assignment info. */
interface AssignmentResult {
  assignmentType: AssignmentType;
  lineId?: string;
  assignedMachineIds?: string[];
}

export const useProduction = () => {
  // --- Core Data ---
  const [machines, setMachines] = useState<Machine[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [parts, setParts] = useState<BackendPart[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // --- Fetch initial data from service ---
  const fetchData = useCallback(async () => {
    const [m, l, j, po, pt] = await Promise.all([
      productionService.getMachines(),
      productionService.getLines(),
      productionService.getJobs(),
      productionService.getPendingOrders(),
      workOrderService.getParts(),
    ]);
    setMachines(m as Machine[]);
    setLines(l as ProductionLine[]);
    setJobs(j as ProductionJob[]);
    setPendingOrders(po as PendingOrder[]);
    setParts(pt);
    setDataLoaded(true);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Modal ---
  const [modal, setModal] = useState<ModalState>({ type: "closed" });

  // --- Forms ---
  const [startJobForm] = Form.useForm<StartJobFormValues>();
  const [acceptOrderForm] = Form.useForm<AcceptOrderFormValues>();

  // --- Machine Conflict State ---
  const [conflictMachines, setConflictMachines] = useState<Machine[]>([]);
  const [conflictAcknowledged, setConflictAcknowledged] = useState(false);
  const isConflictBlocked = conflictMachines.length > 0 && !conflictAcknowledged;

  const checkMachineConflicts = useCallback(
    (assignmentType: string, values: { lineId?: string; machineIds?: string[]; customMachineIds?: string[] }) => {
      setConflictAcknowledged(false);
      let idsToCheck: string[] = [];

      if (assignmentType === "machine" && values.machineIds?.length) {
        idsToCheck = values.machineIds;
      } else if (assignmentType === "custom-line" && values.customMachineIds?.length) {
        idsToCheck = values.customMachineIds;
      } else if ((assignmentType === "existing-line") && values.lineId) {
        const line = lines.find((l) => l.id === values.lineId);
        idsToCheck = line ? line.machineIds : [];
      }

      const busyMachines = machines.filter(
        (m) => idsToCheck.includes(m.id) && m.status !== "Available",
      );
      setConflictMachines(busyMachines);
    },
    [machines, lines],
  );

  const resetConflicts = useCallback(() => {
    setConflictMachines([]);
    setConflictAcknowledged(false);
  }, []);

  // --- Derived Data ---
  const availableMachines = useMemo(
    () => machines.filter((m) => m.status === "Available"),
    [machines],
  );

  const stats = useMemo(() => {
    const jobStats = jobs.reduce(
      (acc, j) => {
        acc.total++;
        if (j.status === "Running") acc.running++;
        if (j.status === "Paused") acc.paused++;
        if (j.status === "Scheduled") acc.scheduled++;
        return acc;
      },
      { total: 0, running: 0, paused: 0, scheduled: 0 },
    );

    const machineStats = {
      total: machines.length,
      available: machines.filter((m) => m.status === "Available").length,
      inUse: machines.filter((m) => m.status === "In Use").length,
      error: machines.filter((m) => m.status === "Error").length,
    };

    return { jobs: jobStats, machines: machineStats };
  }, [jobs, machines]);

  // --- Assignment Resolution ---
  const resolveAssignment = useCallback(
    (
      type: AssignmentType,
      values: {
        lineId?: string;
        machineIds?: string[];
        customLineName?: string;
        customMachineIds?: string[];
      },
    ): AssignmentResult => {
      if (type === "existing-line" && values.lineId) {
        return { assignmentType: type, lineId: values.lineId };
      }

      if (type === "machine" && values.machineIds?.length) {
        return {
          assignmentType: type,
          assignedMachineIds: values.machineIds,
        };
      }

      if (
        type === "custom-line" &&
        values.customMachineIds?.length
      ) {
        return {
          assignmentType: type,
          assignedMachineIds: values.customMachineIds,
        };
      }

      return { assignmentType: type };
    },
    [],
  );

  // Convention: machine.id = slug (display), machine.key = UUID (API).
  // Forms emit slugs; the backend executions/start endpoint expects UUID.
  const pickTargetMachineId = useCallback(
    (assignment: AssignmentResult): string | undefined => {
      const slugToUuid = (slugId: string): string | undefined =>
        machines.find((m) => m.id === slugId)?.key;

      if (assignment.assignedMachineIds?.length) {
        return slugToUuid(assignment.assignedMachineIds[0]);
      }
      if (assignment.lineId) {
        const line = lines.find((l) => l.id === assignment.lineId);
        const firstSlug = line?.machineIds[0];
        if (firstSlug) return slugToUuid(firstSlug);
      }
      return undefined;
    },
    [machines, lines],
  );

  // --- Modal Helpers ---

  const openStartJobModal = useCallback(() => {
    setModal({ type: "startJob" });
    startJobForm.resetFields();
    resetConflicts();
  }, [startJobForm, resetConflicts]);

  const openPendingOrders = useCallback(() => {
    setModal({ type: "pendingOrders" });
  }, []);

  const openAcceptOrderModal = useCallback(
    (order: PendingOrder) => {
      setModal({ type: "acceptOrder", order });
      acceptOrderForm.resetFields();
    },
    [acceptOrderForm],
  );

  const closeModal = useCallback(() => {
    setModal({ type: "closed" });
    startJobForm.resetFields();
    acceptOrderForm.resetFields();
    resetConflicts();
  }, [startJobForm, acceptOrderForm, resetConflicts]);

  // --- Handlers (persisted to backend) ---

  const handleCreateJob = useCallback(
    async (values: StartJobFormValues) => {
      const assignment = resolveAssignment(values.assignmentType, values);
      const machineId = pickTargetMachineId(assignment);
      if (!machineId) {
        message.error("Please choose at least one machine for this job.");
        return;
      }

      const part = findPartByProductName(parts, values.productName);
      if (!part) {
        message.error(
          `Product "${values.productName}" not found in parts catalog. Pick an existing product (e.g. ${parts.slice(0, 3).map((p) => p.name).join(", ") || "—"}).`,
          5,
        );
        return;
      }

      const woPayload: CreateWorkOrderPayload = {
        code: `WO-${Date.now().toString(36).toUpperCase()}`,
        description: values.productName,
        part: part.id,
        target_qty: values.targetQty,
        priority: PRIORITY_TO_NUMBER[values.priority],
      };

      try {
        const wo = await workOrderService.createWorkOrder(woPayload);
        const woId =
          typeof wo === "object" && wo !== null && "id" in wo
            ? (wo as { id: string }).id
            : "";
        if (!woId) throw new Error("Backend did not return new work order id.");

        await productionService.createJob({
          key: woId,
          id: woId,
          productName: values.productName,
          assignmentType: assignment.assignmentType,
          lineId: assignment.lineId,
          assignedMachineIds: [machineId],
          status: "Scheduled",
          targetQty: values.targetQty,
          actualQty: 0,
          startTime: "-",
          currentStageIndex: 0,
          stages: ["Prep", "Processing", "QC", "Output"],
          defects: 0,
          estimatedTimeRemaining: "TBD",
        });

        await fetchData();
        closeModal();
        message.success("New production job scheduled.");
      } catch (err) {
        console.error("handleCreateJob failed", err);
        message.error("Failed to start production job. Check server logs.");
      }
    },
    [resolveAssignment, pickTargetMachineId, parts, fetchData, closeModal],
  );

  const handleAcceptOrder = useCallback(
    async (values: AcceptOrderFormValues) => {
      if (modal.type !== "acceptOrder") return;
      const { order } = modal;

      const assignment = resolveAssignment(values.assignmentType, values);
      const machineId = pickTargetMachineId(assignment);
      if (!machineId) {
        message.error("Please choose at least one machine for this order.");
        return;
      }

      try {
        await productionService.acceptOrder(order.key, {
          key: order.key,
          id: order.key,
          productName: order.product,
          assignmentType: assignment.assignmentType,
          lineId: assignment.lineId,
          assignedMachineIds: [machineId],
          status: "Scheduled",
          targetQty: order.quantity,
          actualQty: 0,
          startTime: "-",
          currentStageIndex: 0,
          stages: ["Prep", "Processing", "QC", "Output"],
          defects: 0,
          estimatedTimeRemaining: "TBD",
        });

        await fetchData();
        closeModal();
        message.success(`Order ${order.orderId} accepted into production.`);
      } catch (err) {
        console.error("handleAcceptOrder failed", err);
        message.error("Failed to accept order. Check server logs.");
      }
    },
    [modal, resolveAssignment, pickTargetMachineId, fetchData, closeModal],
  );

  const handleRunJob = useCallback(
    async (key: string) => {
      const job = jobs.find((j) => j.key === key);
      if (!job) return;

      try {
        // Backend "resume" only works on PAUSED executions.
        // For SCHEDULED (= AWAITING_START on backend) the live generator flips
        // the status to RUNNING automatically — we just refetch.
        if (job.status === "Paused") {
          await productionService.runJob(job.key);
        }
        await fetchData();
        message.success(`Job ${job.id} is now running.`);
      } catch (err) {
        console.error("handleRunJob failed", err);
        message.error("Failed to start job. Check server logs.");
      }
    },
    [jobs, fetchData],
  );

  const handleCancelJob = useCallback(
    async (key: string) => {
      const job = jobs.find((j) => j.key === key);
      if (!job) return;

      try {
        await productionService.cancelJob(job.key);
        await fetchData();
        message.info("Job cancelled.");
      } catch (err) {
        console.error("handleCancelJob failed", err);
        message.error("Failed to cancel job. Check server logs.");
      }
    },
    [jobs, fetchData],
  );

  // --- Lookup helpers ---

  const getLineName = useCallback(
    (lineId: string): string => {
      const line = lines.find((l) => l.id === lineId);
      return line ? `${line.id} — ${line.name}` : lineId;
    },
    [lines],
  );

  const getMachinesForLine = useCallback(
    (lineId: string): Machine[] => {
      const line = lines.find((l) => l.id === lineId);
      if (!line) return [];
      return machines.filter((m) => line.machineIds.includes(m.id));
    },
    [lines, machines],
  );

  const getMachinesByIds = useCallback(
    (ids: string[]): Machine[] => {
      return machines.filter((m) => ids.includes(m.id));
    },
    [machines],
  );

  // --- Emergency Stop ---

  const hasRunningJobs = useMemo(
    () => jobs.some((j) => j.status === "Running"),
    [jobs],
  );

  const handleStopAll = useCallback(async () => {
    try {
      await productionService.stopAll();
      await fetchData();
      message.error("EMERGENCY STOP: All running jobs halted.");
    } catch (err) {
      console.error("handleStopAll failed", err);
      message.error("Failed to stop all jobs. Check server logs.");
    }
  }, [fetchData]);

  const handleStopJob = useCallback(
    async (key: string) => {
      const job = jobs.find((j) => j.key === key);
      if (!job) return;

      try {
        await productionService.stopJob(job.key);
        await fetchData();
        message.error(`EMERGENCY STOP: Job ${job.id} halted.`);
      } catch (err) {
        console.error("handleStopJob failed", err);
        message.error("Failed to stop job. Check server logs.");
      }
    },
    [jobs, fetchData],
  );

  return {
    machines,
    lines,
    jobs,
    pendingOrders,
    availableMachines,
    stats,
    dataLoaded,

    modal,
    openStartJobModal,
    openPendingOrders,
    openAcceptOrderModal,
    closeModal,

    startJobForm,
    acceptOrderForm,

    handleCreateJob,
    handleAcceptOrder,
    handleRunJob,
    handleCancelJob,

    getLineName,
    getMachinesForLine,
    getMachinesByIds,

    // Emergency Stop
    hasRunningJobs,
    handleStopAll,
    handleStopJob,

    // Machine Conflict
    conflictMachines,
    conflictAcknowledged,
    setConflictAcknowledged,
    checkMachineConflicts,
    isConflictBlocked,
  };
};
