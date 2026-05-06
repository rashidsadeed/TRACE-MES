import React, { useMemo, useState } from "react";
import {
  Button,
  Space,
  Badge,
  Card,
  Tabs,
  Typography,
  Row,
  Col,
  Statistic,
} from "antd";
import {
  PlusOutlined,
  InboxOutlined,
  DashboardOutlined,
  ToolOutlined,
  AlertOutlined,
} from "@ant-design/icons";
import { useProduction } from "./hooks/useProduction";
import {
  JobsTable,
  LinesTable,
  MachinesTable,
  StartJobModal,
  AcceptOrderModal,
  PendingOrdersModal,
  NavbarPortal,
  EmergencyStopBar,
  ErrorMachinesModal,
} from "./components";
import { styles } from "./styles";

const { Title } = Typography;

const Production: React.FC = () => {
  const {
    machines,
    lines,
    jobs,
    pendingOrders,
    availableMachines,
    stats,
    modal,
    openStartJobModal,
    openPendingOrders,
    openAcceptOrderModal,
    closeModal,
    startJobForm,
    acceptOrderForm,
    handleCreateJob,
    handleAcceptOrder,
    handleRunJob,
    handleCancelJob,
    getLineName,
    getMachinesForLine,
    getMachinesByIds,
    // Emergency
    hasRunningJobs,
    handleStopAll,
    handleStopJob,
    // Machine Conflict
    conflictMachines,
    conflictAcknowledged,
    setConflictAcknowledged,
    checkMachineConflicts,
    isConflictBlocked,
  } = useProduction();

  const [errorModalOpen, setErrorModalOpen] = useState(false);

  const erroredMachines = useMemo(
    () => machines.filter((m) => m.status === "Error"),
    [machines],
  );

  const tabItems = [
    {
      key: "jobs",
      label: (
        <span>
          <DashboardOutlined /> Active Jobs ({stats.jobs.total})
        </span>
      ),
      children: (
        <JobsTable
          jobs={jobs}
          getLineName={getLineName}
          getMachinesForLine={getMachinesForLine}
          getMachinesByIds={getMachinesByIds}
          onStartJob={handleRunJob}
          onStopJob={handleStopJob}
          onCancelJob={handleCancelJob}
        />
      ),
    },
    {
      key: "lines",
      label: (
        <span>
          <ToolOutlined /> Production Lines ({lines.length})
        </span>
      ),
      children: (
        <LinesTable lines={lines} getMachinesForLine={getMachinesForLine} />
      ),
    },
    {
      key: "machines",
      label: (
        <span>
          <ToolOutlined /> Machines ({machines.length})
        </span>
      ),
      children: <MachinesTable machines={machines} />,
    },
  ];

  return (
    <div>
      {/* Emergency Stop — renders into the navbar via Portal */}
      <NavbarPortal>
        <EmergencyStopBar
          jobs={jobs}
          machines={machines}
          lines={lines}
          hasRunningJobs={hasRunningJobs}
          onStopAll={handleStopAll}
        />
      </NavbarPortal>

      {/* Header */}
      <div style={styles.pageHeader}>
        <div>
          <Title level={2} style={styles.pageTitle}>
            Production
          </Title>
          <span style={styles.subtitle}>
            Manage jobs, lines, and machine assignments.
          </span>
        </div>
        <Space>
          <Badge count={pendingOrders.length} offset={[-5, 5]}>
            <Button icon={<InboxOutlined />} onClick={openPendingOrders}>
              Accept Order
            </Button>
          </Badge>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={openStartJobModal}
          >
            Start New Job
          </Button>
        </Space>
      </div>

      {/* Quick Stats */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card bordered={false} size="small">
            <Statistic
              title="Running Jobs"
              value={stats.jobs.running}
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} size="small">
            <Statistic
              title="Scheduled"
              value={stats.jobs.scheduled}
              valueStyle={{ color: "#1890ff" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} size="small">
            <Statistic
              title="Available Machines"
              value={stats.machines.available}
              suffix={`/ ${stats.machines.total}`}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card
            bordered={false}
            size="small"
            hoverable={stats.machines.error > 0}
            onClick={
              stats.machines.error > 0
                ? () => setErrorModalOpen(true)
                : undefined
            }
            style={{
              cursor: stats.machines.error > 0 ? "pointer" : undefined,
              border:
                stats.machines.error > 0 ? "1px solid #ffa39e" : undefined,
              background: stats.machines.error > 0 ? "#fff1f0" : undefined,
            }}
          >
            <Statistic
              title={
                stats.machines.error > 0
                  ? "Machine Errors (click for details)"
                  : "Machine Errors"
              }
              value={stats.machines.error}
              valueStyle={
                stats.machines.error > 0 ? { color: "#ff4d4f" } : undefined
              }
              prefix={stats.machines.error > 0 ? <AlertOutlined /> : undefined}
            />
          </Card>
        </Col>
      </Row>

      {/* Tabbed Content */}
      <Card bordered={false} style={styles.cardShadow}>
        <Tabs defaultActiveKey="jobs" items={tabItems} />
      </Card>

      {/* Modal: Start New Job */}
      <StartJobModal
        open={modal.type === "startJob"}
        form={startJobForm}
        lines={lines}
        availableMachines={availableMachines}
        onFinish={handleCreateJob}
        onCancel={closeModal}
        conflictMachines={conflictMachines}
        conflictAcknowledged={conflictAcknowledged}
        onConflictAcknowledge={setConflictAcknowledged}
        onAssignmentChange={checkMachineConflicts}
        isSubmitBlocked={isConflictBlocked}
      />

      {/* Modal: Pending Orders List */}
      <PendingOrdersModal
        open={modal.type === "pendingOrders"}
        orders={pendingOrders}
        onCancel={closeModal}
        onAssign={openAcceptOrderModal}
      />

      {/* Modal: Accept & Assign Order */}
      <AcceptOrderModal
        open={modal.type === "acceptOrder"}
        order={modal.type === "acceptOrder" ? modal.order : null}
        form={acceptOrderForm}
        lines={lines}
        availableMachines={availableMachines}
        onFinish={handleAcceptOrder}
        onCancel={closeModal}
        conflictMachines={conflictMachines}
        conflictAcknowledged={conflictAcknowledged}
        onConflictAcknowledge={setConflictAcknowledged}
        onAssignmentChange={checkMachineConflicts}
        isSubmitBlocked={isConflictBlocked}
      />

      {/* Modal: Error Machines Drill-down */}
      <ErrorMachinesModal
        open={errorModalOpen}
        machines={erroredMachines}
        onClose={() => setErrorModalOpen(false)}
      />
    </div>
  );
};

export default Production;
