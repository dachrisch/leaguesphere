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
`OfficialExternalGames` (plus `Empty*` null-object variants).

## Service layer (`service/`)
- `official_service.py`, `officials_repository_service.py` — core logic + data access.
- `signup_service.py` — gameday signup handling.
- `boff_license_calculation.py`, `game_official_entries.py` — license level calculation from duties.
- `moodle/` — external Moodle license-report integration.

## API & routes
- `api/` (`views.py`, `serializers.py`, `urls.py`) — official data endpoints.
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
