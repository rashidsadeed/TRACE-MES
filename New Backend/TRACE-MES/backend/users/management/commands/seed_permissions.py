from django.core.management.base import BaseCommand

from users.models import Permission

PERMISSIONS = [
    ('users.manage', 'System', 'Create, update, delete users'),
    ('users.view', 'System', 'View user list and profiles'),
    ('roles.manage', 'System', 'Create, update, delete roles'),
    ('workorders.create', 'Production', 'Create work orders'),
    ('workorders.manage', 'Production', 'Update and assign work orders'),
    ('workorders.view', 'Production', 'View work orders'),
    ('executions.control', 'Production', 'Start, pause, resume, stop executions'),
    ('quality.entry', 'Quality', 'Log production and scrap data'),
    ('quality.view', 'Quality', 'View quality data and defect codes'),
    ('system.admin', 'System', 'Full system administration'),
    ('machines.manage', 'System', 'Create and update machines'),
    ('export.request', 'Data', 'Request data exports'),
]


class Command(BaseCommand):
    help = 'Seed the Permission table with canonical permission codes (idempotent).'

    def handle(self, *args, **options):
        created_count = 0
        updated_count = 0

        for code, module, description in PERMISSIONS:
            _, created = Permission.objects.update_or_create(
                code=code,
                defaults={
                    'module': module,
                    'description': description,
                },
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Permissions seeded: {created_count} created, {updated_count} updated.'
            )
        )
