"""Dedicated, run-id-tagged games for the frontend journeys.

The agent stage shares one database between ref and cand. Every journey that
writes therefore creates its *own* gameday/game through the same API steps the
backend write scenarios use, with a ``<run-id>-ref`` / ``<run-id>-cand`` suffix,
and removes it afterwards. Ref and cand never write to each other's fixture.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import scenarios  # noqa: E402

from .common import api_session, discover  # noqa: E402


def _run_step(session, step, context):
    from scenarios import _resolve

    response = session.request(
        _resolve(step.path, context),
        method=step.method,
        json_body=_resolve(step.json, context) if step.json is not None else None,
        form=_resolve(step.form, context) if step.form is not None else None,
    )
    expected = step.expect if isinstance(step.expect, tuple) else (step.expect,)
    if response.status not in expected:
        raise RuntimeError(
            f"fixture {step.name}: HTTP {response.status} (expected {expected})"
        )
    return response


def _find_run(session, run_id):
    response = session.request(f"/api/gamedays/?search={run_id}&page_size=50")
    if response.status != 200:
        raise RuntimeError(f"fixture discovery: HTTP {response.status}")
    payload = response.json()
    items = payload.get("results", payload if isinstance(payload, list) else [])
    for item in items:
        if run_id in (item.get("name") or ""):
            return item["id"]
    raise LookupError(f"fixture gameday for {run_id} was not created")


def create(
    context, run_id, *, started=False, finished=False, locked=False, publish=True
):
    """Create one gameday/game and optionally start or finish its game.

    ``publish=False`` stops after saving the designer canvas: the gameday stays
    a DRAFT the designer can still edit (a published one is locked), so the
    result has no ``game_id``.
    """
    session = api_session(context)
    seed = discover(context)
    if not seed.get("season_id") or not seed.get("league_id"):
        raise LookupError("no season/league on stage for a journey fixture")
    fixture_context = {
        "run_id": run_id,
        "season_id": seed["season_id"],
        "league_id": seed["league_id"],
    }
    _run_step(session, scenarios._gameday_create_step(), fixture_context)
    # The publish steps interpolate {gameday_id}; resolve it from the created
    # row before replaying them, exactly as the backend runner's capture does.
    gameday_id = _find_run(session, run_id)
    fixture_context["gameday_id"] = gameday_id
    steps = scenarios._publish_steps_with_teams()
    if not publish:
        steps = [step for step in steps if step.method == "PUT"]
        for step in steps:
            _run_step(session, step, fixture_context)
        return {
            "gameday_id": gameday_id,
            "season_id": seed["season_id"],
            "league_id": seed["league_id"],
            "run_id": run_id,
        }
    for step in steps:
        _run_step(session, step, fixture_context)

    games = session.request(f"/api/gamedays/{gameday_id}/games/")
    payload = games.json()
    rows = payload if isinstance(payload, list) else payload.get("results", [])
    if not rows:
        raise LookupError(f"fixture game for {run_id} was not published")
    game = rows[0]

    if started or finished:
        response = session.request(
            f"/api/game/{game['id']}/setup",
            method="PUT",
            json_body={
                "ctResult": "Home",
                "direction": "Nord",
                "fhPossession": game.get("team_name") or "",
                "device_id": f"fe-{run_id}",
            },
        )
        if response.status >= 400:
            raise RuntimeError(f"fixture start: HTTP {response.status}")
        # The browser has its own device id; release the harness lock so the
        # journey's UI writes are not refused as a device conflict. A `locked`
        # fixture deliberately keeps it to exercise the stranded/read-only UI.
        if not locked:
            session.request(f"/api/game/{game['id']}/device", method="DELETE")
    if finished:
        response = session.request(
            f"/api/game/{game['id']}/finalize", method="PUT", json_body={}
        )
        if response.status >= 400:
            raise RuntimeError(f"fixture finalize: HTTP {response.status}")

    return {
        "gameday_id": gameday_id,
        "game_id": game["id"],
        "season_id": seed["season_id"],
        "league_id": seed["league_id"],
        "run_id": run_id,
    }


def cleanup(context, fixture):
    """Remove the run's own fixture gameday (and its games) again.

    This is the one deliberate exception to "never delete stage rows" (plan
    §3.3): it only deletes the gameday this journey created a moment ago, found
    by its unique ``<run-id>-ref``/``-cand`` name. Leaving it would put a
    side-specific row on the shared DB that the other side's ``discover()``
    could pick up, i.e. a cross-side diff. A published gameday must be set
    back to DRAFT before the API lets it be deleted.
    """
    if not fixture:
        return False
    session = api_session(context)
    gameday = fixture["gameday_id"]
    session.request(
        f"/api/gamedays/{gameday}/",
        method="PATCH",
        json_body={"status": "DRAFT"},
    )
    response = session.request(f"/api/gamedays/{gameday}/", method="DELETE")
    return response.status in (200, 204)
