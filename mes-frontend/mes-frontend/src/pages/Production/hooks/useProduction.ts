import apiClient from "../../../services/apiClient";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Form, message } from "antd";
import dayjs from "dayjs";
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
import type { EditJobFormValues } from "../components/EditJobModal";
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
  customLineName?: string;
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
    // Poll every 5 seconds to automatically detect machines added by simulator_gui
    const interval = setInterval(() => {
      fetchData();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // --- Modal ---
  const [modal, setModal] = useState<ModalState>({ type: "closed" });

  // --- Forms ---
  const [startJobForm] = Form.useForm<StartJobFormValues>();
  const [acceptOrderForm] = Form.useForm<AcceptOrderFormValues>();
  const [editJobForm] = Form.useForm<EditJobFormValues>();
  const [cancelJobForm] = Form.useForm<{ reason: string }>(); // EditJobFormValues imported elsewhere or use any

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
        if (j.status === "Waiting") acc.scheduled++;
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
          customLineName: values.customLineName,
        };
      }

      return { assignmentType: type };
    },
    [],
  );

  // Forms and backend endpoints expect UUID.
  const pickTargetMachineId = useCallback(
    (assignment: AssignmentResult): string | undefined => {
      if (assignment.assignedMachineIds?.length) {
        return assignment.assignedMachineIds[0];
      }
      if (assignment.lineId) {
        const line = lines.find((l) => l.id === assignment.lineId);
        return line?.machineIds?.[0];
      }
      return undefined;
    },
    [lines],
  );

  // --- Modal Helpers ---

  const openStartJobModal = useCallback(() => {
    setModal({ type: "startJob" });
    startJobForm.resetFields();
    resetConflicts();
  }, [startJobForm, resetConflicts]);

  const openEditJobModal = useCallback((job: ProductionJob) => {
    setModal({ type: "editJob", job });
    editJobForm.resetFields();
  }, [editJobForm]);

  const openCancelJobModal = useCallback((job: ProductionJob) => {
    setModal({ type: "cancelJob", job });
    cancelJobForm.resetFields();
  }, [cancelJobForm]);

  const openPendingOrders = useCallback(() => {
    setModal({ type: "pendingOrders" });
  }, []);

  const openAcceptOrderModal = useCallback(
    (order: PendingOrder) => {
      setModal({ type: "acceptOrder", order });
      acceptOrderForm.resetFields();
      if (order.productionLineId) {
        acceptOrderForm.setFieldsValue({
          assignmentType: "existing-line",
          lineId: order.productionLineId,
        });
      } else if (order.machineIds && order.machineIds.length > 0) {
        acceptOrderForm.setFieldsValue({
          assignmentType: "machine",
          machineIds: order.machineIds,
        });
      } else {
        acceptOrderForm.setFieldsValue({
          assignmentType: "existing-line", // Default
        });
      }
    },
    [acceptOrderForm],
  );

  const closeModal = useCallback(() => {
    setModal({ type: "closed" });
    startJobForm.resetFields();
    acceptOrderForm.resetFields();
    editJobForm.resetFields();
    cancelJobForm.resetFields();
    resetConflicts();
  }, [startJobForm, acceptOrderForm, resetConflicts]);

  // --- Handlers (persisted to backend) ---

  const handleCreateJob = useCallback(
    async (values: StartJobFormValues) => {
      const assignment = resolveAssignment(values.assignmentType, values);
      let targetLineId = assignment.lineId;
      let targetMachineIds = assignment.assignedMachineIds || [];
      
      if (assignment.assignmentType === 'existing-line' && targetLineId) {
        const line = lines.find((l) => l.id === targetLineId);
        if (line) targetMachineIds = line.machineIds;
      }

      if (!targetMachineIds.length && !targetLineId) {
        message.error("Please choose at least one machine or line for this job.");
        return;
      }

      const woId = `WO-${Date.now().toString(36).toUpperCase()}`;

      try {
        let partId: string | null = null;
        const part = findPartByProductName(parts, values.productName);
        if (part) {
          partId = part.id;
        } else {
          // Auto-create new part on the fly
          try {
            const { data: newPart } = await apiClient.post("/parts/", {
              name: values.productName,
              sku: `PRD-${Date.now().toString().slice(-6)}`,
            });
            partId = newPart.id;
            // Optionally update local parts list
            setParts((prev) => [...prev, newPart]);
          } catch (error) {
            message.error("Failed to create new product. Check server logs.");
            return;
          }
        }

        try {
          // Create custom line if requested
          if (assignment.assignmentType === 'custom-line' && assignment.customLineName) {
            try {
              const { data: newLine } = await apiClient.post("/production-lines/", {
                name: assignment.customLineName,
                status: 'ACTIVE',
                machines: targetMachineIds,
              });
              targetLineId = newLine.id;
            } catch (err) {
              message.error("Failed to create custom line.");
              return;
            }
          }

          await apiClient.post("/workorders/", {
            code: woId,
            description: `Manual Job: ${values.productName}`,
            part: partId,
            production_line: targetLineId || null,
            target_qty: values.targetQty,
            priority: values.priority === "High" ? 3 : values.priority === "Normal" ? 2 : 1,
            due_date: values.dueDate ? dayjs(values.dueDate).toISOString() : null,
          });

          for (const mId of targetMachineIds) {
            await apiClient.post("/workorders/" + woId + "/assign/", {
              machine_id: mId,
              operator_id: null,
            });
          }

          message.success("Production job scheduled!");
          closeModal();
          fetchData();
        } catch (err) {
          console.error("handleCreateJob failed", err);
          message.error("Failed to start production job. Check server logs.");
        }
      } catch (err) {
        console.error("handleCreateJob failed", err);
        message.error("Failed to start production job. Check server logs.");
      }
    },
    [resolveAssignment, parts, fetchData, closeModal],
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
          status: "Waiting",
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
        // Backend "resume" now works on both PAUSED and AWAITING_START (Waiting) executions.
        if (job.status === "Paused" || job.status === "Waiting") {
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
        await productionService.cancelJob(job.workOrderId || job.key);
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


  const handleEditJobSubmit = useCallback(
    async (values: EditJobFormValues) => {
      if (modal.type !== "editJob") return;
      const job = modal.job;
      try {
        await apiClient.patch(`/workorders/${job.workOrderId || job.key}/`, {
          target_qty: values.targetQty,
          due_date: values.dueDate ? values.dueDate.format("YYYY-MM-DD") : null,
        });
        message.success("Job updated successfully.");
        setModal({ type: "closed" });
        await fetchData();
      } catch (err) {
        console.error(err);
        message.error("Failed to update job.");
      }
    },
    [modal, fetchData],
  );

  const handleDeleteJobSubmit = useCallback(
    async (values: { reason: string }) => {
      if (modal.type !== "cancelJob") return;
      const job = modal.job;
      try {
        await productionService.deleteJob(job.key, values.reason);
        message.success("Job deleted successfully.");
        setModal({ type: "closed" });
        await fetchData();
      } catch (err) {
        console.error(err);
        message.error("Failed to delete job.");
      }
    },
    [modal, fetchData],
  );

  const handleCompleteJob = useCallback(
    async (key: string) => {
      try {
        const job = jobs.find((j) => j.key === key);
        if (!job) return;
        await apiClient.post(`/workorders/${job.workOrderId || job.key}/complete/`);
        message.success("Job marked as complete.");
        await fetchData();
      } catch (err) {
        console.error(err);
        message.error("Failed to complete job.");
      }
    },
    [fetchData],
  );

  const getLineName = useCallback(
    (lineId: string): string => {
      const line = lines.find((l) => l.id === lineId);
      return line ? `${line.slug} — ${line.name}` : lineId;
    },
    [lines],
  );

  const getMachinesForLine = useCallback(
    (lineId: string): Machine[] => {
      const line = lines.find((l) => l.id === lineId);
      if (!line) return [];
      const machineDict = new Map(machines.map((m) => [m.id, m]));
      return line.machineIds
        .map((id) => machineDict.get(id))
        .filter((m): m is Machine => m !== undefined);
    },
    [lines, machines],
  );

  const getMachinesByIds = useCallback(
    (ids: string[]): Machine[] => {
      const machineDict = new Map(machines.map((m) => [m.id, m]));
      return ids
        .map((id) => machineDict.get(id))
        .filter((m): m is Machine => m !== undefined);
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
    parts,
    availableMachines,
    stats,
    dataLoaded,

    modal,
    openStartJobModal,
    openPendingOrders,
    openAcceptOrderModal,
    openEditJobModal,
    openCancelJobModal,
    closeModal,

    startJobForm,
    acceptOrderForm,
    editJobForm,
    cancelJobForm,

    handleCreateJob,
    handleAcceptOrder,
    handleRunJob,
    handleCancelJob,
    handleEditJobSubmit,
    handleDeleteJobSubmit,
    handleCompleteJob,

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
