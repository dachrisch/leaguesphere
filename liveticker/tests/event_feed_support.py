"""Fixtures for the liveticker's event-projection flag (T5).

A live game is built by hand (results, status, scheduled) so the slot filters
of ``LivetickerService`` select it. Events are appended through the canonical
service -- the same path the scorecard uses -- so the projection and the rows
the liveticker reads are exactly what production would hold.
"""

from datetime import time

from gameevents.models import GameEvent
from gameevents.service.append import append_submission
from gameevents.service.projector import GameEventValue
from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameresultFactory,
    GameinfoFactory,
    TeamFactory,
)


def make_live_game(label, gameday=None, status="1. Halbzeit", scheduled=time(10, 0)):
    """A game the liveticker selects, with a home/away result pair."""

    gameday = gameday or GamedayFactory()
    home = TeamFactory(name=f"{label}-home", description=f"{label} home")
    away = TeamFactory(name=f"{label}-away", description=f"{label} away")
    game = GameinfoFactory(
        gameday=gameday,
        status=status,
        scheduled=scheduled,
        in_possession=home.name,
        gameStarted=scheduled,
    )
    GameresultFactory(gameinfo=game, team=home, fh=0, sh=0, pa=0, isHome=True)
    GameresultFactory(gameinfo=game, team=away, fh=0, sh=0, pa=0, isHome=False)
    return game, home, away


def event(type, code="", side=None, player=None, period=1, payload=None):
    """One envelope in the shape ``GameEventValue`` expects."""

    return GameEventValue(
        type=type,
        code=code,
        side=side,
        player=player,
        period=period,
        payload=payload or {},
    )


def submit(game, events, client_id="sub-1"):
    """Append one submission and project it into rows/state (like the app)."""

    return append_submission(
        game,
        events,
        client_id=client_id,
        source=GameEvent.Source.V2,
        write_rows=True,
    )
