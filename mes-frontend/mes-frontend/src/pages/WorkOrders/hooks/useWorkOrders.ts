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
} from "../types";
import * as workOrderService from "../../../services/workOrderService";
import {
  buildWorkOrder,
  resolveAssignment,
  computeStats,
  findUpcomingDeadlines,
  findDateConflicts,
} from "../utils";

export const useWorkOrders = () => {
  // --- Core Data ---
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [requests, setRequests] = useState<OrderRequest[]>([]);
  const [lines, setLines] = useState<LineInfo[]>([]);
  const [allMachines, setAllMachines] = useState<MachineInfo[]>([]);

  // --- Fetch initial data from service ---
  useEffect(() => {
    const fetchData = async () => {
      const [wo, req, ln, mc] = await Promise.all([
        workOrderService.getWorkOrders(),
        workOrderService.getOrderRequests(),
        workOrderService.getLines(),
        workOrderService.getMachines(),
      ]);
      setOrders(wo as WorkOrder[]);
      setRequests(req as OrderRequest[]);
      setLines(ln as LineInfo[]);
      setAllMachines(mc as MachineInfo[]);
    };
    fetchData();
  }, []);

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

  // --- CRUD Handlers ---
  const handleCreateOrder = useCallback(
    (values: CreateOrderFormValues) => {
      const assignment = resolveAssignment({
        assignmentType: values.assignmentType,
        lineId: values.lineId,
        machineIds: values.machineIds,
        customLineName: values.customLineName,
        customMachineIds: values.customMachineIds,
      });

      const newOrder = buildWorkOrder({
        product: values.product,
        quantity: values.quantity,
        priority: values.priority,
        dueDate: values.dueDate,
        ...assignment,
      });

      setOrders((prev) => [newOrder, ...prev]);
      closeModal();
      message.success("Work Order created successfully.");
    },
    [closeModal],
  );

  const handleAcceptRequest = useCallback(
    (values: AcceptOrderFormValues) => {
      if (modal.type !== "accept") return;
      const { request } = modal;

      const assignment = resolveAssignment({
        assignmentType: values.assignmentType,
        lineId: values.lineId,
        machineIds: values.machineIds,
        customLineName: values.customLineName,
        customMachineIds: values.customMachineIds,
      });

      const newOrder = buildWorkOrder({
        id: `WO-REQ-${request.key}`,
        product: request.product,
        quantity: request.quantity,
        priority: values.priority,
        dueDate: values.dueDate,
        ...assignment,
      });

      setOrders((prev) => [newOrder, ...prev]);
      setRequests((prev) => prev.filter((r) => r.key !== request.key));
      closeModal();
      message.success(
        `Request from ${request.client} accepted into production.`,
      );
    },
    [modal, closeModal],
  );

  const handleDeleteOrder = useCallback((key: string) => {
    setOrders((prev) => prev.filter((item) => item.key !== key));
    message.success("Work Order deleted.");
  }, []);

  const handleDeclineRequest = useCallback((key: string) => {
    setRequests((prev) => prev.filter((r) => r.key !== key));
    message.info("Request declined and removed.");
  }, []);

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
