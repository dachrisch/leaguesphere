# gameday_designer/ — CLAUDE.md

> Module guide. This folder is **hybrid**: a Django app *and* its React app live here together.
> For repo-wide commands, testing setup, and deployment policy see the [root CLAUDE.md](../CLAUDE.md).
> Detailed agent notes also exist in `gameday_designer/GEMINI.md`.

## Purpose
A tool for building, validating, and applying tournament **schedule templates**. Users wire up a
bracket (Field > Stage > Game) with winner/loser/rank progression paths, then apply it to generate
real gamedays.

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

## Frontend (React — TypeScript)
- Entry: `src/index.tsx` → `src/App.tsx`. The bracket editor is a **list/table UI**
  (`ListDesignerApp.tsx` → `ListCanvas.tsx` → `list/FieldSection.tsx` → `list/StageSection.tsx` →
  `list/GameTable.tsx`, nested Bootstrap cards/tables) — **not** a React Flow canvas; there is no
  `reactflow`/`@xyflow/react` dependency. The domain model still speaks in node/edge terms
  (`FlowNode`/`FlowEdge` in `src/types/flowchart.ts`, replacing what were originally React Flow
  types) because the graph shape (Field > Stage > Game, winner/loser/rank wiring) is still exactly
  a graph — only the rendering changed.
- `src/api/` (backend calls), `src/context/` + `src/hooks/` (state — no Redux),
  `src/components/`, `src/types/`, `src/i18n/` (localized), `src/utils/`.
- Built with Vite (`vite.config.mts`) into `static/`.

### Expert Mode / Progression Inspector
An opt-in, advanced view for inspecting how the current graph *would* resolve if played to
completion, plus non-blocking correctness findings (dangling references, unreachable placeholders,
unresolved cycles, undecided ties, reference/edge mismatches, ambiguous — fully tied — standings).
Deliberately kept separate from the always-on `useFlowValidation`/`FlowValidationResult` system:
- **Finding messages**: every `ProgressionFinding` `progressionSimulator.ts` produces sets both
  `messageKey`/`messageParams` (for translation) and a plain-English `message`. Only the former
  should ever reach a real user — `message` is a dev-only fallback for ad-hoc/test-constructed
  findings; `getProgressionFindingMessage()` in `utils/progressionMessages.ts` (shared by
  `ProgressionInspectorPanel.tsx` and `GameTable.tsx` — don't reimplement it per call site) logs a
  warning if it ever has to fall back to `message`, since that means a finding was built without a
  `messageKey`.
- **Toggle**: `expertMode` in `GamedayContext.tsx`, backed by `useExpertMode.ts`
  (`localStorage`, key `gd_expert_mode`) — **per-user, local-only, off by default**. It is never
  sent to the backend and never appears in the saved `FlowState`.
- **Engine**: `src/utils/progressionSimulator.ts` (`simulateProgression`) — a topological-fixpoint
  simulator over `winner`/`loser`/`rank`/`groupRank` `TeamReference`s, distinguishing
  `basis: 'actual'` (already happened) from `basis: 'projected'` (hypothetical, e.g. "if the home
  team wins"). Its stage-standings tiebreak (win points, then point diff, then points-for) is
  copied from `gamedays/service/canvas_progression_service.py::_compute_stage_standings` — keep
  the two in sync if that backend logic changes.
- **Hook**: `useProgressionInspection.ts`, wired into `useDesignerController.ts` as a value fully
  separate from `validation` (different return type, never merged) — this is what makes the
  "never blocks saving" guarantee structural rather than a convention to remember.
- **UI**: a toolbar switch (`FlowToolbar.tsx`), a per-row indicator in `GameTable.tsx`, and the
  `ProgressionInspectorPanel.tsx` summary panel (mounted only when `expertMode` is true — it
  doesn't render at all when off).
- **Do not** attach simulation output to `node.data` — `GameNodeData.resolvedHomeTeam`/
  `resolvedAwayTeam` look like a precedent for that, but they're a pre-existing quirk: despite
  being commented "non-persisted", they actually round-trip through `exportState()`/`saveData`
  into the shared, saved `FlowState`. Expert Mode's simulation must stay in separate client-only
  state (the `progressionByGameId` map) specifically so it can never leak into another
  collaborator's session.

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


## CI scope (scoped CI)

Changes here run: **python-designer backend shard (pytest gameday_designer/tests/) + gameday_designer_js frontend job (npm --prefix gameday_designer/) + e2e.** Scoping details: [Scoped CI](../docs/topics/deployment/scoped-ci.md).
