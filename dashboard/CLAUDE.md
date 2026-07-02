# dashboard/ — CLAUDE.md

> Module guide. For repo-wide commands, testing setup, and deployment policy see the [root CLAUDE.md](../CLAUDE.md).

## ⚠️ Status: legacy — being phased out
This is the **old** administrative dashboard. New game-progress work happens in
[journey](../journey/CLAUDE.md) + [journey_dashboard](../journey_dashboard/CLAUDE.md). Prefer
extending those; only touch this app for maintenance of existing behavior, and avoid building new
features on it.

## Purpose (historical)
Provided the main admin dashboard for league managers to oversee gamedays, teams, and league status.

## Key files
- `api/` — dashboard data endpoints.
- `service/` — dashboard business logic.
- `tests/` — existing coverage (keep green if you modify anything here).

## Conventions & gotchas
- Before adding to this app, confirm the feature doesn't belong in the `journey` stack instead.
- Data is sourced from [gamedays](../gamedays/CLAUDE.md); no independent domain models.

## Tests
```bash
cd leaguesphere && pytest dashboard
```
