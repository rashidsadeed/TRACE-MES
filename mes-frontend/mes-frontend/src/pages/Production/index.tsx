import React, { useMemo, useState, useCallback, useEffect } from "react";
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
  Tag,
  Modal,
  Form,
  Input,
} from "antd";
import {
  PlusOutlined,
  InboxOutlined,
  DashboardOutlined,
  ToolOutlined,
  AlertOutlined,
  FilterOutlined,
} from "@ant-design/icons";
import { useSearchParams } from "react-router-dom";
import { useProduction } from "./hooks/useProduction";
import {
  JobsTable,
  LinesTable,
  MachinesTable,
  StartJobModal,
  EditJobModal,
  AcceptOrderModal,
  PendingOrdersModal,
  NavbarPortal,
  EmergencyStopBar,
  ErrorMachinesModal,
} from "./components";
import { styles } from "./styles";

const { Title } = Typography;

/** Filter types for the Quick Stats cards */
type QuickFilter = "running" | "scheduled" | "available" | "error" | null;

const FILTER_LABELS: Record<string, string> = {
  running: "Running Jobs",
  scheduled: "Scheduled Jobs",
  available: "Available Machines",
  error: "Machine Errors",
};

const Production: React.FC = () => {
  const {
    machines,
    lines,
    jobs,
    pendingOrders,
    parts,
    availableMachines,
    stats,
    modal,
    openStartJobModal,
    openPendingOrders,
    openAcceptOrderModal,
    openEditJobModal,
    openCancelJobModal,
    closeModal,
    startJobForm,
    acceptOrderForm,
    editJobForm,
    cancelJobForm,
    handleCreateJob,
    handleAcceptOrder,
    handleRunJob,
    handleCancelJob,
    handleEditJobSubmit,
    handleDeleteJobSubmit,
    handleCompleteJob,
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

  const [searchParams] = useSearchParams();
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("jobs");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null);
  const [jobSearch, setJobSearch] = useState("");

  // Pre-fill search from ?search= query param (e.g. from ERP WO Ref link)
  useEffect(() => {
    const q = searchParams.get("search");
    if (q) {
      setJobSearch(q);
      setActiveTab("jobs");
    }
  }, [searchParams]);

  const erroredMachines = useMemo(
    () => machines.filter((m) => m.status === "Error"),
    [machines],
  );

  // Apply quick filter + text search to jobs
  const filteredJobs = useMemo(() => {
    let result = jobs;
    if (quickFilter === "running") result = result.filter((j) => j.status === "Running");
    else if (quickFilter === "scheduled") result = result.filter((j) => j.status === "Waiting");
    if (jobSearch.trim()) {
      const q = jobSearch.toLowerCase();
      result = result.filter(
        (j) =>
          j.key.toLowerCase().includes(q) ||
          j.productName.toLowerCase().includes(q) ||
          (j.workOrderId?.toLowerCase() ?? "").includes(q),
      );
    }
    return result;
  }, [jobs, quickFilter, jobSearch]);

  // Apply quick filter to machines
  const filteredMachines = useMemo(() => {
    if (quickFilter === "available") return machines.filter((m) => m.status === "Available");
    if (quickFilter === "error") return machines.filter((m) => m.status === "Error");
    return machines;
  }, [machines, quickFilter]);

  const handleQuickFilterClick = useCallback((filter: QuickFilter) => {
    setQuickFilter((prev) => {
      if (prev === filter) return null; // Toggle off
      // Switch to the appropriate tab
      if (filter === "running" || filter === "scheduled") {
        setActiveTab("jobs");
      } else if (filter === "available" || filter === "error") {
        setActiveTab("machines");
      }
      return filter;
    });
  }, []);

  const clearFilter = useCallback(() => {
    setQuickFilter(null);
  }, []);

  // Navigate to a specific machine in the Machines tab
  const handleViewErrorMachine = useCallback((machineId: string) => {
    setActiveTab("machines");
    setQuickFilter("error");
  }, []);

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
          jobs={filteredJobs}
          getLineName={getLineName}
          getMachinesForLine={getMachinesForLine}
          getMachinesByIds={getMachinesByIds}
          onStartJob={handleRunJob}
          onStopJob={handleStopJob}
          onCancelJob={handleCancelJob}
          onDeleteJob={(key) => {
            const job = filteredJobs.find(j => j.key === key);
            if (job) openCancelJobModal(job);
          }}
          onEditJob={(key) => {
            const job = filteredJobs.find(j => j.key === key);
            if (job) openEditJobModal(job);
          }}
          onCompleteJob={handleCompleteJob}
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
      children: <MachinesTable machines={filteredMachines} />,
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
          <Input.Search
            placeholder="Search jobs…"
            value={jobSearch}
            onChange={(e) => setJobSearch(e.target.value)}
            onSearch={setJobSearch}
            allowClear
            style={{ width: 220 }}
          />
          <Badge count={pendingOrders.length} style={{ backgroundColor: "#ff4d4f" }}>
            <Button
              icon={<InboxOutlined />}
              onClick={openPendingOrders}
              style={{ marginRight: 8 }}
            >
              Pull from Backlog
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
          <Card
            bordered={false}
            size="small"
            hoverable
            onClick={() => handleQuickFilterClick("running")}
            style={{
              cursor: "pointer",
              border: quickFilter === "running" ? "1px solid #b7eb8f" : undefined,
              background: quickFilter === "running" ? "#f6ffed" : undefined,
            }}
          >
            <Statistic
              title="Running Jobs"
              value={stats.jobs.running}
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card
            bordered={false}
            size="small"
            hoverable
            onClick={() => handleQuickFilterClick("scheduled")}
            style={{
              cursor: "pointer",
              border: quickFilter === "scheduled" ? "1px solid #91d5ff" : undefined,
              background: quickFilter === "scheduled" ? "#e6f7ff" : undefined,
            }}
          >
            <Statistic
              title="Scheduled"
              value={stats.jobs.scheduled}
              valueStyle={{ color: "#1890ff" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card
            bordered={false}
            size="small"
            hoverable
            onClick={() => handleQuickFilterClick("available")}
            style={{
              cursor: "pointer",
              border: quickFilter === "available" ? "1px solid #d9d9d9" : undefined,
              background: quickFilter === "available" ? "#fafafa" : undefined,
            }}
          >
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

      {/* Active Filter Indicator */}
      {(quickFilter || jobSearch) && (
        <div style={{ marginBottom: 16 }}>
          {quickFilter && (
            <Tag
              icon={<FilterOutlined />}
              color="blue"
              closable
              onClose={clearFilter}
              style={{ fontSize: 13, padding: "4px 12px" }}
            >
              Filtered: {FILTER_LABELS[quickFilter]}
            </Tag>
          )}
          {jobSearch && (
            <Tag
              icon={<FilterOutlined />}
              color="purple"
              closable
              onClose={() => setJobSearch("")}
              style={{ fontSize: 13, padding: "4px 12px" }}
            >
              Search: {jobSearch}
            </Tag>
          )}
        </div>
      )}

      {/* Tabbed Content */}
      <Card bordered={false} style={styles.cardShadow}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>

      {/* Modal: Start New Job */}
      <StartJobModal
        open={modal.type === "startJob"}
        form={startJobForm}
        lines={lines}
        availableMachines={availableMachines}
        parts={parts}
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

            {/* Modal: Edit Job */}
      <EditJobModal
        open={modal.type === "editJob"}
        form={editJobForm}
        job={modal.type === "editJob" ? modal.job : null}
        lines={lines}
        availableMachines={availableMachines}
        onFinish={handleEditJobSubmit}
        onCancel={closeModal}
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

      {/* Modal: Delete/Cancel Job with Reason */}
      <Modal
        title="Delete Job"
        open={modal.type === "cancelJob"}
        onCancel={closeModal}
        onOk={() => cancelJobForm.submit()}
        okText="Delete"
        okButtonProps={{ danger: true }}
      >
        <Form
          form={cancelJobForm}
          layout="vertical"
          onFinish={handleDeleteJobSubmit}
        >
          <p>Are you sure you want to completely delete this job? This will inform the customer.</p>
          <Form.Item 
            name="reason" 
            label="Reason for deletion"
            rules={[{ required: true, message: "Please provide a reason" }]}
          >
            <Input.TextArea rows={4} placeholder="E.g. Cannot fulfill this request due to machine failure..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal: Error Machines Drill-down */}
      <ErrorMachinesModal
        open={errorModalOpen}
        machines={erroredMachines}
        onClose={() => setErrorModalOpen(false)}
        onViewMachine={handleViewErrorMachine}
      />
    </div>
  );
};

export default Production;
