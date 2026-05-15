def get_client_ip(request):
    # NOTE: X-Forwarded-For is trusted as-is. Ensure this service sits behind
    # a trusted reverse proxy (e.g. nginx) in production to prevent IP spoofing.
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')
