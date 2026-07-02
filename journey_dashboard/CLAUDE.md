# journey_dashboard/ — CLAUDE.md

> Module guide (frontend-only). For repo-wide commands, testing setup, and deployment policy see
> the [root CLAUDE.md](../CLAUDE.md).

## Purpose
The **React app for the Game Progress dashboard** — a paginated gameday schedule with live score
updates across a 21-day window (7 days past, 14 days future).

## Role in the system
Pure frontend; the **backend counterpart is [journey](../journey/CLAUDE.md)**. This app consumes
`GameProgressViewSet` (read-only denormalized gameday + games + scores) and filters by league and
season via query params. There is **no Django app in this folder** (no `apps.py`).

## Frontend (React — TypeScript)
- Entry: `src/main.tsx` → `src/App.tsx`.
- `src/api/` — calls to the journey progress API.
- `src/components/`, `src/types/` (+ `types.ts`), `src/i18n/` (localized),
  `src/styles/` + `src/index.css`, `src/utils/`, `src/trackEvent.ts` (analytics).
- Built with Vite (`vite.config.ts`) into `static/` for Django `collectstatic`.

## Conventions & gotchas
- Data shape is driven by the journey serializers — coordinate any field changes with
  [journey](../journey/CLAUDE.md)`/api/progress_serializers.py`.
- The API is read-only and query-flat; don't add write calls from here.
- TypeScript + Vite; keep `npm run eslint` at **zero errors** (CI blocks merge).

## Tests
```bash
cd leaguesphere/journey_dashboard && npm run test:run
cd leaguesphere/journey_dashboard && npm run eslint
```
