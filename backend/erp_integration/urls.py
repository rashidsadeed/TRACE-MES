from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SAPIntegrationViewSet

router = DefaultRouter()
router.register(r'sap', SAPIntegrationViewSet, basename='sap')

urlpatterns = [
    path('', include(router.urls)),
]
