import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Typography } from "antd";
import { KPICard, MachineTable, MachineDetailDrawer } from "./components";
import { useLiveTelemetry } from "./hooks/useLiveTelemetry";
import { styles } from "./styles";
import { getKPIs, getMachineLogs, getMachineDetail } from "../../services/dashboardService";
import type { KPIData, MachineLog, MachineDetail } from "./types";
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

  const { data: telemetryData, latest: latestTelemetry } = useLiveTelemetry(selectedMachine);

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
      const d = await getMachineDetail(selectedMachine);
      setDetail(d);
    };
    fetchDetail();
  }, [selectedMachine]);

  const handleViewDetail = useCallback((machineId: string) => {
    setSelectedMachine(machineId);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setSelectedMachine(null);
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
        {kpiData.map((kpi) => (
          <Col xs={24} sm={12} lg={6} key={kpi.key}>
            <KPICard data={kpi} />
          </Col>
        ))}
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
        onClose={handleCloseDrawer}
      />
    </div>
  );
};

export default Dashboard;
