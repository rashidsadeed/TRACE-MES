import React, { useMemo, useRef } from "react";
import { Table, Tag, Progress, Badge, Input, Button, Space } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { ColumnsType, ColumnType } from "antd/es/table";
import type { InputRef } from "antd";
import type { FilterDropdownProps } from "antd/es/table/interface";
import type { Machine } from "../types";
import { MACHINE_STATUS_CONFIG, MACHINE_TYPE_COLOR } from "../constants";
import { styles, getTempColor } from "../styles";

interface MachinesTableProps {
  machines: Machine[];
}

const MachinesTable: React.FC<MachinesTableProps> = ({ machines }) => {
  const searchInput = useRef<InputRef>(null);

  const getColumnSearchProps = (dataIndex: keyof Machine): ColumnType<Machine> => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: FilterDropdownProps) => (
      <div style={{ padding: 8 }}>
        <Input
          ref={searchInput}
          placeholder={`Search ${dataIndex}...`}
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
      String(record[dataIndex] ?? "").toLowerCase().includes((value as string).toLowerCase()),
    onFilterDropdownOpenChange: (visible) => {
      if (visible) setTimeout(() => searchInput.current?.select(), 100);
    },
  });

  const columns: ColumnsType<Machine> = useMemo(
    () => [
      {
        title: "Machine ID",
        dataIndex: "id",
        key: "id",
        sorter: (a, b) => a.id.localeCompare(b.id),
        render: (text: string) => (
          <span style={styles.lineBold}>{text}</span>
        ),
      },
      {
        title: "Name",
        dataIndex: "name",
        key: "name",
        sorter: (a, b) => a.name.localeCompare(b.name),
        ...getColumnSearchProps("name"),
      },
      {
        title: "Type",
        dataIndex: "type",
        key: "type",
        sorter: (a, b) => a.type.localeCompare(b.type),
        filters: [
          { text: "CNC", value: "CNC" },
          { text: "Press", value: "Press" },
          { text: "Assembly", value: "Assembly" },
          { text: "Welding", value: "Welding" },
          { text: "Painting", value: "Painting" },
          { text: "Testing", value: "Testing" },
          { text: "Packaging", value: "Packaging" },
          { text: "Soldering", value: "Soldering" },
          { text: "Molding", value: "Molding" },
        ],
        onFilter: (value, record) => record.type === value,
        render: (type: Machine["type"]) => (
          <Tag color={MACHINE_TYPE_COLOR[type]}>{type}</Tag>
        ),
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        sorter: (a, b) => a.status.localeCompare(b.status),
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
        sorter: (a, b) => a.location.localeCompare(b.location),
      },
      {
        title: "Assigned Line",
        dataIndex: "currentLineId",
        key: "currentLineId",
        sorter: (a, b) => (a.currentLineId ?? "").localeCompare(b.currentLineId ?? ""),
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
        sorter: (a, b) => a.lastMaint.localeCompare(b.lastMaint),
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
