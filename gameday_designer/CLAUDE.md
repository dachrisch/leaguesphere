# gameday_designer/ — CLAUDE.md

> Module guide. This folder is **hybrid**: a Django app *and* its React app live here together.
> For repo-wide commands, testing setup, and deployment policy see the [root CLAUDE.md](../CLAUDE.md).
> Detailed agent notes also exist in `gameday_designer/GEMINI.md`.

## Purpose
A **visual flowchart tool** for building, validating, and applying tournament **schedule
templates**. Users wire up a bracket (Field > Stage > Game) with winner/loser progression paths,
then apply it to generate real gamedays.

## Role in the system
Produces schedules that become `Gameday`/`Gameinfo` records in [gamedays](../gamedays/CLAUDE.md)
(whose `service/canvas_*` and `schedule_resolution_service.py` handle the canvas + bracket
resolution). Applying a template is the write path into the core scheduling model.

---

## Backend (Django)

### Key models (`models.py`)
`ScheduleTemplate`, `TemplateSlot`, `TemplateUpdateRule`, `TemplateUpdateRuleTeam`,
`TemplateApplication`.

### Service layer (`service/`)
- `template_application_service.py` — applies a template to create a gameday (the write path).
- `template_validation_service.py` — validates a template before application.
- `time_service.py` — slot/time calculations.

### API & routes (`urls.py` / `app_urls.py`)
`''`, `config/`, `teams/`, `teams/bulk/`, `gamedays/<int:gameday_id>/league-teams/`.
Serializers in `serializers.py`; `permissions.py` guards access; `management/` has commands.

---

## Frontend (React — TypeScript, React Flow)
- Entry: `src/index.tsx` → `src/App.tsx`. **React Flow** renders the bracket canvas.
- `src/api/` (backend calls), `src/context/` + `src/hooks/` (state — no Redux),
  `src/components/`, `src/types/`, `src/i18n/` (localized), `src/utils/`.
- Built with Vite (`vite.config.mts`) into `static/`.

---

## Conventions & gotchas
- Hierarchy is always **Field > Stage > Game** — keep new features consistent with it.
- Progression (winner/loser paths) resolves against **placeholder teams** — templates reference
  placeholders that must exist in the DB (see root CLAUDE.md § placeholder teams).
- Always run `template_validation_service` logic before application; don't bypass validation.

## Tests
```bash
cd leaguesphere && pytest gameday_designer          # backend (needs LXC test DB)
cd leaguesphere/gameday_designer && npm run test:run # frontend
cd leaguesphere/gameday_designer && npm run eslint   # ZERO errors — CI blocks merge
```
