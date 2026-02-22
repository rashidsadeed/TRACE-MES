import { useState, useMemo, useCallback } from "react";
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
} from "../types";
import {
  INITIAL_MACHINES,
  INITIAL_LINES,
  INITIAL_JOBS,
  INITIAL_PENDING_ORDERS,
} from "../constants";

/** Result of resolving form values into job assignment info. */
interface AssignmentResult {
  assignmentType: AssignmentType;
  lineId?: string;
  assignedMachineIds?: string[];
}

export const useProduction = () => {
  // --- Core Data ---
  const [machines, setMachines] = useState<Machine[]>(INITIAL_MACHINES);
  const [lines, setLines] = useState<ProductionLine[]>(INITIAL_LINES);
  const [jobs, setJobs] = useState<ProductionJob[]>(INITIAL_JOBS);
  const [pendingOrders, setPendingOrders] =
    useState<PendingOrder[]>(INITIAL_PENDING_ORDERS);

  // --- Modal ---
  const [modal, setModal] = useState<ModalState>({ type: "closed" });

  // --- Forms ---
  const [startJobForm] = Form.useForm<StartJobFormValues>();
  const [acceptOrderForm] = Form.useForm<AcceptOrderFormValues>();

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

  const markMachinesBusy = useCallback(
    (machineIds: string[], jobId: string, lineId?: string) => {
      setMachines((prev) =>
        prev.map((m) =>
          machineIds.includes(m.id)
            ? {
                ...m,
                status: "In Use" as const,
                currentJobId: jobId,
                currentLineId: lineId,
              }
            : m,
        ),
      );
    },
    [],
  );

  const freeMachines = useCallback((machineIds: string[]) => {
    setMachines((prev) =>
      prev.map((m) =>
        machineIds.includes(m.id)
          ? {
              ...m,
              status: "Available" as const,
              currentJobId: undefined,
              currentLineId: undefined,
            }
          : m,
      ),
    );
  }, []);

  /**
   * Resolves form values into assignment info.
   * - existing-line: returns lineId
   * - machine: returns assignedMachineIds directly (NO fake line)
   * - custom-line: creates new line, returns lineId
   */
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
        // Direct machine assignment — no line created
        return {
          assignmentType: type,
          assignedMachineIds: values.machineIds,
        };
      }

      if (
        type === "custom-line" &&
        values.customLineName &&
        values.customMachineIds?.length
      ) {
        const lineId = `LINE-C-${Date.now().toString(36).toUpperCase()}`;
        const newLine: ProductionLine = {
          key: Date.now().toString(),
          id: lineId,
          name: values.customLineName,
          isCustom: true,
          machineIds: values.customMachineIds,
          status: "Idle",
        };
        setLines((prev) => [...prev, newLine]);
        return { assignmentType: type, lineId };
      }

      return { assignmentType: type };
    },
    [],
  );

  // --- Modal Helpers ---

  const openStartJobModal = useCallback(() => {
    setModal({ type: "startJob" });
    startJobForm.resetFields();
  }, [startJobForm]);

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
  }, [startJobForm, acceptOrderForm]);

  // --- Handlers ---

  const handleCreateJob = useCallback(
    (values: StartJobFormValues) => {
      const assignment = resolveAssignment(values.assignmentType, values);
      const jobId = `JOB-${Date.now().toString(36).toUpperCase()}`;

      const newJob: ProductionJob = {
        key: Date.now().toString(),
        id: jobId,
        productName: values.productName,
        assignmentType: assignment.assignmentType,
        lineId: assignment.lineId,
        assignedMachineIds: assignment.assignedMachineIds,
        status: "Scheduled",
        targetQty: values.targetQty,
        actualQty: 0,
        startTime: "-",
        currentStageIndex: 0,
        stages: ["Prep", "Processing", "QC", "Output"],
        defects: 0,
        estimatedTimeRemaining: "TBD",
      };

      setJobs((prev) => [newJob, ...prev]);
      closeModal();
      message.success("New production job scheduled.");
    },
    [resolveAssignment, closeModal],
  );

  const handleAcceptOrder = useCallback(
    (values: AcceptOrderFormValues) => {
      if (modal.type !== "acceptOrder") return;
      const { order } = modal;

      const assignment = resolveAssignment(values.assignmentType, values);
      const jobId = `JOB-${order.orderId}`;

      const newJob: ProductionJob = {
        key: Date.now().toString(),
        id: jobId,
        productName: order.product,
        assignmentType: assignment.assignmentType,
        lineId: assignment.lineId,
        assignedMachineIds: assignment.assignedMachineIds,
        status: "Scheduled",
        targetQty: order.quantity,
        actualQty: 0,
        startTime: "-",
        currentStageIndex: 0,
        stages: ["Prep", "Processing", "QC", "Output"],
        defects: 0,
        estimatedTimeRemaining: "TBD",
      };

      setJobs((prev) => [newJob, ...prev]);
      setPendingOrders((prev) => prev.filter((o) => o.key !== order.key));
      closeModal();
      message.success(`Order ${order.orderId} accepted into production.`);
    },
    [modal, resolveAssignment, closeModal],
  );

  /**
   * Transitions a Scheduled job → Running.
   * Marks assigned machines as busy, updates line status.
   */
  const handleRunJob = useCallback(
    (key: string) => {
      const job = jobs.find((j) => j.key === key);
      if (!job || job.status !== "Scheduled") return;

      const now = dayjs().format("hh:mm A");

      // Mark job as running
      setJobs((prev) =>
        prev.map((j) =>
          j.key === key ? { ...j, status: "Running" as const, startTime: now } : j,
        ),
      );

      // Activate machines
      if (job.assignmentType === "machine" && job.assignedMachineIds?.length) {
        markMachinesBusy(job.assignedMachineIds, job.id);
      }

      if (job.lineId) {
        // Activate machines on the line
        const line = lines.find((l) => l.id === job.lineId);
        if (line) {
          markMachinesBusy(line.machineIds, job.id, line.id);
          // Set line as Active
          setLines((prev) =>
            prev.map((l) =>
              l.id === job.lineId
                ? { ...l, status: "Active" as const, activeJobId: job.id }
                : l,
            ),
          );
        }
      }

      message.success(`Job ${job.id} is now running.`);
    },
    [jobs, lines, markMachinesBusy],
  );

  const handleCancelJob = useCallback(
    (key: string) => {
      const job = jobs.find((j) => j.key === key);
      if (!job) return;

      // Free machines if they were assigned
      if (job.assignedMachineIds?.length) {
        freeMachines(job.assignedMachineIds);
      }
      if (job.lineId) {
        const line = lines.find((l) => l.id === job.lineId);
        if (line) {
          freeMachines(line.machineIds);
          setLines((prev) =>
            prev.map((l) =>
              l.id === job.lineId
                ? { ...l, status: "Idle" as const, activeJobId: undefined }
                : l,
            ),
          );
        }
      }

      setJobs((prev) => prev.filter((j) => j.key !== key));
      message.info("Job cancelled.");
    },
    [jobs, lines, freeMachines],
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

  /**
   * STOP ALL — halts every running job, every active machine, every active line.
   */
  const handleStopAll = useCallback(() => {
    setJobs((prev) =>
      prev.map((j) =>
        j.status === "Running" ? { ...j, status: "Paused" as const } : j,
      ),
    );
    setMachines((prev) =>
      prev.map((m) =>
        m.status === "In Use" ? { ...m, status: "Error" as const } : m,
      ),
    );
    setLines((prev) =>
      prev.map((l) =>
        l.status === "Active" ? { ...l, status: "Maintenance" as const } : l,
      ),
    );
    message.error("EMERGENCY STOP: All machines and jobs halted.");
  }, []);

  /**
   * STOP JOB — halts a single running job and its assigned machines.
   */
  const handleStopJob = useCallback(
    (key: string) => {
      const job = jobs.find((j) => j.key === key);
      if (!job) return;

      // Pause the job
      setJobs((prev) =>
        prev.map((j) =>
          j.key === key ? { ...j, status: "Paused" as const } : j,
        ),
      );

      // Collect all machine IDs to halt
      const machineIdsToHalt: string[] = [];

      if (job.assignedMachineIds?.length) {
        machineIdsToHalt.push(...job.assignedMachineIds);
      }
      if (job.lineId) {
        const line = lines.find((l) => l.id === job.lineId);
        if (line) {
          machineIdsToHalt.push(...line.machineIds);
          setLines((prev) =>
            prev.map((l) =>
              l.id === job.lineId
                ? { ...l, status: "Maintenance" as const }
                : l,
            ),
          );
        }
      }

      if (machineIdsToHalt.length > 0) {
        setMachines((prev) =>
          prev.map((m) =>
            machineIdsToHalt.includes(m.id)
              ? { ...m, status: "Error" as const }
              : m,
          ),
        );
      }

      message.error(`EMERGENCY STOP: Job ${job.id} halted.`);
    },
    [jobs, lines],
  );

  return {
    machines,
    lines,
    jobs,
    pendingOrders,
    availableMachines,
    stats,

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
  };
};
