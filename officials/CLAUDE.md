# officials/ — CLAUDE.md

> Module guide. For repo-wide commands, testing setup, and deployment policy see the [root CLAUDE.md](../CLAUDE.md).

## Purpose
Manages **referees/officials**: their licenses, gameday signups, and assignment to games, plus
license reporting (including a Moodle integration).

## Role in the system
Owns official-specific data and links officials to games (`GameOfficial` lives in
[gamedays](../gamedays/CLAUDE.md)). Feeds license/duty reporting used for tracking and reimbursement.

## Key models (`models.py`)
`Official`, `OfficialGamedaySignup`, `OfficialLicense`, `OfficialLicenseHistory`,
`OfficialExternalGames` (plus `Empty*` null-object variants), and
`CrewPosition` — the scorecard's crew slots *per league* (`position` is the
exact `GameOfficial.position` wire value, `label` the display name, `order` the
sequence, `required` decides the completeness counter). A league without rows
gets the built-in defaults, so the table holds overrides only.

## Service layer (`service/`)
- `official_service.py`, `officials_repository_service.py` — core logic + data access.
  `official_service.py` also holds `LICENSE_LEVELS` (`["F1","F2","F3","F4"]`, best-to-worst) and
  `license_rank()` (resolves a possibly year-suffixed license name like `"F1 2027"` to its rank
  index) — the canonical level-parsing shared by every consumer below.
- `signup_service.py` — gameday signup handling; already depends on `league_table.LeagueSeasonConfig`
  for per-gameday officiating quotas (precedent for the dependency below).
- `boff_license_calculation.py`, `game_official_entries.py` — license level calculation from duties.
- `officials_compliance_service.py` — checks whether a game's assigned officials meet the
  minimum-officials-per-license-level thresholds configured on `league_table.LeagueSeasonConfig`
  (a *different* concern from `boff_license_calculation.py`: given already-recorded license
  history, does the assigned staff meet a configured minimum). Also exposes `best_valid_rank()`
  (public - shared with `game_official_licenses.py` below). Reads `league_table.models` directly;
  consumed by [matchreport](../matchreport/CLAUDE.md)'s gameday list/detail views, not from within
  this app.
- `crew_positions.py` — the crew slots the scorecard offers for a game
  (`crew_positions_for_game` resolves game → gameday → league;
  `crew_positions_for_league` answers the configured rows or
  `DEFAULT_CREW_POSITIONS`, never an empty list). Edited per league in the
  Django admin; `manage.py seed_crew_positions <liga|--all>` copies the
  defaults into a league once so they can be relabelled.
- `game_official_licenses.py` — resolves the currently valid license per refereed position
  (Referee/Down Judge/Field Judge/Side Judge) for a batch of games; consumed by matchreport's
  gameday-list CSV export.
- `license_validity.py` — shared license-validity-window logic (a license is valid from
  `created_at` through approximately one year later, `timedelta(days=365)`), used by
  `officials_compliance_service.py` and matchreport's `model_wrapper.py` so the two can't
  independently drift.
- `official_profile.py` — shared official-profile-URL helper, used by both `moodle/moodle_service.py`
  and matchreport's `model_wrapper.py`.
- `moodle/` — external Moodle license-report integration.

## API & routes
- `api/` (`views.py`, `serializers.py`, `urls.py`) — official data endpoints,
  incl. `GET /api/officials/crew-positions/game/<id>` for the scorecard's
  preparation screen (`[{position, label, order, required}]`, configured or
  default — same shape).
- `urls.py`: `moodle-report/` — license report export.

## Conventions & gotchas
- `Empty*` classes are **null-object** placeholders — return them instead of `None` where the
  existing code expects a license/history object.
- License levels are **calculated** from game entries; change the calculation in
  `boff_license_calculation.py`, not at call sites.

## Tests
```bash
cd leaguesphere && pytest officials
```


## CI scope (scoped CI)

Changes here run: **python-officials (pytest officials/tests/).** Scoping details: [Scoped CI](../docs/topics/deployment/scoped-ci.md).
