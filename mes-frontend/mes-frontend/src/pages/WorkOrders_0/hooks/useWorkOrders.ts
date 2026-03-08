import { useState, useMemo, useCallback } from "react";
import { Form, message } from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import type {
  WorkOrder,
  OrderRequest,
  ModalState,
  CreateOrderFormValues,
  AcceptOrderFormValues,
} from "../types";
import {
  INITIAL_WORK_ORDERS,
  INITIAL_ORDER_REQUESTS,
} from "../constants";
import {
  buildWorkOrder,
  generateOrderId,
  computeStats,
  findUpcomingDeadlines,
  findDateConflicts,
} from "../utils";

export const useWorkOrders = () => {
  // --- Core Data ---
  const [orders, setOrders] = useState<WorkOrder[]>(INITIAL_WORK_ORDERS);
  const [requests, setRequests] = useState<OrderRequest[]>(INITIAL_ORDER_REQUESTS);

  // --- Modal State (single source of truth) ---
  const [modal, setModal] = useState<ModalState>({ type: "closed" });

  // --- Conflict State ---
  const [dateConflicts, setDateConflicts] = useState<WorkOrder[]>([]);
  const [conflictAcknowledged, setConflictAcknowledged] = useState(false);

  // --- Forms ---
  const [createForm] = Form.useForm<CreateOrderFormValues>();
  const [acceptForm] = Form.useForm<AcceptOrderFormValues>();

  // --- Derived Data (memoized) ---
  const stats = useMemo(() => computeStats(orders), [orders]);
  const upcomingDeadlines = useMemo(() => findUpcomingDeadlines(orders), [orders]);

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
      const conflicts = findDateConflicts(orders, dayjs(request.requestedDate));
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
      const newOrder = buildWorkOrder({
        product: values.product,
        quantity: values.quantity,
        priority: values.priority,
        dueDate: values.dueDate,
        assignedLine: values.assignedLine,
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

      const newOrder = buildWorkOrder({
        id: `WO-REQ-${request.key}`,
        product: request.product,
        quantity: request.quantity,
        priority: values.priority,
        dueDate: values.dueDate,
        assignedLine: values.assignedLine,
      });

      setOrders((prev) => [newOrder, ...prev]);
      setRequests((prev) => prev.filter((r) => r.key !== request.key));
      closeModal();
      message.success(`Request from ${request.client} accepted into production.`);
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

    // Modal
    modal,
    openCreateModal,
    openRequestList,
    openAcceptModal,
    closeModal,

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
