"""Designer journey: edit a team cell and capture the autosave PUT."""

import copy
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import scenarios  # noqa: E402

from . import fixture
from .common import (
    click,
    id_tokens,
    no_op,
    press,
    required_click,
    role_view,
    run_steps,
)

TEAM_SELECT = ".react-select__control"
GAMEDAY_NAME_FIELD = "#gamedayName"
TEAM_OPTION = (
    ".react-select__option"
    ":not(.react-select__option--is-disabled)"
    ":not(.react-select__option--is-selected)"
)
AUTOSAVE_TIMEOUT_MS = 8000  # the designer debounces its autosave by 1.5 s

# buildGroupedTeamOptions only offers teams with ``groupId is None``; the bare
# {id, label} teams in the shared backend fixture are silently dropped by the
# designer. Give every team the real GlobalTeam shape and keep one unassigned.
DESIGNER_CANVAS = copy.deepcopy(scenarios.CANVAS_WITH_TEAMS)
for _index, _team in enumerate(DESIGNER_CANVAS["globalTeams"]):
    _team.update(groupId=None, order=_index, color="#6c757d")
DESIGNER_CANVAS["globalTeams"].append(
    {
        "id": "eq-spare",
        "label": "Equivalence Spare",
        "groupId": None,
        "order": 3,
        "color": "#6c757d",
    }
)


def _is_designer_save(response):
    return "/designer-state/" in response.url and response.request.method == "PUT"


def _designer_loaded(page):
    """The gameday name input is filled only after the designer fetched it.

    An empty form with a "Loading..." hint looks network-quiet, so comparing
    it against a loaded fixture produced false DOM/ARIA diffs on ref-vs-ref.
    Waiting for this field is the observable readiness condition, not a
    volatile-text exception.
    """
    field = page.locator(GAMEDAY_NAME_FIELD)
    return field.count() > 0 and bool(field.first.input_value().strip())


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
    game = fixture.create(
        view, f"fe-designer-{run_id}", publish=False, canvas=DESIGNER_CANVAS
    )
    try:
        tokens = id_tokens({game["gameday_id"]: "<entity-1>"}, run_id)
        actions = [
            ("team-options", click(TEAM_SELECT)),
            ("team-save", _pick_team_and_save),
            ("options-close", press("Escape")),
            ("after-save", no_op),
        ]
        url = f"/gamedays/gameday/design/designer/{game['gameday_id']}"
        run_steps(
            view,
            url,
            steps,
            skipped,
            actions=actions,
            tokens=tokens,
            ready=_designer_loaded,
        )
    finally:
        fixture.cleanup(view, game)
    return steps, skipped
