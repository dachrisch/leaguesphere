# journey/ — CLAUDE.md

> Module guide. For repo-wide commands, testing setup, and deployment policy see the [root CLAUDE.md](../CLAUDE.md).

## Purpose
Backend for the **Game Progress "journey" dashboard** — a live view of game progress across a
21-day window (7 days past, 14 days future). Serves the denormalized gameday + games + scores
feed and tracks journey/event records.

## Role in the system
Pairs one-to-one with the [journey_dashboard](../journey_dashboard/CLAUDE.md) React app: this app
exposes the template view and read-only API, the frontend renders it. It reads game data owned by
[gamedays](../gamedays/CLAUDE.md).

## Key models (`models.py`)
`Journey`, `JourneyEvent`.

## Key files
- `progress_view.py` — `GameProgressPageView`, the auth-required template view that hosts the SPA.
- `api/progress_views.py` — `GameProgressViewSet`, **read-only** denormalized feed.
- `api/progress_serializers.py`, `api/progress_urls.py` — API serialization and routing.
- `api/creation_stats.py` — journey creation statistics.

## Routes (`urls.py`)
- `''` — dashboard page; `dashboard/` — nested view. API mounted via `api/progress_urls.py`.
- Filters by **league** and **season** via query parameters.

## Conventions & gotchas
- The feed **must** stay query-count-flat: it uses `select_related('league','season')` and
  `prefetch_related('gameinfo_set', 'gameinfo_set__gameresult_set')`. Preserve this when editing
  the viewset — this endpoint is the canonical example of the pattern in root CLAUDE.md.
- View requires authentication; the API is read-only by design (no write paths here).

## Tests
```bash
cd leaguesphere && pytest journey
```
