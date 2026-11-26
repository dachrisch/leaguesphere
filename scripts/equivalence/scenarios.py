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
import re
import uuid

import normalise


@dataclass(frozen=True)
class Step:
    name: str
    method: str
    path: str
    role: str = "staff"
    json: dict | None = None
    form: dict | None = None
    expect: tuple = (200, 201)
    capture: str | None = None
    capture_path: str | None = None
    required_capture: bool = False
    no_redirect: bool = False
    # "url" captures the gameday id from a wizard redirect (Phase 2).
    capture_from: str | None = None


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
    captured: dict = field(default_factory=dict)
    skipped: list = field(default_factory=list)

    def as_results(self):
        return {f"{self.name}:{step.name}": step for step in self.steps}


# A canvas with a real downstream reference: game-2 takes game-1's winner.
# Without a reference, CanvasBracketProgressionService has nothing to resolve
# and the canvas branch of schedule resolution is only nominally exercised.
CANVAS_WITH_REFERENCE = {
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
        {
            "id": "game-2",
            "type": "game",
            "parentId": "stage-1",
            "data": {
                "type": "game",
                "standing": "Spiel 2",
                "startTime": "11:00",
                "homeTeamId": None,
                "awayTeamId": None,
                "homeTeamDynamic": {"type": "winner", "matchName": "Spiel 1"},
                "official": None,
            },
        },
    ],
    "edges": [
        {
            "id": "winner-to-game-2",
            "type": "gameToGame",
            "source": "game-1",
            "sourceHandle": "winner",
            "target": "game-2",
            "targetHandle": "home",
        }
    ],
    "globalTeams": [],
}

# (group key, team key) pairs that TemplateApplicationService maps to teams.
_PLACEHOLDER_KEYS = (
    ("home_group", "home_team"),
    ("away_group", "away_team"),
    ("official_group", "official_team"),
)


def discover_team_ids(sessions, limit=3):
    """Real team ids for the wizard-built legacy schedule (format 3_1)."""
    session = sessions.get("anonymous") or sessions.get("staff")
    if session is None:
        return []
    response = session.request("/api/teams/")
    if response.status != 200:
        return []
    try:
        payload = response.json()
        return [team["id"] for team in payload.get("results", [])][:limit]
    except (ValueError, KeyError, TypeError):
        return []


def discover_template_context(sessions):
    """Discover a stage template and teams for the designer-template scenario.

    The harness has no seeded template id: find one through the staff API and
    map every team placeholder in its slots to a real team id. Returns an
    empty dict when the data is unavailable (the scenario's steps then stay
    unresolved and are reported as harness errors, never fabricated).
    """
    staff = sessions.get("staff")
    if staff is None:
        return {}
    listing = staff.request("/api/designer/templates/")
    if listing.status != 200:
        return {}
    try:
        payload = listing.json()
        templates = payload.get("results", []) if isinstance(payload, dict) else []
        template_id = templates[0]["id"] if templates else None
    except (ValueError, KeyError, IndexError, TypeError):
        return {}
    if template_id is None:
        return {}

    detail = staff.request(f"/api/designer/templates/{template_id}/")
    if detail.status != 200:
        return {}
    try:
        template = detail.json()
        placeholders = set()
        for slot in template.get("slots", []):
            for group_key, team_key in _PLACEHOLDER_KEYS:
                if slot.get(group_key) is not None and slot.get(team_key) is not None:
                    placeholders.add(f"{slot[group_key]}_{slot[team_key]}")
    except (ValueError, AttributeError, TypeError):
        return {}
    if not placeholders:
        return {}

    teams_session = sessions.get("anonymous") or staff
    teams_response = teams_session.request("/api/teams/")
    if teams_response.status != 200:
        return {}
    try:
        teams_payload = teams_response.json()
        team_ids = [team["id"] for team in teams_payload.get("results", [])]
    except (ValueError, KeyError, TypeError):
        return {}
    if len(team_ids) < len(placeholders):
        return {}
    return {
        "template_id": template_id,
        "team_mapping": {
            key: team_ids[index] for index, key in enumerate(sorted(placeholders))
        },
        "num_fields": template.get("num_fields"),
    }


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


def _publish_steps(canvas=None):
    return [
        Step(
            name="save-designer-canvas",
            method="PUT",
            path="/api/gamedays/{gameday_id}/designer-state/",
            json={"state_data": MINIMAL_CANVAS if canvas is None else canvas},
        ),
        Step(
            name="publish-gameday",
            method="POST",
            path="/api/gamedays/{gameday_id}/publish/",
        ),
    ]


