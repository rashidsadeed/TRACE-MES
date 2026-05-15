import React from "react";
import { Row, Col, Card, Statistic } from "antd";
import {
  FileTextOutlined,
  SyncOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import type { OrderStats as OrderStatsType } from "../types";
import { styles } from "../styles";

interface OrderStatsProps {
  stats: OrderStatsType;
}

const OrderStats: React.FC<OrderStatsProps> = React.memo(({ stats }) => (
  <Row gutter={16} style={styles.statsRow}>
    <Col span={8}>
      <Card bordered={false}>
        <Statistic
          title="Total Orders"
          value={stats.total}
          prefix={<FileTextOutlined />}
        />
      </Card>
    </Col>
    <Col span={8}>
      <Card bordered={false}>
        <Statistic
          title="In Progress"
          value={stats.active}
          valueStyle={styles.activeStatValue}
          prefix={<SyncOutlined spin />}
        />
      </Card>
    </Col>
    <Col span={8}>
      <Card bordered={false}>
        <Statistic
          title="Delayed / Critical"
          value={stats.delayed}
          valueStyle={styles.delayedStatValue}
          prefix={<ClockCircleOutlined />}
        />
      </Card>
    </Col>
  </Row>
));

OrderStats.displayName = "OrderStats";

export default OrderStats;
