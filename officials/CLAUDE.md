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
- `signup_service.py` — gameday signup handling; already depends on `league_table.LeagueSeasonConfig`
  for per-gameday officiating quotas (precedent for the dependency below).
- `boff_license_calculation.py`, `game_official_entries.py` — license level calculation from duties.
- `officials_compliance_service.py` — checks whether a game's assigned officials meet the
  minimum-officials-per-license-level thresholds configured on `league_table.LeagueSeasonConfig`
  (a *different* concern from `boff_license_calculation.py`: given already-recorded license
  history, does the assigned staff meet a configured minimum). Reads `league_table.models`
  directly; consumed by [matchreport](../matchreport/CLAUDE.md)'s gameday list/detail views, not
  from within this app.
- `license_validity.py` — shared license-validity-window logic (calendar-year rule matching
  `OfficialLicenseHistory.valid_until()`), used by both `officials_compliance_service.py` and
  matchreport's `model_wrapper.py` so the two can't independently drift.
- `official_profile.py` — shared official-profile-URL helper, used by both `moodle/moodle_service.py`
  and matchreport's `model_wrapper.py`.
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
