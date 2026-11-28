"""Port for "which games did a team officiate" on the officials team page.

The answer is rendered through the match report (license level, expiry note,
hyperlinked license number), which lives in ``matchreport``. ``matchreport``
already depends on ``officials``, so ``officials`` must not import it back:
it owns this port and ``matchreport`` registers the implementation from its
``AppConfig.ready()`` (architecture scan 2026-11-28, B3).
"""

from django.core.exceptions import ImproperlyConfigured

_provider = None


def register_provider(provider) -> None:
    """Set the implementation; idempotent, the last registration wins."""
    global _provider
    _provider = provider


def team_officiated_games(
    team_id: int,
    season: int,
    include_official_actions: bool = False,
    next_path=None,
) -> list:
    if _provider is None:
        raise ImproperlyConfigured(
            "No officiated-games provider registered; is 'matchreport' in "
            "INSTALLED_APPS?"
        )
    return _provider(
        team_id,
        season,
        include_official_actions=include_official_actions,
        next_path=next_path,
    )
