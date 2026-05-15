import React, { useState, useMemo, useCallback } from "react";
import { Button, Modal, Tag, Space, Typography, Popconfirm } from "antd";
import { StopOutlined, ExclamationCircleFilled } from "@ant-design/icons";
import type { ProductionJob, Machine, ProductionLine } from "../types";
import { MACHINE_TYPE_COLOR } from "../constants";

const { Text } = Typography;

interface EmergencyStopBarProps {
  jobs: ProductionJob[];
  machines: Machine[];
  lines: ProductionLine[];
  hasRunningJobs: boolean;
  onStopAll: () => void;
}

const EmergencyStopBar: React.FC<EmergencyStopBarProps> = ({
  jobs,
  machines,
  lines,
  hasRunningJobs,
  onStopAll,
}) => {
  const [infoVisible, setInfoVisible] = useState(false);

  const runningJobs = useMemo(
    () => jobs.filter((j) => j.status === "Running"),
    [jobs],
  );
  const activeMachines = useMemo(
    () => machines.filter((m) => m.status === "In Use"),
    [machines],
  );
  const activeLines = useMemo(
    () => lines.filter((l) => l.status === "Active"),
    [lines],
  );

  const handleConfirmStop = useCallback(() => {
    setInfoVisible(false);
    onStopAll();
  }, [onStopAll]);

  return (
    <>
      <Button
        danger
        type="primary"
        icon={<StopOutlined />}
        disabled={!hasRunningJobs}
        onClick={() => setInfoVisible(true)}
        style={{
          fontWeight: 700,
          height: 40,
          paddingInline: 20,
          borderRadius: 6,
        }}
      >
        Emergency Stop All
      </Button>

      {/* Info + Confirm Modal */}
      <Modal
        open={infoVisible}
        onCancel={() => setInfoVisible(false)}
        centered
        width={520}
        title={
          <span style={{ color: "#ff4d4f", fontWeight: 700, fontSize: 16 }}>
            <ExclamationCircleFilled style={{ marginRight: 8 }} />
            Emergency Stop All
          </span>
        }
        footer={
          <Space>
            <Button onClick={() => setInfoVisible(false)}>Cancel</Button>
            <Popconfirm
              title="Are you sure?"
              description="All machines will require manual restart."
              okText="CONFIRM STOP"
              okButtonProps={{ danger: true }}
              onConfirm={handleConfirmStop}
            >
              <Button
                danger
                type="primary"
                icon={<StopOutlined />}
                style={{ fontWeight: 700 }}
              >
                Stop All
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        <Text style={{ display: "block", marginBottom: 16 }}>
          The following will be halted immediately:
        </Text>

        <div style={{ marginBottom: 12 }}>
          <Text strong>Running Jobs ({runningJobs.length})</Text>
          <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {runningJobs.map((j) => (
              <Tag key={j.key} color="red">
                {j.id} — {j.productName}
              </Tag>
            ))}
            {runningJobs.length === 0 && <Text type="secondary">None</Text>}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <Text strong>Active Lines ({activeLines.length})</Text>
          <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {activeLines.map((l) => (
              <Tag key={l.key} color="geekblue">
                {l.id} — {l.name}
              </Tag>
            ))}
            {activeLines.length === 0 && <Text type="secondary">None</Text>}
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <Text strong>Active Machines ({activeMachines.length})</Text>
          <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {activeMachines.map((m) => (
              <Tag key={m.key} color={MACHINE_TYPE_COLOR[m.type]}>
                {m.id} ({m.type})
              </Tag>
            ))}
            {activeMachines.length === 0 && <Text type="secondary">None</Text>}
          </div>
        </div>
      </Modal>
    </>
  );
};

export default React.memo(EmergencyStopBar);
