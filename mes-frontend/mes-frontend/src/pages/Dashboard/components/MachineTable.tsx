import React, { useMemo, useState, useRef } from "react";
import { Table, Card, Tag, Progress, Button, Input, Space } from "antd";
import { EyeOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType, ColumnType } from "antd/es/table";
import type { InputRef } from "antd";
import type { FilterDropdownProps } from "antd/es/table/interface";
import type { MachineLog, MachineStatus } from "../types";
import { MACHINE_STATUS_COLOR, TEMP_DANGER_THRESHOLD } from "../constants";
import { styles, getTempColor } from "../styles";

interface MachineTableProps {
  data: MachineLog[];
  onViewDetail: (machineId: string) => void;
}

const MachineTable: React.FC<MachineTableProps> = React.memo(({ data, onViewDetail }) => {
  const searchInput = useRef<InputRef>(null);

  const getColumnSearchProps = (dataIndex: "machine"): ColumnType<MachineLog> => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: FilterDropdownProps) => (
      <div style={{ padding: 8 }}>
        <Input
          ref={searchInput}
          placeholder="Search machine name..."
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => confirm()}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button type="primary" onClick={() => confirm()} icon={<SearchOutlined />} size="small" style={{ width: 90 }}>
            Search
          </Button>
          <Button onClick={() => { clearFilters?.(); confirm(); }} size="small" style={{ width: 90 }}>
            Reset
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered: boolean) => <SearchOutlined style={{ color: filtered ? "#1890ff" : undefined }} />,
    onFilter: (value, record) =>
      record[dataIndex].toLowerCase().includes((value as string).toLowerCase()),
    onFilterDropdownOpenChange: (visible) => {
      if (visible) setTimeout(() => searchInput.current?.select(), 100);
    },
  });

  const columns: ColumnsType<MachineLog> = useMemo(
    () => [
      {
        title: "Machine ID",
        dataIndex: "machine",
        key: "machine",
        sorter: (a, b) => a.machine.localeCompare(b.machine),
        ...getColumnSearchProps("machine"),
        render: (text: string) => <span style={styles.machineName}>{text}</span>,
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        sorter: (a, b) => a.status.localeCompare(b.status),
        filters: [
          { text: "Running", value: "Running" },
          { text: "Idle", value: "Idle" },
          { text: "Error", value: "Error" },
          { text: "Maintenance", value: "Maintenance" },
        ],
        onFilter: (value, record) => record.status === value,
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
        sorter: (a, b) => a.output - b.output,
        render: (val: number) => `${val.toLocaleString()} units`,
      },
      {
        title: "Temperature (°C)",
        dataIndex: "temp",
        key: "temp",
        sorter: (a, b) => a.temp - b.temp,
        render: (temp: number) => (
          <div style={styles.tempBar}>
            <Progress
              percent={temp}
              steps={5}
              size="small"
              strokeColor={getTempColor(temp, TEMP_DANGER_THRESHOLD)}
              showInfo={false}
            />
            <span style={styles.tempLabel}>{temp.toFixed(1)}°C</span>
          </div>
        ),
      },
      {
        title: "Last Maintenance",
        dataIndex: "lastMaint",
        key: "lastMaint",
        sorter: (a, b) => a.lastMaint.localeCompare(b.lastMaint),
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
