import React from "react";
import { Modal, List, Button, Tag, Typography, Avatar, Space } from "antd";
import { InboxOutlined, EyeOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import type { PendingOrder } from "../types";

const { Text } = Typography;

const PRIORITY_COLOR: Record<string, string> = {
  High: "red",
  Normal: "blue",
  Low: "green",
};

interface PendingOrdersModalProps {
  open: boolean;
  orders: PendingOrder[];
  onCancel: () => void;
  onAssign: (order: PendingOrder) => void;
}

const PendingOrdersModal: React.FC<PendingOrdersModalProps> = ({
  open,
  orders,
  onCancel,
  onAssign,
}) => {
  const navigate = useNavigate();
  const displayOrders = orders.slice(0, 10);
  const totalOrders = orders.length;

  const handleGoToBacklog = () => {
    onCancel();
    navigate("/backlog", { state: { fromProduction: true } });
  };

  return (
    <Modal
      title="Production Backlog"
      open={open}
      onCancel={onCancel}
      width={700}
      footer={
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Button type="primary" onClick={handleGoToBacklog}>
            {totalOrders > 10 ? "Show All" : "Go to Backlog"}
          </Button>
        </div>
      }
    >
      <List
        itemLayout="horizontal"
        dataSource={displayOrders}
        locale={{ emptyText: "No pending orders available." }}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button
                key="assign"
                type="primary"
                size="small"
                onClick={() => onAssign(item)}
              >
                Schedule to Machine
              </Button>,
              <Button
                key="show"
                icon={<EyeOutlined />}
                size="small"
                onClick={handleGoToBacklog}
              >
                Show
              </Button>,
            ]}
          >
            <List.Item.Meta
              avatar={
                <Avatar
                  icon={<InboxOutlined />}
                  style={{ backgroundColor: "#1890ff" }}
                />
              }
              title={
                <Space>
                  <Text strong>{item.orderId}</Text>
                  <Text>{item.product}</Text>
                  <Tag color={PRIORITY_COLOR[item.priority]}>
                    {item.priority}
                  </Tag>
                </Space>
              }
              description={
                <>
                  <div>
                    Requested by: <b>{item.clientName || item.client}</b>
                    {item.approvedBy && (
                      <> | Approved by: <b>{item.approvedBy}</b></>
                    )}
                  </div>
                  <div>
                    Due Date: <b>{dayjs(item.dueDate).format("DD MMM YYYY, HH:mm")}</b> | Qty: {item.quantity.toLocaleString()}
                  </div>
                </>
              }
            />
          </List.Item>
        )}
      />
      {totalOrders > 10 && (
        <div style={{ textAlign: "center", marginTop: 12, color: "#888" }}>
          Showing 10 of {totalOrders} orders. Click "Show All" to see the rest.
        </div>
      )}
    </Modal>
  );
};

export default PendingOrdersModal;
