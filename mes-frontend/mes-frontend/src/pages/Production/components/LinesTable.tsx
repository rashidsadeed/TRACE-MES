import React, { useMemo } from "react";
import { Table, Tag, Space } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ProductionLine, Machine } from "../types";
import { LINE_STATUS_CONFIG, MACHINE_TYPE_COLOR } from "../constants";
import { styles } from "../styles";

interface LinesTableProps {
  lines: ProductionLine[];
  getMachinesForLine: (lineId: string) => Machine[];
}

const LinesTable: React.FC<LinesTableProps> = ({ lines, getMachinesForLine }) => {
  const columns: ColumnsType<ProductionLine> = useMemo(
    () => [
      {
        title: "Line ID",
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
        render: (name: string, record: ProductionLine) => (
          <Space>
            {name}
            {record.isCustom && (
              <Tag color="purple" style={{ fontSize: 10 }}>
                CUSTOM
              </Tag>
            )}
          </Space>
        ),
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        render: (status: ProductionLine["status"]) => (
          <Tag color={LINE_STATUS_CONFIG[status]}>
            {status.toUpperCase()}
          </Tag>
        ),
      },
      {
        title: "Machines",
        key: "machines",
        render: (_: unknown, record: ProductionLine) => {
          const lineMachines = getMachinesForLine(record.id);
          return (
            <div style={styles.machineListInLine}>
              {lineMachines.map((m) => (
                <Tag key={m.id} color={MACHINE_TYPE_COLOR[m.type]}>
                  {m.id} ({m.type})
                </Tag>
              ))}
              {lineMachines.length === 0 && (
                <span style={{ color: "#ccc" }}>No machines assigned</span>
              )}
            </div>
          );
        },
      },
      {
        title: "Active Job",
        dataIndex: "activeJobId",
        key: "activeJobId",
        render: (jobId?: string) =>
          jobId ? (
            <Tag color="blue">{jobId}</Tag>
          ) : (
            <span style={{ color: "#ccc" }}>—</span>
          ),
      },
    ],
    [getMachinesForLine],
  );

  return (
    <Table<ProductionLine>
      columns={columns}
      dataSource={lines}
      rowKey="key"
      pagination={{ pageSize: 10 }}
      scroll={{ x: "max-content" }}
    />
  );
};

export default React.memo(LinesTable);
