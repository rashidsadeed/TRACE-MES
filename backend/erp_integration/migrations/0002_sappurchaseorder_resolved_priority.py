from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('erp_integration', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='sappurchaseorder',
            name='resolved_priority',
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
