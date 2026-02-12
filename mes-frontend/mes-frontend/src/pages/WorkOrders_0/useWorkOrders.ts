import { useState, useMemo, useCallback } from "react";
import { Form, message } from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";

// ========================
// Types
// ========================

export type Priority = "High" | "Normal" | "Low";
export type OrderStatus = "Pending" | "In Progress" | "Completed" | "Delayed";

export interface WorkOrder {
  key: string;
  id: string;
  product: string;
  quantity: number;
  completed: number;
  priority: Priority;
  status: OrderStatus;
  dueDate: string;
  assignedLine: string;
}

export interface OrderRequest {
  key: string;
  client: string;
  product: string;
  quantity: number;
  requestedDate: string;
}

export interface OrderFormValues {
  product: string;
  quantity: number;
  priority: Priority;
  dueDate: Dayjs;
  assignedLine: string;
}

// ========================
// Constants
// ========================

export const PRIORITY_OPTIONS: Priority[] = ["High", "Normal", "Low"];
export const LINE_OPTIONS = ["LINE-01", "LINE-02", "LINE-03"];

export const PRIORITY_COLOR: Record<Priority, string> = {
  High: "red",
  Normal: "blue",
  Low: "green",
};

// ========================
// Mock Data
// ========================

const INITIAL_ORDERS: WorkOrder[] = [
  {
    key: "1",
    id: "WO-2024-001",
    product: "Industrial Pump X500",
    quantity: 500,
    completed: 320,
    priority: "High",
    status: "In Progress",
    dueDate: dayjs().add(1, "day").format("YYYY-MM-DD"),
    assignedLine: "LINE-01",
  },
  {
    key: "2",
    id: "WO-2024-002",
    product: "Circuit Board V2",
    quantity: 2000,
    completed: 0,
    priority: "Normal",
    status: "Pending",
    dueDate: "2024-03-20",
    assignedLine: "LINE-02",
  },
];

const INITIAL_REQUESTS: OrderRequest[] = [
  {
    key: "101",
    client: "Tesla Inc.",
    product: "Battery Casing Model Y",
    quantity: 5000,
    requestedDate: "2024-04-01",
  },
  {
    key: "102",
    client: "Samsung",
    product: 'OLED Screen 55"',
    quantity: 200,
    requestedDate: "2024-03-25",
  },
];

// ========================
// Helper
// ========================

const buildWorkOrder = (
  params: Omit<OrderFormValues, "dueDate"> & {
    id?: string;
    dueDate: Dayjs | null;
  },
): WorkOrder => ({
  key: Date.now().toString(),
  id: params.id ?? `WO-${Date.now().toString(36).toUpperCase()}`,
  product: params.product,
  quantity: params.quantity,
  completed: 0,
  priority: params.priority,
  status: "Pending",
  dueDate: params.dueDate ? params.dueDate.format("YYYY-MM-DD") : "TBD",
  assignedLine: params.assignedLine,
});

// ========================
// Hook
// ========================

export const useWorkOrders = () => {
  const [orders, setOrders] = useState<WorkOrder[]>(INITIAL_ORDERS);
  const [requests, setRequests] = useState<OrderRequest[]>(INITIAL_REQUESTS);

  // Modal — tek state ile yönet
  const [modal, setModal] = useState<
    | { type: "closed" }
    | { type: "create" }
    | { type: "requestList" }
    | { type: "accept"; request: OrderRequest }
  >({ type: "closed" });

  // Conflict
  const [dateConflicts, setDateConflicts] = useState<WorkOrder[]>([]);
  const [conflictAcknowledged, setConflictAcknowledged] = useState(false);

  // Forms
  const [createForm] = Form.useForm<OrderFormValues>();
  const [acceptForm] = Form.useForm<OrderFormValues>();

  // --- Derived (memoized) ---

  const stats = useMemo(() => {
    let active = 0;
    let delayed = 0;
    for (const o of orders) {
      if (o.status === "In Progress") active++;
      if (o.status === "Delayed") delayed++;
    }
    return { total: orders.length, active, delayed };
  }, [orders]);

  const upcomingDeadlines = useMemo(() => {
    const today = dayjs();
    const limit = dayjs().add(3, "day");
    return orders.filter((o) => {
      if (o.status === "Completed") return false;
      const due = dayjs(o.dueDate);
      return due.isAfter(today) && due.isBefore(limit);
    });
  }, [orders]);

  // --- Conflict helpers ---

  const checkDateConflicts = useCallback(
    (date: Dayjs | null) => {
      setConflictAcknowledged(false);
      if (!date) {
        setDateConflicts([]);
        return;
      }
      const dateStr = date.format("YYYY-MM-DD");
      setDateConflicts(
        orders.filter((o) => o.dueDate === dateStr && o.status !== "Completed"),
      );
    },
    [orders],
  );

  const resetConflicts = useCallback(() => {
    setDateConflicts([]);
    setConflictAcknowledged(false);
  }, []);

  const isSubmitBlocked = dateConflicts.length > 0 && !conflictAcknowledged;

  // --- Modal helpers ---

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
      // Pre-check conflicts
      const dateStr = dayjs(request.requestedDate).format("YYYY-MM-DD");
      setDateConflicts(
        orders.filter((o) => o.dueDate === dateStr && o.status !== "Completed"),
      );
    },
    [acceptForm, orders, resetConflicts],
  );

  const closeModal = useCallback(() => {
    setModal({ type: "closed" });
    createForm.resetFields();
    acceptForm.resetFields();
    resetConflicts();
  }, [createForm, acceptForm, resetConflicts]);

  // --- CRUD ---

  const handleCreateOrder = useCallback(
    (values: OrderFormValues) => {
      setOrders((prev) => [buildWorkOrder(values), ...prev]);
      closeModal();
      message.success("Work Order created.");
    },
    [closeModal],
  );

  const handleAcceptRequest = useCallback(
    (values: OrderFormValues) => {
      if (modal.type !== "accept") return;
      const { request } = modal;

      const newOrder = buildWorkOrder({
        ...values,
        id: `WO-REQ-${request.key}`,
        product: request.product,
        quantity: request.quantity,
      });

      setOrders((prev) => [newOrder, ...prev]);
      setRequests((prev) => prev.filter((r) => r.key !== request.key));
      closeModal();
      message.success(`Request from ${request.client} accepted.`);
    },
    [modal, closeModal],
  );

  const handleDeleteOrder = useCallback((key: string) => {
    setOrders((prev) => prev.filter((item) => item.key !== key));
    message.success("Work Order deleted.");
  }, []);

  const handleDeclineRequest = useCallback((key: string) => {
    setRequests((prev) => prev.filter((r) => r.key !== key));
    message.info("Request declined.");
  }, []);

  return {
    orders,
    requests,
    stats,
    upcomingDeadlines,
    modal,
    openCreateModal,
    openRequestList,
    openAcceptModal,
    closeModal,
    dateConflicts,
    conflictAcknowledged,
    setConflictAcknowledged,
    checkDateConflicts,
    isSubmitBlocked,
    createForm,
    acceptForm,
    handleCreateOrder,
    handleAcceptRequest,
    handleDeleteOrder,
    handleDeclineRequest,
  };
};
