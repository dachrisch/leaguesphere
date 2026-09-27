"""Fail-fast guard for the deployed settings modules (prod.py, stage.py).

base.py falls back to insecure defaults (user/user@127.0.0.1, no SECRET_KEY)
when the MySQL/SECRET_KEY env vars are unset. That is fine for local dev but
must never happen silently on a deployed environment, so the deployed
settings modules refuse to import without them.

The check only runs when the module is genuinely the active settings:

* ``DJANGO_SETTINGS_MODULE`` names it directly (the compose files do this), or
* ``DJANGO_SETTINGS_MODULE`` names the ``league_manager.settings`` *package*
  (the default in wsgi.py / asgi.py / manage.py) and the ``league_manager``
  env var does not select dev/test_sqlite, so the package's ``__init__``
  resolves to prod.

It must NOT run when prod.py is merely imported incidentally -- e.g. by the
package ``__init__`` during a local run, or by tests importing the module to
inspect its values -- or every local dev/test run would need prod secrets.
"""

import os

from django.core.exceptions import ImproperlyConfigured

SETTINGS_PACKAGE = "league_manager.settings"
PACKAGE_FALLBACK_MODULE = f"{SETTINGS_PACKAGE}.prod"
LOCAL_SETTINGS_SELECTORS = ("dev", "test_sqlite")

REQUIRED_ENV_VARS = (
    "SECRET_KEY",
    "MYSQL_HOST",
    "MYSQL_DB_NAME",
    "MYSQL_USER",
    "MYSQL_PWD",
)


def is_active_settings_module(module_name):
    active = os.environ.get("DJANGO_SETTINGS_MODULE")
    if active == module_name:
        return True
    return (
        active == SETTINGS_PACKAGE
        and module_name == PACKAGE_FALLBACK_MODULE
        and os.environ.get("league_manager") not in LOCAL_SETTINGS_SELECTORS
    )


def require_env_vars(module_name, label):
    if not is_active_settings_module(module_name):
        return
    missing = [var for var in REQUIRED_ENV_VARS if not os.environ.get(var)]
    if missing:
        raise ImproperlyConfigured(
            f"{label} settings require these environment variables to be set: "
            f"{', '.join(missing)}. For a local run select the dev settings instead "
            "(league_manager=dev or DJANGO_SETTINGS_MODULE=league_manager.settings.dev)."
        )
