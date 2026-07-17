import datetime
import sys

from .base import *

if not SECRET_KEY:
    SECRET_KEY = "django-insecure-local-dev-key-set-SECRET_KEY-env-var-in-production"

DEBUG = True
MOCK_TEAMS = True
DEBUG_DATE = datetime.date.today()
# DEBUG_DATE = datetime.date(2026, 3, 21)

DEBUG_TOOLBAR = "pytest" not in sys.modules
# DEBUG_TOOLBAR = True
# DEBUG_TOOLBAR = False
# PROFILING = True
PROFILING = False
ALLOWED_HOSTS = [
    "127.0.0.1",
    ".ngrok-free.app",
    "localhost",
    "172.21.0.3",
    "django",
    "lm.servyy-test.lxd",
    "lm.servyy-test",
    "lm.lehel.xyz",
    "stage.leaguesphere.servyy-test.lxd",
    "testserver",
]

CSRF_TRUSTED_ORIGINS = [
    "https://lm.lehel.xyz",
    "https://lm.servyy-test.lxd",
    "https://stage.leaguesphere.servyy-test.lxd",
]

# Sitemap domain for development
SITEMAP_DOMAIN = "localhost:8000"

if PROFILING:
    INSTALLED_APPS = [
        "silk",
    ] + INSTALLED_APPS
    MIDDLEWARE = [
        "silk.middleware.SilkyMiddleware",
    ] + MIDDLEWARE
    SILKY_PYTHON_PROFILER = True

if DEBUG_TOOLBAR:
    INSTALLED_APPS = INSTALLED_APPS + [
        "debug_toolbar",
    ]
    MIDDLEWARE = MIDDLEWARE + [
        "debug_toolbar.middleware.DebugToolbarMiddleware",
    ]

def show_toolbar(request):
    """
    Callback to determine whether to show the debug toolbar.
    Returns False if the database is offline to prevent the toolbar
    from attempting to query the database and causing a crash.
    """
    from django.core.cache import cache
    if cache.get('db_connection_status') is False:
        return False
    return True

DEBUG_TOOLBAR_CONFIG = {
    'SHOW_TOOLBAR_CALLBACK': show_toolbar,
}

# ProfilingPanel wraps every request in cProfile.Profile().enable() regardless
# of DISABLE_PANELS (that setting only hides it from the UI). On Python 3.12+,
# cProfile claims a process-wide sys.monitoring slot instead of a per-thread
# one, so concurrent requests on the threaded dev server race for it and
# raise "ValueError: Another profiling tool is already active". Omit it here
# since it's excluded from PANELS_DEFAULTS entirely rather than just disabled.
DEBUG_TOOLBAR_PANELS = [
    "debug_toolbar.panels.history.HistoryPanel",
    "debug_toolbar.panels.versions.VersionsPanel",
    "debug_toolbar.panels.timer.TimerPanel",
    "debug_toolbar.panels.settings.SettingsPanel",
    "debug_toolbar.panels.headers.HeadersPanel",
    "debug_toolbar.panels.request.RequestPanel",
    "debug_toolbar.panels.sql.SQLPanel",
    "debug_toolbar.panels.staticfiles.StaticFilesPanel",
    "debug_toolbar.panels.templates.TemplatesPanel",
    "debug_toolbar.panels.alerts.AlertsPanel",
    "debug_toolbar.panels.cache.CachePanel",
    "debug_toolbar.panels.signals.SignalsPanel",
    "debug_toolbar.panels.community.CommunityPanel",
    "debug_toolbar.panels.redirects.RedirectsPanel",
]

INTERNAL_IPS = ["127.0.0.1"]
