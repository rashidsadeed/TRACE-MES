import React from "react";
import { Card, Statistic } from "antd";
import { ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";
import type { KPIData } from "../types";
import { styles, getTrendColor } from "../styles";

interface KPICardProps {
  data: KPIData;
  onClick?: () => void;
  highlight?: boolean;
}

const KPICard: React.FC<KPICardProps> = React.memo(({ data, onClick, highlight }) => {
  const trendColor = getTrendColor(data.trend);
  const TrendIcon = data.trend === "up" ? ArrowUpOutlined : ArrowDownOutlined;
  const clickable = Boolean(onClick);

  return (
    <Card
      bordered={false}
      hoverable
      onClick={onClick}
      style={{
        height: "100%",
        cursor: clickable ? "pointer" : undefined,
        border: highlight ? "1px solid #ffa39e" : undefined,
        background: highlight ? "#fff1f0" : undefined,
      }}
    >
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
        <span style={styles.kpiTrendLabel}>
          {clickable ? "Click for details" : "vs last week"}
        </span>
      </div>
    </Card>
  );
});

KPICard.displayName = "KPICard";

export default KPICard;
