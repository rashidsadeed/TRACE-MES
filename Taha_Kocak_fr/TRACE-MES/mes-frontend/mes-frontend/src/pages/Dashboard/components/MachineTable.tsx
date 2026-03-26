import React, { useMemo } from "react";
import { Table, Card, Tag, Progress, Button } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { MachineLog } from "../types";
import { MACHINE_STATUS_COLOR, TEMP_DANGER_THRESHOLD } from "../constants";
import { styles, getTempColor } from "../styles";

interface MachineTableProps {
  data: MachineLog[];
  onViewDetail: (machineId: string) => void;
}

const MachineTable: React.FC<MachineTableProps> = React.memo(({ data, onViewDetail }) => {
  const columns: ColumnsType<MachineLog> = useMemo(
    () => [
      {
        title: "Machine ID",
        dataIndex: "machine",
        key: "machine",
        render: (text: string) => <span style={styles.machineName}>{text}</span>,
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        render: (status: MachineLog["status"]) => (
          <Tag color={MACHINE_STATUS_COLOR[status]}>
            {status.toUpperCase()}
          </Tag>
        ),
      },
      {
        title: "Daily Output",
        dataIndex: "output",
        key: "output",
        render: (val: number) => `${val.toLocaleString()} units`,
      },
      {
        title: "Temperature (°C)",
        dataIndex: "temp",
        key: "temp",
        render: (temp: number) => (
          <div style={styles.tempBar}>
            <Progress
              percent={temp}
              steps={5}
              size="small"
              strokeColor={getTempColor(temp, TEMP_DANGER_THRESHOLD)}
              showInfo={false}
            />
            <span style={styles.tempLabel}>{temp}°C</span>
          </div>
        ),
      },
      {
        title: "Last Maintenance",
        dataIndex: "lastMaint",
        key: "lastMaint",
      },
      {
        title: "Action",
        key: "action",
        width: 100,
        render: (_: unknown, record: MachineLog) => (
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => onViewDetail(record.key)}
          >
            Details
          </Button>
        ),
      },
    ],
    [onViewDetail],
  );

  return (
    <Card
      title="Recent Machine Logs"
      bordered={false}
      extra={<a href="#">View All History</a>}
    >
      <Table<MachineLog>
        columns={columns}
        dataSource={data}
        pagination={{ pageSize: 5 }}
        rowKey="key"
      />
    </Card>
  );
});

MachineTable.displayName = "MachineTable";

export default MachineTable;
