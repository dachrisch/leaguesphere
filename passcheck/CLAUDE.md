# passcheck/ — CLAUDE.md

> Module guide. This folder is **hybrid**: a Django app *and* its React app live here together.
> For repo-wide commands, testing setup, and deployment policy see the [root CLAUDE.md](../CLAUDE.md).

## Purpose
**Player eligibility verification ("passcheck")** on gamedays — digital player-list checks that
enforce relegation rules, gameday participation limits, and transfer constraints before a player
may play.

## Role in the system
Owns eligibility data and rules, reading rosters from [teammanager](../teammanager/CLAUDE.md) /
[gamedays](../gamedays/CLAUDE.md). The React app is the on-site verification UI; it authenticates
with a Knox token from [accounts](../accounts/CLAUDE.md) and calls this app's API.

---

## Backend (Django)

### Key models (`models.py`)
`Player`, `Playerlist`, `PlayerlistGameday`, `PlayerlistTransfer`, `PasscheckVerification`
(+ `EmptyPasscheckVerification` null-object), `TeamRelationship`, `EligibilityRule`.

### Service layer (`service/`)
- `eligibility_validation.py` — **the core rules engine**; change eligibility logic here.
- `passcheck_service.py` — verification orchestration.
- `transfer_service.py` — player transfer handling.
- `request_api_service.py`, `repositories/` — external calls + data access.

### API & routes
- `api/` (`views.py`, `serializers.py`, `urls.py`).
- `urls.py`: `''` (app home), `transfer/list/`, `team/<int:pk>/list/`.

---

## Frontend (React — TypeScript)
- Entry: `src/index.tsx` → `src/App.tsx`. TypeScript + **Context/hooks** state
  (`src/context/`, `src/hooks/`) — no Redux.
- `src/components/`, `src/common/`, `src/utils/`, `src/trackEvent.ts` (analytics).
- Built with Vite (`vite.config.mts`) into `static/` for Django `collectstatic`.

---

## Conventions & gotchas
- Access is **strictly permissioned** — only authorized personnel may run checks; keep auth
  guards intact on new endpoints/screens.
- Eligibility is rules-driven via `EligibilityRule` + `eligibility_validation.py`; don't inline
  rule checks in views or components.
- `Empty*` classes are null-objects — return them instead of `None`.

## Tests
```bash
cd leaguesphere && pytest passcheck          # backend (needs LXC test DB)
cd leaguesphere/passcheck && npm run test:run # frontend
cd leaguesphere/passcheck && npm run eslint   # ZERO errors — CI blocks merge
```
