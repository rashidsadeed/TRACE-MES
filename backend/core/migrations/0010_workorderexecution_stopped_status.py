from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_workorder_due_date'),
    ]

    operations = [
        migrations.AlterField(
            model_name='workorderexecution',
            name='status',
            field=models.CharField(
                choices=[
                    ('AWAITING_START', 'Awaiting Start'),
                    ('RUNNING', 'Running'),
                    ('PAUSED', 'Paused'),
                    ('STOPPED', 'Stopped'),
                    ('COMPLETED', 'Completed'),
                ],
                default='RUNNING',
                max_length=20,
            ),
        ),
    ]
