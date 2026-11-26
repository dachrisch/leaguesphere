"""Passcheck journey: the eligibility list for a run-id gameday."""

from .common import click_if_present, discover, run_steps


def run(context, run_id, credentials):
    user, password = credentials.get("staff", ("", ""))
    ids = discover(context, user, password)
    if not ids.get("gameday_id"):
        return {}, ["passcheck:no-gameday-on-stage"]
    tokens = {ids["gameday_id"]: "<entity-1>", ids["game_id"]: "<entity-2>"}
    steps, skipped = {}, []
    run_steps(
        context,
        f"/passcheck/?gameday={ids['gameday_id']}",
        steps,
        skipped,
        actions=[
            (
                "team-list",
                lambda page: click_if_present(page, "a[href*='list']"),
            )
        ],
        tokens=tokens,
    )
    return steps, skipped
