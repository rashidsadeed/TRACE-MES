from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Machine, Part
from .serializers import MachineSerializer, PartSerializer

class MachineViewSet(viewsets.ModelViewSet):
    """API endpoint that allows machines to be viewed or edited."""
    queryset = Machine.objects.all().order_by("name")
    serializer_class = MachineSerializer
    permission_classes = [IsAuthenticated] # Only authenticated users can access

class PartViewSet(viewsets.ModelViewSet):
    """API endpoint that allows parts to be viewed or edited."""
    queryset = Part.objects.all()
    serializer_class = PartSerializer
    permission_classes = [IsAuthenticated]