"""Shared fixtures for the T3 endpoint tests.

The two write paths (legacy ``/api/gamelog/<id>`` and canonical
``/api/game/<id>/events``) must be compared on the same game setup, so the
helpers here build a game with a home/away result pair and post JSON bodies
through Django's test client (session auth, no CSRF enforcement in tests).

The helpers are also the one place that sets up what the *app* sets up: a
submission id that the legacy endpoint accepts (a UUID, ``sub_id``), and -- for
the tests that are about the device lock -- a ``GameSetup`` row holding the
device that claimed the game (``lock_device``). A game without a setup row has
no stored device, and the lock lets every write through, which is exactly how
the old scorecard (no device header at all) still works.
"""

import json
import uuid

from rest_framework.reverse import reverse

from gameevents.tests.golden_cases import ROW_FIELDS
from gamedays.constants import API_GAMELOG
from gamedays.models import TeamLog
from gamedays.tests.setup_factories.factories import (
    GameresultFactory,
    GameinfoFactory,
    GameSetupFactory,
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


def lock_device(game, device_id="device-a"):
    """Give ``game`` a setup row holding ``device_id`` -- the device lock.

    Written the way the v2 app writes it (``PUT /api/game/<pk>/setup`` with
    ``X-Scorecard-Device``): the first non-empty id wins until staff release
    it. Both write endpoints read this row, so the same fixture serves the
    lock tests of ``/api/gamelog/`` and ``/api/game/<id>/events``.
    """

    return GameSetupFactory(gameinfo=game, device_id=device_id)


def login(client):
    user = UserFactory()
    client.force_login(user)
    return user


def _device_headers(device):
    """``X-Scorecard-Device`` as the app sends it, or nothing (old app)."""

    return {} if device is None else {"HTTP_X_SCORECARD_DEVICE": device}


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


def post_legacy(client, game, body, device=None):
    return client.post(
        reverse(API_GAMELOG, kwargs={"id": game.pk}),
        data=json.dumps(body),
        content_type="application/json",
        **_device_headers(device),
    )


def post_events(client, game, body, device=None):
    return client.post(
        reverse(NEW_EVENTS_URL, kwargs={"game_id": game.pk}),
        data=json.dumps(body),
        content_type="application/json",
        **_device_headers(device),
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


_SUB_NAMESPACE = uuid.UUID("6f9619ff-8b86-d011-b42d-00c04fc964ff")


def sub_id(n: int) -> str:
    """A deterministic submission id.

    The legacy endpoint validates the outbox ids the app actually sends, so a
    readable placeholder like sub_id(1) is a 400; this keeps the tests readable
    while using a real UUID.
    """
    return str(uuid.uuid5(_SUB_NAMESPACE, f"sub-{n}"))
