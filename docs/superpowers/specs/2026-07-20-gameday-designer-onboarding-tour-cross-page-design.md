# Gameday Designer onboarding Tour A — cross-page redesign

- **Date:** 2026-07-20
- **Status:** Approved, ready for implementation planning
- **Supersedes:** Tour A section of [2026-07-19-gameday-designer-onboarding-tour-design.md](2026-07-19-gameday-designer-onboarding-tour-design.md) (Tour B — save-as-template — is unaffected and out of scope here)

## Problem

Tour A currently only starts once a gameday already exists, on first visit to
`/designer/:id`. A first-time user never sees any guidance on the dashboard
(`/gamedays/gameday/design`) itself, and the designer-page portion of the tour
is five fine-grained steps (add field, add stage, add team, add game, toolbar)
that don't map to the higher-level mental model of the workflow: fill in
metadata, build a team pool, lay out fields, publish.

Tour A should instead start on the dashboard, guide the user through creating a
gameday, and then continue on the resulting designer page through metadata →
team pool → fields → publish, ending right where a schedule becomes real.

## Decisions

| Question | Decision |
|---|---|
| Cross-page mechanism | Two coordinated, page-local `react-joyride` instances (dashboard, designer), not one continuous instance spanning the route change. |
| Coordination primitive | `useTourSeen('manual_build')` (unchanged) for seen/unseen, plus a new `localStorage['gd_tour_manual_build_gameday_id']` key that remembers which gameday the in-progress tour belongs to. |
| Create-step interaction | The dashboard step requires a real click on the actual "Create Gameday" button — the tour's own "Next"/primary control is suppressed for that step. Only "Skip" is available. |
| Designer-step granularity | Consolidated from 5 fine-grained steps to 4, one per requested group: metadata, team pool, fields, publish. The old `flow-toolbar` step is dropped (not one of the four groups). |
| Resume behavior | If a user starts the tour, creates a gameday, and leaves before finishing, the next dashboard visit resumes mid-tour on that same draft gameday (skips the create step) instead of restarting from scratch. |
| Dashboard tour target | The header "Create Gameday" button (always rendered), not the empty-state duplicate button (only rendered when the gameday list is empty) — a first-time user may still see other users' gamedays in the list. |
| Replay ("?" button) | Unchanged. Always replays just the 4 designer-page steps for the gameday currently open; never re-triggers the dashboard/create step. |

## Architecture

Two `DesignerTour` instances instead of one:

1. **Dashboard** (`GamedayDashboard.tsx`, new usage) — a single-step tour.
2. **Designer page** (`ListDesignerApp.tsx`, existing usage) — 4 consolidated steps.

They coordinate through two pieces of state, both already-established patterns
in this app:

- `useTourSeen('manual_build')` — existing hook, unchanged. Still the sole
  source of truth for "has this user finished or skipped the tour" (backed by
  the `JourneyEvent` log, not `localStorage`).
- `localStorage['gd_tour_manual_build_gameday_id']` — new. Set immediately after
  a tour-driven gameday is created (before navigating away from the dashboard).
  Read on dashboard mount to decide whether to resume mid-tour. Cleared when the
  designer-page tour finishes or is skipped, and cleared (with fallback to a
  fresh create step) if the referenced gameday no longer resolves to a valid
  draft.

This intentionally avoids a single continuous Joyride instance controlled via
`stepIndex` and mounted above the router (e.g. in `GamedayProvider`). That
approach would give one seamless "step X of 5" counter across the navigation,
but requires custom logic to detect when the new page's DOM targets exist after
every route change. The two-instance design gets that for free — each instance
only ever mounts once its own page's DOM is present — at the cost of the
progress counter resetting between the dashboard step and the designer steps.

## Dashboard step (new)

Renders only when both:
- `useTourSeen('manual_build')` reports unseen, and
- `localStorage['gd_tour_manual_build_gameday_id']` has no valid entry (see
  Resume check below).

Single step:
- Target: new `data-testid="create-gameday-button"` on the **header** "Create
  Gameday" button in `GamedayDashboard.tsx` (not the empty-state button).
- `DesignerTour` gains a new optional prop, e.g. `requireRealAction?: boolean`,
  which — when true — configures the underlying `<Joyride>`'s
  `options.buttons` to omit `'primary'` (the Next control) for every step of
  that instance. Only `'back'` is irrelevant (single step) and `'skip'`/`'close'`
  remain. Dashboard's instance passes `requireRealAction`; the designer page's
  instance does not (unchanged, all four buttons available as today).
- The user must click the real button. `handleCreateGameday`'s existing success
  path additionally does, only when this tour step is currently active:
  ```ts
  localStorage.setItem('gd_tour_manual_build_gameday_id', String(newGameday.id));
  ```
  before its existing `navigate(`/designer/${newGameday.id}`)` call.
- Skipping this step fires the existing `gd_tour_manual_build_skipped` event
  (via the same `onFinish`/`STATUS.SKIPPED` handling `DesignerTour` already
  implements) and marks the tour seen — no gameday is created.

## Resume check (dashboard mount)

