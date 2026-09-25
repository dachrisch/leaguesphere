"""base.py silently falls back to user/user@127.0.0.1 when the MySQL env
vars are missing, and SECRET_KEY has no prod-time enforcement either. In
prod/stage that means a misconfigured deploy doesn't fail fast -- it starts
up and either talks to the wrong database or, if nothing is listening at
127.0.0.1:3306, fails with a confusing connection error far from the actual
cause. Importing prod.py/stage.py without the required env vars set must
raise immediately instead.
"""

import importlib
import sys

import pytest
from django.core.exceptions import ImproperlyConfigured

REQUIRED_ENV_VARS = [
    "SECRET_KEY",
    "MYSQL_HOST",
    "MYSQL_DB_NAME",
    "MYSQL_USER",
    "MYSQL_PWD",
]


def _reimport(module_name, env):
    import os

    sys.modules.pop(module_name, None)
    previous = {var: os.environ.get(var) for var in REQUIRED_ENV_VARS}
    previous_django_settings_module = os.environ.get("DJANGO_SETTINGS_MODULE")
    try:
        for var in REQUIRED_ENV_VARS:
            os.environ.pop(var, None)
        os.environ.update(env)
        # The check only fires when this module is genuinely the active
        # settings, not when it's incidentally imported as a fallback by
        # league_manager/settings/__init__.py.
        os.environ["DJANGO_SETTINGS_MODULE"] = module_name
        return importlib.import_module(module_name)
    finally:
        sys.modules.pop(module_name, None)
        for var, value in previous.items():
            if value is None:
                os.environ.pop(var, None)
            else:
                os.environ[var] = value
        if previous_django_settings_module is None:
            os.environ.pop("DJANGO_SETTINGS_MODULE", None)
        else:
            os.environ["DJANGO_SETTINGS_MODULE"] = previous_django_settings_module


@pytest.mark.parametrize(
    "module_name", ["league_manager.settings.prod", "league_manager.settings.stage"]
)
@pytest.mark.parametrize("missing_var", REQUIRED_ENV_VARS)
def test_missing_required_env_var_raises_at_import(module_name, missing_var):
    env = {var: "x" for var in REQUIRED_ENV_VARS if var != missing_var}

    with pytest.raises(ImproperlyConfigured):
        _reimport(module_name, env)


@pytest.mark.parametrize(
    "module_name", ["league_manager.settings.prod", "league_manager.settings.stage"]
)
def test_all_required_env_vars_present_imports_cleanly(module_name):
    env = {var: "x" for var in REQUIRED_ENV_VARS}

    # Must not raise.
    _reimport(module_name, env)
