"""Designer journey: team-option menu and row state on a team cell."""

from .common import click, discover, press, role_view, run_steps


def run(context, run_id, credentials):
    view = role_view(context, "staff")
    if view is None:
        return {}, ["designer:staff-login-unavailable"]
    ids = discover(view)
    if not ids.get("gameday_id"):
        return {}, ["designer:no-gameday-on-stage"]
    tokens = {ids["gameday_id"]: "<entity-1>"}
    steps, skipped = {}, []
    actions = [
        # The cell itself, then the react-select control that owns the grouped
        # team-option menu extracted by Layer 5.
        ("select-team", click("[id^='team-']")),
        ("team-options", click("[id^='team-'] .official-select__control")),
        ("options-close", press("Escape")),
        ("read-row", click("tr[id^='game-']")),
    ]
    run_steps(
        view,
        f"/gamedays/gameday/design/?season={ids['season_id']}&league={ids['league_id']}",
        steps,
        skipped,
        actions=actions,
        tokens=tokens,
    )
    return steps, skipped
