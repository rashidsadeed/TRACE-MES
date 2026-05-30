import datetime
import logging

from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response

from core.audit import log_action
from core.models import Part, OrderRequest, WorkOrder
from .models import SAPPurchaseOrder
from .serializers import SAPPurchaseOrderSerializer

logger = logging.getLogger(__name__)

# SAP Excel column header → model field name
_SAP_COLUMN_MAP = {
    'Sipariş No':             'sap_order_no',
    'SAS Kalem No/Adet':      'line_item_no',
    'Satıcı Tanımı':          'vendor',
    'SAS Tarihi':             'po_date',
    'Sektör':                 'sector',
    'Malzeme No':             'material_no',
    'Malzeme Adı':            'material_name',
    'SAS Miktarı':            'po_quantity',
    'Yolda Olan Miktar':      'in_transit_qty',
    'Mal Giriş Miktarı':      'goods_receipt_qty',
    'Ölçü Birimi':            'unit',
    'Açık Miktar':            'open_qty',
    'SAS Teslimat Tarihi':    'delivery_date',
    'İstatistiksel Teslim':   'statistical_delivery_date',
    'Fiyat':                  'price',
    'Fiyat B.':               'currency',
    'PB':                     'price_unit',
    'Ödeme Koşulu':           'payment_terms',
    'Mlz. Rev. SAS':          'material_revision_sap',
    'Güncel':                 'material_revision_current',
    'İş Emri':                'work_order_ref',
    'Gecikme Süresi(Gün)':    'delay_days',
    'Blokaj Durumu':          'block_status',
    'Üretici Parça No':       'manufacturer_part_no',
    'Öncelik Bilgisi':        'priority',
}

# SAP priority letter → WorkOrder.priority integer
_PRIORITY_MAP = {'A': 3, 'B': 2}

_DATE_FIELDS = {'po_date', 'delivery_date', 'statistical_delivery_date'}
_INT_FIELDS = {'po_quantity', 'in_transit_qty', 'goods_receipt_qty', 'open_qty', 'price_unit', 'delay_days'}
_EXCEL_EPOCH = datetime.date(1899, 12, 30)


def _parse_date(value):
    """Convert an openpyxl cell value to a Python date, handling both native dates and Excel serial numbers."""
    if value is None:
        return None
    if isinstance(value, datetime.datetime):
        return value.date()
    if isinstance(value, datetime.date):
        return value
    try:
        serial = int(float(str(value)))
        if serial > 0:
            return _EXCEL_EPOCH + datetime.timedelta(days=serial)
    except (ValueError, TypeError):
        pass
    return None


def _safe_int(value, default=0):
    if value is None:
        return default
    try:
        return int(float(str(value)))
    except (ValueError, TypeError):
        return default


def _safe_str(value):
    if value is None:
        return ''
    return str(value).strip()


def _safe_decimal(value):
    if value is None:
        return None
    try:
        from decimal import Decimal
        return Decimal(str(value))
    except Exception:
        return None


def _parse_row(header_index, row):
    """Map a worksheet row to a dict of SAPPurchaseOrder field values."""
    data = {}
    for col_header, field_name in _SAP_COLUMN_MAP.items():
        col_idx = header_index.get(col_header)
        if col_idx is None:
            continue
        cell_value = row[col_idx].value
        if field_name in _DATE_FIELDS:
            data[field_name] = _parse_date(cell_value)
        elif field_name in _INT_FIELDS:
            data[field_name] = _safe_int(cell_value)
        elif field_name == 'price':
            data[field_name] = _safe_decimal(cell_value)
        else:
            data[field_name] = _safe_str(cell_value)
    return data


