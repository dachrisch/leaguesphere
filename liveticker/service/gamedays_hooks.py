"""liveticker implementations of gamedays hooks (Phase 1, #2537)."""

from __future__ import annotations

from gamedays.service import detail_context, registry
from liveticker.service.today_status import today_statuses as _today_statuses
from liveticker.urls import gameday_ticker_url as _gameday_ticker_url
from liveticker.service.liveticker_service import LivetickerService


def live_feed(gameday_ids):
    return LivetickerService([], [], gameday_ids).get_liveticker_as_json()


def today_statuses():
    return _today_statuses()


def gameday_ticker_url(gameday):
    return _gameday_ticker_url(gameday)


def detail_contributor(draft):
    draft.url_pattern_liveticker = gameday_ticker_url(draft.gameday)


def register():
    detail_context.register_contributor("liveticker", 30, detail_contributor)
    registry.register("live_feed", live_feed, "liveticker")
    registry.register("today_statuses", today_statuses, "liveticker")
    registry.register("gameday_ticker_url", gameday_ticker_url, "liveticker")
