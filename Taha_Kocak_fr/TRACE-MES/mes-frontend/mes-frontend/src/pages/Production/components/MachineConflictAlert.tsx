import React from "react";
import { Alert, Checkbox, Tag, Space } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import type { Machine } from "../types";
import { MACHINE_TYPE_COLOR } from "../constants";

interface MachineConflictAlertProps {
  conflictMachines: Machine[];
  acknowledged: boolean;
  onAcknowledge: (checked: boolean) => void;
}

const MachineConflictAlert: React.FC<MachineConflictAlertProps> = React.memo(
  ({ conflictMachines, acknowledged, onAcknowledge }) => {
    if (conflictMachines.length === 0) return null;

    return (
      <div style={{ marginBottom: 16 }}>
        <Alert
          message="Machine Conflict Detected"
          description={
            <div>
              <p>The following machines are currently busy or in error state:</p>
              <ul style={{ paddingLeft: 20, margin: "5px 0" }}>
                {conflictMachines.map((m) => (
                  <li key={m.id}>
                    <Space size={4}>
                      <b>{m.name}</b>
                      <Tag color={MACHINE_TYPE_COLOR[m.type]}>{m.type}</Tag>
                      <Tag color={m.status === "In Use" ? "orange" : "red"}>
                        {m.status}
                      </Tag>
                    </Space>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 10 }}>
                <Checkbox
                  checked={acknowledged}
                  onChange={(e) => onAcknowledge(e.target.checked)}
                >
                  <span style={{ fontWeight: 600 }}>
                    I acknowledge the machine conflict and want to proceed.
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

MachineConflictAlert.displayName = "MachineConflictAlert";

export default MachineConflictAlert;
