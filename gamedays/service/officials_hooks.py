"""Gamedays-side access point for officials hooks (Phase 1, #2537)."""

from __future__ import annotations

from gamedays.service.registry import get


def current_licenses(official_ids):
    return get("current_licenses")(official_ids)
