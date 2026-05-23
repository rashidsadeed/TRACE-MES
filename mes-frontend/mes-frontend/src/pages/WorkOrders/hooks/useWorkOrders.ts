import { useState, useEffect, useMemo, useCallback } from "react";
import { Form, message } from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import type {
  WorkOrder,
  OrderRequest,
  ModalState,
  CreateOrderFormValues,
  AcceptOrderFormValues,
  AssignmentType,
  LineInfo,
  MachineInfo,
  Priority,
} from "../types";
import * as workOrderService from "../../../services/workOrderService";
import type {
  BackendPart,
  CreateWorkOrderPayload,
} from "../../../services/workOrderService";
import {
  computeStats,
  findUpcomingDeadlines,
  findDateConflicts,
  generateOrderId,
} from "../utils";

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

export const useWorkOrders = () => {
  // --- Core Data ---
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [requests, setRequests] = useState<OrderRequest[]>([]);
  const [lines, setLines] = useState<LineInfo[]>([]);
  const [allMachines, setAllMachines] = useState<MachineInfo[]>([]);
  const [parts, setParts] = useState<BackendPart[]>([]);

  // --- Fetch initial data from service ---
  const fetchData = useCallback(async () => {
    const [wo, req, ln, mc, pt] = await Promise.all([
      workOrderService.getWorkOrders(),
      workOrderService.getOrderRequests(),
      workOrderService.getLines(),
      workOrderService.getMachines(),
      workOrderService.getParts(),
    ]);
    setOrders(wo as WorkOrder[]);
    setRequests(req as OrderRequest[]);
    setLines(ln as LineInfo[]);
    setAllMachines(mc as MachineInfo[]);
    setParts(pt);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Modal State (single source of truth) ---
  const [modal, setModal] = useState<ModalState>({ type: "closed" });

  // --- Conflict State ---
  const [dateConflicts, setDateConflicts] = useState<WorkOrder[]>([]);
  const [conflictAcknowledged, setConflictAcknowledged] = useState(false);

  // --- Forms ---
  const [createForm] = Form.useForm<CreateOrderFormValues>();
  const [acceptForm] = Form.useForm<AcceptOrderFormValues>();

  // Watch assignmentType from both forms
  const createAssignmentType = Form.useWatch("assignmentType", createForm) as
    | AssignmentType
    | undefined;
  const acceptAssignmentType = Form.useWatch("assignmentType", acceptForm) as
    | AssignmentType
    | undefined;

  // --- Available Machines (not in use/maintenance) ---
  const availableMachines = useMemo(
    () => allMachines.filter((m) => m.status === "Available"),
    [allMachines],
  );

  // --- Derived Data (memoized) ---
  const stats = useMemo(() => computeStats(orders), [orders]);
  const upcomingDeadlines = useMemo(
    () => findUpcomingDeadlines(orders),
    [orders],
  );

  // --- Conflict Logic ---
  const checkDateConflicts = useCallback(
    (date: Dayjs | null) => {
      setConflictAcknowledged(false);
      setDateConflicts(findDateConflicts(orders, date));
    },
    [orders],
  );

  const resetConflicts = useCallback(() => {
    setDateConflicts([]);
    setConflictAcknowledged(false);
  }, []);

  const isSubmitBlocked = dateConflicts.length > 0 && !conflictAcknowledged;

  // --- Modal Helpers ---
  const openCreateModal = useCallback(() => {
    setModal({ type: "create" });
    resetConflicts();
  }, [resetConflicts]);

  const openRequestList = useCallback(() => {
    setModal({ type: "requestList" });
  }, []);

  const openAcceptModal = useCallback(
    (request: OrderRequest) => {
      setModal({ type: "accept", request });
      resetConflicts();

      acceptForm.setFieldsValue({
        product: request.product,
        quantity: request.quantity,
        dueDate: dayjs(request.requestedDate),
        priority: "Normal",
      });

      // Check conflicts for the pre-filled date
      const conflicts = findDateConflicts(
        orders,
        dayjs(request.requestedDate),
      );
      setDateConflicts(conflicts);
    },
    [acceptForm, orders, resetConflicts],
  );

  const closeModal = useCallback(() => {
    setModal({ type: "closed" });
    createForm.resetFields();
    acceptForm.resetFields();
    resetConflicts();
  }, [createForm, acceptForm, resetConflicts]);

  // --- Payload builder (product name → part UUID) ---
  const buildCreatePayload = useCallback(
    (
      values: { product: string; quantity: number; priority: Priority },
    ): CreateWorkOrderPayload | null => {
      const part = findPartByProductName(parts, values.product);
      if (!part) {
        message.error(
          `Product "${values.product}" not found in parts catalog. Please pick an existing product name (e.g. ${parts.slice(0, 3).map((p) => p.name).join(", ") || "—"}).`,
          5,
        );
        return null;
      }
      return {
        code: generateOrderId(),
        description: values.product,
        part: part.id,
        target_qty: values.quantity,
        priority: PRIORITY_TO_NUMBER[values.priority],
      };
    },
    [parts],
  );

  // --- CRUD Handlers (now persist to backend) ---
  const handleCreateOrder = useCallback(
    async (values: CreateOrderFormValues) => {
      const payload = buildCreatePayload(values);
      if (!payload) return;

      try {
        await workOrderService.createWorkOrder(payload);
        await fetchData();
        closeModal();
        message.success("Work Order created successfully.");
      } catch (err) {
        console.error("createWorkOrder failed", err);
        message.error("Failed to create work order. Check server logs.");
      }
    },
    [buildCreatePayload, closeModal, fetchData],
  );

  const handleAcceptRequest = useCallback(
    async (values: AcceptOrderFormValues) => {
      if (modal.type !== "accept") return;
      const { request } = modal;

      const payload = buildCreatePayload({
        product: request.product,
        quantity: request.quantity,
        priority: values.priority,
      });
      if (!payload) return;

      try {
        await workOrderService.acceptRequest(request.key, payload);
        await fetchData();
        closeModal();
        message.success(
          `Request from ${request.client} accepted into production.`,
        );
      } catch (err) {
        console.error("acceptRequest failed", err);
        message.error("Failed to accept request. Check server logs.");
      }
    },
    [modal, buildCreatePayload, closeModal, fetchData],
  );

  const handleDeleteOrder = useCallback(
    async (key: string) => {
      try {
        await workOrderService.deleteWorkOrder(key);
        await fetchData();
        message.success("Work Order cancelled.");
      } catch (err) {
        console.error("deleteWorkOrder failed", err);
        message.error("Failed to cancel work order.");
      }
    },
    [fetchData],
  );

  const handleDeclineRequest = useCallback(
    async (key: string, reason?: string) => {
      try {
        await workOrderService.declineRequest(key, reason);
        await fetchData();
        message.info("Request declined.");
      } catch (err) {
        console.error("declineRequest failed", err);
        message.error("Failed to decline request.");
      }
    },
    [fetchData],
  );

  return {
    // Data
    orders,
    requests,
    stats,
    upcomingDeadlines,

    // Lines & Machines
    lines,
    allMachines,
    availableMachines,

    // Modal
    modal,
    openCreateModal,
    openRequestList,
    openAcceptModal,
    closeModal,

    // Assignment type watchers
    createAssignmentType,
    acceptAssignmentType,

    // Conflicts
    dateConflicts,
    conflictAcknowledged,
    setConflictAcknowledged,
    checkDateConflicts,
    isSubmitBlocked,

    // Forms
    createForm,
    acceptForm,

    // Handlers
    handleCreateOrder,
    handleAcceptRequest,
    handleDeleteOrder,
    handleDeclineRequest,
  };
};
