import React from "react";
import { Row, Col, Typography } from "antd";
import { KPICard, MachineTable } from "./components";
import { KPI_DATA, MACHINE_LOG_DATA } from "./constants";
import { styles } from "./styles";

const { Title } = Typography;

const Dashboard: React.FC = () => (
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
        <MachineTable data={MACHINE_LOG_DATA} />
      </Col>
    </Row>
  </div>
);

export default Dashboard;
