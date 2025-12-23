from rest_framework import serializers
from .models import Machine, Part

class MachineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Machine
        fields = ["id", "name", "type", "status", "slug"]

class PartSerializer(serializers.ModelSerializer):
    class Meta:
        model = Part
        fields = ["id", "name", "sku", "description"]