def _wizard_steps():
    """Build a schedule from the format through the HTML wizard.

    This is the legacy path: publishing a gameday with no designer state runs
    CanvasPublishService, which returns early, so only the wizard creates the
    Gameinfo rows that finalize needs. The wizard is a SessionWizardView: the
    GET establishes the session/CSRF cookie, then two form posts walk its
    steps. Management form prefix is ``gameinfo_wizard``; each form's fields
    are prefixed with its own step name.
    """
    wizard_path = "/gamedays/gameday/{gameday_id}/gameinfos/wizard/"
    return [
        Step(
            name="wizard-get", method="GET", path=wizard_path, role="staff", expect=200
        ),
        Step(
            name="wizard-field-groups",
            method="POST",
            path=wizard_path,
            role="staff",
            form={
                "gameinfo_wizard-current_step": "field-group-step",
                "field-group-step-format": "3_1",
                "field-group-step-number_fields": "1",
            },
            expect=(200, 302),
        ),
        Step(
            name="wizard-format",
            method="POST",
            path=wizard_path,
            role="staff",
            form={
                "gameinfo_wizard-current_step": "gameday-format",
                "gameday-format-TOTAL_FORMS": "1",
                "gameday-format-INITIAL_FORMS": "0",
                "gameday-format-MIN_NUM_FORMS": "0",
                "gameday-format-MAX_NUM_FORMS": "1000",
                "gameday-format-0-group": "{wizard_team_ids}",
                "gameday-format-0-group_name": "Gruppe 1",
                "gameday-format-0-league_group": "",
            },
            expect=302,  # an invalid formset re-renders with 200
            no_redirect=True,  # the done() redirect must stay visible
        ),
    ]


def _read_game_id_steps(required=False):
    """Capture all per-run ids the later read-backs can echo back."""
    return [
        Step(
            name="read-games",
            method="GET",
            path="/api/gamedays/{gameday_id}/games/",
            role="anonymous",
            expect=200,
            capture="game_id",
            capture_path="0.id",
            required_capture=required,
        ),
        Step(
            name="read-games-home-id",
            method="GET",
            path="/api/gamedays/{gameday_id}/games/",
            role="anonymous",
            expect=200,
            capture="id_home",
            capture_path="0.results.0.id",
        ),
        Step(
            name="read-games-away-id",
            method="GET",
            path="/api/gamedays/{gameday_id}/games/",
            role="anonymous",
            expect=200,
            capture="id_away",
            capture_path="0.results.1.id",
        ),
    ]


def _shadow_steps():
    """Setup and the legacy v1 write whose shadow event the feed exposes."""

    return [
        _gameday_create_step(),
        *_publish_steps(),
        *_read_game_id_steps(),
        Step(
            name="read-home-team",
            method="GET",
            path="/api/gamedays/{gameday_id}/games/",
            role="anonymous",
            expect=200,
            capture="team_id",
            capture_path="0.results.0.team_id",
        ),
        Step(
            name="write-shadow-event",
            method="POST",
            path="/api/gamelog/{game_id}",
            json={
                "gameId": "{game_id}",
                "team": "{team_id}",
                "event": [{"name": "Touchdown", "player": 7}],
                "half": 1,
                "client_id": "{client_id}",
            },
            expect=(200, 201),
        ),
    ]


# A compact legacy schedule: the wizard's ``CUSTOM`` format writes these rows
# directly, without the canvas publish path the old finalize-legacy scenario
# reused. The run id tags every created gameday.
LEGACY_SCHEDULE = {
    "games": [
        {
            "scheduled": "10:00",
            "field": 1,
            "stage": "Hauptrunde",
            "standing": "Gruppe 1",
        }
    ]
}


