import React from "react";
import { Alert, Checkbox, Tag } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import type { WorkOrder } from "../types";
import { PRIORITY_COLOR } from "../constants";

interface ConflictAlertProps {
  conflicts: WorkOrder[];
  acknowledged: boolean;
  onAcknowledge: (checked: boolean) => void;
}

const ConflictAlert: React.FC<ConflictAlertProps> = React.memo(
  ({ conflicts, acknowledged, onAcknowledge }) => {
    if (conflicts.length === 0) return null;

    return (
      <div style={{ marginBottom: 16 }}>
        <Alert
          message="Schedule Conflict Detected"
          description={
            <div>
              <p>The following orders are already scheduled for this date:</p>
              <ul style={{ paddingLeft: 20, margin: "5px 0" }}>
                {conflicts.map((c) => (
                  <li key={c.key}>
                    <b>{c.product}</b> –{" "}
                    <Tag color={PRIORITY_COLOR[c.priority]}>
                      {c.priority}
                    </Tag>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 10 }}>
                <Checkbox
                  checked={acknowledged}
                  onChange={(e) => onAcknowledge(e.target.checked)}
                >
                  <span style={{ fontWeight: 600 }}>
                    I acknowledge the schedule conflict.
                  </span>
                </Checkbox>
              </div>
            </div>
          }
          type="warning"
          showIcon
          icon={<ExclamationCircleOutlined />}
        />
      </div>
    );
  },
);

ConflictAlert.displayName = "ConflictAlert";

export default ConflictAlert;
