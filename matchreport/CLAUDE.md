# matchreport/ — CLAUDE.md

> Module guide. For repo-wide commands, testing setup, and deployment policy see the [root CLAUDE.md](../CLAUDE.md).

## Purpose
Generates **match reports** — the per-game report artifacts summarizing a completed game.

## Role in the system
A thin **service/reporting app** with no models of its own. It wraps game data owned by
[gamedays](../gamedays/CLAUDE.md) and renders it into report templates.

## Key files
- `service/matchreport_service.py` — report assembly logic (start here).
- `service/model_wrapper.py` — read-model wrapper over gamedays models.
- `service/gameday_list_csv_service.py` — builds the gameday-list CSV export (one row per game;
  see the "download" button next to the Season/League selector).
- `views.py`, `urls.py`, `templates/` — report rendering + routing.
- `menu.py`, `constants.py` — navigation entry and shared constants.

## Conventions & gotchas
- No `models.py` — all data comes from gamedays; do not add domain models here, extend the
  wrapper instead.
- Reporting logic belongs in `service/`, presentation in `templates/`.
- The gameday list/detail views call
  [officials](../officials/CLAUDE.md)`/service/officials_compliance_service.py` directly for the
  officials-compliance check (violation badges/counts, the "only violations" filter) - that
  service itself reads `league_table.LeagueSeasonConfig`, so this app has a real (if one-way)
  dependency on both `officials` and `league_table`, despite matchreport otherwise only wrapping
  `gamedays`.

## Tests
```bash
cd leaguesphere && pytest matchreport
```
