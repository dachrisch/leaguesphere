# scorecard/ — CLAUDE.md

> Module guide. This folder is **hybrid**: a Django app *and* its React app live here together.
> For repo-wide commands, testing setup, and deployment policy see the [root CLAUDE.md](../CLAUDE.md).

## Purpose
The **on-field scoring interface** used by officials/scorekeepers to record game results directly
from the sideline — touchdowns, points-after, penalties — usually on a tablet or phone.

## Role in the system
The **write path** for live game results. The React app captures scoring and pushes atomic updates
to the backend; results land in [gamedays](../gamedays/CLAUDE.md) models and are then displayed by
[liveticker](../liveticker/CLAUDE.md).

---

## Backend (Django) — thin
- **No `models.py`, no `api/`, no `service/`.** `views.py` is a single `TemplateView`
  (`ScorecardView`) that just **serves the React SPA**; `urls.py` routes `''` → `scorecard-home`.
- Scoring reads/writes go through the [gamedays](../gamedays/CLAUDE.md) API, not a local API here.

---

## Frontend (React — JavaScript, Redux)
- Entry: `src/index.jsx`. **Redux** state — `src/actions/`, `src/reducers/`, `src/store.js`
  (same pattern as liveticker; unlike the Context/hooks apps).
- `src/components/`, `src/trackEvent.ts` (analytics), `src/reportWebVitals.js`.
- Built with Vite (`vite.config.mjs`) into `static/`.

---

## Conventions & gotchas
- Backend is intentionally thin — **don't add domain models/APIs here**; extend the gamedays API
  for new score data.
- Updates must be **atomic** to avoid data loss on flaky field connections — preserve that
  guarantee when changing the submit flow.
- Validate game rules at entry (client) but rely on gamedays for authoritative validation.

## Tests
```bash
cd leaguesphere/scorecard && npm run test:run # frontend (primary)
cd leaguesphere/scorecard && npm run eslint   # ZERO errors — CI blocks merge
```
