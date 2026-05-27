import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.models import WorkOrder

print("All work orders:")
for wo in WorkOrder.objects.all():
    print(f"ID: {wo.id}, Status: {wo.status}")
