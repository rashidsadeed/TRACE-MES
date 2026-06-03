import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('core', '0017_productionline_machine_sequence_and_more'),
        ('users', '0002_alter_role_type'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='SAPPurchaseOrder',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('sap_order_no', models.CharField(db_index=True, max_length=100)),
                ('line_item_no', models.CharField(blank=True, max_length=50)),
                ('vendor', models.CharField(blank=True, max_length=200)),
                ('po_date', models.DateField(blank=True, null=True)),
                ('sector', models.CharField(blank=True, max_length=50)),
                ('material_no', models.CharField(max_length=100)),
                ('material_name', models.CharField(max_length=200)),
                ('po_quantity', models.PositiveIntegerField(default=0)),
                ('in_transit_qty', models.PositiveIntegerField(default=0)),
                ('goods_receipt_qty', models.PositiveIntegerField(default=0)),
                ('unit', models.CharField(blank=True, max_length=20)),
                ('open_qty', models.PositiveIntegerField(default=0)),
                ('delivery_date', models.DateField(blank=True, null=True)),
                ('statistical_delivery_date', models.DateField(blank=True, null=True)),
                ('price', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('currency', models.CharField(blank=True, max_length=10)),
                ('price_unit', models.PositiveIntegerField(default=1)),
                ('payment_terms', models.CharField(blank=True, max_length=100)),
                ('material_revision_sap', models.CharField(blank=True, max_length=50)),
                ('material_revision_current', models.CharField(blank=True, max_length=50)),
                ('work_order_ref', models.CharField(blank=True, max_length=100)),
                ('delay_days', models.IntegerField(default=0)),
                ('block_status', models.CharField(blank=True, max_length=50)),
                ('manufacturer_part_no', models.CharField(blank=True, max_length=100)),
                ('priority', models.CharField(blank=True, max_length=10)),
                ('sync_status', models.CharField(
                    choices=[('PENDING', 'Pending'), ('SYNCED', 'Synced'), ('ERROR', 'Error')],
                    default='PENDING',
                    max_length=20,
                )),
                ('sync_error', models.TextField(blank=True)),
                ('import_batch', models.CharField(blank=True, db_index=True, max_length=200)),
                ('imported_at', models.DateTimeField(auto_now_add=True)),
                ('imported_by', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='sap_imports',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('synced_order_request', models.OneToOneField(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='sap_purchase_order',
                    to='core.orderrequest',
                )),
                ('synced_work_order', models.OneToOneField(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='sap_purchase_order',
                    to='core.workorder',
                )),
            ],
            options={
                'verbose_name': 'SAP Purchase Order',
                'verbose_name_plural': 'SAP Purchase Orders',
                'ordering': ['-imported_at'],
            },
        ),
    ]
