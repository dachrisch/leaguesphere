"""GameSetup journey: crew selection, a real start and the saved-setup state."""

from . import fixture
from .common import click, id_tokens, optional, press, role_view, run_steps


def run(context, run_id, credentials):
    """Write a crew/start through the UI, then re-open the saved setup."""
    view = role_view(context, "staff")
    if view is None:
        return {}, ["gamesetup:staff-login-unavailable"]
    steps, skipped = {}, []
    game = fixture.create(view, f"fe-setup-{run_id}")
    try:
        tokens = id_tokens(
            {game["gameday_id"]: "<entity-1>", game["game_id"]: "<entity-2>"}, run_id
        )
        path = f"/scorecard/v2/gameday/{game['gameday_id']}/game/{game['game_id']}/"
        actions = [
            # The crew picker is opened from a slot's ARIA label; the option is
            # genuinely optional (a stage with no officials still starts).
            ("crew-open", click('button[aria-label*="Offiziellen wählen"]')),
            ("crew-option", optional('[role="option"]:not([aria-disabled="true"])')),
            ("crew-close", press("Escape")),
            # First tap opens the confirmation; the sheet's button writes the
            # crew and setup and starts the game.
            ("start-open", optional(".setupfoot button.startbtn")),
            ("start-write", optional(".sheet .sheetfoot button.startbtn")),
        ]
        run_steps(view, path, steps, skipped, actions=actions, tokens=tokens)
        # A saved setup changes the primary action to "Fortsetzen"; if the
        # start was refused, record the absence instead of faking the state.
        run_steps(
            view,
            path,
            steps,
            skipped,
            prefix="saved-",
            actions=[("resume", optional('button:has-text("Fortsetzen")'))],
            tokens=tokens,
        )
    finally:
        fixture.cleanup(view, game)
    return steps, skipped
