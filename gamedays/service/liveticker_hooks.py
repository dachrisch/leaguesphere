"""Gamedays-side access point for the liveticker feed hook (Phase 1, #2537)."""

from __future__ import annotations

from gamedays.service.registry import get


def live_feed(gameday_ids):
    return get("live_feed")(gameday_ids)


def today_statuses():
    return get("today_statuses")()


def gameday_ticker_url(gameday):
    return get("gameday_ticker_url")(gameday)
