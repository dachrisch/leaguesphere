"""Shared fixtures for the T3 endpoint tests.

The two write paths (legacy ``/api/gamelog/<id>`` and canonical
``/api/game/<id>/events``) must be compared on the same game setup, so the
helpers here build a game with a home/away result pair and post JSON bodies
through Django's test client (session auth, no CSRF enforcement in tests).
"""

import json

from rest_framework.reverse import reverse

from gameevents.tests.golden_cases import ROW_FIELDS
from gamedays.constants import API_GAMELOG
from gamedays.models import TeamLog
from gamedays.tests.setup_factories.factories import (
    GameresultFactory,
    GameinfoFactory,
    TeamFactory,
    UserFactory,
)

NEW_EVENTS_URL = "api-game-events"


def make_game(label):
    """A game with a home and an away team, as ``GameLog`` expects."""

    game = GameinfoFactory()
    home = TeamFactory(name=f"{label}-home", description=f"{label} home")
    away = TeamFactory(name=f"{label}-away", description=f"{label} away")
    GameresultFactory(gameinfo=game, team=home, isHome=True)
    GameresultFactory(gameinfo=game, team=away, isHome=False)
    return game, home, away


def login(client):
    user = UserFactory()
    client.force_login(user)
    return user


def legacy_body(game, team, entries, half=1, client_id=None):
    body = {
        "gameId": game.pk,
        "team": team.pk if hasattr(team, "pk") else team,
        "half": half,
        "event": entries,
    }
    if client_id is not None:
        body["client_id"] = client_id
    return body


def post_legacy(client, game, body):
    return client.post(
        reverse(API_GAMELOG, kwargs={"id": game.pk}),
        data=json.dumps(body),
        content_type="application/json",
    )


def post_events(client, game, body):
    return client.post(
        reverse(NEW_EVENTS_URL, kwargs={"game_id": game.pk}),
        data=json.dumps(body),
        content_type="application/json",
    )


def db_row_signatures(game, home):
    """``TeamLog`` rows of ``game`` in the golden comparison shape."""

    rows = TeamLog.objects.filter(gameinfo=game).order_by("pk")
    return [
        tuple(
            ("home" if row.team_id == home.pk else "away")
            if field == "side"
            else getattr(row, field)
            for field in ROW_FIELDS
        )
        for row in rows
    ]
