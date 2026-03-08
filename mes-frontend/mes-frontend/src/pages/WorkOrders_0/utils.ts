import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import type { Priority, WorkOrder, OrderStats } from "./types";
import { DEADLINE_THRESHOLD_DAYS } from "./constants";

/**
 * Generates a unique work order ID.
 */
export const generateOrderId = (prefix = "WO"): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

/**
 * Generates a unique key for React list rendering.
 */
export const generateKey = (): string => Date.now().toString();

/**
 * Builds a new WorkOrder object from common parameters.
 */
export const buildWorkOrder = (params: {
  id?: string;
  product: string;
  quantity: number;
  priority: Priority;
  dueDate: Dayjs | null;
  assignedLine: string;
}): WorkOrder => ({
  key: generateKey(),
  id: params.id ?? generateOrderId(),
  product: params.product,
  quantity: params.quantity,
  completed: 0,
  priority: params.priority,
  status: "Pending",
  dueDate: params.dueDate ? params.dueDate.format("YYYY-MM-DD") : "TBD",
  assignedLine: params.assignedLine,
});

/**
 * Computes order statistics in a single pass.
 */
export const computeStats = (orders: WorkOrder[]): OrderStats => {
  return orders.reduce(
    (acc, order) => {
      acc.total++;
      if (order.status === "In Progress") acc.active++;
      if (order.status === "Delayed") acc.delayed++;
      return acc;
    },
    { total: 0, active: 0, delayed: 0 } as OrderStats,
  );
};

/**
 * Finds orders with upcoming deadlines within the threshold.
 */
export const findUpcomingDeadlines = (orders: WorkOrder[]): WorkOrder[] => {
  const today = dayjs();
  const threshold = dayjs().add(DEADLINE_THRESHOLD_DAYS, "day");

  return orders.filter((order) => {
    if (order.status === "Completed") return false;
    const due = dayjs(order.dueDate);
    return due.isAfter(today) && due.isBefore(threshold);
  });
};

/**
 * Finds active orders scheduled for a specific date (conflict detection).
 */
export const findDateConflicts = (
  orders: WorkOrder[],
  date: Dayjs | null,
): WorkOrder[] => {
  if (!date) return [];
  const dateStr = date.format("YYYY-MM-DD");
  return orders.filter(
    (order) => order.dueDate === dateStr && order.status !== "Completed",
  );
};
