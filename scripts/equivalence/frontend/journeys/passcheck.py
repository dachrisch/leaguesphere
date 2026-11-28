"""Passcheck journey: the eligibility list for a run-id gameday."""

from .common import discover, id_tokens, optional, role_view, run_steps


def run(context, run_id, credentials):
    view = role_view(context, "staff")
    if view is None:
        return {}, ["passcheck:staff-login-unavailable"]
    ids = discover(view)
    if not ids.get("gameday_id"):
        return {}, ["passcheck:no-gameday-on-stage"]
    tokens = id_tokens(
        {ids["gameday_id"]: "<entity-1>", ids["game_id"]: "<entity-2>"}, run_id
    )
    steps, skipped = {}, []
    run_steps(
        view,
        f"/passcheck/?gameday={ids['gameday_id']}",
        steps,
        skipped,
        actions=[("team-list", optional("a[href*='list']"))],
        tokens=tokens,
    )
    return steps, skipped
