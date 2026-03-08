import React from "react";
import { Alert } from "antd";
import type { WorkOrder } from "../types";
import { styles } from "../styles";

interface DeadlineAlertProps {
  deadlines: WorkOrder[];
}

const DeadlineAlert: React.FC<DeadlineAlertProps> = React.memo(
  ({ deadlines }) => {
    if (deadlines.length === 0) return null;

    return (
      <div style={styles.alertContainer}>
        <Alert
          message={
            <span style={styles.alertText}>
              Production Alert: {deadlines.length} order(s) due within 72 hours.
              Check priorities immediately.
            </span>
          }
          type="warning"
          showIcon
          closable
          style={styles.alertBorder}
        />
      </div>
    );
  },
);

DeadlineAlert.displayName = "DeadlineAlert";

export default DeadlineAlert;
