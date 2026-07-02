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
- `views.py`, `urls.py`, `templates/` — report rendering + routing.
- `menu.py`, `constants.py` — navigation entry and shared constants.

## Conventions & gotchas
- No `models.py` — all data comes from gamedays; do not add domain models here, extend the
  wrapper instead.
- Reporting logic belongs in `service/`, presentation in `templates/`.

## Tests
```bash
cd leaguesphere && pytest matchreport
```
