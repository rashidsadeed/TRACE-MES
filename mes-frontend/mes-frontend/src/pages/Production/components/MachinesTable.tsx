import React, { useMemo } from "react";
import { Table, Tag, Progress, Badge } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Machine } from "../types";
import { MACHINE_STATUS_CONFIG, MACHINE_TYPE_COLOR } from "../constants";
import { styles, getTempColor } from "../styles";

interface MachinesTableProps {
  machines: Machine[];
}

const MachinesTable: React.FC<MachinesTableProps> = ({ machines }) => {
  const columns: ColumnsType<Machine> = useMemo(
    () => [
      {
        title: "Machine ID",
        dataIndex: "id",
        key: "id",
        render: (text: string) => (
          <span style={styles.lineBold}>{text}</span>
        ),
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
          const config = MACHINE_STATUS_CONFIG[status];
          return <Badge status={config.badge} text={status} />;
        },
        filters: [
          { text: "Available", value: "Available" },
          { text: "In Use", value: "In Use" },
          { text: "Maintenance", value: "Maintenance" },
          { text: "Error", value: "Error" },
        ],
        onFilter: (value, record) => record.status === value,
      },
      {
        title: "Temperature",
        dataIndex: "temp",
        key: "temp",
        sorter: (a, b) => a.temp - b.temp,
        render: (temp: number) => (
          <div style={styles.tempBar}>
            <Progress
              percent={temp}
              steps={5}
              size="small"
              strokeColor={getTempColor(temp)}
              showInfo={false}
            />
            <span style={styles.tempLabel}>{temp}°C</span>
          </div>
        ),
      },
      {
        title: "Location",
        dataIndex: "location",
        key: "location",
      },
      {
        title: "Assigned Line",
        dataIndex: "currentLineId",
        key: "currentLineId",
        render: (lineId?: string) =>
          lineId ? (
            <Tag color="geekblue">{lineId}</Tag>
          ) : (
            <span style={{ color: "#ccc" }}>—</span>
          ),
      },
      {
        title: "Last Maintenance",
        dataIndex: "lastMaint",
        key: "lastMaint",
      },
    ],
    [],
  );

  return (
    <Table<Machine>
      columns={columns}
      dataSource={machines}
      rowKey="key"
      pagination={{ pageSize: 10 }}
      scroll={{ x: "max-content" }}
    />
  );
};

export default React.memo(MachinesTable);
