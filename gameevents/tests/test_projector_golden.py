"""Database-backed golden tests: projector == today's writers.

The projector tests themselves are pure (``test_projector.py``). This module
answers the plan's acceptance question against the real writers:

- every v2 payload replayed through ``GameLogCreator`` produces the same
  ``TeamLog`` rows (including ``sequence``) as ``project_submission``;
- the start/half-time/end markers replayed through
  ``GameService._create_log_entry`` match the projector's marker rows.

If someone changes a legacy mapping, these fail and ``golden_cases.py`` must be
updated deliberately.
"""

import pytest

from gameevents.service.projector import (
    GameEventValue,
    GameStateValue,
    project_submission,
)
from gameevents.tests.golden_cases import (
    GOLDEN_CASES,
    MARKER_CASES,
    ROW_FIELDS,
    expected_signature,
    row_signature,
)
from gamedays.models import TeamLog
from gamedays.service.game_service import GameService
from gamedays.service.gamelog import GameLogCreator
from gamedays.tests.setup_factories.factories import (
    GameresultFactory,
    GameinfoFactory,
    TeamFactory,
    UserFactory,
)


def _db_signature(row, home):
    return tuple(
        getattr(row, field)
        if field != "side"
        else ("home" if row.team_id == home.pk else "away")
        for field in ROW_FIELDS
    )


@pytest.mark.django_db
@pytest.mark.parametrize("case", GOLDEN_CASES, ids=lambda case: case.name)
def test_projector_matches_the_real_gamelog_writer(case):
    game = GameinfoFactory()
    home = TeamFactory(name=f"{case.name}-home")
    away = TeamFactory(name=f"{case.name}-away")
    GameresultFactory(gameinfo=game, team=home, isHome=True)
    GameresultFactory(gameinfo=game, team=away, isHome=False)
    user = UserFactory()
    team = home if case.side == "home" else away

    GameLogCreator(game, team, case.entries, user, case.half).create()

    written = list(TeamLog.objects.filter(gameinfo=game).order_by("pk"))
    actual = [_db_signature(row, home) for row in written]
    assert actual == expected_signature(case)

    projection = project_submission(GameStateValue(), case.events)

    assert [row_signature(row) for row in projection.rows] == actual
    assert projection.deleted_sequences == []
    assert projection.restored_sequences == []


@pytest.mark.django_db
@pytest.mark.parametrize("case", MARKER_CASES, ids=lambda case: case.name)
def test_period_markers_match_the_game_service_writer(case):
    game = GameinfoFactory()
    user = UserFactory()

    GameService(game.pk)._create_log_entry(case.event_name, user)

    written = list(TeamLog.objects.filter(gameinfo=game))
    assert len(written) == 1
    actual = (
        written[0].event,
        None if written[0].team_id is None else "team",
        written[0].player,
        written[0].input,
        written[0].value,
        written[0].half,
        written[0].cop,
        written[0].isDeleted,
        written[0].sequence,
    )

    projection = project_submission(
        GameStateValue(),
        [GameEventValue(type="period", code=case.code, seq=1)],
    )

    assert row_signature(projection.rows[0]) == actual


def test_projected_vocabulary_matches_the_current_write_path():
    from gameevents.service.projector import (
        EXCLUDED_EVENTS,
        SCORING_EVENT_VALUES,
    )
    from gamedays.service.gamelog import EXCLUDED_EVENTS as CURRENT_EXCLUDED
    from gamedays.service.gamelog import (
        SCORING_EVENT_VALUES as CURRENT_SCORING_VALUES,
    )

    assert SCORING_EVENT_VALUES == CURRENT_SCORING_VALUES
    assert set(EXCLUDED_EVENTS) == set(CURRENT_EXCLUDED)
