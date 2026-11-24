"""Fail-fast guard for the deployed settings modules (prod.py, stage.py).

base.py falls back to insecure defaults (user/user@127.0.0.1, no SECRET_KEY)
when the env vars are unset, so prod/stage refuse to import without them --
but only when they are the active settings, not when prod.py is imported
incidentally by the settings package or by a test.
"""

import os

from django.core.exceptions import ImproperlyConfigured

SETTINGS_PACKAGE = "league_manager.settings"
PACKAGE_FALLBACK_MODULE = f"{SETTINGS_PACKAGE}.prod"
LOCAL_SETTINGS_SELECTORS = ("dev", "test_sqlite")

# The canonical DB pair uses the MariaDB image-standard names. The aliases are
# deprecated but still accepted so staged infra/app rollouts work in any order.
REQUIRED_ENV_VARS = (
    "SECRET_KEY",
    "MYSQL_HOST",
    "MYSQL_USER",
)
CANONICAL_DB_VARS = ("MYSQL_DATABASE", "MYSQL_PASSWORD")
LEGACY_DB_VARS = ("MYSQL_DB_NAME", "MYSQL_PWD")


def is_active_settings_module(module_name):
    active = os.environ.get("DJANGO_SETTINGS_MODULE")
    if active == module_name:
        return True
    # wsgi/asgi/manage.py default to the settings *package*, whose __init__
    # falls back to prod unless `league_manager` selects dev/test_sqlite.
    return (
        active == SETTINGS_PACKAGE
        and module_name == PACKAGE_FALLBACK_MODULE
        and os.environ.get("league_manager") not in LOCAL_SETTINGS_SELECTORS
    )


def require_env_vars(module_name, label):
    if not is_active_settings_module(module_name):
        return
    missing = [var for var in REQUIRED_ENV_VARS if not os.environ.get(var)]
    # Either a complete canonical pair or a complete legacy pair suffices.
    if any(not os.environ.get(var) for var in CANONICAL_DB_VARS) and any(
        not os.environ.get(var) for var in LEGACY_DB_VARS
    ):
        missing.append(
            "MYSQL_DATABASE and MYSQL_PASSWORD "
            "(legacy aliases MYSQL_DB_NAME and MYSQL_PWD are also accepted)"
        )
    if missing:
        raise ImproperlyConfigured(
            f"{label} settings require these environment variables to be set: "
            f"{', '.join(missing)}. For a local run select the dev settings instead "
            "(league_manager=dev or DJANGO_SETTINGS_MODULE=league_manager.settings.dev)."
        )