On mount, if the tour is unseen and `localStorage['gd_tour_manual_build_gameday_id']`
holds an id, validate it with `gamedayApi.getGameday(id)` (existing method,
`GET /gamedays/{id}/`):
- Resolves, and `status === 'DRAFT'`: valid resume target. Navigate straight to
  `/designer/{id}`; no dashboard-step tour is rendered on this visit.
- Rejects (deleted/404), or resolves but no longer `DRAFT` (published): clear
  the stored id immediately and render the create-step tour normally on this
  same visit.

This is a real network call, not a check against `GamedayDashboard`'s own
`loadGamedays()` list — that list is fetched with `has_designer_state: true`
(`GamedayCard`s only show gamedays that have actually been saved from the
designer at least once). A tour-created gameday has no `GamedayDesignerState`
row yet until the designer page's autosave fires on the first real change
(1.5s debounce after fields/teams/metadata change) — so a user who creates a
gameday via the tour and closes the tab immediately (the main case this
resume feature exists for) would have a gameday that's real and resumable but
invisible to that filtered list. `getGameday` checks gameday existence and
status directly, independent of designer-state.

Validating explicitly (rather than optimistically navigating and relying on
the designer page to detect and unwind an invalid id) also avoids a redirect
loop: an optimistic redirect to a deleted gameday would bounce back to `/` via
the designer page's existing load-failure handling, but nothing in that path
clears the stored id, so the next dashboard mount would redirect into the same
dead end again.

## Designer-page steps (consolidated, replaces current 5)

Auto-run trigger is unchanged: `!tourASeen && id` (still works whether the user
arrived via the dashboard hand-off or opened this gameday directly, e.g. via a
bookmark — in the latter case there's simply no dashboard step to skip).

1. **Metadata** — target `[data-testid="gameday-metadata-header"]` (existing
   testid, `GamedayMetadataAccordion.tsx`)
2. **Team Pool** — target new `[data-testid="add-team-group-button"]`, on the
   always-rendered header "Add Group" button in `MetadataTeamPoolRow.tsx`. The
   existing `add-team-button` testid (`TeamGroupCard.tsx`) only exists once at
   least one team group has been created — `useFlowState`'s
   `globalTeamGroups` defaults to `[]` for a gameday with no saved designer
   state yet, so a brand-new gameday (the exact case this step needs to cover)
   would have no matching element for that selector.
3. **Fields** — target `#add-field-button` (existing); copy now covers
   fields/stages/games together instead of three separate steps
4. **Publish** — target `[data-testid="publish-schedule-button"]` (existing,
   `ListDesignerApp.tsx`), last step

Finishing (clicking "Last" on step 4) or skipping at any point:
- Fires the existing `gd_tour_manual_build_completed` /
  `gd_tour_manual_build_skipped` tracking (unchanged `DesignerTour` /
  `handleTourAFinish` logic).
- Additionally clears `localStorage['gd_tour_manual_build_gameday_id']` — the
  tour is no longer "in progress" for that gameday either way.

## Data / testid changes

| File | Change |
|---|---|
| `src/components/dashboard/GamedayDashboard.tsx` | Add `data-testid="create-gameday-button"` to the header Create button; add resume-check effect + conditional single-step `DesignerTour` render; set `localStorage` id on successful tour-driven creation |
| `src/onboarding/DesignerTour.tsx` | Add optional `requireRealAction?: boolean` prop, threading through to `options.buttons` |
| `src/components/MetadataTeamPoolRow.tsx` | Add `data-testid="add-team-group-button"` to the header "Add Group" button |
| `src/components/ListDesignerApp.tsx` | Replace `tourASteps` (5 steps) with the 4 consolidated steps/targets; clear the resume `localStorage` key in `handleTourAFinish` |
| `src/i18n/locales/{de,en}/ui.json` | New copy for the create step + 4 consolidated steps; remove now-orphaned `add_stage`/`add_game`/`toolbar` keys |

No backend changes — this is entirely a frontend restructuring of an existing,
already-shipped tour; the `JourneyEvent`-backed seen-state mechanism and event
names are unchanged.

## Testing

- Vitest, `DesignerTour.test.tsx`: `requireRealAction` omits the primary button
  from `options.buttons`.
- Vitest, new `GamedayDashboard` coverage: renders the create-step tour when
  unseen and no resume id; skips it and navigates directly when a valid resume
  id is present; falls back to the create step when the resume id's gameday
  fails to load.
- Vitest, `ListDesignerApp.test.tsx`: update fixtures/assertions for the new
  4-step `tourASteps` list and targets; `handleTourAFinish` clears the
  `localStorage` resume key.
- Manual: fresh user's first dashboard visit shows the create-step tour;
  clicking Create Gameday (not the tour's own controls, since there are none)
  creates the gameday, navigates, and the designer-page tour auto-continues at
  Metadata; closing the tab mid-tour and returning to the dashboard resumes at
  Metadata on the same draft instead of creating a second gameday; finishing at
  Publish marks the tour seen and clears the resume id; the "?" replay button
  still only replays the 4 designer-page steps.

## Out of scope

- Tour B (save-as-template nudge) — unchanged, not touched by this redesign.
- A single continuous cross-page progress counter (see Architecture — explicitly
  rejected in favor of the simpler two-instance design).
- Multi-device resume (the resume id lives in `localStorage`, per-browser, same
  limitation as the existing `authToken` storage).
