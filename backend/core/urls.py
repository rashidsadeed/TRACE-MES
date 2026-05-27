from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    MachineViewSet, PartViewSet, WorkOrderViewSet, ExecutionViewSet,
    DefectCodeViewSet, ProductionLogCreateView, ScrapLogCreateView,
    LiveOverviewView, MachineTelemetryView, MachineEventListView,
    DataExportJobViewSet,
    SystemConfigViewSet, OperationViewSet, ProductionLineViewSet,
    OrderRequestViewSet, NotificationViewSet,
)

router = DefaultRouter()
router.register(r'machines', MachineViewSet)
router.register(r'parts', PartViewSet)
router.register(r'workorders', WorkOrderViewSet, basename='workorder')
router.register(r'executions', ExecutionViewSet, basename='execution')
router.register(r'defect-codes', DefectCodeViewSet, basename='defect-code')
router.register(r'export/jobs', DataExportJobViewSet, basename='export-job')
router.register(r'config', SystemConfigViewSet, basename='config')
router.register(r'operations', OperationViewSet, basename='operation')
router.register(r'production-lines', ProductionLineViewSet, basename='production-line')
router.register(r'orders/requests', OrderRequestViewSet, basename='order-requests')
router.register(r'notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    path('', include(router.urls)),
    path('quality/production-log/', ProductionLogCreateView.as_view(), name='production-log-create'),
    path('quality/scrap-log/', ScrapLogCreateView.as_view(), name='scrap-log-create'),
    path('live/overview/', LiveOverviewView.as_view(), name='live-overview'),
    path('live/telemetry/<uuid:machine_id>/', MachineTelemetryView.as_view(), name='machine-telemetry'),
    path('live/events/', MachineEventListView.as_view(), name='machine-events'),
]