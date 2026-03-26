import React from "react";
import { Modal, List, Button, Tag, Typography, Avatar, Space } from "antd";
import { InboxOutlined } from "@ant-design/icons";
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
}) => (
  <Modal
    title="Pending Orders — Ready for Production"
    open={open}
    onCancel={onCancel}
    footer={null}
    width={650}
  >
    <List
      itemLayout="horizontal"
      dataSource={orders}
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
              Assign to Production
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
                <Tag color={PRIORITY_COLOR[item.priority]}>
                  {item.priority}
                </Tag>
              </Space>
            }
            description={
              <>
                <div>
                  Client: <b>{item.client}</b> — Product: <b>{item.product}</b>
                </div>
                <div>
                  Qty: {item.quantity.toLocaleString()} | Due: {item.dueDate}
                </div>
              </>
            }
          />
        </List.Item>
      )}
    />
  </Modal>
);

export default PendingOrdersModal;
