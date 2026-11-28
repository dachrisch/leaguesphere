"""GameSetup journey: crew selection, a real start and the saved-setup state."""

from . import fixture
from .common import (
    click,
    id_tokens,
    no_op,
    optional,
    press,
    required_click,
    role_view,
    run_steps,
)

OFFICIAL_SLOT = 'button[aria-label*="Offiziellen wählen"]'
OFFICIAL_SEARCH = 'input[aria-label*="Person suchen"]'
OFFICIAL_SEARCH_TIMEOUT_MS = 4000  # PersonPicker debounces by 250 ms


def _is_official_search(response):
    """The free-text picker's debounced directory lookup, GET only."""
    return (
        "/api/officials/search/list" in response.url
        and response.request.method == "GET"
    )


def _assign_officials(page, absent):
    """Fill every required crew slot with a real free-text entry via the UI.

    The league requires four officials; without them the start button stays
    disabled ("Angaben fehlen") and the journey would record a skipped write.
    Wait for the picker's debounced lookup before taking the free-text option:
    clicking early left the request unfired on one side only, which made a
    ref-vs-ref noise floor differ in captured request counts.
    """
    del absent
    for index in range(4):
        required_click(page, f"{OFFICIAL_SLOT} >> nth={index}")
        with page.expect_response(
            _is_official_search, timeout=OFFICIAL_SEARCH_TIMEOUT_MS
        ):
            page.locator(OFFICIAL_SEARCH).first.fill(
                f"Equivalence Official {index + 1}"
            )
        required_click(page, "button.ppfree")


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
            ("officials", _assign_officials),
            # The start button is disabled until the three required setup
            # choices are made in the UI. Pick the first option of each group;
            # these are real writes/choices, not a bypass of the start gate.
            (
                "toss",
                click('div[aria-label="Münzwurf gewonnen von"] button:first-child'),
            ),
            (
                "possession",
                click('div[aria-label="Erster Ballbesitz"] button:first-child'),
            ),
            (
                "direction",
                click('div[aria-label="Spielrichtung"] button:first-child'),
            ),
            # First tap opens the confirmation; the sheet's button writes the
            # crew and setup and starts the game. Both are required writes: an
            # absent control must fail the journey, not yield an "absent"-only
            # step that compares equal on both sides.
            ("start-open", click(".setupfoot button.startbtn")),
            ("start-write", click(".sheet .sheetfoot button.startbtn")),
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
