import React from "react";
import { Button, Space, Badge, Typography } from "antd";
import { PlusOutlined, BellOutlined } from "@ant-design/icons";
import { useWorkOrders } from "./hooks/useWorkOrders";
import {
  OrderStats,
  OrdersTable,
  DeadlineAlert,
  CreateOrderModal,
  RequestListModal,
  AcceptOrderModal,
} from "./components";
import { styles } from "./styles";

const { Title } = Typography;

const WorkOrders: React.FC = () => {
  const {
    orders,
    requests,
    stats,
    upcomingDeadlines,
    lines,
    allMachines,
    availableMachines,
    modal,
    openCreateModal,
    openRequestList,
    openAcceptModal,
    closeModal,
    createAssignmentType,
    acceptAssignmentType,
    dateConflicts,
    conflictAcknowledged,
    setConflictAcknowledged,
    checkDateConflicts,
    isSubmitBlocked,
    createForm,
    acceptForm,
    handleCreateOrder,
    handleAcceptRequest,
    handleDeleteOrder,
    handleDeclineRequest,
  } = useWorkOrders();

  return (
    <div>
      {/* Statistics Cards */}
      <OrderStats stats={stats} />

      {/* Header: Title + Alert + Actions */}
      <div style={styles.pageHeader}>
        <Title level={3} style={styles.pageTitle}>
          Work Orders
        </Title>

        <DeadlineAlert deadlines={upcomingDeadlines} />

        <Space>
          <Badge count={requests.length} offset={[-5, 5]}>
            <Button icon={<BellOutlined />} onClick={openRequestList}>
              Order Requests
            </Button>
          </Badge>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreateModal}
          >
            Create Order
          </Button>
        </Space>
      </div>

      {/* Orders Table */}
      <OrdersTable
        orders={orders}
        lines={lines}
        machines={allMachines}
        onDelete={handleDeleteOrder}
      />

      {/* Modal: Create Order */}
      <CreateOrderModal
        open={modal.type === "create"}
        form={createForm}
        onFinish={handleCreateOrder}
        onCancel={closeModal}
        assignmentType={createAssignmentType}
        lines={lines}
        availableMachines={availableMachines}
        dateConflicts={dateConflicts}
        conflictAcknowledged={conflictAcknowledged}
        onConflictAcknowledge={setConflictAcknowledged}
        onDateChange={checkDateConflicts}
        isSubmitBlocked={isSubmitBlocked}
      />

      {/* Modal: Request List */}
      <RequestListModal
        open={modal.type === "requestList"}
        requests={requests}
        onCancel={closeModal}
        onAccept={openAcceptModal}
        onDecline={handleDeclineRequest}
      />

      {/* Modal: Accept & Configure */}
      <AcceptOrderModal
        open={modal.type === "accept"}
        request={modal.type === "accept" ? modal.request : null}
        form={acceptForm}
        onFinish={handleAcceptRequest}
        onCancel={closeModal}
        assignmentType={acceptAssignmentType}
        lines={lines}
        availableMachines={availableMachines}
        dateConflicts={dateConflicts}
        conflictAcknowledged={conflictAcknowledged}
        onConflictAcknowledge={setConflictAcknowledged}
        onDateChange={checkDateConflicts}
        isSubmitBlocked={isSubmitBlocked}
      />
    </div>
  );
};

export default WorkOrders;
