import React, { useEffect } from "react";
import { Modal, Form, InputNumber, DatePicker, Row, Col } from "antd";
import type { FormInstance } from "antd";
import type { ProductionJob, Machine, ProductionLine } from "../types";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";

export interface EditJobFormValues {
  targetQty: number;
  dueDate: Dayjs | null;
}

interface EditJobModalProps {
  open: boolean;
  form: FormInstance<EditJobFormValues>;
  job: ProductionJob | null;
  lines: ProductionLine[];
  availableMachines: Machine[];
  onFinish: (values: EditJobFormValues) => void;
  onCancel: () => void;
}

const EditJobModal: React.FC<EditJobModalProps> = ({
  open,
  form,
  job,
  onFinish,
  onCancel,
}) => {
  useEffect(() => {
    if (open && job) {
      form.setFieldsValue({
        targetQty: job.targetQty,
        dueDate: job.dueDate ? dayjs(job.dueDate) : null,
      });
    }
  }, [open, job, form]);

  return (
    <Modal
      title={`Edit Job: ${job?.id || ""}`}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText="Save Changes"
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{ targetQty: 1 }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="targetQty"
              label="Target Quantity"
              rules={[
                { required: true, message: "Please enter target quantity" },
                { type: "number", min: 1, message: "Must be at least 1" },
              ]}
            >
              <InputNumber style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="dueDate"
              label="Due Date"
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default EditJobModal;
