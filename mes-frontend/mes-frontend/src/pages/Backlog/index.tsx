import React, { useState } from "react";
import { Table, Typography, Tag, Button, Space, Row, Col, Empty } from "antd";
import { ArrowLeftOutlined, ReloadOutlined, DeleteOutlined } from "@ant-design/icons";
import { Modal, Input, message } from "antd";
import apiClient from "../../services/apiClient";
import { useLocation, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { useProduction } from "../Production/hooks/useProduction";
import type { PendingOrder } from "../Production/types";
import ProductVisualizer from "../Production/components/ProductVisualizer";
import AcceptOrderModal from "../Production/components/AcceptOrderModal";

const { Title, Text } = Typography;

const PRIORITY_COLOR: Record<string, string> = {
  High: "red",
  Normal: "blue",
  Low: "green",
};

const BacklogPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fromProduction = location.state?.fromProduction === true;

  const {
    pendingOrders,
    lines,
    availableMachines,
    modal,
    acceptOrderForm,
    openAcceptOrderModal,
    closeModal,
    handleAcceptOrder,
    conflictMachines,
    conflictAcknowledged,
    setConflictAcknowledged,
    checkMachineConflicts,
    isConflictBlocked,
  } = useProduction();

  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState<PendingOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [tableParams, setTableParams] = useState({ current: 1, pageSize: 10 });

  
  const handleCancelClick = (order: PendingOrder) => {
    setCancellingOrder(order);
    setCancelReason("");
    setCancelModalVisible(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancellingOrder) return;
    try {
      await apiClient.post(`/workorders/${cancellingOrder.key}/cancel/`, { reason: cancelReason });
      message.success("Order cancelled and customer notified.");
      setCancelModalVisible(false);
      setCancellingOrder(null);
      window.location.reload();
    } catch (err) {
      console.error(err);
      message.error("Failed to cancel order.");
    }
  };

  const columns = [
    {
      title: "Work Order",
      dataIndex: "orderId",
      key: "orderId",
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: "Product",
      dataIndex: "product",
      key: "product",
    },
    {
      title: "Client",
      key: "client",
      render: (_: any, record: PendingOrder) => record.clientName || record.client,
    },
    {
      title: "Approved By",
      dataIndex: "approvedBy",
      key: "approvedBy",
      render: (text: string) => text || "Unknown",
    },
    {
      title: "Quantity",
      dataIndex: "quantity",
      key: "quantity",
      render: (qty: number) => qty.toLocaleString(),
    },
    {
      title: "Priority",
      dataIndex: "priority",
      key: "priority",
      render: (priority: string) => (
        <Tag color={PRIORITY_COLOR[priority]}>{priority}</Tag>
      ),
    },
    {
      title: "Due Date",
      dataIndex: "dueDate",
      key: "dueDate",
      render: (date: string) => dayjs(date).format("DD MMM YYYY, HH:mm"),
    },
    {
            title: "Action",
      key: "action",
      render: (_: any, record: PendingOrder) => (
        <Space>
          <Button type="primary" onClick={() => openAcceptOrderModal(record)}>
            Schedule to Machine
          </Button>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleCancelClick(record)}
          />
        </Space>
      ),
    },
  ];

  const expandedRowRender = (record: PendingOrder) => (
    <div style={{ padding: "24px 48px", backgroundColor: "#fafafa", borderTop: "1px solid #f0f0f0" }}>
      <Row gutter={24}>
        <Col span={12}>
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">Client Details: </Text>
            <Text strong>{record.clientName || record.client}</Text>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">Priority: </Text>
            <Tag color={PRIORITY_COLOR[record.priority]}>{record.priority}</Tag>
          </div>
        </Col>
        <Col span={12}>
          {record.fileGlbUrl ? (
            <ProductVisualizer status="Pending Review" modelUrl={record.fileGlbUrl} />
          ) : (
            <Empty
              description={
                record.file3dUrl ? (
                  <Space direction="vertical" align="center">
                    <Text>3D Model is being processed or not in GLB format</Text>
                  </Space>
                ) : (
                  "No 3D Model available"
                )
              }
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </Col>
      </Row>
    </div>
  );

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <Space align="center" size="middle">
          {fromProduction && (
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate("/production")}
            >
              Back to Production
            </Button>
          )}
          <Title level={2} style={{ margin: 0 }}>Production Backlog</Title>
        </Space>
      </div>

      <Table
        dataSource={pendingOrders}
        columns={columns}
        rowKey="key"
        pagination={{
          current: tableParams.current,
          pageSize: tableParams.pageSize,
          onChange: (page, pageSize) => setTableParams({ current: page, pageSize }),
          showSizeChanger: true,
        }}
        expandable={{
          expandedRowRender,
          expandedRowKeys,
          onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as string[]),
        }}
      />


      <Modal
        title="Cancel Order"
        open={cancelModalVisible}
        onOk={handleConfirmCancel}
        onCancel={() => setCancelModalVisible(false)}
        okText="Cancel Order"
        okButtonProps={{ danger: true }}
      >
        <p>Please enter a reason for cancelling this order (this will be sent to the customer):</p>
        <Input.TextArea
          rows={4}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="e.g., We cannot fulfill this order at the moment."
        />
      </Modal>

      <AcceptOrderModal
        open={modal.type === "acceptOrder"}
        order={modal.type === "acceptOrder" ? modal.order : null}
        form={acceptOrderForm}
        lines={lines}
        availableMachines={availableMachines}
        onFinish={async (values) => {
          await handleAcceptOrder(values);
          // Optional: refresh backlog logic is inside useProduction
        }}
        onCancel={closeModal}
        conflictMachines={conflictMachines}
        conflictAcknowledged={conflictAcknowledged}
        onConflictAcknowledge={setConflictAcknowledged}
        onAssignmentChange={checkMachineConflicts}
        isSubmitBlocked={isConflictBlocked}
      />
    </div>
  );
};

export default BacklogPage;
