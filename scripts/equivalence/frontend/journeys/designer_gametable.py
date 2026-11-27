"""Designer journey: edit a team cell and capture the autosave PUT."""

from . import fixture
from .common import click, id_tokens, no_op, press, required_click, role_view, run_steps

TEAM_SELECT = ".react-select__control"
TEAM_OPTION = (
    ".react-select__option"
    ":not(.react-select__option--is-disabled)"
    ":not(.react-select__option--is-selected)"
)
AUTOSAVE_TIMEOUT_MS = 8000  # the designer debounces its autosave by 1.5 s


def _is_designer_save(response):
    return "/designer-state/" in response.url and response.request.method == "PUT"


def _pick_team_and_save(page, absent):
    """Pick another team for the cell and wait for the designer's own PUT.

    No PUT within the timeout raises, which ``run_steps`` records as a skipped
    step and the runner fails on: the journey can no longer pass without a
    real write.
    """
    del absent
    with page.expect_response(_is_designer_save, timeout=AUTOSAVE_TIMEOUT_MS):
        required_click(page, TEAM_OPTION)


def run(context, run_id, credentials):
    view = role_view(context, "staff")
    if view is None:
        return {}, ["designer:staff-login-unavailable"]
    steps, skipped = {}, []
    # A DRAFT gameday: a published one is locked and its cells are read-only.
    game = fixture.create(view, f"fe-designer-{run_id}", publish=False)
    try:
        tokens = id_tokens({game["gameday_id"]: "<entity-1>"}, run_id)
        actions = [
            ("team-options", click(TEAM_SELECT)),
            ("team-save", _pick_team_and_save),
            ("options-close", press("Escape")),
            ("after-save", no_op),
        ]
        url = f"/gamedays/gameday/design/designer/{game['gameday_id']}"
        run_steps(view, url, steps, skipped, actions=actions, tokens=tokens)
    finally:
        fixture.cleanup(view, game)
    return steps, skipped
