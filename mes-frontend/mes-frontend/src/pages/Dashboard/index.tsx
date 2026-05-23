import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Row, Col, Typography, Button, Tag } from "antd";
import { KPICard, MachineTable, MachineDetailDrawer, AlertMachinesModal } from "./components";
import { useLiveTelemetry } from "./hooks/useLiveTelemetry";
import { styles } from "./styles";
import { getKPIs, getMachineLogs, getMachineDetail, getMachineErrorLogs, resetMachineAlarm } from "../../services/dashboardService";
import type { KPIData, MachineLog, MachineDetail, ErrorLog, MachineStatus } from "./types";
import {
  RocketOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  AlertOutlined,
  FilterOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";

const { Title } = Typography;

/** Maps raw KPI data to renderable KPIData (adds icons) */
const KPI_ICON_MAP: Record<string, React.ReactNode> = {
  production: <RocketOutlined style={{ color: "#1890ff", fontSize: 24 }} />,
  oee: <ThunderboltOutlined style={{ color: "#52c41a", fontSize: 24 }} />,
  machines: <ToolOutlined style={{ color: "#faad14", fontSize: 24 }} />,
  alerts: <AlertOutlined style={{ color: "#ff4d4f", fontSize: 24 }} />,
};

/** KPI keys that should invert trend color (up = bad) */
const INVERT_TREND_KEYS = new Set(["alerts"]);

/** Filter definitions for each KPI card */
type KPIFilter = {
  label: string;
  predicate: (m: MachineLog) => boolean;
};

const KPI_FILTER_MAP: Record<string, KPIFilter> = {
  production: {
    label: "Running Machines",
    predicate: (m) => m.status === "Running",
  },
  machines: {
    label: "Active Machines",
    predicate: (m) => m.status === "Running" || m.status === "Idle",
  },
  alerts: {
    label: "Error / Maintenance",
    predicate: (m) => m.status === "Error" || m.status === "Maintenance",
  },
};

const Dashboard: React.FC = () => {
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [kpiData, setKpiData] = useState<KPIData[]>([]);
  const [machineLogData, setMachineLogData] = useState<MachineLog[]>([]);
  const [detail, setDetail] = useState<MachineDetail | null>(null);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [alertsModalOpen, setAlertsModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const { data: telemetryData, latest: latestTelemetry } = useLiveTelemetry(selectedMachine);

  // Machines in Error or Maintenance state — drive the Alerts KPI drill-down.
  const alertMachines = useMemo(
    () =>
      machineLogData.filter(
        (m) => m.status === "Error" || m.status === "Maintenance",
      ),
    [machineLogData],
  );

  // Apply active filter to machine logs
  const filteredMachineLogData = useMemo(() => {
    if (!activeFilter || !KPI_FILTER_MAP[activeFilter]) return machineLogData;
    return machineLogData.filter(KPI_FILTER_MAP[activeFilter].predicate);
  }, [machineLogData, activeFilter]);

  // Fetch data from service — poll every 3s for live updates
  useEffect(() => {
    const fetchData = async () => {
      const [rawKPIs, logs] = await Promise.all([getKPIs(), getMachineLogs()]);
      // Attach icons to KPI data
      const kpis: KPIData[] = rawKPIs.map((k) => ({
        ...k,
        icon: KPI_ICON_MAP[k.key] ?? <RocketOutlined style={{ fontSize: 24 }} />,
      }));
      setKpiData(kpis);
      setMachineLogData(logs);
    };
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  // Fetch machine detail when selection changes
  useEffect(() => {
    if (!selectedMachine) {
      setDetail(null);
      return;
    }
    const fetchDetail = async () => {
      const [d, logs] = await Promise.all([
        getMachineDetail(selectedMachine),
        getMachineErrorLogs(selectedMachine),
      ]);
      setDetail(d);
      setErrorLogs(logs);
    };
    fetchDetail();
  }, [selectedMachine]);

  const handleViewDetail = useCallback((machineId: string) => {
    setSelectedMachine(machineId);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setSelectedMachine(null);
    setErrorLogs([]);
  }, []);

  const handleResetAlarm = useCallback(async (machineId: string) => {
    await resetMachineAlarm(machineId);
    // Refresh error logs after reset
    const updatedLogs = await getMachineErrorLogs(machineId);
    setErrorLogs(updatedLogs);
  }, []);

  const handleKPIClick = useCallback((key: string) => {
    if (key === "alerts") {
      setAlertsModalOpen(true);
      return;
    }
    if (KPI_FILTER_MAP[key]) {
      setActiveFilter((prev) => (prev === key ? null : key));
    }
  }, []);

  const clearFilter = useCallback(() => {
    setActiveFilter(null);
  }, []);

  return (
    <div>
      {/* Header */}
      <div style={styles.pageHeader}>
        <Title level={2}>Plant Overview</Title>
        <span style={styles.subtitle}>
          Real-time production metrics and machine status.
        </span>
      </div>

      {/* KPI Cards */}
      <Row gutter={[24, 24]}>
        {kpiData.map((kpi) => {
          const isAlerts = kpi.key === "alerts";
          const isClickable = isAlerts || Boolean(KPI_FILTER_MAP[kpi.key]);
          return (
            <Col xs={24} sm={12} lg={6} key={kpi.key}>
              <KPICard
                data={kpi}
                onClick={isClickable ? () => handleKPIClick(kpi.key) : undefined}
                highlight={
                  (isAlerts && alertMachines.length > 0) ||
                  activeFilter === kpi.key
                }
                invertTrend={INVERT_TREND_KEYS.has(kpi.key)}
              />
            </Col>
          );
        })}
      </Row>

      {/* Active Filter Indicator */}
      {activeFilter && KPI_FILTER_MAP[activeFilter] && (
        <div style={{ marginTop: 16, marginBottom: -8 }}>
          <Tag
            icon={<FilterOutlined />}
            color="blue"
            closable
            onClose={clearFilter}
            style={{ fontSize: 13, padding: "4px 12px" }}
          >
            Filtered: {KPI_FILTER_MAP[activeFilter].label}
          </Tag>
        </div>
      )}

      {/* Machine Logs */}
      <Row style={styles.tableSection}>
        <Col span={24}>
          <MachineTable data={filteredMachineLogData} onViewDetail={handleViewDetail} />
        </Col>
      </Row>

      {/* Machine Detail Drawer */}
      <MachineDetailDrawer
        open={selectedMachine !== null}
        detail={detail}
        telemetryData={telemetryData}
        latestTelemetry={latestTelemetry}
        errorLogs={errorLogs}
        onClose={handleCloseDrawer}
        onResetAlarm={handleResetAlarm}
      />

      {/* Alerts Drill-down Modal */}
      <AlertMachinesModal
        open={alertsModalOpen}
        machines={alertMachines}
        onClose={() => setAlertsModalOpen(false)}
        onViewDetail={handleViewDetail}
      />
    </div>
  );
};

export default Dashboard;
