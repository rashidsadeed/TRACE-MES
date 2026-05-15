import hashlib
import logging

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from users.models import ApiClient

logger = logging.getLogger(__name__)


class ApiKeyAuthentication(BaseAuthentication):
    """
    Authenticate requests using an ``X-API-Key`` header.

    The provided key is SHA-256 hashed and compared against
    ``ApiClient.api_key_hash``.  On success the request is authenticated
    with ``request.user = None`` and ``request.auth = <ApiClient>``.
    """

    HEADER = "HTTP_X_API_KEY"

    def authenticate(self, request):
        raw_key = request.META.get(self.HEADER)
        if not raw_key:
            return None  # Let other authenticators try

        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

        try:
            client = ApiClient.objects.get(api_key_hash=key_hash, is_active=True)
        except ApiClient.DoesNotExist:
            raise AuthenticationFailed("Invalid or inactive API key.")

        # Update last_used_at (best-effort)
        try:
            ApiClient.objects.filter(pk=client.pk).update(last_used_at=timezone.now())
        except Exception:
            logger.exception("Failed to update ApiClient.last_used_at for %s", client.name)

        return (None, client)  # user=None, auth=ApiClient instance

    def authenticate_header(self, request):
        return "X-API-Key"
