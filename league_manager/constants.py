ADMIN_ALL_URLS = "admin-all-urls"
CLEAR_CACHE = "clear-cache"
LEAGUE_MANAGER_MAINTENANCE = "maintenance"
MAINTENANCE_CONFIG_CACHE_KEY = "site_maintenance_config"
MAINTENANCE_CONFIG_CACHE_TTL = 30
MAINTENANCE_SCOPE_OFF = "off"
MAINTENANCE_SCOPE_FULL = "full"
MAINTENANCE_SCOPE_WRITES_ONLY = "writes_only"
MAINTENANCE_SCOPE_CUSTOM = "custom"

# Static info files for crawlers and AI agents, served without a database
# connection. Single source of truth:
# - league_manager/urls.py routes them (strip the leading slash for path())
# - maintenance-mode and database-guard middlewares exempt them exactly
# - facts.json (tier 2) advertises them in agentDocumentation
STATIC_INFO_PATHS = {
    "sitemap": "/sitemap.xml",
    "robots": "/robots.txt",
    "llms": "/llms.txt",
    "llms-full": "/llms-full.txt",
    "llms-dynamic": "/llms-dynamic.txt",
    "facts": "/facts.json",
    "security": "/.well-known/security.txt",
}

# Prefix-based exemptions for static assets and the RFC 8615 well-known
# directory (covers security.txt and agent-card.json).
STATIC_INFO_PREFIXES = ("/static/", "/media/", "/.well-known/")


def static_info_url_pattern(key: str) -> str:
    """URL pattern for a STATIC_INFO_PATHS entry (paths carry a leading
    slash for middleware matching; Django path() patterns must not)."""
    return STATIC_INFO_PATHS[key].removeprefix("/")
