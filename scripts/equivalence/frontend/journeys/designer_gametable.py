"""Designer journey: team-option menu and row state on a team cell."""

from . import fixture
from .common import click, id_tokens, optional, press, role_view, run_steps


def run(context, run_id, credentials):
    view = role_view(context, "staff")
    if view is None:
        return {}, ["designer:staff-login-unavailable"]
    steps, skipped = {}, []
    game = fixture.create(view, f"fe-designer-{run_id}")
    try:
        tokens = id_tokens({game["gameday_id"]: "<entity-1>"}, run_id)
        actions = [
            # The cell and its react-select control are only present once the
            # canvas published a game; record an absence instead of faking it.
            ("select-team", optional("[id^='team-']")),
            ("team-options", optional("[id^='team-'] .official-select__control")),
            ("options-close", press("Escape")),
            ("read-row", optional("tr[id^='game-']")),
        ]
        url = (
            f"/gamedays/gameday/design/?season={game['season_id']}"
            f"&league={game['league_id']}"
        )
        run_steps(view, url, steps, skipped, actions=actions, tokens=tokens)
    finally:
        fixture.cleanup(view, game)
    return steps, skipped
