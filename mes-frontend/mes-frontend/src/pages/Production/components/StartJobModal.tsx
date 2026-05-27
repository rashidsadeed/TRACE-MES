import React from "react";
import { Modal, Form, Input, InputNumber, Button, Space, Select, DatePicker, Row, Col, AutoComplete } from "antd";
import type { FormInstance } from "antd";
import dayjs from "dayjs";
import type {
  StartJobFormValues,
  AssignmentType,
  ProductionLine,
  Machine,
} from "../types";
import AssignmentFields from "./AssignmentFields";
import MachineConflictAlert from "./MachineConflictAlert";
import { styles } from "../styles";

interface StartJobModalProps {
  open: boolean;
  form: FormInstance<StartJobFormValues>;
  lines: ProductionLine[];
  availableMachines: Machine[];
  parts: any[];
  onFinish: (values: StartJobFormValues) => void;
  onCancel: () => void;
  // Conflict
  conflictMachines: Machine[];
  conflictAcknowledged: boolean;
  onConflictAcknowledge: (checked: boolean) => void;
  onAssignmentChange: (assignmentType: string, values: Record<string, unknown>) => void;
  isSubmitBlocked: boolean;
}

const StartJobModal: React.FC<StartJobModalProps> = ({
  open,
  form,
  lines,
  availableMachines,
  parts,
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
          <AutoComplete
            options={parts.map((p) => ({ value: p.name }))}
            placeholder="e.g. Widget X-500 (type any name)"
            filterOption={(inputValue, option) =>
              option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
            }
          />
        </Form.Item>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="targetQty"
              label="Target Quantity"
              rules={[{ required: true, message: "Enter target quantity" }]}
            >
              <InputNumber style={{ width: "100%" }} min={1} placeholder="1000" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="priority"
              label="Priority"
              initialValue="Normal"
              rules={[{ required: true, message: "Select priority" }]}
            >
              <Select>
                <Select.Option value="High">High</Select.Option>
                <Select.Option value="Normal">Normal</Select.Option>
                <Select.Option value="Low">Low</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="dueDate"
              label="Due Date"
              rules={[{ required: true, message: "Select due date" }]}
            >
              <DatePicker
                style={{ width: "100%" }}
                disabledDate={(current) => current && current < dayjs().startOf('day')}
              />
            </Form.Item>
          </Col>
        </Row>

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
              Schedule Job
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default StartJobModal;
