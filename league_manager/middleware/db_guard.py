import logging
from django.db import connection
from django.core.cache import cache
from django.shortcuts import redirect
from django.urls import reverse

logger = logging.getLogger(__name__)

class DatabaseGuardMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.db_status_cache_key = 'db_connection_status'

    def __call__(self, request):
        # Skip check for the error page itself and static/media files
        try:
            error_url = reverse('database-error')
        except:
            # Fallback if the URL isn't defined yet (e.g. during initial setup)
            error_url = '/database-error/'

        if request.path.startswith(error_url) or request.path.startswith('/static/') or request.path.startswith('/media/'):
            return self.get_response(request)

        # Skip check for health endpoint as it has its own logic
        if request.path.startswith('/health/'):
            return self.get_response(request)

        db_online = cache.get(self.db_status_cache_key)
        
        if db_online is None:
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT 1")
                db_online = True
                cache.set(self.db_status_cache_key, True, 10)  # Cache success for 10s
            except Exception as e:
                logger.error(f"Database connection guard detected failure: {e}")
                db_online = False
                cache.set(self.db_status_cache_key, False, 5)  # Cache failure for 5s

        if not db_online:
            return redirect(error_url)

        return self.get_response(request)
