import React from "react";
import { Modal, Form, Input, InputNumber, Button, Space } from "antd";
import type { FormInstance } from "antd";
import type {
  StartJobFormValues,
  AssignmentType,
  ProductionLine,
  Machine,
} from "../types";
import AssignmentFields from "./AssignmentFields";
import { styles } from "../styles";

interface StartJobModalProps {
  open: boolean;
  form: FormInstance<StartJobFormValues>;
  lines: ProductionLine[];
  availableMachines: Machine[];
  onFinish: (values: StartJobFormValues) => void;
  onCancel: () => void;
}

const StartJobModal: React.FC<StartJobModalProps> = ({
  open,
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
      title="Start New Production Job"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={600}
    >
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="productName"
          label="Product Name"
          rules={[{ required: true, message: "Enter product name" }]}
        >
          <Input placeholder="e.g. Widget X-500" />
        </Form.Item>

        <Form.Item
          name="targetQty"
          label="Target Quantity"
          rules={[{ required: true, message: "Enter target quantity" }]}
        >
          <InputNumber style={{ width: "100%" }} min={1} placeholder="1000" />
        </Form.Item>

        <AssignmentFields
          assignmentType={assignmentType}
          lines={lines}
          availableMachines={availableMachines}
        />

        <Form.Item style={styles.formSubmit}>
          <Space>
            <Button onClick={onCancel}>Cancel</Button>
            <Button type="primary" htmlType="submit">
              Schedule Job
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default StartJobModal;
