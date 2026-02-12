import React from "react";
import {
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  DatePicker,
  Button,
  Space,
  Row,
  Col,
  List,
  Avatar,
  Alert,
  Checkbox,
  Typography,
  Tag,
} from "antd";
import type { FormInstance } from "antd";
import type { Dayjs } from "dayjs";
import { UserOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import type {
  WorkOrder,
  OrderRequest,
  OrderFormValues,
} from "./useWorkOrders";
import { PRIORITY_OPTIONS, LINE_OPTIONS, PRIORITY_COLOR } from "./useWorkOrders";

const { Text } = Typography;

// ==========================================
// Shared: Conflict Alert (dosya-seviyesinde, render içinde DEĞİL)
// ==========================================

interface ConflictAlertProps {
  conflicts: WorkOrder[];
  acknowledged: boolean;
  onAcknowledge: (checked: boolean) => void;
}

const ConflictAlert: React.FC<ConflictAlertProps> = ({
  conflicts,
  acknowledged,
  onAcknowledge,
}) => {
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
                  <Tag color={PRIORITY_COLOR[c.priority]}>{c.priority}</Tag>
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
};

// ==========================================
// Shared: Select helpers (DRY)
// ==========================================

const PrioritySelect = () => (
  <Select>
    {PRIORITY_OPTIONS.map((p) => (
      <Select.Option key={p} value={p}>
        {p}
      </Select.Option>
    ))}
  </Select>
);

const LineSelect = () => (
  <Select placeholder="Select Line">
    {LINE_OPTIONS.map((l) => (
      <Select.Option key={l} value={l}>
        {l}
      </Select.Option>
    ))}
  </Select>
);

// ==========================================
// Shared conflict props (her iki modal da kullanıyor)
// ==========================================

interface ConflictProps {
  dateConflicts: WorkOrder[];
  conflictAcknowledged: boolean;
  onConflictAcknowledge: (checked: boolean) => void;
  onDateChange: (date: Dayjs | null) => void;
  isSubmitBlocked: boolean;
}

// ==========================================
// Modal 1: Create Order
// ==========================================

interface CreateOrderModalProps extends ConflictProps {
  open: boolean;
  form: FormInstance<OrderFormValues>;
  onFinish: (values: OrderFormValues) => void;
  onCancel: () => void;
}

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
  open,
  form,
  onFinish,
  onCancel,
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
    destroyOnClose
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

      <Form.Item
        name="assignedLine"
        label="Assigned Line"
        rules={[{ required: true, message: "Line is required" }]}
      >
        <LineSelect />
      </Form.Item>

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

      <Form.Item style={{ textAlign: "right" }}>
        <Button type="primary" htmlType="submit" disabled={isSubmitBlocked}>
          Create
        </Button>
      </Form.Item>
    </Form>
  </Modal>
);

// ==========================================
// Modal 2: Request List
// ==========================================

interface RequestListModalProps {
  open: boolean;
  requests: OrderRequest[];
  onCancel: () => void;
  onAccept: (request: OrderRequest) => void;
  onDecline: (key: string) => void;
}

export const RequestListModal: React.FC<RequestListModalProps> = ({
  open,
  requests,
  onCancel,
  onAccept,
  onDecline,
}) => (
  <Modal
    title="Incoming Order Requests"
    open={open}
    onCancel={onCancel}
    footer={null}
    width={600}
  >
    <List
      itemLayout="horizontal"
      dataSource={requests}
      locale={{ emptyText: "No pending requests." }}
      renderItem={(item) => (
        <List.Item
          actions={[
            <Button
              key="decline"
              type="link"
              danger
              onClick={() => onDecline(item.key)}
            >
              Decline
            </Button>,
            <Button
              key="accept"
              type="primary"
              size="small"
              onClick={() => onAccept(item)}
            >
              Accept & Plan
            </Button>,
          ]}
        >
          <List.Item.Meta
            avatar={
              <Avatar
                icon={<UserOutlined />}
                style={{ backgroundColor: "#87d068" }}
              />
            }
            title={<Text strong>{item.client}</Text>}
            description={
              <>
                <div>
                  Product: <b>{item.product}</b>
                </div>
                <div>
                  Qty: {item.quantity} | Req. Date: {item.requestedDate}
                </div>
              </>
            }
          />
        </List.Item>
      )}
    />
  </Modal>
);

// ==========================================
// Modal 3: Accept & Configure
// ==========================================

interface AcceptOrderModalProps extends ConflictProps {
  open: boolean;
  request: OrderRequest | null;
  form: FormInstance<OrderFormValues>;
  onFinish: (values: OrderFormValues) => void;
  onCancel: () => void;
}

export const AcceptOrderModal: React.FC<AcceptOrderModalProps> = ({
  open,
  request,
  form,
  onFinish,
  onCancel,
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
    destroyOnClose
  >
    {request && (
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          background: "#f5f5f5",
          borderRadius: 4,
        }}
      >
        <Text type="secondary">Client: {request.client}</Text>
        <br />
        <Text type="secondary">Requested Qty: {request.quantity}</Text>
      </div>
    )}

    <Form form={form} layout="vertical" onFinish={onFinish}>
      <Form.Item name="product" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="quantity" hidden>
        <InputNumber />
      </Form.Item>

      <Form.Item
        name="assignedLine"
        label="Assign Production Line"
        rules={[{ required: true, message: "Line is required" }]}
      >
        <LineSelect />
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

      <ConflictAlert
        conflicts={dateConflicts}
        acknowledged={conflictAcknowledged}
        onAcknowledge={onConflictAcknowledge}
      />

      <Form.Item style={{ textAlign: "right", marginTop: 16 }}>
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
