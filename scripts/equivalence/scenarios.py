"""Write scenarios for the equivalence harness (dachrisch/leaguesphere#2536).

Each scenario runs against both deployments with its own run id
(``<base>-ref`` / ``<base>-cand``), creates fresh entities tagged with that
run id (never touches restored stage rows), then re-reads them. Entity ids
differ between the two sides by construction, so every captured id is
normalised to ``<entity-N>`` before the reads are diffed.

The stage is shared by both deployments, so the two runs see each other's
rows in list endpoints; the run id keeps their *own* rows distinguishable,
and the read-back probes below target the run's own gameday by id.

The officials sign-up flow is Moodle-gated (``MOODLE_LOGGED_IN_USER`` in the
session), so with harness accounts it can only exercise the guard redirect.
That is intentional: the scenario records the guard's behaviour on both
sides instead of pretending to have a Moodle session. Stage 2 may extend it
if the coordinator supplies a harness Moodle session.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import normalise


@dataclass(frozen=True)
class Step:
    name: str
    method: str
    path: str
    role: str = "staff"
    json: dict | None = None
    expect: tuple = (200, 201)
    capture: str | None = None
    capture_path: str | None = None


@dataclass
class StepResult:
    name: str
    status: int
    body: object


@dataclass
class ScenarioRun:
    name: str
    run_id: str
    steps: list = field(default_factory=list)
    id_tokens: dict = field(default_factory=dict)
    skipped: list = field(default_factory=list)

    def as_results(self):
        return {f"{self.name}:{step.name}": step for step in self.steps}


MINIMAL_CANVAS = {
    "nodes": [
        {
            "id": "field-1",
            "type": "field",
            "data": {"type": "field", "name": "Feld 1", "order": 0},
        },
        {
            "id": "stage-1",
            "type": "stage",
            "parentId": "field-1",
            "data": {
                "type": "stage",
                "name": "Liga",
                "category": "preliminary",
                "stageType": "STANDARD",
            },
        },
        {
            "id": "game-1",
            "type": "game",
            "parentId": "stage-1",
            "data": {
                "type": "game",
                "standing": "Spiel 1",
                "startTime": "10:00",
                "homeTeamId": None,
                "awayTeamId": None,
                "official": None,
            },
        },
    ],
    "globalTeams": [],
}


def _gameday_create_step():
    return Step(
        name="create-gameday",
        method="POST",
        path="/api/gamedays/",
        json={
            "name": "Equivalence {run_id}",
            "season": "{season_id}",
            "league": "{league_id}",
            "date": "2030-01-01",
            "start": "10:00",
            "format": "6_2",
            "address": "equivalence run {run_id}",
        },
        capture="gameday_id",
        capture_path="id",
    )


def _publish_steps():
    return [
        Step(
            name="save-designer-canvas",
            method="PUT",
            path="/api/gamedays/{gameday_id}/designer-state/",
            json={"state_data": MINIMAL_CANVAS},
        ),
        Step(
            name="publish-gameday",
            method="POST",
            path="/api/gamedays/{gameday_id}/publish/",
        ),
    ]


SCENARIOS = {
    "designer-publish": [
        _gameday_create_step(),
        *_publish_steps(),
        Step(
            name="read-gameday",
            method="GET",
            path="/api/gameday/{gameday_id}/",
            role="anonymous",
            expect=200,
        ),
        Step(
            name="read-games",
            method="GET",
            path="/api/gamedays/{gameday_id}/games/",
            role="anonymous",
            expect=200,
            capture="game_id",
            capture_path="0.id",
        ),
    ],
    "finalize-game": [
        _gameday_create_step(),
        *_publish_steps(),
        Step(
            name="read-games",
            method="GET",
            path="/api/gamedays/{gameday_id}/games/",
            role="anonymous",
            capture="game_id",
            capture_path="0.id",
        ),
        Step(
            name="finalize-game",
            method="PUT",
            path="/api/game/{game_id}/finalize",
            json={},
            expect=(200, 409),
        ),
        Step(
            name="read-gamelog",
            method="GET",
            path="/api/gamelog/{game_id}",
            role="anonymous",
            expect=200,
        ),
    ],
    "officials-signup": [
        _gameday_create_step(),
        Step(
            name="signup-list",
            method="GET",
            path="/officials/gameday/sign-up/",
            role="official",
            expect=(200, 302),
        ),
        Step(
            name="signup-add",
            method="GET",
            path="/officials/gameday/sign-up/{gameday_id}/add/",
            role="official",
            expect=(200, 302),
        ),
    ],
}


def _resolve(value, context):
    if isinstance(value, str):
        for key, replacement in context.items():
            value = value.replace("{" + key + "}", str(replacement))
        return value
    if isinstance(value, dict):
        return {key: _resolve(item, context) for key, item in value.items()}
    if isinstance(value, list):
        return [_resolve(item, context) for item in value]
    return value


def _pluck(payload, path):
    current = payload
    for part in path.split("."):
        current = current[int(part)] if isinstance(current, list) else current[part]
    return current


def run_scenario(name, sessions, context, run_id):
    """Run one scenario against one deployment. Returns a ``ScenarioRun``."""
    run = ScenarioRun(name=name, run_id=run_id)
    run.id_tokens[run_id] = "<run-id>"
    context = {**context, "run_id": run_id}

    for step in SCENARIOS[name]:
        role_session = sessions.get(step.role)
        if role_session is None:
            run.skipped.append(step.name)
            continue
        path = _resolve(step.path, context)
        body = _resolve(step.json, context) if step.json is not None else None
        response = role_session.request(path, method=step.method, json_body=body)
        expected = step.expect if isinstance(step.expect, tuple) else (step.expect,)
        if response.status not in expected:
            raise RuntimeError(
                f"{name}:{step.name} -> HTTP {response.status} "
                f"(expected {expected})"
            )
        try:
            payload = response.json()
        except ValueError:
            payload = response.body
        if step.capture and step.capture_path and isinstance(payload, (dict, list)):
            try:
                value = _pluck(payload, step.capture_path)
            except (IndexError, KeyError, TypeError):
                value = None
            if value is not None:
                context[step.capture] = value
                run.id_tokens[value] = f"<entity-{len(run.id_tokens)}>"
        if isinstance(payload, (dict, list)):
            normalised = normalise.normalise_json(payload, run.id_tokens)
        elif isinstance(payload, str):
            normalised = normalise.normalise_html(payload, run.id_tokens)
        else:
            normalised = payload
        run.steps.append(
            StepResult(name=step.name, status=response.status, body=normalised)
        )
    return run
