import React, { useMemo } from "react";
import {
  Table,
  Tag,
  Button,
  Space,
  Progress,
  Popconfirm,
  Steps,
  Descriptions,
  Badge,
  Tooltip,
  Typography,
  Row,
  Col,
} from "antd";
import type { TableProps } from "antd";
import {
  DeleteOutlined,
  CaretRightOutlined,
  StopOutlined,
} from "@ant-design/icons";
import type { ProductionJob, Machine } from "../types";
import { JOB_STATUS_CONFIG, MACHINE_TYPE_COLOR } from "../constants";
import ProductVisualizer from "./ProductVisualizer";
import { styles } from "../styles";

const { Title } = Typography;

interface JobsTableProps {
  jobs: ProductionJob[];
  getLineName: (lineId: string) => string;
  getMachinesForLine: (lineId: string) => Machine[];
  getMachinesByIds: (ids: string[]) => Machine[];
  onStartJob: (key: string) => void;
  onStopJob: (key: string) => void;
  onCancelJob: (key: string) => void;
}

const JobsTable: React.FC<JobsTableProps> = ({
  jobs,
  getLineName,
  getMachinesForLine,
  getMachinesByIds,
  onStartJob,
  onStopJob,
  onCancelJob,
}) => {
  const columns: TableProps<ProductionJob>["columns"] = useMemo(
    () => [
      {
        title: "Job ID",
        dataIndex: "id",
        key: "id",
        render: (text: string) => (
          <span style={styles.lineBold}>{text}</span>
        ),
      },
      {
        title: "Product",
        dataIndex: "productName",
        key: "productName",
      },
      {
        title: "Assignment",
        key: "assignment",
        render: (_: unknown, record: ProductionJob) => {
          if (record.assignmentType === "machine" && record.assignedMachineIds?.length) {
            const assignedMachines = getMachinesByIds(record.assignedMachineIds);
            return (
              <Space wrap size={4}>
                {assignedMachines.map((m) => (
                  <Tooltip key={m.id} title={m.name}>
                    <Tag color={MACHINE_TYPE_COLOR[m.type]}>{m.id}</Tag>
                  </Tooltip>
                ))}
                {assignedMachines.length === 0 &&
                  record.assignedMachineIds.map((id) => (
                    <Tag key={id}>{id}</Tag>
                  ))}
              </Space>
            );
          }

          if (record.lineId) {
            const lineName = getLineName(record.lineId);
            const isCustom = record.assignmentType === "custom-line";
            return (
              <Space size={4}>
                <Tag color="geekblue">{lineName}</Tag>
                {isCustom && (
                  <Tag color="purple" style={{ fontSize: 10 }}>CUSTOM</Tag>
                )}
              </Space>
            );
          }

          return <span style={{ color: "#ccc" }}>Unassigned</span>;
        },
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        render: (status: ProductionJob["status"]) => {
          const config = JOB_STATUS_CONFIG[status];
          return (
            <Tag icon={config.icon} color={config.color}>
              {status.toUpperCase()}
            </Tag>
          );
        },
      },
      {
        title: "Progress",
        key: "progress",
        render: (_: unknown, record: ProductionJob) => {
          if (record.targetQty === 0)
            return <span style={{ color: "#ccc" }}>N/A</span>;
          const percent = Math.round(
            (record.actualQty / record.targetQty) * 100,
          );
          return (
            <div style={styles.progressBar}>
              <Progress
                percent={percent}
                size="small"
                status={percent >= 100 ? "success" : "active"}
              />
            </div>
          );
        },
      },
      {
        title: "Action",
        key: "action",
        render: (_: unknown, record: ProductionJob) => {
          // Running → emergency stop for this job
          if (record.status === "Running") {
            return (
              <Popconfirm
                title="Emergency Stop"
                description={`Halt ${record.id} and its machines immediately?`}
                okText="STOP"
                okButtonProps={{ danger: true }}
                onConfirm={() => onStopJob(record.key)}
                onPopupClick={(e) => e.stopPropagation()}
              >
                <Button
                  danger
                  size="small"
                  icon={<StopOutlined />}
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontWeight: 600 }}
                >
                  Stop
                </Button>
              </Popconfirm>
            );
          }

          // Scheduled → start or cancel
          if (record.status === "Scheduled") {
            return (
              <Space>
                <Button
                  type="primary"
                  size="small"
                  icon={<CaretRightOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartJob(record.key);
                  }}
                >
                  Start
                </Button>
                <Popconfirm
                  title="Cancel this job?"
                  onConfirm={() => onCancelJob(record.key)}
                  onPopupClick={(e) => e.stopPropagation()}
                >
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Popconfirm>
              </Space>
            );
          }

          // Paused / Completed
          return <Tag color="default">{record.status}</Tag>;
        },
      },
    ],
    [getLineName, getMachinesByIds, onStartJob, onStopJob, onCancelJob],
  );

  // --- Expanded Row ---
  const expandedRowRender = (record: ProductionJob) => {
    const jobMachines =
      record.assignmentType === "machine" && record.assignedMachineIds?.length
        ? getMachinesByIds(record.assignedMachineIds)
        : record.lineId
          ? getMachinesForLine(record.lineId)
          : [];

    return (
      <div style={styles.expandedRow}>
        <Row gutter={[32, 32]}>
          <Col xs={24} lg={14}>
            <Title level={5} style={styles.sectionTitle}>
              Process Tracking
            </Title>
            <Steps
              current={record.currentStageIndex}
              size="small"
              status={record.status === "Paused" ? "error" : "process"}
              items={record.stages.map((stage) => ({ title: stage }))}
              style={{ marginBottom: 24 }}
            />
            <Descriptions title="Diagnostic Data" bordered size="small" column={2}>
              <Descriptions.Item label="Assignment">
                {record.assignmentType === "machine"
                  ? "Direct Machine"
                  : record.assignmentType === "custom-line"
                    ? "Custom Line"
                    : "Production Line"}
              </Descriptions.Item>
              <Descriptions.Item label="Machines">
                {jobMachines.length > 0 ? (
                  <Space wrap size={4}>
                    {jobMachines.map((m) => (
                      <Tag key={m.id} color={MACHINE_TYPE_COLOR[m.type]}>{m.id}</Tag>
                    ))}
                  </Space>
                ) : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Est. Completion">
                {record.estimatedTimeRemaining}
              </Descriptions.Item>
              <Descriptions.Item label="Defect Rate">
                <Badge
                  status={record.defects > 10 ? "error" : "success"}
                  text={`${record.defects} units detected`}
                />
              </Descriptions.Item>
              <Descriptions.Item label="Start Time">{record.startTime}</Descriptions.Item>
              <Descriptions.Item label="Cycle Time">45s / unit</Descriptions.Item>
            </Descriptions>
          </Col>
          <Col xs={24} lg={10}>
            <Title level={5} style={styles.sectionTitle}>Digital Twin</Title>
            <ProductVisualizer status={record.status} />
            <div style={styles.visualizerFooter}>Interactive 3D Model • Rotate to inspect</div>
          </Col>
        </Row>
      </div>
    );
  };

  return (
    <Table<ProductionJob>
      columns={columns}
      dataSource={jobs}
      rowKey="key"
      pagination={{ pageSize: 10 }}
      expandable={{
        expandedRowRender,
        expandRowByClick: true,
        rowExpandable: (record) => record.status !== "Completed",
      }}
    />
  );
};

export default React.memo(JobsTable);
