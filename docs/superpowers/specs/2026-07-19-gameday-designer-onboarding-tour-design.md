# Gameday Designer onboarding tours — design

- **Date:** 2026-07-19
- **Status:** Approved, ready for implementation planning

## Problem

First-time users of `gameday_designer` land on an empty canvas with no guidance on
how to build a schedule (add a field, add a stage, add teams, add games), and no
nudge that a finished schedule can be saved as a reusable template. We want two
short, self-hosted product tours — no third-party service, no new backend tables —
reusing the app's existing `trackEvent()` / `JourneyEvent` pipeline for analytics.

## Decisions

| Question | Decision |
|---|---|
| Library | `react-joyride` (MIT). Rejected Shepherd.js: core lib is AGPL-3.0, requires a paid commercial license for revenue-generating use. |
| Tour A scope | Manual build path only (add field → stage → team → game), not the Templates/generate-from-template shortcut. |
| Tour A trigger | Auto-start on first visit to `/designer/:id`, if unseen. |
| Tour B scope | Nudge toward "save current schedule as a template". |
| Tour B trigger | Right after a successful publish, if unseen. |
| Seen-state storage | Derived from the `JourneyEvent` log (query existing `/api/journey/events/` endpoint), not a new table and not `localStorage`. Persists cross-device; reuses infra the app already writes to via `trackEvent()`. |
| Replay | Manual "?" button in `AppHeader`, force-starts Tour A regardless of seen-state. |
| i18n | Step copy goes through `useTypedTranslation`, `de` + `en`, matching every other string in this app. |

## Architecture

### 1. Dependency

Add `react-joyride` to `gameday_designer/package.json`.

### 2. Backend — `journey/views.py::JourneyEventViewSet.get_queryset`

Add `event_name` / `event_name__in` query-param filtering (currently only filters
by `journey`). No migration — `JourneyEvent.event_name` already exists and is
indexed (`journey/models.py`).

```python
event_name = self.request.query_params.get('event_name')
if event_name:
    qs = qs.filter(event_name=event_name)
event_names = self.request.query_params.get('event_name__in')
if event_names:
    qs = qs.filter(event_name__in=event_names.split(','))
```

### 3. Frontend — `src/onboarding/`

- `useTourSeen(tourId: string): boolean | 'loading'`
  `GET /api/journey/events/?event_name__in=gd_tour_<tourId>_completed,gd_tour_<tourId>_skipped`
  (via the existing session+CSRF `trackEvent.ts`-style fetch helper); `seen = results.length > 0`.
- `<DesignerTour tourId steps run onFinish />` — thin wrapper around
  `react-joyride`'s `<Joyride>`, translating its `callback` into
  `trackEvent()` calls (see event names below).
- Event naming follows the existing snake_case/past-tense convention used
  elsewhere in this app (`gameday_published`, `template_saved`, `global_team_added`):
  - `gd_tour_<id>_started`
  - `gd_tour_<id>_step_completed` — metadata: `{ step_id, step_index }`
  - `gd_tour_<id>_completed`
  - `gd_tour_<id>_skipped` — metadata: `{ step_index }`

### 4. New `data-testid`s needed (joyride anchors)

The app already has a `data-testid` convention (`add-field-button`,
`open-template-library-button`, `flow-toolbar`, etc.) but several elements the
tours need to anchor to don't have one yet:

| File | Element | New testid |
|---|---|---|
| `src/components/list/FieldSection.tsx` | "Add Stage" button | `add-stage-button` |
| `src/components/list/GlobalTeamTable.tsx` | "Add Team" button | `add-team-button` |
| `src/components/list/StageSection.tsx` | "Add Game" button | `add-game-button` |
| `src/components/modals/TemplateLibraryModal.tsx` | "Save current as template" button | `save-current-as-template-button` |

## Tour A — manual build (`gd_tour_manual_build`)

Auto-starts in `ListDesignerApp` on first visit if `useTourSeen('manual_build')`
is `false`.

1. Welcome / canvas overview (centered, no anchor)
2. `add-field-button` — add a field where games are played
3. `add-stage-button` — add a stage within the field
4. `add-team-button` — build the team pool
5. `add-game-button` — add a game to the stage
6. `flow-toolbar` — autosave + undo/redo

A "?" help button, added next to the Templates button in `AppHeader.tsx`,
re-triggers Tour A on demand (ignores seen-state).

## Tour B — save as template (`gd_tour_save_template`)

Trigger: on successful publish, alongside the existing `gameday_published`
`trackEvent()` call in `ListDesignerApp.tsx::handleConfirmPublish`, if
`useTourSeen('save_template')` is `false`. Single-step spotlight on the Templates
button: "Did you know you can save this as a template?"

### Required fix, in scope: Templates button is disabled once published

`AppHeader.tsx` currently does `disabled={isLocked}` on
`open-template-library-button`, which fully blocks this tour's target action once
a gameday is published (`isLocked = metadata.status !== 'DRAFT'`). This is also
almost certainly why an orphaned `SaveTemplateModal.tsx` exists in the codebase
(no other file imports it) — an earlier, abandoned attempt at the same problem.

Fix:
- `AppHeader.tsx`: drop `disabled={isLocked}` from `open-template-library-button`;
  the button stays clickable when locked.
- `TemplateLibraryModal.tsx`: accept a new `isLocked` prop, threaded from
  `ListDesignerApp`. When locked, disable the *generate* actions
  (`onGenerateFromBuiltin` / `onGenerateFromSavedTemplate` — these would mutate a
  published gameday's games, which must stay blocked) but leave
  **"Save current as template"** enabled — saving a template reads the current
  designer state and writes a new, independent `Template` row; it does not mutate
  the locked gameday.

## Testing

- Vitest: `useTourSeen` (mocked fetch — seen/unseen/loading), Tour A trigger
  effect (fires once per unseen user, no-op when seen), Tour B trigger effect
  (fires on publish success when unseen), `TemplateLibraryModal` generate-actions
  disabled vs. save-as-template enabled when `isLocked`.
- Django: `JourneyEventViewSet` `event_name` / `event_name__in` filter — returns
  only matching events, still scoped to the requesting user (existing
  `get_queryset` behavior for non-staff).
- Manual: fresh user's first `/designer/:id` visit fires Tour A; publishing a
  draft as a first-time user fires Tour B and "Save current as template" works
  while locked; "?" button replays Tour A for a returning user.

## Out of scope

- The Templates/generate-from-template path is not taught by either tour.
- No new backend model/migration for onboarding state.
- No cross-app (PostHog-style) journey/funnel analytics — this only extends the
  existing per-app `JourneyEvent` log.
- Localizing tour copy beyond `de`/`en` (the app's current two locales).
