"""Shared helper for linking to an official's profile page.

Used both by the Moodle-sync report links
(officials/service/moodle/moodle_service.py) and by matchreport's referee
tables (matchreport/service/model_wrapper.py), so the link target can't
silently drift between call sites. Lives in its own module (rather than
official_service.py) to avoid a circular import: official_service.py
already imports moodle_service.py.
"""


def official_profile_url(official_id) -> str:
    # Local import mirrors the existing convention at both call sites -
    # avoids importing officials.urls (and everything it pulls in via
    # officials.views) at module load time.
    from django.urls import reverse

    from officials.urls import OFFICIALS_PROFILE_LICENSE

    return reverse(OFFICIALS_PROFILE_LICENSE, kwargs={"pk": official_id})


def official_profile_gamelist_url(official_id, season) -> str:
    """The official's per-season game list page - what matchreport's
    referee table license-number link points to (rather than the license
    profile page official_profile_url() returns)."""
    from django.urls import reverse

    from officials.urls import OFFICIALS_PROFILE_GAMELIST

    return reverse(
        OFFICIALS_PROFILE_GAMELIST, kwargs={"pk": official_id, "season": season}
    )
