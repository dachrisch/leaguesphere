"""Gamedays-side access points for LeagueGroup lookup hooks (Phase 1, #2537)."""

from __future__ import annotations

from gamedays.service.registry import get


def group_options(ids):
    return get("group_options")(ids)


def group_by_id(pk):
    return get("group_by_id")(pk)
