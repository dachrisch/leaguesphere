import logging
import re

from django.core.cache import cache
from django.http import HttpResponseRedirect
from django.urls import reverse

from league_manager.constants import (
    LEAGUE_MANAGER_MAINTENANCE,
    MAINTENANCE_CONFIG_CACHE_KEY,
    MAINTENANCE_CONFIG_CACHE_TTL,
    MAINTENANCE_SCOPE_FULL,
    MAINTENANCE_SCOPE_OFF,
    MAINTENANCE_SCOPE_CUSTOM,
    MAINTENANCE_SCOPE_WRITES_ONLY,
    STATIC_INFO_PATHS,
    STATIC_INFO_PREFIXES,
)
from league_manager.models import SiteConfiguration

ADMIN_PREFIX = "/admin/"
MAINTENANCE_PREFIX = "/maintenance/"
WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

logger = logging.getLogger(__name__)


class MaintenanceModeMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        config = cache.get("%s" % MAINTENANCE_CONFIG_CACHE_KEY)

        if config is None:
            try:
                db_config = SiteConfiguration.objects.first()
            except Exception as exc:
                # Fail open on any DB error, mirroring DatabaseGuardMiddleware
                # (which runs first and owns the redirect to the offline page).
                logger.error(
                    f"Maintenance config lookup failed, treating maintenance as off: {exc}"
                )
                # Not cached: retry next request so maintenance mode resumes
                # as soon as the DB is back.
                config = {"scope": MAINTENANCE_SCOPE_OFF, "patterns": []}
            else:
                if db_config:
                    config = {
                        "scope": db_config.maintenance_scope,
                        "patterns": db_config.maintenance_pages,
                    }
                else:
                    config = {"scope": MAINTENANCE_SCOPE_OFF, "patterns": []}

                cache.set(
                    MAINTENANCE_CONFIG_CACHE_KEY, config, MAINTENANCE_CONFIG_CACHE_TTL
                )

        path = request.path_info
        if self._is_exempt(path):
            return self.get_response(request)

        scope = config["scope"]

        if scope == MAINTENANCE_SCOPE_FULL:
            return HttpResponseRedirect(reverse(LEAGUE_MANAGER_MAINTENANCE))

        if scope == MAINTENANCE_SCOPE_WRITES_ONLY:
            if request.method in WRITE_METHODS:
                return HttpResponseRedirect(reverse(LEAGUE_MANAGER_MAINTENANCE))

        if scope == MAINTENANCE_SCOPE_CUSTOM:
            for maintenance_pattern in config["patterns"]:
                if re.match(maintenance_pattern, path):
                    return HttpResponseRedirect(reverse(LEAGUE_MANAGER_MAINTENANCE))

        return self.get_response(request)

    @staticmethod
    def _is_exempt(path):
        return (
            path.startswith(ADMIN_PREFIX)
            or path.startswith(MAINTENANCE_PREFIX)
            # Static info files stay reachable during maintenance
            or path.startswith(STATIC_INFO_PREFIXES)
            or path in STATIC_INFO_PATHS.values()
            or path == "/health/"
            or path == "/database-error/"
        )
