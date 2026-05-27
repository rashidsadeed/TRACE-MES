import React, { useState } from "react";
import { Form, Input, InputNumber, Button, Upload, Card, Typography, message } from "antd";
import { InboxOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";

const { Title } = Typography;
const { Dragger } = Upload;
const { TextArea } = Input;

const NewOrder: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState<any[]>([]);
  const navigate = useNavigate();

  const onFinish = async (values: any) => {
    const formData = new FormData();
    formData.append("title", values.title || "");
    formData.append("description", values.description || "");
    formData.append("quantity", values.quantity.toString());
    
    if (fileList.length > 0) {
      const fileToUpload = fileList[0].originFileObj || fileList[0];
      formData.append("file_3d", fileToUpload);
    }

    setLoading(true);
    try {
      await apiClient.post("/orders/requests/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      message.success("Order request submitted successfully");
      navigate("/customer/orders");
    } catch (error) {
      message.error("Failed to submit order request");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const uploadProps = {
    onRemove: () => {
      setFileList([]);
    },
    beforeUpload: (file: any) => {
      const isStlOrObj = file.name.endsWith(".stl") || file.name.endsWith(".obj");
      if (!isStlOrObj) {
        message.error("You can only upload .stl or .obj files!");
        return Upload.LIST_IGNORE;
      }
      setFileList([file]);
      return false; // Prevent automatic upload
    },
    fileList,
    maxCount: 1,
    accept: ".stl,.obj",
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate("/customer/orders")}
        style={{ marginBottom: 16 }}
      >
        Back to Orders
      </Button>

      <Card>
        <Title level={3} style={{ marginTop: 0, marginBottom: 24 }}>
          Create New Order
        </Title>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ quantity: 1 }}
        >
          <Form.Item
            label="Quantity"
            name="quantity"
            rules={[{ required: true, message: "Please enter a quantity" }]}
          >
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item
            label="Order Name / Title"
            name="title"
            rules={[{ required: true, message: "Please enter a name for your order" }]}
          >
            <Input placeholder="e.g. Aluminum Bracket Batch 1" />
          </Form.Item>

          <Form.Item
            label="Description & Requirements"
            name="description"
          >
            <TextArea rows={4} placeholder="Describe any specific requirements, materials, or tolerances..." />
          </Form.Item>

          <Form.Item label="3D Model (.stl, .obj) (Optional)">
            <Dragger {...uploadProps}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag file to this area to upload</p>
              <p className="ant-upload-hint">
                Support for a single .stl or .obj file upload.
              </p>
            </Dragger>
          </Form.Item>

          <Form.Item style={{ marginTop: 32, marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              Submit Order Request
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default NewOrder;
