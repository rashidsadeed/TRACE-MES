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
}

const AcceptOrderModal: React.FC<AcceptOrderModalProps> = ({
  open,
  order,
  form,
  lines,
  availableMachines,
  onFinish,
  onCancel,
}) => {
  const assignmentType = Form.useWatch("assignmentType", form) as
    | AssignmentType
    | undefined;

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

        <Form.Item style={styles.formSubmit}>
          <Space>
            <Button onClick={onCancel}>Cancel</Button>
            <Button type="primary" htmlType="submit">
              Confirm & Schedule
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default AcceptOrderModal;
