import React from "react";
import { Modal, List, Button, Avatar, Typography } from "antd";
import { UserOutlined } from "@ant-design/icons";
import type { OrderRequest } from "../types";

const { Text } = Typography;

interface RequestListModalProps {
  open: boolean;
  requests: OrderRequest[];
  onCancel: () => void;
  onAccept: (request: OrderRequest) => void;
  onDecline: (key: string) => void;
}

const RequestListModal: React.FC<RequestListModalProps> = ({
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

export default RequestListModal;
