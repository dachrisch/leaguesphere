"""Gamedays-side access point for the liveticker feed hook (Phase 1, #2537)."""

from __future__ import annotations

from gamedays.service.registry import get


def live_feed(gameday_ids):
    return get("live_feed")(gameday_ids)
