import React, { useState } from "react";
import { Alert, Modal, Table, Tag, Typography } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { WorkOrder } from "../types";
import { styles } from "../styles";

const { Text } = Typography;

const PRIORITY_COLOR: Record<string, string> = {
  High: "red",
  Normal: "blue",
  Low: "default",
};

const STATUS_COLOR: Record<string, string> = {
  Pending: "gold",
  "In Progress": "processing",
  Completed: "success",
  Delayed: "error",
};

interface DeadlineAlertProps {
  deadlines: WorkOrder[];
}

const DeadlineAlert: React.FC<DeadlineAlertProps> = React.memo(
  ({ deadlines }) => {
    const [modalOpen, setModalOpen] = useState(false);

    if (deadlines.length === 0) return null;

    const columns: ColumnsType<WorkOrder> = [
      {
        title: "Order ID",
        dataIndex: "id",
        key: "id",
        render: (text: string) => <strong>{text}</strong>,
      },
      {
        title: "Product",
        dataIndex: "product",
        key: "product",
      },
      {
        title: "Quantity",
        dataIndex: "quantity",
        key: "quantity",
        render: (qty: number, record) => `${record.completed}/${qty}`,
      },
      {
        title: "Priority",
        dataIndex: "priority",
        key: "priority",
        render: (p: string) => <Tag color={PRIORITY_COLOR[p]}>{p}</Tag>,
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        render: (s: string) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
      },
      {
        title: "Due Date",
        dataIndex: "dueDate",
        key: "dueDate",
      },
      {
        title: "Assigned To",
        key: "assignment",
        render: (_: unknown, record: WorkOrder) => {
          if (record.assignedLine) {
            return <Tag color="geekblue">{record.assignedLine}</Tag>;
          }
          if (record.assignedMachineIds?.length) {
            return record.assignedMachineIds.map((id) => (
              <Tag key={id}>{id}</Tag>
            ));
          }
          return <Text type="secondary">Unassigned</Text>;
        },
      },
    ];

    return (
      <>
        <div
          style={{ ...styles.alertContainer, cursor: "pointer" }}
          onClick={() => setModalOpen(true)}
        >
          <Alert
            message={
              <span style={styles.alertText}>
                Production Alert: {deadlines.length} order(s) due within 72
                hours. Click to view details.
              </span>
            }
            type="warning"
            showIcon
            style={styles.alertBorder}
          />
        </div>

        <Modal
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          footer={null}
          width={900}
          title={
            <span>
              <ClockCircleOutlined
                style={{ color: "#faad14", marginRight: 8 }}
              />
              Orders Due Within 72 Hours ({deadlines.length})
            </span>
          }
        >
          <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
            These orders are approaching their deadlines. Review priorities and
            machine assignments to ensure on-time delivery.
          </Text>
          <Table<WorkOrder>
            columns={columns}
            dataSource={deadlines}
            rowKey="key"
            pagination={false}
            size="middle"
          />
        </Modal>
      </>
    );
  },
);

DeadlineAlert.displayName = "DeadlineAlert";

export default DeadlineAlert;
