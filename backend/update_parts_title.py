import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from core.models import Part

updated = 0
for part in Part.objects.all():
    # Find a work order related to this part that has an order request
    wo = part.work_orders.filter(order_request__isnull=False).first()
    if wo and wo.order_request and wo.order_request.title:
        print(f"Updating part {part.id} from '{part.name}' to '{wo.order_request.title}'")
        part.name = wo.order_request.title
        part.save(update_fields=['name'])
        updated += 1
    elif wo and wo.order_request and wo.order_request.description:
        # Fallback if no title but description exists
        print(f"Updating part {part.id} from '{part.name}' to '{wo.order_request.description}' (fallback)")
        part.name = wo.order_request.description
        part.save(update_fields=['name'])
        updated += 1

print(f"Successfully updated {updated} parts.")
