"""Sanity checks on the prod/stage settings *modules themselves*, independent
of whichever settings module pytest is actually running under.

These import the env-specific settings modules directly, since
`manage.py check --deploy` against `league_manager.settings.prod` requires a
live MySQL connection (SECRET_KEY, DB env vars, etc.) that isn't available in
every environment these tests run in.
"""

import importlib
import re

import pytest


@pytest.mark.parametrize(
    "module_name", ["league_manager.settings.prod", "league_manager.settings.stage"]
)
def test_cookies_hsts_and_ssl_redirect_enabled(module_name):
    settings_module = importlib.import_module(module_name)

    assert settings_module.SESSION_COOKIE_SECURE is True
    assert settings_module.CSRF_COOKIE_SECURE is True
    assert settings_module.SECURE_SSL_REDIRECT is True
    assert settings_module.SECURE_HSTS_SECONDS > 0
    assert settings_module.SECURE_HSTS_INCLUDE_SUBDOMAINS is True
    assert settings_module.SECURE_REFERRER_POLICY == "strict-origin-when-cross-origin"
    # The container healthcheck hits /health/ over plain HTTP; it must stay
    # reachable rather than get redirected to https.
    assert any(
        re.match(pattern, "health/")
        for pattern in settings_module.SECURE_REDIRECT_EXEMPT
    )


@pytest.mark.parametrize(
    "module_name",
    [
        "league_manager.settings.prod",
        "league_manager.settings.stage",
        "league_manager.settings.demo",
    ],
)
def test_multi_worker_environments_share_a_redis_cache(module_name):
    """gunicorn runs 6 workers in prod/stage/demo (see deployed/docker-
    compose*.yaml); LocMemCache is private per worker, so a shared backend
    is required for AnonRateThrottle counts, maintenance-mode/DB-guard
    status and cached payloads to agree across workers.
    """
    settings_module = importlib.import_module(module_name)

    assert (
        settings_module.CACHES["default"]["BACKEND"]
        == "django.core.cache.backends.redis.RedisCache"
    )


@pytest.mark.parametrize(
    "module_name",
    ["league_manager.settings.dev", "league_manager.settings.test_sqlite"],
)
def test_single_process_environments_use_locmem_cache(module_name):
    """dev/test_sqlite run a single process with no Redis available."""
    settings_module = importlib.import_module(module_name)

    assert (
        settings_module.CACHES["default"]["BACKEND"]
        == "django.core.cache.backends.locmem.LocMemCache"
    )
