# noinspection PyUnresolvedReferences
from .base import *
from ._env_guard import require_env_vars

# Refuse to start without the DB/SECRET_KEY env vars -- see _env_guard.py
# for why this is guarded on being the *active* settings (directly or via
# the league_manager.settings package fallback) rather than on os.environ.
require_env_vars(__name__, "production")

DEBUG = False
MOCK_TEAMS = False
ALLOWED_HOSTS = [
    "127.0.0.1",
    "leaguesphere.app",
    "www.leaguesphere.app",
    "localhost",
    "django",
    "stage.leaguesphere.app",
    "www.stage.leaguesphere.app",
    "leaguesphere.servyy-test.lxd",
    "leaguesphere.lehel.xyz",
]
CSRF_TRUSTED_ORIGINS = [
    "https://leaguesphere.app",
    "https://www.leaguesphere.app",
    "https://stage.leaguesphere.app",
    "https://www.stage.leaguesphere.app",
    "https://leaguesphere.servyy-test.lxd",
    "https://leaguesphere.lehel.xyz",
]

# Sitemap domain for production
SITEMAP_DOMAIN = "leaguesphere.app"

# Trust X-Forwarded-Proto header from nginx proxy (which forwards Traefik's
# value) so request.is_secure() is True behind TLS termination and Django emits
# https:// absolute URLs (DRF pagination, sitemaps, emails, redirects).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Trust X-Forwarded-Host header from reverse proxy chain (Traefik -> nginx)
USE_X_FORWARDED_HOST = True

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30  # start at 30 days, raise to a year once stable
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
# The container healthcheck hits /health/ over plain HTTP.
SECURE_REDIRECT_EXEMPT = [r"^health/"]
