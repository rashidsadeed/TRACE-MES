import uuid
from django.conf import settings
from django.db import models


class SAPPurchaseOrder(models.Model):
    """
    Mirrors the SAP Purchase Order export structure.
    Field comments show the original Turkish SAP column names.
    """
    SYNC_STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('SYNCED', 'Synced'),
        ('ERROR', 'Error'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # --- SAP source fields ---
    sap_order_no = models.CharField(max_length=100, db_index=True)           # Sipariş No
    line_item_no = models.CharField(max_length=50, blank=True)               # SAS Kalem No/Adet
    vendor = models.CharField(max_length=200, blank=True)                    # Satıcı Tanımı
    po_date = models.DateField(null=True, blank=True)                        # SAS Tarihi
    sector = models.CharField(max_length=50, blank=True)                     # Sektör
    material_no = models.CharField(max_length=100)                           # Malzeme No
    material_name = models.CharField(max_length=200)                         # Malzeme Adı
    po_quantity = models.PositiveIntegerField(default=0)                     # SAS Miktarı
    in_transit_qty = models.PositiveIntegerField(default=0)                  # Yolda Olan Miktar
    goods_receipt_qty = models.PositiveIntegerField(default=0)               # Mal Giriş Miktarı
    unit = models.CharField(max_length=20, blank=True)                       # Ölçü Birimi
    open_qty = models.PositiveIntegerField(default=0)                        # Açık Miktar
    delivery_date = models.DateField(null=True, blank=True)                  # SAS Teslimat Tarihi
    statistical_delivery_date = models.DateField(null=True, blank=True)      # İstatistiksel Teslim
    price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)  # Fiyat
    currency = models.CharField(max_length=10, blank=True)                   # Fiyat B.
    price_unit = models.PositiveIntegerField(default=1)                      # PB
    payment_terms = models.CharField(max_length=100, blank=True)             # Ödeme Koşulu
    material_revision_sap = models.CharField(max_length=50, blank=True)      # Mlz. Rev. SAS
    material_revision_current = models.CharField(max_length=50, blank=True)  # Güncel
    work_order_ref = models.CharField(max_length=100, blank=True)            # İş Emri (SAP ref)
    delay_days = models.IntegerField(default=0)                              # Gecikme Süresi(Gün)
    block_status = models.CharField(max_length=50, blank=True)               # Blokaj Durumu
    manufacturer_part_no = models.CharField(max_length=100, blank=True)      # Üretici Parça No
    priority = models.CharField(max_length=10, blank=True)                   # Öncelik Bilgisi (A/B/empty)
    resolved_priority = models.IntegerField(null=True, blank=True)           # Computed on sync (1=Low,2=Med,3=High)

    # --- TRACE-MES sync tracking ---
    sync_status = models.CharField(max_length=20, choices=SYNC_STATUS_CHOICES, default='PENDING')
    sync_error = models.TextField(blank=True)
    import_batch = models.CharField(max_length=200, blank=True, db_index=True)
    imported_at = models.DateTimeField(auto_now_add=True)
    imported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='sap_imports',
    )
    synced_order_request = models.OneToOneField(
        'core.OrderRequest',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sap_purchase_order',
    )
    synced_work_order = models.OneToOneField(
        'core.WorkOrder',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sap_purchase_order',
    )

    class Meta:
        ordering = ['-imported_at']
        verbose_name = 'SAP Purchase Order'
        verbose_name_plural = 'SAP Purchase Orders'

    def __str__(self):
        return f"SAP PO {self.sap_order_no} — {self.material_name}"
