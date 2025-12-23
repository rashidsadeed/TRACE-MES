from django.contrib.auth.models import AbstractUser
from django.db import models

class CustomUser(AbstractUser):
    ROLE_CHOICES = [
        ("OPERATOR", "Operator"),
        ("TECHNICIAN", "Technician"),
        ("MANAGER", "Manager"),
        ("ADMIN", "Admin"),
    ]

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="OPERATOR")

    def __str__(self):
        return f"{self.username} ({self.role})"
