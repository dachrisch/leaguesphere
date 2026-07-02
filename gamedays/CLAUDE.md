# gamedays/ — CLAUDE.md

> Module guide. For repo-wide commands, testing setup, and deployment policy see the [root CLAUDE.md](../CLAUDE.md).

## Purpose
The **core domain app** and the heart of LeagueSphere. Owns the central data model for
competitions and the scheduling/results business logic that most other apps read from.

## Role in the system
This is the source of truth for the shared domain objects. Other apps depend on it:
- [teammanager](../teammanager/CLAUDE.md) manages the `Team`/roster models defined **here**.
- [league_table](../league_table/CLAUDE.md) computes standings from `Gameinfo`/`Gameresult`.
- [gameday_designer](../gameday_designer/CLAUDE.md) applies schedule templates to create `Gameday`s.
- [scorecard](../scorecard/CLAUDE.md), [liveticker](../liveticker/CLAUDE.md), and
  [journey](../journey/CLAUDE.md) read/write game data through this app's models and API.

## Key models (`models.py`)
`Season`, `League`, `Association`, `Team`, `SeasonLeagueTeam`, `Gameday`, `Gameinfo`,
`Gameresult`, `GameOfficial`, `GameSetup`, `TeamLog`, `UserProfile`, `Person`,
`Permissions`/`UserPermissions`, `Achievement`/`PlayerAchievement`,
`GamedayDesignerState`. **Team lives here, not in teammanager.**

## Service layer (`service/`)
This is where the real logic lives — read it before changing behavior:
- `gameday_service.py`, `game_service.py`, `gameday_form_service.py` — gameday/game orchestration.
- `schedule_resolution_service.py`, `bracket_resolution.py`, `placeholder_service.py` —
  tournament progression + playoff placeholder resolution (see root CLAUDE.md § placeholder teams).
- `canvas_progression_service.py`, `canvas_publish_service.py` — designer-canvas integration.
- `league_statistics_service.py`, `model_statistics_wrapper.py` — aggregate stats.
- `model_wrapper.py`, `model_helper.py`, `wrapper/` — read-model wrappers over the ORM.
- `team_repository_service.py`, `builders.py`, `gamelog.py`, `signals.py`, `gameday_settings.py`.

## API (`api/`)
`api/game_views.py`, `api/views.py`, `api/serializers.py`, routed via `api/urls.py`.
**ETag caching is implemented here** — see root CLAUDE.md § Query Optimization. Read-heavy
endpoints return HTTP 304 via `@condition(...)`; keep new list/detail endpoints on that pattern.

## Routes (`urls.py`)
`gamedays/`, `gameday/<int:pk>/`, `gameday/new/`. Multi-step gameday creation lives under `wizard/`.

## Conventions & gotchas
- **Every DB-touching test must assert query count** (`assertNumQueries`) and the count must not
  grow with result-set size. Note the known flakiness under `pytest -n` (xdist ordering).
- Use `select_related()`/`prefetch_related()` on any endpoint returning gameday data.
- Schedule JSON references **placeholder teams** that must exist in the DB
  (`spinup_test_db.sh --fresh` creates them; see `tests/setup_factories/db_setup.py`).

## Tests
```bash
cd leaguesphere && pytest gamedays          # requires the LXC MariaDB test DB
```