def _legacy_schedule_form():
    """Turn ``LEGACY_SCHEDULE`` into the wizard's formset payload."""

    form = {
        "gameinfo_wizard-current_step": "gameinfo-step",
        "gameinfo-step-TOTAL_FORMS": str(len(LEGACY_SCHEDULE["games"])),
        "gameinfo-step-INITIAL_FORMS": "0",
        "gameinfo-step-MIN_NUM_FORMS": "0",
        "gameinfo-step-MAX_NUM_FORMS": "1000",
    }
    for index, game in enumerate(LEGACY_SCHEDULE["games"]):
        for key, value in game.items():
            form[f"gameinfo-step-{index}-{key}"] = str(value)
        form[f"gameinfo-step-{index}-home"] = "{team_id}"
        form[f"gameinfo-step-{index}-away"] = "{team_id}"
        form[f"gameinfo-step-{index}-id"] = ""
    return form


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
        *_read_game_id_steps(),
        Step(
            name="read-game-officials",
            method="GET",
            path="/api/game/{game_id}/officials",
            role="anonymous",
            expect=200,
        ),
        Step(
            name="read-game-summary",
            method="GET",
            path="/api/game/{game_id}/summary",
            expect=200,
        ),
    ],
    "finalize-game": [
        _gameday_create_step(),
        *_publish_steps(),
        *_read_game_id_steps(),
        Step(
            name="finalize-game",
            method="PUT",
            path="/api/game/{game_id}/finalize",
            json={},
            expect=(200, 409),
        ),
        Step(
            name="read-game-officials",
            method="GET",
            path="/api/game/{game_id}/officials",
            role="anonymous",
            expect=200,
        ),
        Step(
            name="read-game-summary",
            method="GET",
            path="/api/game/{game_id}/summary",
            expect=200,
        ),
        Step(
            name="read-gamelog",
            method="GET",
            path="/api/gamelog/{game_id}",
            role="anonymous",
            expect=200,
        ),
    ],
    "finalize-canvas": [
        _gameday_create_step(),
        *_publish_steps(CANVAS_WITH_REFERENCE),
        *_read_game_id_steps(),
        Step(
            name="finalize-game",
            method="PUT",
            path="/api/game/{game_id}/finalize",
            json={},
            expect=(200, 409),
        ),
        Step(
            name="read-game-officials",
            method="GET",
            path="/api/game/{game_id}/officials",
            role="anonymous",
            expect=200,
        ),
        Step(
            name="read-game-summary",
            method="GET",
            path="/api/game/{game_id}/summary",
            expect=200,
        ),
    ],
    "finalize-legacy": [
        Step(
            name="create-gameday",
            method="POST",
            path="/api/gamedays/",
            json={
                "name": "Equivalence {run_id} legacy",
                "season": "{season_id}",
                "league": "{league_id}",
                "date": "2030-01-02",
                "start": "10:00",
                "format": "4_1",
                "address": "equivalence legacy {run_id}",
            },
            capture="gameday_id",
            capture_path="id",
        ),
        # No designer-state step: the wizard builds the schedule from the
        # format, so there are games to finalize and the legacy ScheduleUpdate
        # branch in signals.py is the one that runs (not the canvas branch).
        *_wizard_steps(),
        Step(
            name="publish-gameday",
            method="POST",
            path="/api/gamedays/{gameday_id}/publish/",
        ),
        *_read_game_id_steps(required=True),
        Step(
            name="finalize-game",
            method="PUT",
            path="/api/game/{game_id}/finalize",
            json={},
            expect=(200, 409),
        ),
        Step(
            name="read-game-officials",
            method="GET",
            path="/api/game/{game_id}/officials",
            role="anonymous",
            expect=200,
        ),
        Step(
            name="read-game-summary",
            method="GET",
            path="/api/game/{game_id}/summary",
            expect=200,
        ),
    ],
    "finalize-template": [
        _gameday_create_step(),
        Step(
            name="apply-template",
            method="POST",
            path="/api/designer/templates/{template_id}/apply/",
            json={
                "gameday_id": "{gameday_id}",
                "team_mapping": "{team_mapping}",
                "num_fields": "{num_fields}",
            },
        ),
        Step(
            name="publish-gameday",
            method="POST",
            path="/api/gamedays/{gameday_id}/publish/",
        ),
        *_read_game_id_steps(),
        Step(
            name="finalize-game",
            method="PUT",
            path="/api/game/{game_id}/finalize",
            json={},
            expect=(200, 409),
        ),
        Step(
            name="read-game-officials",
            method="GET",
            path="/api/game/{game_id}/officials",
            role="anonymous",
            expect=200,
        ),
        Step(
            name="read-game-summary",
            method="GET",
            path="/api/game/{game_id}/summary",
            expect=200,
        ),
        Step(
            name="read-gamelog",
            method="GET",
            path="/api/gamelog/{game_id}",
            role="anonymous",
            expect=200,
        ),
    ],
    "v2-events-write": [
        _gameday_create_step(),
        *_publish_steps(),
        *_read_game_id_steps(),
        Step(
            name="write-events",
            method="POST",
            path="/api/game/{game_id}/events",
            json={
                "events": [
                    {
                        "type": "score",
                        "code": "touchdown",
                        "side": "home",
                        "player": 7,
                        "period": 1,
                        "client_id": "{client_id}",
                    }
                ]
            },
            expect=(200, 201),
        ),
        Step(
            name="read-feed",
            method="GET",
            path="/api/game/{game_id}/feed",
            role="anonymous",
            expect=200,
        ),
        Step(
            name="read-gamelog",
            method="GET",
            path="/api/gamelog/{game_id}",
            role="anonymous",
            expect=200,
        ),
        Step(
            name="read-liveticker",
            method="GET",
            path="/api/liveticker/",
            role="anonymous",
            expect=200,
        ),
    ],
    "v1-shadow-write": [
        *_shadow_steps(),
        Step(
            name="read-gamelog",
            method="GET",
            path="/api/gamelog/{game_id}",
            role="anonymous",
            expect=200,
        ),
        Step(
            name="read-feed",
            method="GET",
            path="/api/game/{game_id}/feed",
            role="anonymous",
            expect=200,
        ),
        Step(
            name="read-liveticker",
            method="GET",
            path="/api/liveticker/",
            role="anonymous",
            expect=200,
        ),
    ],
    "reconciliation-flag": [
        *_shadow_steps(),
        Step(
            name="flag-projection",
            method="DELETE",
            path="/api/gamelog/{game_id}",
            json={"sequence": 0},
            expect=(200, 204),
        ),
        Step(
            name="read-feed",
            method="GET",
            path="/api/game/{game_id}/feed",
            role="anonymous",
            expect=(409, 200),
        ),
        Step(
            name="read-liveticker",
            method="GET",
            path="/api/liveticker/",
            role="anonymous",
            expect=200,
        ),
    ],
    "legacy-wizard-finalize": [
        Step(
            name="wizard-create-gameday",
            method="POST",
            path="/gamedays/gameday/new/",
            form={
                "name": "Equivalence {run_id} legacy wizard",
                "season": "{season_id}",
                "league": "{league_id}",
                "date": "2030-02-01",
                "start": "10:00",
                "address": "equivalence legacy wizard {run_id}",
                "action": "gameinfos_create",
                "urls-TOTAL_FORMS": "0",
                "urls-INITIAL_FORMS": "0",
                "urls-MIN_NUM_FORMS": "0",
                "urls-MAX_NUM_FORMS": "1000",
            },
            capture="gameday_id",
            capture_from="url",
        ),
        Step(
            name="wizard-legacy-json-schedule",
            method="POST",
            path="/gamedays/gameday/{gameday_id}/gameinfos/wizard/",
            form={
                "gameinfo_wizard-current_step": "field-group-step",
                "field-group-step-format": "CUSTOM",
                "field-group-step-number_fields": "1",
                "field-group-step-number_groups": "1",
            },
        ),
        Step(
            name="wizard-write-schedule-rows",
            method="POST",
            path="/gamedays/gameday/{gameday_id}/gameinfos/wizard/",
            form=_legacy_schedule_form(),
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
        Step(
            name="read-game-summary",
            method="GET",
            path="/api/game/{game_id}/summary",
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
            token = "{" + key + "}"
            if value == token:
                return replacement  # keep dict/int payload values intact
            value = value.replace(token, str(replacement))
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


def discover_team_id(session):
    """One throwaway team id for the legacy-wizard schedule form."""

    response = session.request("/api/teams/")
    if response.status == 200:
        try:
            teams = response.json().get("results", [])
        except ValueError:
            teams = []
        if teams:
            return teams[0].get("id")
    return None


def run_scenario(name, sessions, context, run_id):
    """Run one scenario against one deployment. Returns a ``ScenarioRun``."""
    run = ScenarioRun(name=name, run_id=run_id)
    run.id_tokens[run_id] = "<run-id>"
    # A run-id-derived UUID keeps client ids deterministic and lets the
    # normaliser collapse the two sides' different ids.
    client_id = str(uuid.uuid5(uuid.NAMESPACE_URL, run_id))
    run.id_tokens[client_id] = "<client-id>"
    context = {**context, "run_id": run_id, "client_id": client_id}

    for step in SCENARIOS[name]:
        role_session = sessions.get(step.role)
        if role_session is None:
            run.skipped.append(step.name)
            continue
        path = _resolve(step.path, context)
        body = _resolve(step.json, context) if step.json is not None else None
        form = _resolve(step.form, context) if step.form is not None else None
        response = role_session.request(
            path,
            method=step.method,
            json_body=body,
            form=form,
            follow_redirects=not step.no_redirect,
        )
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
                run.captured[step.capture] = value
                run.id_tokens[value] = f"<entity-{len(run.id_tokens)}>"
        if step.capture and step.capture_from == "url":
            match = re.search(r"/gamedays/gameday/(\d+)/", response.url)
            if match:
                value = int(match.group(1))
                context[step.capture] = value
                run.captured[step.capture] = value
                run.id_tokens[value] = f"<entity-{len(run.id_tokens)}>"
        if step.required_capture and step.capture not in run.captured:
            # Fail here, before a later step can send the literal {token}.
            raise RuntimeError(
                f"{name}:{step.name} did not capture required '{step.capture}'"
            )
        if isinstance(payload, (dict, list)):
            # Scenario rows are new on each side: primary keys differ by
            # construction, so every `id` key is normalised (the captured
            # ids are in id_tokens for ids embedded in strings).
            normalised = normalise.normalise_json(
                payload, run.id_tokens, normalise_ids=True
            )
        elif isinstance(payload, str):
            normalised = normalise.normalise_html(payload, run.id_tokens)
        else:
            normalised = payload
        run.steps.append(
            StepResult(name=step.name, status=response.status, body=normalised)
        )
    return run
