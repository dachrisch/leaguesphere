import os

# noinspection PyUnresolvedReferences
from .base import *
from django.core.exceptions import ImproperlyConfigured

# base.py falls back to insecure defaults (user/user@127.0.0.1, no
# SECRET_KEY) when these are unset, which is fine for local dev but must
# never happen silently in production: fail fast at import time instead.
#
# Guarded on DJANGO_SETTINGS_MODULE actually pointing here (rather than just
# checking os.environ) because league_manager/settings/__init__.py imports
# this module as an incidental fallback whenever the `league_manager` env
# var isn't "dev"/"test_sqlite" -- which happens on every settings import,
# including in local dev/test runs that target dev.py/test_sqlite.py
# directly. Without this guard, this check would fire there too.
if os.environ.get("DJANGO_SETTINGS_MODULE") == __name__:
    _REQUIRED_ENV_VARS = [
        "SECRET_KEY",
        "MYSQL_HOST",
        "MYSQL_DB_NAME",
        "MYSQL_USER",
        "MYSQL_PWD",
    ]
    _missing_env_vars = [var for var in _REQUIRED_ENV_VARS if not os.environ.get(var)]
    if _missing_env_vars:
        raise ImproperlyConfigured(
            f"production settings require these environment variables to be set: {', '.join(_missing_env_vars)}"
        )

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
