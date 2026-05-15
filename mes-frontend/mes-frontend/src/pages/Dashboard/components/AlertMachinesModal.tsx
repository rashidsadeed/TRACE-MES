import React from "react";
import { Modal, Table, Tag, Button, Empty, Typography } from "antd";
import { AlertOutlined, EyeOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { MachineLog } from "../types";
import { MACHINE_STATUS_COLOR } from "../constants";

const { Text } = Typography;

interface AlertMachinesModalProps {
  open: boolean;
  machines: MachineLog[];
  onClose: () => void;
  onViewDetail: (machineId: string) => void;
}

const AlertMachinesModal: React.FC<AlertMachinesModalProps> = ({
  open,
  machines,
  onClose,
  onViewDetail,
}) => {
  const columns: ColumnsType<MachineLog> = [
    {
      title: "Machine ID",
      dataIndex: "machine",
      key: "machine",
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: MachineLog["status"]) => (
        <Tag color={MACHINE_STATUS_COLOR[status]}>{status.toUpperCase()}</Tag>
      ),
    },
    {
      title: "Temperature",
      dataIndex: "temp",
      key: "temp",
      render: (temp: number) => `${temp}°C`,
    },
    {
      title: "Last Maintenance",
      dataIndex: "lastMaint",
      key: "lastMaint",
    },
    {
      title: "Action",
      key: "action",
      width: 110,
      render: (_: unknown, record: MachineLog) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            onClose();
            onViewDetail(record.key);
          }}
        >
          Details
        </Button>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      title={
        <span>
          <AlertOutlined style={{ color: "#ff4d4f", marginRight: 8 }} />
          Machines Requiring Attention ({machines.length})
        </span>
      }
    >
      {machines.length === 0 ? (
        <Empty
          description="All machines are operating normally"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <>
          <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
            The following machines are in an Error or Maintenance state. Click
            "Details" to inspect telemetry and reset alarms.
          </Text>
          <Table<MachineLog>
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

export default React.memo(AlertMachinesModal);
