import logging

from core.models import AuditLog
from users.utils import get_client_ip

logger = logging.getLogger(__name__)

MAX_USER_AGENT_LENGTH = 512


def log_action(actor, action, entity_type, entity_id, before=None, after=None, request=None):
    """
    Create an AuditLog record for any tracked action in the system.

    Best-effort: audit failures are logged but never crash the parent operation.
    """
    ip_address = None
    user_agent = ""

    if request is not None:
        ip_address = get_client_ip(request)
        user_agent = request.META.get("HTTP_USER_AGENT", "")[:MAX_USER_AGENT_LENGTH]

    try:
        AuditLog.objects.create(
            actor_user=actor,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before_json=before,
            after_json=after,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    except Exception:
        logger.exception("Failed to write AuditLog: action=%s entity=%s(%s)", action, entity_type, entity_id)
