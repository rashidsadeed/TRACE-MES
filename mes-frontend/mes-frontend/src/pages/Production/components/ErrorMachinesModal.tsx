import React from "react";
import { Modal, Table, Tag, Badge, Empty, Typography, Progress, Button } from "antd";
import { AlertOutlined, EyeOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Machine } from "../types";
import { MACHINE_STATUS_CONFIG, MACHINE_TYPE_COLOR } from "../constants";

const { Text } = Typography;

interface ErrorMachinesModalProps {
  open: boolean;
  machines: Machine[];
  onClose: () => void;
  onViewMachine?: (machineId: string) => void;
}

const getTempColor = (temp: number): string => {
  if (temp >= 80) return "#ff4d4f";
  if (temp >= 60) return "#faad14";
  return "#1890ff";
};

const ErrorMachinesModal: React.FC<ErrorMachinesModalProps> = ({
  open,
  machines,
  onClose,
  onViewMachine,
}) => {
  const columns: ColumnsType<Machine> = [
    {
      title: "Machine ID",
      dataIndex: "id",
      key: "id",
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      render: (type: Machine["type"]) => (
        <Tag color={MACHINE_TYPE_COLOR[type]}>{type}</Tag>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: Machine["status"]) => {
        const cfg = MACHINE_STATUS_CONFIG[status];
        return <Badge status={cfg.badge} text={status} />;
      },
    },
    {
      title: "Temperature",
      dataIndex: "temp",
      key: "temp",
      render: (temp: number) => (
        <div style={{ width: 120 }}>
          <Progress
            percent={temp}
            steps={5}
            size="small"
            strokeColor={getTempColor(temp)}
            showInfo={false}
          />
          <span style={{ fontSize: 12, color: "#888" }}>{temp}°C</span>
        </div>
      ),
    },
    {
      title: "Location",
      dataIndex: "location",
      key: "location",
    },
    {
      title: "Last Maintenance",
      dataIndex: "lastMaint",
      key: "lastMaint",
    },
    ...(onViewMachine
      ? [
          {
            title: "Action",
            key: "action",
            render: (_: unknown, record: Machine) => (
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => {
                  onClose();
                  onViewMachine(record.id);
                }}
              >
                Go to Machine
              </Button>
            ),
          } as const,
        ]
      : []),
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={920}
      title={
        <span>
          <AlertOutlined style={{ color: "#ff4d4f", marginRight: 8 }} />
          Machines in Error State ({machines.length})
        </span>
      }
    >
      {machines.length === 0 ? (
        <Empty
          description="No machines are currently in error state"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <>
          <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
            The machines below have halted due to errors. Click "Go to Machine" to
            navigate to the machine in the Machines tab.
          </Text>
          <Table<Machine>
            columns={columns}
            dataSource={machines}
            rowKey="key"
            pagination={false}
            size="middle"
          />
        </>
      )}
    </Modal>
  );
};

export default React.memo(ErrorMachinesModal);
