import React, { useState, useCallback } from "react";
import { Row, Col, Typography } from "antd";
import { KPICard, MachineTable, MachineDetailDrawer } from "./components";
import { KPI_DATA, MACHINE_LOG_DATA, MACHINE_DETAIL_MAP } from "./constants";
import { useLiveTelemetry } from "./hooks/useLiveTelemetry";
import { styles } from "./styles";

const { Title } = Typography;

const Dashboard: React.FC = () => {
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);

  const detail = selectedMachine ? MACHINE_DETAIL_MAP[selectedMachine] ?? null : null;
  const { data: telemetryData, latest: latestTelemetry } = useLiveTelemetry(selectedMachine);

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
        {KPI_DATA.map((kpi) => (
          <Col xs={24} sm={12} lg={6} key={kpi.key}>
            <KPICard data={kpi} />
          </Col>
        ))}
      </Row>

      {/* Machine Logs */}
      <Row style={styles.tableSection}>
        <Col span={24}>
          <MachineTable data={MACHINE_LOG_DATA} onViewDetail={handleViewDetail} />
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
