import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  ExclamationCircleOutlined,
  InboxOutlined,
  ReloadOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import erpService, {
  type ImportResult,
  type SAPOrder,
  type SkippedRow,
} from "../../services/erpService";

const { Title, Text } = Typography;
const { Dragger } = Upload;

const PRIORITY_LABEL: Record<string, { color: string; label: string }> = {
  A: { color: "red", label: "A — High" },
  B: { color: "orange", label: "B — Medium" },
};

const SYNC_STATUS_CONFIG: Record<
  string,
  { color: string; icon: React.ReactNode; label: string }
> = {
  PENDING: { color: "warning", icon: <SyncOutlined />, label: "Pending" },
  SYNCED: { color: "success", icon: <CheckCircleOutlined />, label: "Synced" },
  ERROR: {
    color: "error",
    icon: <ExclamationCircleOutlined />,
    label: "Error",
  },
};

const SKIP_REASON_LABEL: Record<string, string> = {
  duplicate: "already imported",
  missing_material_no: "missing Material No",
};

const ERPIntegration: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<SAPOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const { data } = await erpService.listSAPOrders();
      setOrders(data);
    } catch {
      message.error("Failed to load SAP orders.");
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleImport = async () => {
    const file = fileList[0]?.originFileObj as File | undefined;
    if (!file) {
      message.warning("Please select an .xlsx file first.");
      return;
    }

    setImporting(true);
    setImportResult(null);
    setImportError(null);

    try {
      const { data } = await erpService.importSAPFile(file);
      setImportResult(data);
      setFileList([]);
      if (data.imported > 0) {
        message.success(`Imported ${data.imported} SAP order(s).`);
        fetchOrders();
      } else {
        message.info("No new records imported (all rows already exist or were empty).");
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Import failed. Check the file format.";
      setImportError(msg);
      message.error(msg);
    } finally {
      setImporting(false);
    }
  };

  const handleSync = async (record: SAPOrder) => {
    setSyncingIds((prev) => new Set(prev).add(record.id));
    try {
      const { data: updated } = await erpService.syncSAPOrder(record.id);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      message.success(
        `WorkOrder ${updated.synced_work_order_code ?? ""} created successfully.`
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Sync failed.";
      message.error(msg);
      fetchOrders();
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(record.id);
        return next;
      });
    }
  };

  const handleBulkSync = async () => {
    const pending = orders.filter((o) => o.sync_status === "PENDING");
    if (pending.length === 0) {
      message.info("No pending orders to sync.");
      return;
    }

    setBulkSyncing(true);
    setBulkProgress({ current: 0, total: pending.length });
    let success = 0;
    let failed = 0;

    for (const order of pending) {
      try {
        const { data: updated } = await erpService.syncSAPOrder(order.id);
        setOrders((prev) =>
          prev.map((o) => (o.id === updated.id ? updated : o))
        );
        success++;
      } catch {
        failed++;
      }
      setBulkProgress((prev) =>
        prev ? { ...prev, current: prev.current + 1 } : null
      );
    }

    setBulkSyncing(false);
    setBulkProgress(null);

    if (failed === 0) {
      message.success(`${success} synced successfully, ${failed} failed.`);
    } else {
      message.warning(`${success} synced successfully, ${failed} failed.`);
    }
  };

  const columns: ColumnsType<SAPOrder> = [
    {
      title: "SAP Order No",
      dataIndex: "sap_order_no",
      key: "sap_order_no",
      width: 130,
      render: (val, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{val}</Text>
          {record.line_item_no && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              Line: {record.line_item_no}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: "Material",
      key: "material",
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.material_name}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.material_no}
          </Text>
        </Space>
      ),
    },
    {
      title: "Qty",
      dataIndex: "po_quantity",
      key: "po_quantity",
      width: 70,
      align: "right",
      render: (val, record) => (
        <span>
          {val} <Text type="secondary">{record.unit}</Text>
        </span>
      ),
    },
    {
      title: "Delivery Date",
      dataIndex: "delivery_date",
      key: "delivery_date",
      width: 120,
      render: (val) =>
        val ? (
          <Text>{new Date(val).toLocaleDateString("tr-TR")}</Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "Delay (days)",
      dataIndex: "delay_days",
      key: "delay_days",
      width: 100,
      align: "right",
      render: (val) =>
        val > 0 ? (
          <Text type="danger">{val}</Text>
        ) : (
          <Text type="secondary">0</Text>
        ),
    },
    {
      title: "Priority",
      dataIndex: "priority",
      key: "priority",
      width: 110,
      render: (val, record) => {
        let finalPriority = 1;
        
        if (record.sync_status === "SYNCED" && record.resolved_priority != null) {
          finalPriority = record.resolved_priority;
        } else {
          const delay = record.delay_days || 0;
          if (delay >= 60) finalPriority = 3;
          else if (delay >= 30) finalPriority = 2;
          else finalPriority = val === "A" ? 3 : val === "B" ? 2 : 1;
        }

        if (finalPriority === 3) return <Tag color="red">High</Tag>;
        if (finalPriority === 2) return <Tag color="blue">Medium</Tag>;
        return <Tag color="default">Low</Tag>;
      },
    },

    {
      title: "Sync Status",
      dataIndex: "sync_status",
      key: "sync_status",
      width: 120,
      render: (val, record) => {
        const cfg = SYNC_STATUS_CONFIG[val] ?? SYNC_STATUS_CONFIG.PENDING;
        return (
          <Tooltip title={record.sync_error || undefined}>
            <Badge
              status={cfg.color as "warning" | "success" | "error"}
              text={
                <Text style={{ fontSize: 13 }}>
                  {cfg.icon} {cfg.label}
                </Text>
              }
            />
            {record.synced_work_order_code && (
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {record.synced_work_order_code}
                </Text>
              </div>
            )}
          </Tooltip>
        );
      },
    },
    {
      title: "Action",
      key: "action",
      width: 160,
      render: (_, record) => {
        const isSyncing = syncingIds.has(record.id) || bulkSyncing;
        const isSynced = record.sync_status === "SYNCED";
        return (
          <Button
            type="primary"
            size="small"
            icon={isSyncing ? <SyncOutlined spin /> : <CloudUploadOutlined />}
            disabled={isSynced || isSyncing}
            onClick={() => handleSync(record)}
          >
            {isSynced ? "Synced" : "Sync to WO"}
          </Button>
        );
      },
    },
  ];

  const pendingCount = orders.filter((o) => o.sync_status === "PENDING").length;
  const syncedCount = orders.filter((o) => o.sync_status === "SYNCED").length;
  const errorCount = orders.filter((o) => o.sync_status === "ERROR").length;

  const skippedList: SkippedRow[] = importResult?.skipped ?? [];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        SAP ERP Integration
      </Title>

      {/* Upload section */}
      <Card
        title="Import SAP Purchase Order Export"
        style={{ marginBottom: 24 }}
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            Accepts .xlsx files exported from SAP (Turkish column headers)
          </Text>
        }
      >
        <Row gutter={24} align="top">
          <Col xs={24} lg={14}>
            <Dragger
              accept=".xlsx"
              maxCount={1}
              fileList={fileList}
              beforeUpload={() => false}
              onChange={({ fileList: fl }) => setFileList(fl)}
              style={{ marginBottom: 16 }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">
                Click or drag an .xlsx file here to select it
              </p>
              <p className="ant-upload-hint">
                The file must contain SAP Purchase Order data with Turkish column
                headers (Sipariş No, Malzeme No, etc.)
              </p>
            </Dragger>

            <Button
              type="primary"
              icon={importing ? <SyncOutlined spin /> : <CloudUploadOutlined />}
              onClick={handleImport}
              loading={importing}
              disabled={fileList.length === 0}
              block
            >
              {importing ? "Importing…" : "Import File"}
            </Button>
          </Col>

          <Col xs={24} lg={10}>
            {importResult && (
              <Space direction="vertical" style={{ width: "100%" }}>
                <Alert
                  type={importResult.errors.length > 0 ? "warning" : "success"}
                  message="Import Complete"
                  description={
                    <Space direction="vertical" size={4} style={{ width: "100%" }}>
                      <Text>
                        <Text strong>{importResult.imported}</Text> row(s) imported
                      </Text>
                      <Text>
                        <Text strong>{skippedList.length}</Text> row(s) skipped
                      </Text>
                      {importResult.errors.length > 0 && (
                        <>
                          <Text type="danger">
                            <Text strong>{importResult.errors.length}</Text> error(s):
                          </Text>
                          <ul style={{ margin: 0, paddingLeft: 16 }}>
                            {importResult.errors.slice(0, 5).map((e, i) => (
                              <li key={i}>
                                <Text type="danger" style={{ fontSize: 12 }}>
                                  {e}
                                </Text>
                              </li>
                            ))}
                            {importResult.errors.length > 5 && (
                              <li>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  …and {importResult.errors.length - 5} more
                                </Text>
                              </li>
                            )}
                          </ul>
                        </>
                      )}
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Batch: {importResult.batch}
                      </Text>
                    </Space>
                  }
                  showIcon
                />

                {skippedList.length > 0 && (
                  <Alert
                    type="warning"
                    message={`${skippedList.length} row(s) skipped`}
                    description={
                      <Collapse
                        ghost
                        size="small"
                        items={[
                          {
                            key: "skipped",
                            label: "View skipped rows",
                            children: (
                              <ul style={{ margin: 0, paddingLeft: 16 }}>
                                {skippedList.slice(0, 20).map((s, i) => (
                                  <li key={i}>
                                    <Text style={{ fontSize: 12 }}>
                                      Row {s.row} — {s.sap_order_no}:{" "}
                                      {SKIP_REASON_LABEL[s.reason] ?? s.reason}
                                    </Text>
                                  </li>
                                ))}
                                {skippedList.length > 20 && (
                                  <li>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      …and {skippedList.length - 20} more
                                    </Text>
                                  </li>
                                )}
                              </ul>
                            ),
                          },
                        ]}
                      />
                    }
                    showIcon
                  />
                )}
              </Space>
            )}

            {importError && (
              <Alert
                type="error"
                message="Import Failed"
                description={importError}
                showIcon
              />
            )}
          </Col>
        </Row>
      </Card>

      {/* Orders table */}
      <Card
        title={
          <Space size="large">
            <span>Imported SAP Orders</span>
            <Space size="small">
              <Badge status="warning" text={`${pendingCount} Pending`} />
              <Badge status="success" text={`${syncedCount} Synced`} />
              {errorCount > 0 && (
                <Badge status="error" text={`${errorCount} Error`} />
              )}
            </Space>
          </Space>
        }
        extra={
          <Space>
            {bulkProgress && (
              <Text type="secondary">
                Syncing {bulkProgress.current} / {bulkProgress.total}…
              </Text>
            )}
            <Button
              icon={<SyncOutlined spin={bulkSyncing} />}
              onClick={handleBulkSync}
              loading={bulkSyncing}
              disabled={bulkSyncing || pendingCount === 0}
            >
              Sync All Pending
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchOrders}
              loading={loadingOrders}
            >
              Refresh
            </Button>
          </Space>
        }
      >
        <Spin spinning={loadingOrders}>
          <Table<SAPOrder>
            dataSource={orders}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: orders.length,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "50"],
              showTotal: (t) => `${t} orders`,
              onChange: (page, size) => {
                setCurrentPage(page);
                setPageSize(size);
              },
            }}
            rowClassName={(record) =>
              record.sync_status === "ERROR" ? "ant-table-row-error" : ""
            }
            scroll={{ x: 1200 }}
            locale={{ emptyText: "No SAP orders imported yet. Upload an .xlsx file above." }}
          />
        </Spin>
      </Card>

      <Alert
        type="info"
        closable
        style={{ marginTop: 16 }}
        message="Priority auto-assignment on sync"
        description="Priority is auto-assigned on sync: Delay ≥60 days → HIGH, Delay ≥30 days → MEDIUM, else follows SAP revision (A=HIGH, B=MEDIUM, none=LOW). Check the Priority column after syncing a pending row."
      />
    </div>
  );
};

export default ERPIntegration;
