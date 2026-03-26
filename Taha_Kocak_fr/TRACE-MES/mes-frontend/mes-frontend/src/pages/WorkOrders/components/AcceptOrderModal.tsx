import React from "react";
import {
  Modal, Form, Input, InputNumber, DatePicker, Button, Row, Col, Space, Typography,
} from "antd";
import type { FormInstance } from "antd";
import type { Dayjs } from "dayjs";
import type {
  WorkOrder, OrderRequest, AcceptOrderFormValues,
  AssignmentType, LineInfo, MachineInfo,
} from "../types";
import { PrioritySelect } from "./FormSelects";
import AssignmentFields from "./AssignmentFields";
import ConflictAlert from "./ConflictAlert";
import { styles } from "../styles";

const { Text } = Typography;

interface AcceptOrderModalProps {
  open: boolean;
  request: OrderRequest | null;
  form: FormInstance<AcceptOrderFormValues>;
  onFinish: (values: AcceptOrderFormValues) => void;
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

const AcceptOrderModal: React.FC<AcceptOrderModalProps> = ({
  open,
  request,
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
    title={`Plan Order: ${request?.product ?? ""}`}
    open={open}
    onCancel={onCancel}
    footer={null}
    width={640}
  >
    {request && (
      <div style={styles.clientInfoBox}>
        <Text type="secondary">Client: {request.client}</Text>
        <br />
        <Text type="secondary">Requested Qty: {request.quantity}</Text>
      </div>
    )}

    <Form form={form} layout="vertical" onFinish={onFinish}>
      {/* Hidden fields to carry data */}
      <Form.Item name="product" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="quantity" hidden>
        <InputNumber />
      </Form.Item>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="priority"
            label="Set Priority"
            rules={[{ required: true, message: "Priority is required" }]}
          >
            <PrioritySelect />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="dueDate"
            label="Confirm Due Date"
            rules={[{ required: true, message: "Due date is required" }]}
          >
            <DatePicker style={{ width: "100%" }} onChange={onDateChange} />
          </Form.Item>
        </Col>
      </Row>

      {/* Assignment Fields (Line / Machine / Custom Line) */}
      <AssignmentFields
        assignmentType={assignmentType}
        lines={lines}
        availableMachines={availableMachines}
      />

      <ConflictAlert
        conflicts={dateConflicts}
        acknowledged={conflictAcknowledged}
        onAcknowledge={onConflictAcknowledge}
      />

      <Form.Item style={styles.submitRightWithMargin}>
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

export default AcceptOrderModal;
