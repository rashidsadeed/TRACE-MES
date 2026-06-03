import apiClient from "./apiClient";

export interface SAPOrder {
  id: string;
  sap_order_no: string;
  line_item_no: string;
  vendor: string;
  po_date: string | null;
  sector: string;
  material_no: string;
  material_name: string;
  po_quantity: number;
  in_transit_qty: number;
  goods_receipt_qty: number;
  unit: string;
  open_qty: number;
  delivery_date: string | null;
  statistical_delivery_date: string | null;
  price: string | null;
  currency: string;
  price_unit: number;
  payment_terms: string;
  material_revision_sap: string;
  material_revision_current: string;
  work_order_ref: string;
  delay_days: number;
  block_status: string;
  manufacturer_part_no: string;
  priority: string;
  sync_status: "PENDING" | "SYNCED" | "ERROR";
  sync_error: string;
  import_batch: string;
  imported_at: string;
  imported_by_username: string | null;
  synced_order_request_id: string | null;
  synced_work_order_id: string | null;
  synced_work_order_code: string | null;
}

export interface SkippedRow {
  row: number;
  sap_order_no: string;
  reason: "duplicate" | "missing_material_no" | string;
}

export interface ImportResult {
  batch: string;
  imported: number;
  skipped: SkippedRow[];
  errors: string[];
}

export interface ListOrdersParams {
  batch?: string;
  sync_status?: "PENDING" | "SYNCED" | "ERROR";
}

const erpService = {
  importSAPFile: (file: File): Promise<{ data: ImportResult }> => {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient.post("/erp/sap/import/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  listSAPOrders: (params?: ListOrdersParams): Promise<{ data: SAPOrder[] }> => {
    return apiClient.get("/erp/sap/orders/", { params });
  },

  syncSAPOrder: (id: string): Promise<{ data: SAPOrder }> => {
    return apiClient.post(`/erp/sap/${id}/sync/`);
  },
};

export default erpService;
