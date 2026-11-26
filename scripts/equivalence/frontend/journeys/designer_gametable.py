"""Designer journey: open a gameday's team table and inspect a row."""

from .common import click_if_present, discover, run_steps


def run(context, run_id, credentials):
    ids = discover(context)
    if not ids.get("gameday_id"):
        return {}, ["designer:no-gameday-on-stage"]
    tokens = {ids["gameday_id"]: "<entity-1>"}
    steps, skipped = {}, []
    actions = [
        (
            "select-team",
            lambda page: click_if_present(page, "[id^='team-']"),
        ),
        (
            "read-row",
            lambda page: click_if_present(page, "tr[id^='game-']"),
        ),
    ]
    run_steps(
        context,
        f"/gamedays/gameday/design/?season={ids['season_id']}&league={ids['league_id']}",
        steps,
        skipped,
        actions=actions,
        tokens=tokens,
    )
    return steps, skipped
