import React from "react";
import {
  Modal, Form, Input, InputNumber, DatePicker, Button, Row, Col,
} from "antd";
import type { FormInstance } from "antd";
import type { Dayjs } from "dayjs";
import type {
  WorkOrder, CreateOrderFormValues, AssignmentType, LineInfo, MachineInfo,
} from "../types";
import { PrioritySelect } from "./FormSelects";
import AssignmentFields from "./AssignmentFields";
import ConflictAlert from "./ConflictAlert";
import { styles } from "../styles";

interface CreateOrderModalProps {
  open: boolean;
  form: FormInstance<CreateOrderFormValues>;
  onFinish: (values: CreateOrderFormValues) => void;
  onCancel: () => void;
  // Assignment
  assignmentType: AssignmentType | undefined;
  lines: LineInfo[];
  availableMachines: MachineInfo[];
  // Conflict
  dateConflicts: WorkOrder[];
  conflictAcknowledged: boolean;
  onConflictAcknowledge: (checked: boolean) => void;
  onDateChange: (date: Dayjs | null) => void;
  isSubmitBlocked: boolean;
}

const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
  open,
  form,
  onFinish,
  onCancel,
  assignmentType,
  lines,
  availableMachines,
  dateConflicts,
  conflictAcknowledged,
  onConflictAcknowledge,
  onDateChange,
  isSubmitBlocked,
}) => (
  <Modal
    title="Create New Work Order"
    open={open}
    onCancel={onCancel}
    footer={null}
    width={640}
  >
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <Form.Item
        name="product"
        label="Product Name"
        rules={[{ required: true, message: "Product name is required" }]}
      >
        <Input />
      </Form.Item>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="quantity"
            label="Quantity"
            rules={[{ required: true, message: "Quantity is required" }]}
          >
            <InputNumber style={{ width: "100%" }} min={1} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="priority" label="Priority" initialValue="Normal">
            <PrioritySelect />
          </Form.Item>
        </Col>
      </Row>

      {/* Assignment Fields (Line / Machine / Custom Line) */}
      <AssignmentFields
        assignmentType={assignmentType}
        lines={lines}
        availableMachines={availableMachines}
      />

      <Form.Item
        name="dueDate"
        label="Due Date"
        rules={[{ required: true, message: "Due date is required" }]}
      >
        <DatePicker style={{ width: "100%" }} onChange={onDateChange} />
      </Form.Item>

      <ConflictAlert
        conflicts={dateConflicts}
        acknowledged={conflictAcknowledged}
        onAcknowledge={onConflictAcknowledge}
      />

      <Form.Item style={styles.submitRight}>
        <Button type="primary" htmlType="submit" disabled={isSubmitBlocked}>
          Create
        </Button>
      </Form.Item>
    </Form>
  </Modal>
);

export default CreateOrderModal;
