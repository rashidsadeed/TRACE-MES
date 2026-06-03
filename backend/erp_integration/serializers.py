from rest_framework import serializers
from .models import SAPPurchaseOrder


class SAPPurchaseOrderSerializer(serializers.ModelSerializer):
    imported_by_username = serializers.CharField(source='imported_by.username', read_only=True)
    synced_order_request_id = serializers.UUIDField(source='synced_order_request.id', read_only=True)
    synced_work_order_id = serializers.UUIDField(source='synced_work_order.id', read_only=True)
    synced_work_order_code = serializers.CharField(source='synced_work_order.code', read_only=True)

    class Meta:
        model = SAPPurchaseOrder
        fields = [
            'id',
            'sap_order_no',
            'line_item_no',
            'vendor',
            'po_date',
            'sector',
            'material_no',
            'material_name',
            'po_quantity',
            'in_transit_qty',
            'goods_receipt_qty',
            'unit',
            'open_qty',
            'delivery_date',
            'statistical_delivery_date',
            'price',
            'currency',
            'price_unit',
            'payment_terms',
            'material_revision_sap',
            'material_revision_current',
            'work_order_ref',
            'delay_days',
            'block_status',
            'manufacturer_part_no',
            'priority',
            'resolved_priority',
            'sync_status',
            'sync_error',
            'import_batch',
            'imported_at',
            'imported_by_username',
            'synced_order_request_id',
            'synced_work_order_id',
            'synced_work_order_code',
        ]
        read_only_fields = fields
