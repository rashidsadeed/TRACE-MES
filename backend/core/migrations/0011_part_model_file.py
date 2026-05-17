from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0010_workorderexecution_stopped_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='part',
            name='model_file',
            field=models.FileField(blank=True, help_text='3D model file for the part', null=True, upload_to='part_models/'),
        ),
    ]