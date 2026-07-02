# liveticker/ — CLAUDE.md

> Module guide. This folder is **hybrid**: a Django app *and* its React app live here together.
> For repo-wide commands, testing setup, and deployment policy see the [root CLAUDE.md](../CLAUDE.md).

## Purpose
**Real-time game updates** for fans and participants — live scores, statuses, and event logging
(touchdowns, interceptions, etc.), refreshed automatically during active gamedays.

## Role in the system
A read-oriented view over game data owned by [gamedays](../gamedays/CLAUDE.md). The React app polls
this app's API for the latest game information. Mobile-first, on-field viewing.

---

## Backend (Django)
- **No `models.py`** — reads from gamedays; `constants.py` holds shared values.
- `service/liveticker_service.py` — assembles the live feed (start here).
- `api/` (`views.py`, `serializers.py`, `urls.py`) — the polling endpoints.
- `urls.py`: `''` (serves the SPA).

---

## Frontend (React — JavaScript, Redux)
- Entry: `src/index.jsx`. **Redux** state — `src/actions/`, `src/reducers/`, `src/store.js`
  (differs from the Context/hooks apps like passcheck/gameday_designer).
- `src/components/`, `src/reportWebVitals.js`.
- Built with Vite (`vite.config.mjs`) into `static/`.

---

## Conventions & gotchas
- This is **JavaScript + Redux**, not TypeScript — match the existing action/reducer pattern.
- The feed is read-heavy and polled — keep endpoints query-flat and cache-friendly (ETag pattern
  from gamedays applies).
- Live scoring **entry** happens in [scorecard](../scorecard/CLAUDE.md); liveticker only displays.

## Tests
```bash
cd leaguesphere && pytest liveticker          # backend (needs LXC test DB)
cd leaguesphere/liveticker && npm run test:run # frontend
cd leaguesphere/liveticker && npm run eslint   # ZERO errors — CI blocks merge
```
