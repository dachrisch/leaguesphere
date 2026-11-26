"""liveticker implementations of gamedays hooks (Phase 1, #2537)."""

from __future__ import annotations

from gamedays.service import registry
from liveticker.service.liveticker_service import LivetickerService


def live_feed(gameday_ids):
    return LivetickerService([], [], gameday_ids).get_liveticker_as_json()


def register():
    registry.register("live_feed", live_feed, "liveticker")
