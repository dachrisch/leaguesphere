"""Tests for liveticker's gamedays hook (Phase 1, #2537)."""

from __future__ import annotations

from unittest.mock import patch

from liveticker.service import gamedays_hooks as hooks


def test_live_feed_delegates_to_the_service():
    with patch("liveticker.service.gamedays_hooks.LivetickerService") as service:
        service.return_value.get_liveticker_as_json.return_value = [{"gameId": 1}]
        assert hooks.live_feed([3, 4]) == [{"gameId": 1}]
        service.assert_called_once_with([], [], [3, 4])


def test_register_registers_the_hook():
    with patch("liveticker.service.gamedays_hooks.registry.register") as register:
        hooks.register()
    register.assert_called_once_with("live_feed", hooks.live_feed, "liveticker")
