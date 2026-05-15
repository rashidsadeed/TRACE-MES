import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Row, Col, Typography } from "antd";
import { KPICard, MachineTable, MachineDetailDrawer, AlertMachinesModal } from "./components";
import { useLiveTelemetry } from "./hooks/useLiveTelemetry";
import { styles } from "./styles";
import { getKPIs, getMachineLogs, getMachineDetail, getMachineErrorLogs, resetMachineAlarm } from "../../services/dashboardService";
import type { KPIData, MachineLog, MachineDetail, ErrorLog } from "./types";
import {
  RocketOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  AlertOutlined,
} from "@ant-design/icons";

const { Title } = Typography;

/** Maps raw KPI data to renderable KPIData (adds icons) */
const KPI_ICON_MAP: Record<string, React.ReactNode> = {
  production: <RocketOutlined style={{ color: "#1890ff", fontSize: 24 }} />,
  oee: <ThunderboltOutlined style={{ color: "#52c41a", fontSize: 24 }} />,
  machines: <ToolOutlined style={{ color: "#faad14", fontSize: 24 }} />,
  alerts: <AlertOutlined style={{ color: "#ff4d4f", fontSize: 24 }} />,
};

const Dashboard: React.FC = () => {
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [kpiData, setKpiData] = useState<KPIData[]>([]);
  const [machineLogData, setMachineLogData] = useState<MachineLog[]>([]);
  const [detail, setDetail] = useState<MachineDetail | null>(null);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [alertsModalOpen, setAlertsModalOpen] = useState(false);

  const { data: telemetryData, latest: latestTelemetry } = useLiveTelemetry(selectedMachine);

  // Machines in Error or Maintenance state — drive the Alerts KPI drill-down.
  const alertMachines = useMemo(
    () =>
      machineLogData.filter(
        (m) => m.status === "Error" || m.status === "Maintenance",
      ),
    [machineLogData],
  );

  // Fetch initial data from service
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
          return (
            <Col xs={24} sm={12} lg={6} key={kpi.key}>
              <KPICard
                data={kpi}
                onClick={isAlerts ? () => setAlertsModalOpen(true) : undefined}
                highlight={isAlerts && alertMachines.length > 0}
              />
            </Col>
          );
        })}
      </Row>

      {/* Machine Logs */}
      <Row style={styles.tableSection}>
        <Col span={24}>
          <MachineTable data={machineLogData} onViewDetail={handleViewDetail} />
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
