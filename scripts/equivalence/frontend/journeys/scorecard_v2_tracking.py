"""Tracking journey: open a game, record one play, undo it."""

from .common import click_if_present, discover, run_steps


def run(context, run_id, credentials):
    user, password = credentials.get("staff", ("", ""))
    ids = discover(context, user, password)
    if not ids.get("game_id"):
        return {}, ["tracking:no-game-on-stage"]
    tokens = {
        ids["gameday_id"]: "<entity-1>",
        ids["game_id"]: "<entity-2>",
    }
    path = f"/scorecard/v2/gameday/{ids['gameday_id']}/game/{ids['game_id']}/"
    steps, skipped = {}, []
    actions = [
        (
            "record-play",
            lambda page: click_if_present(
                page, '.tracking .action-grid > .action:has(kbd[data-key="8"])'
            ),
        ),
        (
            "undo",
            lambda page: click_if_present(
                page, '.log-row button[aria-label*="ückgängig"], [data-testid="undo"]'
            ),
        ),
    ]
    run_steps(context, path, steps, skipped, actions=actions, tokens=tokens)
    return steps, skipped
