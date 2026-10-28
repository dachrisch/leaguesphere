"""Database-backed golden test: projector rows == today's GameLog rows.

The projector tests themselves are pure (``test_projector.py``). This module
exists only to answer the plan's acceptance question against the real writer:
it replays each v2 payload through ``gamedays.service.gamelog.GameLogCreator``
and compares the resulting ``TeamLog`` rows with the projector's output for the
same submission. If someone changes the legacy mapping, this fails and the
fixture table in ``golden_cases.py`` must be updated deliberately.
"""

import pytest

from gameevents.service.projector import GameStateValue, apply
from gameevents.tests.golden_cases import (
    GOLDEN_CASES,
    ROW_FIELDS,
    expected_signature,
    row_signature,
)
from gamedays.models import TeamLog
from gamedays.service.gamelog import GameLogCreator
from gamedays.tests.setup_factories.factories import (
    GameresultFactory,
    GameinfoFactory,
    TeamFactory,
    UserFactory,
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
    actual = [
        tuple(
            getattr(row, field)
            if field != "side"
            else ("home" if row.team_id == home.pk else "away")
            for field in ROW_FIELDS
        )
        for row in written
    ]
    assert actual == expected_signature(case)

    new_state = GameStateValue()
    projected = []
    for golden_event in case.events:
        new_state, rows = apply(new_state, golden_event)
        projected.extend(rows)

    assert [row_signature(row) for row in projected] == actual
