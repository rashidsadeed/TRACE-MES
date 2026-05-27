import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.models import (
    Machine, Part, DefectCode, ProductionLine,
    WorkOrder, WorkOrderAssignment, WorkOrderExecution,
    MachineEvent, ProductionLog, OrderRequest, Notification, TelemetryPacket
)

def reset_data():
    print("Deleting ProductionLogs...")
    ProductionLog.objects.all().delete()
    print("Deleting TelemetryPackets...")
    TelemetryPacket.objects.all().delete()
    print("Deleting MachineEvents...")
    MachineEvent.objects.all().delete()
    print("Deleting WorkOrderExecutions...")
    WorkOrderExecution.objects.all().delete()
    print("Deleting WorkOrderAssignments...")
    WorkOrderAssignment.objects.all().delete()
    print("Deleting Notifications...")
    Notification.objects.all().delete()
    print("Deleting WorkOrders...")
    WorkOrder.objects.all().delete()
    print("Deleting OrderRequests...")
    OrderRequest.objects.all().delete()
    print("Deleting ProductionLines...")
    ProductionLine.objects.all().delete()
    print("Deleting Parts...")
    Part.objects.all().delete()
    print("Deleting DefectCodes...")
    DefectCode.objects.all().delete()
    print("Deleting Machines...")
    Machine.objects.all().delete()
    print("Database reset complete.")

if __name__ == '__main__':
    reset_data()
