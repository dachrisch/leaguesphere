"""GameSetup journey: crew selection and the start confirmation screen."""

from .common import click_if_present, discover, role_view, run_steps


def run(context, run_id, credentials):
    """Capture the crew and start slices on a planned game (no writes)."""
    view = role_view(context, "staff")
    if view is None:
        return {}, ["gamesetup:staff-login-unavailable"]
    ids = discover(view, game_status="Geplant")
    if not ids.get("gameday_id"):
        return {}, ["gamesetup:no-planned-game-on-stage"]
    tokens = {ids["gameday_id"]: "<entity-1>", ids["game_id"]: "<entity-2>"}
    steps, skipped = {}, []
    actions = [
        # The crew picker is opened from a slot's ARIA label, not a CSS class
        # that the component may rename when the crew slice is extracted.
        (
            "crew-open",
            lambda page: click_if_present(page, 'button[aria-label*="wählen"]'),
        ),
        ("crew-close", lambda page: page.keyboard.press("Escape")),
        # The first tap of the two-step start only opens the confirmation; it
        # never posts a start. The run-id-tagged game is left untouched.
        (
            "start-confirm",
            lambda page: click_if_present(page, 'button:has-text("Fortsetzen")'),
        ),
        ("start-close", lambda page: page.keyboard.press("Escape")),
    ]
    run_steps(
        view,
        f"/scorecard/v2/gameday/{ids['gameday_id']}/game/{ids['game_id']}/",
        steps,
        skipped,
        actions=actions,
        tokens=tokens,
    )
    return steps, skipped