class SAPIntegrationViewSet(viewsets.GenericViewSet):
    """
    ERP integration endpoints for SAP Purchase Order import and sync.

    POST /api/erp/sap/import/          — upload .xlsx, parse, create SAPPurchaseOrder + OrderRequest records
    GET  /api/erp/sap/orders/           — list all imported SAP orders
    POST /api/erp/sap/sync/{pk}/        — sync one SAP order into a TRACE-MES WorkOrder
    """
    queryset = SAPPurchaseOrder.objects.select_related(
        'imported_by', 'synced_order_request', 'synced_work_order'
    ).all()
    serializer_class = SAPPurchaseOrderSerializer

    def get_permissions(self):
        if self.action == 'list_orders':
            return [IsAuthenticated()]
        return [IsAdminUser()]

    # ------------------------------------------------------------------
    # GET /api/erp/sap/orders/
    # ------------------------------------------------------------------
    @action(detail=False, methods=['get'], url_path='orders')
    def list_orders(self, request):
        qs = self.get_queryset()
        batch = request.query_params.get('batch')
        sync_status = request.query_params.get('sync_status')
        if batch:
            qs = qs.filter(import_batch=batch)
        if sync_status:
            qs = qs.filter(sync_status=sync_status)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    # ------------------------------------------------------------------
    # POST /api/erp/sap/import/
    # ------------------------------------------------------------------
    @action(
        detail=False,
        methods=['post'],
        url_path='import',
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_excel(self, request):
        """Parse an SAP .xlsx export and create SAPPurchaseOrder + OrderRequest records."""
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'detail': 'No file provided. Send a multipart/form-data request with key "file".'}, status=status.HTTP_400_BAD_REQUEST)

        if not file_obj.name.endswith('.xlsx'):
            return Response({'detail': 'Only .xlsx files are supported.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            import openpyxl
            wb = openpyxl.load_workbook(file_obj, data_only=True)
        except Exception as exc:
            logger.exception("Failed to open Excel file: %s", file_obj.name)
            return Response({'detail': f'Failed to read Excel file: {exc}'}, status=status.HTTP_400_BAD_REQUEST)

        ws = wb.active
        rows = list(ws.iter_rows())
        if not rows:
            return Response({'detail': 'Excel file is empty.'}, status=status.HTTP_400_BAD_REQUEST)

        # Build column-header → column-index map from first row
        header_row = rows[0]
        header_index = {}
        for idx, cell in enumerate(header_row):
            header_val = _safe_str(cell.value)
            if header_val in _SAP_COLUMN_MAP:
                header_index[header_val] = idx

        if not header_index:
            return Response(
                {'detail': 'No recognised SAP column headers found. Expected Turkish SAP column names in row 1.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        batch_name = f"{file_obj.name.rsplit('.', 1)[0]}-{timezone.now().strftime('%Y%m%d-%H%M%S')}"
        imported, errors = 0, []
        skipped_rows = []  # [{row, sap_order_no, reason}, ...]

        for row_num, row in enumerate(rows[1:], start=2):
            row_data = _parse_row(header_index, row)
            material_no = row_data.get('material_no', '')
            sap_order_no = row_data.get('sap_order_no', '')
            line_item_no = row_data.get('line_item_no', '')

            # Silently skip completely blank rows (no order number at all)
            if not sap_order_no:
                continue

            # Report rows that have an order number but no material
            if not material_no:
                skipped_rows.append({'row': row_num, 'sap_order_no': sap_order_no, 'reason': 'missing_material_no'})
                continue

            # Report duplicate rows (same SAP order + line item already imported)
            if SAPPurchaseOrder.objects.filter(sap_order_no=sap_order_no, line_item_no=line_item_no).exists():
                skipped_rows.append({'row': row_num, 'sap_order_no': sap_order_no, 'reason': 'duplicate'})
                continue

            try:
                with transaction.atomic():
                    sap_order = SAPPurchaseOrder.objects.create(
                        **row_data,
                        imported_by=request.user,
                        import_batch=batch_name,
                        sync_status='PENDING',
                    )

                    # Auto-create a corresponding OrderRequest so the order enters the TRACE-MES workflow
                    order_request = OrderRequest.objects.create(
                        customer=request.user,
                        title=f"SAP-{sap_order_no}: {row_data.get('material_name', '')}",
                        description=(
                            f"SAP Import | Material: {material_no} | "
                            f"Vendor: {row_data.get('vendor', '')} | "
                            f"Work Order Ref: {row_data.get('work_order_ref', '')} | "
                            f"Batch: {batch_name}"
                        ),
                        quantity=row_data.get('po_quantity', 1) or 1,
                        status='PENDING',
                    )
                    sap_order.synced_order_request = order_request
                    sap_order.save(update_fields=['synced_order_request'])

                log_action(
                    actor=request.user,
                    action='SAP_IMPORT_ROW',
                    entity_type='SAPPurchaseOrder',
                    entity_id=sap_order.pk,
                    after={'sap_order_no': sap_order_no, 'material_no': material_no, 'batch': batch_name},
                    request=request,
                )
                imported += 1

            except Exception as exc:
                logger.exception("Row %d import error: %s", row_num, exc)
                errors.append(f"Row {row_num} ({sap_order_no}): {exc}")

        log_action(
            actor=request.user,
            action='SAP_IMPORT_BATCH',
            entity_type='SAPImportBatch',
            entity_id=request.user.pk,
            after={'batch': batch_name, 'imported': imported, 'skipped': len(skipped_rows), 'errors': len(errors)},
            request=request,
        )

        return Response({
            'batch': batch_name,
            'imported': imported,
            'skipped': skipped_rows,
            'errors': errors,
        }, status=status.HTTP_201_CREATED)

    # ------------------------------------------------------------------
    # POST /api/erp/sap/sync/{pk}/
    # ------------------------------------------------------------------
    @action(detail=True, methods=['post'], url_path='sync')
    def sync_order(self, request, pk=None):
        """Create a TRACE-MES WorkOrder from a single SAP Purchase Order record."""
        sap_order = self.get_object()

        if sap_order.sync_status == 'SYNCED' and sap_order.synced_work_order_id:
            return Response(
                {'detail': 'Already synced.', 'work_order_id': str(sap_order.synced_work_order_id)},
                status=status.HTTP_200_OK,
            )

        try:
            with transaction.atomic():
                # Resolve or create the Part from SAP material number (used as SKU)
                part, _ = Part.objects.get_or_create(
                    sku=sap_order.material_no,
                    defaults={'name': sap_order.material_name},
                )

                # Delay-based override takes precedence over SAP letter code
                delay = sap_order.delay_days or 0
                if delay >= 60:
                    priority = 3
                    overdue_tag = " [SAP-OVERDUE]"
                elif delay >= 30:
                    priority = 2
                    overdue_tag = ""
                else:
                    priority = _PRIORITY_MAP.get(sap_order.priority, 1)
                    overdue_tag = ""

                # Convert delivery_date to an aware datetime for WorkOrder.due_date
                due_date = None
                if sap_order.delivery_date:
                    due_date = timezone.make_aware(
                        datetime.datetime.combine(sap_order.delivery_date, datetime.time.min)
                    )

                work_order_code = f"WO-SAP-{str(sap_order.id)[:8].upper()}"

                work_order = WorkOrder.objects.create(
                    code=work_order_code,
                    description=(
                        f"SAP Import: {sap_order.material_name} "
                        f"(PO: {sap_order.sap_order_no}, Ref: {sap_order.work_order_ref}){overdue_tag}"
                    ),
                    part=part,
                    target_qty=sap_order.po_quantity or 1,
                    priority=priority,
                    due_date=due_date,
                    created_by=request.user,
                    status='PENDING',
                )

                sap_order.synced_work_order = work_order
                sap_order.sync_status = 'SYNCED'
                sap_order.sync_error = ''
                sap_order.resolved_priority = priority
                sap_order.save(update_fields=['synced_work_order', 'sync_status', 'sync_error', 'resolved_priority'])

                # Promote the linked OrderRequest to APPROVED and attach the WorkOrder
                if sap_order.synced_order_request:
                    req = sap_order.synced_order_request
                    req.status = 'APPROVED'
                    req.work_order = work_order
                    req.save(update_fields=['status', 'work_order'])

            log_action(
                actor=request.user,
                action='SAP_SYNC_ORDER',
                entity_type='SAPPurchaseOrder',
                entity_id=sap_order.pk,
                after={
                    'sap_order_no': sap_order.sap_order_no,
                    'work_order_id': str(work_order.pk),
                    'work_order_code': work_order.code,
                },
                request=request,
            )

        except Exception as exc:
            logger.exception("Sync failed for SAPPurchaseOrder %s: %s", sap_order.pk, exc)
            sap_order.sync_status = 'ERROR'
            sap_order.sync_error = str(exc)
            sap_order.save(update_fields=['sync_status', 'sync_error'])
            return Response({'detail': f'Sync failed: {exc}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        serializer = self.get_serializer(sap_order)
        return Response(serializer.data, status=status.HTTP_200_OK)
