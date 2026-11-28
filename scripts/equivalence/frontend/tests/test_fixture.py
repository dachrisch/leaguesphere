"""Fixture setup pins for the frontend journeys.

A started game needs a first-half possession or the scorecard disables its
play controls; a locked game deliberately stays stranded. The harness lock is
released before the possession PUT, because that endpoint checks it too.
"""

from __future__ import annotations

from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[4]
for part in ("scripts/equivalence", "scripts/equivalence/frontend"):
    sys.path.insert(0, str(ROOT / part))

from journeys import fixture  # noqa: E402


class FakeResponse:
    def __init__(self, status=200, payload=None):
        self.status = status
        self.payload = payload if payload is not None else {}

    def json(self):
        return self.payload


class FakeSession:
    """Only the calls fixture.create makes after the create/publish steps."""

    def __init__(self, *, possession_status=200, results=None):
        self.calls = []
        self.possession_status = possession_status
        self.results = (
            results
            if results is not None
            else [
                {"isHome": True, "team_id": 11, "team_name": "Equivalence Home"},
                {"isHome": False, "team_id": 12, "team_name": "Equivalence Away"},
            ]
        )

    def request(self, path, method="GET", json_body=None, **kwargs):
        self.calls.append({"path": path, "method": method, "json": json_body})
        if path.endswith("/games/"):
            return FakeResponse(
                200,
                {
                    "results": [
                        {
                            "id": 77,
                            "results": self.results,
                        }
                    ]
                },
            )
        if path.endswith("/possession"):
            return FakeResponse(self.possession_status)
        return FakeResponse()


def _patch_setup(monkeypatch, session):
    monkeypatch.setattr(fixture, "api_session", lambda context: session)
    monkeypatch.setattr(
        fixture,
        "discover",
        lambda context: {"season_id": 1, "league_id": 2},
    )
    monkeypatch.setattr(fixture, "_find_run", lambda session, run_id: 5)
    monkeypatch.setattr(fixture, "_run_step", lambda session, step, context: None)


def _calls(session, suffix):
    return [call for call in session.calls if call["path"].endswith(suffix)]


def test_started_fixture_sets_possession_after_releasing_the_device_lock(monkeypatch):
    session = FakeSession()
    _patch_setup(monkeypatch, session)

    game = fixture.create(object(), "fe-track-ref", started=True)

    assert game["game_id"] == 77
    release = _calls(session, "/device")
    puts = _calls(session, "/possession")
    assert len(release) == 1 and release[0]["method"] == "DELETE"
    assert len(puts) == 1 and puts[0]["method"] == "PUT"
    # The possession endpoint checks the device lock too, so it must come after
    # the harness has released its own lock.
    assert session.calls.index(puts[0]) > session.calls.index(release[0])
    assert puts[0]["json"] == {"team": "Equivalence Home"}


def test_possession_accepts_a_discovered_team_id_when_no_name_is_available(monkeypatch):
    session = FakeSession(results=[{"isHome": True, "team_id": 12, "team_name": None}])
    _patch_setup(monkeypatch, session)

    fixture.create(object(), "fe-track-ref", started=True)

    assert _calls(session, "/possession")[0]["json"] == {"team": "12"}


def test_possession_fails_loudly_when_no_team_can_be_discovered(monkeypatch):
    session = FakeSession(results=[])
    _patch_setup(monkeypatch, session)

    with pytest.raises(LookupError, match="no team for the possession"):
        fixture.create(object(), "fe-track-ref", started=True)

    assert not _calls(session, "/possession")


def test_fixture_possession_http_error_raises(monkeypatch):
    session = FakeSession(possession_status=400)
    _patch_setup(monkeypatch, session)

    with pytest.raises(RuntimeError, match="fixture possession: HTTP 400"):
        fixture.create(object(), "fe-track-ref", started=True)


def test_locked_fixture_stays_stranded_without_possession(monkeypatch):
    session = FakeSession()
    _patch_setup(monkeypatch, session)

    fixture.create(object(), "fe-locked-ref", started=True, locked=True)

    assert not _calls(session, "/device")
    assert not _calls(session, "/possession")
