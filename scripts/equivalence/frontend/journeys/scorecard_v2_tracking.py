"""Tracking journey: log, series, PAT and panels on a live game."""

import re

from .common import click_if_present, discover, role_view, run_steps


def _open_pat_sheet(page):
    """Open the extra-point sheet; a read-only game is a skip, not a timeout."""
    tile = page.get_by_role("button", name=re.compile(r"^Touchdown\b")).first
    if not tile.count() or not tile.is_enabled():
        raise LookupError("touchdown tile is read-only")
    tile.click()


def run(context, run_id, credentials):
    """Capture every Tracking slice, without writing to the shared game.

    The stage is a prod clone, so the journey opens an in-progress game that
    the staff harness account may view and drives only local UI state: the
    log filter, the Spielzug sheet, the extra-point sheet and the panels. The
    write paths are covered by the app's vitest/e2e suites; here the DOM/ARIA
    of each split area is the behaviour witness for the equivalence diff.
    """
    view = role_view(context, "staff")
    if view is None:
        return {}, ["tracking:staff-login-unavailable"]
    ids = discover(view, game_status="2. Halbzeit", prefer_last=True)
    if not ids.get("game_id"):
        return {}, ["tracking:no-live-game-on-stage"]
    tokens = {
        ids["gameday_id"]: "<entity-1>",
        ids["game_id"]: "<entity-2>",
    }
    path = f"/scorecard/v2/gameday/{ids['gameday_id']}/game/{ids['game_id']}/"
    steps, skipped = {}, []
    actions = [
        (
            "log-filter",
            lambda page: click_if_present(page, 'button:has-text("Nur Punkte")'),
        ),
        (
            "series-sheet",
            lambda page: click_if_present(page, 'button:has-text("Spielzug")'),
        ),
        ("series-close", lambda page: page.keyboard.press("Escape")),
        ("pat-sheet", _open_pat_sheet),
        ("pat-close", lambda page: page.keyboard.press("Escape")),
        (
            "panels",
            lambda page: click_if_present(page, 'button:has-text("Feldposition")'),
        ),
    ]
    run_steps(view, path, steps, skipped, actions=actions, tokens=tokens)
    return steps, skipped
