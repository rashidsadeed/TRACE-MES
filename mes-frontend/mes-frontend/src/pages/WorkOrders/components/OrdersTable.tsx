import React, { useMemo } from "react";
import {
  Table,
  Card,
  Tag,
  Button,
  Space,
  Popconfirm,
  Tooltip,
  Progress,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import { EditOutlined, DeleteOutlined } from "@ant-design/icons";
import type { WorkOrder } from "../types";
import { STATUS_CONFIG, PRIORITY_COLOR } from "../constants";

const { Text } = Typography;

interface OrdersTableProps {
  orders: WorkOrder[];
  onDelete: (key: string) => void;
}

const OrdersTable: React.FC<OrdersTableProps> = ({ orders, onDelete }) => {
  const columns: TableProps<WorkOrder>["columns"] = useMemo(
    () => [
      {
        title: "Order ID",
        dataIndex: "id",
        key: "id",
        render: (text: string) => <Text strong>{text}</Text>,
      },
      {
        title: "Product",
        dataIndex: "product",
        key: "product",
      },
      {
        title: "Priority",
        dataIndex: "priority",
        key: "priority",
        render: (priority: WorkOrder["priority"]) => (
          <Tag color={PRIORITY_COLOR[priority]}>{priority.toUpperCase()}</Tag>
        ),
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
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
        width: 200,
        render: (_: unknown, record: WorkOrder) => {
          const percent = record.quantity > 0
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
    [onDelete],
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
