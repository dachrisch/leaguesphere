"""A misconfigured prod/stage deploy must fail at import instead of silently
falling back to base.py's user/user@127.0.0.1 defaults.
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
        # The check only fires for the *active* settings module.
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


# wsgi/asgi/manage.py default to the settings *package*, which falls back to
# prod -- the most common boot path, so it must be guarded the same way.
_PACKAGE = "league_manager.settings"
_PACKAGE_MODULES = [_PACKAGE, f"{_PACKAGE}.prod", f"{_PACKAGE}._env_guard"]


def _reimport_package(env, league_manager_env=None):
    import os

    saved_modules = {name: sys.modules.pop(name, None) for name in _PACKAGE_MODULES}
    saved_env = {
        var: os.environ.get(var)
        for var in REQUIRED_ENV_VARS + ["DJANGO_SETTINGS_MODULE", "league_manager"]
    }
    try:
        for var in REQUIRED_ENV_VARS + ["league_manager"]:
            os.environ.pop(var, None)
        os.environ.update(env)
        if league_manager_env is not None:
            os.environ["league_manager"] = league_manager_env
        os.environ["DJANGO_SETTINGS_MODULE"] = _PACKAGE
        return importlib.import_module(_PACKAGE)
    finally:
        for name in _PACKAGE_MODULES:
            sys.modules.pop(name, None)
        for name, module in saved_modules.items():
            if module is not None:
                sys.modules[name] = module
        for var, value in saved_env.items():
            if value is None:
                os.environ.pop(var, None)
            else:
                os.environ[var] = value


@pytest.mark.parametrize("missing_var", REQUIRED_ENV_VARS)
def test_package_falling_back_to_prod_raises_on_missing_env_var(missing_var):
    env = {var: "x" for var in REQUIRED_ENV_VARS if var != missing_var}

    with pytest.raises(ImproperlyConfigured):
        _reimport_package(env)


def test_package_falling_back_to_prod_imports_cleanly_with_all_vars():
    _reimport_package({var: "x" for var in REQUIRED_ENV_VARS})


@pytest.mark.parametrize("league_manager_env", ["dev", "test_sqlite"])
def test_package_selecting_local_settings_needs_no_env_vars(league_manager_env):
    # Local runs (`league_manager=dev`) never touch prod.py's guard.
    _reimport_package({}, league_manager_env=league_manager_env)


def test_error_message_tells_how_to_select_local_settings():
    with pytest.raises(ImproperlyConfigured) as excinfo:
        _reimport_package({})

    assert "league_manager=dev" in str(excinfo.value)
