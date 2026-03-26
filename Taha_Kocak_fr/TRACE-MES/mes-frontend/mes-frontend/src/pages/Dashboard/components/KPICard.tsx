import React from "react";
import { Card, Statistic } from "antd";
import { ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";
import type { KPIData } from "../types";
import { styles, getTrendColor } from "../styles";

interface KPICardProps {
  data: KPIData;
}

const KPICard: React.FC<KPICardProps> = React.memo(({ data }) => {
  const trendColor = getTrendColor(data.trend);
  const TrendIcon = data.trend === "up" ? ArrowUpOutlined : ArrowDownOutlined;

  return (
    <Card bordered={false} hoverable style={{ height: "100%" }}>
      <div style={styles.kpiCardBody}>
        <Statistic
          title={data.title}
          value={data.value}
          suffix={<span style={styles.kpiSuffix}>{data.suffix}</span>}
        />
        <div style={styles.kpiIconWrapper}>{data.icon}</div>
      </div>
      <div style={styles.kpiTrendRow}>
        <span style={{ color: trendColor, marginRight: 8 }}>
          <TrendIcon /> {data.percent}%
        </span>
        <span style={styles.kpiTrendLabel}>vs last week</span>
      </div>
    </Card>
  );
});

KPICard.displayName = "KPICard";

export default KPICard;
