import React, { useState } from "react";
import { Modal, List, Button, Avatar, Typography, Input } from "antd";
import { UserOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import type { OrderRequest } from "../types";

const { Text } = Typography;
const { TextArea } = Input;

interface RequestListModalProps {
  open: boolean;
  requests: OrderRequest[];
  onCancel: () => void;
  onAccept: (request: OrderRequest) => void;
  onDecline: (key: string, reason?: string) => void;
}

const RequestListModal: React.FC<RequestListModalProps> = ({
  open,
  requests,
  onCancel,
  onAccept,
  onDecline,
}) => {
  const [declineTarget, setDeclineTarget] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  const handleDeclineClick = (key: string) => {
    setDeclineTarget(key);
    setDeclineReason("");
  };

  const handleDeclineConfirm = () => {
    if (declineTarget) {
      onDecline(declineTarget, declineReason.trim() || undefined);
      setDeclineTarget(null);
      setDeclineReason("");
    }
  };

  const handleDeclineCancel = () => {
    setDeclineTarget(null);
    setDeclineReason("");
  };

  return (
    <>
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
                  onClick={() => handleDeclineClick(item.key)}
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

      {/* Decline Confirmation Modal */}
      <Modal
        title={
          <span>
            <ExclamationCircleOutlined style={{ color: "#faad14", marginRight: 8 }} />
            Confirm Decline
          </span>
        }
        open={declineTarget !== null}
        onOk={handleDeclineConfirm}
        onCancel={handleDeclineCancel}
        okText="Decline Order"
        okButtonProps={{ danger: true }}
        cancelText="Cancel"
        width={480}
      >
        <p style={{ marginBottom: 12 }}>
          Are you sure you want to decline this order request? This action cannot be undone.
        </p>
        <TextArea
          rows={3}
          placeholder="Reason for declining (optional)..."
          value={declineReason}
          onChange={(e) => setDeclineReason(e.target.value)}
          maxLength={500}
          showCount
        />
      </Modal>
    </>
  );
};

export default RequestListModal;
