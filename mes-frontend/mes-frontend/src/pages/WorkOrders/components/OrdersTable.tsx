import React, { useMemo } from "react";
import {
  Table, Card, Tag, Button, Space, Popconfirm, Tooltip, Progress, Typography,
} from "antd";
import type { TableProps } from "antd";
import { EditOutlined, DeleteOutlined } from "@ant-design/icons";
import type { WorkOrder, Priority, OrderStatus, LineInfo, MachineInfo } from "../types";
import { STATUS_CONFIG, PRIORITY_COLOR, MACHINE_TYPE_COLOR } from "../constants";

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Normal: 1, Low: 2 };
const STATUS_RANK: Record<OrderStatus, number> = {
  "In Progress": 0,
  Pending: 1,
  Delayed: 2,
  Completed: 3,
};

const { Text } = Typography;

interface OrdersTableProps {
  orders: WorkOrder[];
  lines: LineInfo[];
  machines: MachineInfo[];
  onDelete: (key: string) => void;
}

const OrdersTable: React.FC<OrdersTableProps> = ({
  orders,
  lines,
  machines,
  onDelete,
}) => {
  const lineMap = useMemo(
    () => new Map(lines.map((l) => [l.id, l.name])),
    [lines],
  );
  const machineMap = useMemo(
    () => new Map(machines.map((m) => [m.id, m])),
    [machines],
  );

  const columns: TableProps<WorkOrder>["columns"] = useMemo(
    () => [
      {
        title: "Order ID",
        dataIndex: "id",
        key: "id",
        sorter: (a, b) => a.id.localeCompare(b.id),
        render: (text: string) => <Text strong>{text}</Text>,
      },
      {
        title: "Product",
        dataIndex: "product",
        key: "product",
        sorter: (a, b) => a.product.localeCompare(b.product),
      },
      {
        title: "Priority",
        dataIndex: "priority",
        key: "priority",
        sorter: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
        render: (priority: WorkOrder["priority"]) => (
          <Tag color={PRIORITY_COLOR[priority]}>{priority.toUpperCase()}</Tag>
        ),
      },
      {
        title: "Assignment",
        key: "assignment",
        render: (_: unknown, record: WorkOrder) => {
          // Direct machine assignment
          if (
            record.assignmentType === "machine" &&
            record.assignedMachineIds?.length
          ) {
            return (
              <Space wrap size={4}>
                {record.assignedMachineIds.map((id) => {
                  const m = machineMap.get(id);
                  return (
                    <Tooltip key={id} title={m?.name}>
                      <Tag color={m ? MACHINE_TYPE_COLOR[m.type] : undefined}>
                        {id}
                      </Tag>
                    </Tooltip>
                  );
                })}
              </Space>
            );
          }

          // Line assignment (existing or custom)
          if (record.assignedLine) {
            const name = lineMap.get(record.assignedLine);
            const isCustom = record.assignmentType === "custom-line";
            return (
              <Space size={4}>
                <Tag color="geekblue">
                  {name
                    ? `${record.assignedLine} — ${name}`
                    : record.assignedLine}
                </Tag>
                {isCustom && (
                  <Tag color="purple" style={{ fontSize: 10 }}>
                    CUSTOM
                  </Tag>
                )}
              </Space>
            );
          }

          return <Text type="secondary">Unassigned</Text>;
        },
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        sorter: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status],
        render: (status: WorkOrder["status"]) => {
          const config = STATUS_CONFIG[status];
          return (
            <Tag icon={config.icon} color={config.color}>
              {status}
            </Tag>
          );
        },
      },
      {
        title: "Progress",
        key: "progress",
        width: 180,
        sorter: (a, b) => {
          const ap = a.quantity > 0 ? a.completed / a.quantity : 0;
          const bp = b.quantity > 0 ? b.completed / b.quantity : 0;
          return ap - bp;
        },
        render: (_: unknown, record: WorkOrder) => {
          const percent =
            record.quantity > 0
              ? Math.round((record.completed / record.quantity) * 100)
              : 0;
          return (
            <Tooltip title={`${record.completed} / ${record.quantity} units`}>
              <Progress
                percent={percent}
                size="small"
                status={record.status === "Delayed" ? "exception" : "active"}
              />
            </Tooltip>
          );
        },
      },
      {
        title: "Due Date",
        dataIndex: "dueDate",
        key: "dueDate",
        sorter: (a, b) => {
          const av = a.dueDate ? Date.parse(a.dueDate) : Infinity;
          const bv = b.dueDate ? Date.parse(b.dueDate) : Infinity;
          return av - bv;
        },
      },
      {
        title: "Actions",
        key: "actions",
        render: (_: unknown, record: WorkOrder) => (
          <Space>
            <Button type="text" icon={<EditOutlined />} size="small" />
            <Popconfirm
              title="Delete this order?"
              onConfirm={() => onDelete(record.key)}
            >
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                size="small"
              />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [onDelete, lineMap, machineMap],
  );

  return (
    <Card bordered={false}>
      <Table<WorkOrder>
        columns={columns}
        dataSource={orders}
        pagination={{ pageSize: 10 }}
        rowKey="key"
      />
    </Card>
  );
};

export default React.memo(OrdersTable);
