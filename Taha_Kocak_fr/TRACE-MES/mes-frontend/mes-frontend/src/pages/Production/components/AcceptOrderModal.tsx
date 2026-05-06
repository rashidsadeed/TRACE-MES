import React from "react";
import { Modal, Form, Button, Space, Typography, Tag } from "antd";
import type { FormInstance } from "antd";
import type {
  AcceptOrderFormValues,
  AssignmentType,
  PendingOrder,
  ProductionLine,
  Machine,
} from "../types";
import AssignmentFields from "./AssignmentFields";
import MachineConflictAlert from "./MachineConflictAlert";
import { styles } from "../styles";

const { Text } = Typography;

const PRIORITY_COLOR: Record<string, string> = {
  High: "red",
  Normal: "blue",
  Low: "green",
};

interface AcceptOrderModalProps {
  open: boolean;
  order: PendingOrder | null;
  form: FormInstance<AcceptOrderFormValues>;
  lines: ProductionLine[];
  availableMachines: Machine[];
  onFinish: (values: AcceptOrderFormValues) => void;
  onCancel: () => void;
  // Conflict
  conflictMachines: Machine[];
  conflictAcknowledged: boolean;
  onConflictAcknowledge: (checked: boolean) => void;
  onAssignmentChange: (assignmentType: string, values: Record<string, unknown>) => void;
  isSubmitBlocked: boolean;
}

const AcceptOrderModal: React.FC<AcceptOrderModalProps> = ({
  open,
  order,
  form,
  lines,
  availableMachines,
  onFinish,
  onCancel,
  conflictMachines,
  conflictAcknowledged,
  onConflictAcknowledge,
  onAssignmentChange,
  isSubmitBlocked,
}) => {
  const assignmentType = Form.useWatch("assignmentType", form) as
    | AssignmentType
    | undefined;

  // Watch assignment-related fields for conflict checking
  const lineId = Form.useWatch("lineId", form);
  const machineIds = Form.useWatch("machineIds", form);
  const customMachineIds = Form.useWatch("customMachineIds", form);

  React.useEffect(() => {
    if (assignmentType) {
      onAssignmentChange(assignmentType, { lineId, machineIds, customMachineIds });
    }
  }, [assignmentType, lineId, machineIds, customMachineIds, onAssignmentChange]);

  return (
    <Modal
      title={`Assign Order: ${order?.orderId ?? ""}`}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={600}
    >
      {order && (
        <div style={styles.orderInfoBox}>
          <Space direction="vertical" size={4}>
            <Text>
              Client: <b>{order.client}</b>
            </Text>
            <Text>
              Product: <b>{order.product}</b>
            </Text>
            <Text>
              Quantity: <b>{order.quantity.toLocaleString()}</b> | Due:{" "}
              <b>{order.dueDate}</b>
            </Text>
            <Tag color={PRIORITY_COLOR[order.priority]}>
              {order.priority} Priority
            </Tag>
          </Space>
        </div>
      )}

      <Form form={form} layout="vertical" onFinish={onFinish}>
        <AssignmentFields
          assignmentType={assignmentType}
          lines={lines}
          availableMachines={availableMachines}
        />

        <MachineConflictAlert
          conflictMachines={conflictMachines}
          acknowledged={conflictAcknowledged}
          onAcknowledge={onConflictAcknowledge}
        />

        <Form.Item style={styles.formSubmit}>
          <Space>
            <Button onClick={onCancel}>Cancel</Button>
            <Button type="primary" htmlType="submit" disabled={isSubmitBlocked}>
              Confirm & Schedule
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default AcceptOrderModal;
