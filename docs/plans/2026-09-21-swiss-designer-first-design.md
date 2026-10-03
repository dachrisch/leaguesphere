# Swiss designer-first redesign (2026-09-21)

Follow-up to `2026-09-20-swiss-system-1970-design.md`. Validated with organizer 2026-09-21.

Problem: Swiss setup + round control live in modals (`SwissSetupStep`, `SwissControlModal`).
`SwissTournamentService.setup()` only writes `state_data["swiss"]` and `generate_round()`
only writes `Gameinfo` rows (`stage="Swiss"`). Designer `nodes` stay empty, so the canvas
shows nothing after applying the Swiss template.

## 1. Architecture (designer-first)

- On Swiss template confirm, `setup()` also seeds the canvas: Fields `1..F`, Stage nodes
  `Round 1..N` (`progressionMode: 'swiss'`), real Game nodes for Round 1 only.
  Rounds `2..N` get placeholder Game nodes (e.g. `Swiss R2-G1`, no teams).
- `generate_round()` stays the pairing engine (`SwissRoundResolver`) but gains an override
  path: proposed pairings -> operator adjust -> confirmed pairings materialize as both
  `Gameinfo` rows and designer Game nodes. `loadData()` re-renders, no refresh hack.
- `SwissControlModal` stops being the control loop. Per-round Progress/Generate buttons move
  into `StageSection` headers in `ListCanvas` (swiss stages only). Modal survives only as the
  adjust/override dialog.
- Round 1 generates immediately on template apply (as today). Rounds `2..N` show
  "Not yet generated" until the prior round is fully COMPLETED (existing gate).

## 2. Components

Frontend:
- `TemplateLibraryModal` + `SwissSetupStep` stay for the initial pick (seeds, rounds, fields,
  duration). On confirm: `setupSwiss` + generate Round 1, close, land in designer.
- `ListCanvas` / `FieldSection` / `StageSection`: swiss Stage headers get a Progress button
  with state (`Generate Round N`, `waiting for results`, `complete`) + badge.
- New `SwissRoundAdjustModal` (evolve, don't patch, `SwissControlModal`): proposed pairings
  table with per-row home/away dropdowns, bye dropdown, field select, start-time input.
  Full manual override. Confirm posts overrides, Cancel discards.
- Standings move out of the modal into a designer-embedded Swiss panel so table + canvas
  are visible together.

Backend:
- `setup()` creates Field/Stage/Game canvas nodes in `GamedayDesignerState`.
- `generate_round(overrides?)` accepts confirmed pairings/fields/times/bye, validates
  (no dup teams, bye team unpaired, field in range, HH:MM), materializes `Gameinfo` + nodes.

## 3. Data flow, errors, testing

Flow per round:
1. Progress click on Round N+1 -> `GET standings` + `POST generate-round --dry-run`
   (new, resolve only, no write) -> proposed pairings/bye/times.
2. Adjust modal edits locally -> Confirm `POST generate-round` with overrides -> validate,
   create `Gameinfo` + nodes, update `swiss.completedRounds/byes` -> `loadData()`.
3. Results via existing `GameResultModal`/results mode. Next round gated until all games in
   current round are COMPLETED.

Errors (400 `{error}`, inline in modal/stage header, not toast-only):
unknown/duplicate teams, bye team also paired, field out of range, bad time, round > total,
prior round incomplete.

Testing:
- Backend: extend `test_swiss_api.py` + `test_swiss_tournament_service.py` with override +
  canvas-node assertions (R1 concrete, R2..N placeholders, Progress appends nodes).
- Frontend: keep `TemplateLibrarySwissFlow` setup tests; new tests for Stage Progress states
  + Adjust modal full-override; retire `SwissControlModal` tests with it.
- E2E: template -> R1 visible -> complete results -> Progress -> adjust -> R2 visible.

## Deviations (implementation notes)

1. `TemplateLibraryModal` setup config prop is named `fieldCount`, not `fields`.
2. Generate-round overrides require full coverage: all seed teams exactly once
   (paired or bye), enforced in `_validate_generate_overrides`.
3. `setup()` refuses re-run after rounds were generated (400 `already has generated
   rounds`); re-setup is not allowed.
4. Header 🏁 button removed entirely (not repointed); round control lives in the
   per-round Progress buttons + adjust modal, standings in the embedded panel.
5. Dry-run preview envelope keeps `{success: true}` (`{success, round, pairings,
   bye_team_id, game_ids: []}`), same shape as the generate response.
6. `seedOrder` stores team ids as strings in canvas/designer nodes vs ints in the
   persisted setup config.
7. Seed teams are imported into the canvas pool on apply (deduped by `String(pk)`
   id, saved before setup/generate/loadData) and shown in a `Teams` (`group-swiss`)
   group, so game dropdowns resolve names.
8. SUPERSEDED 2026-09-22 (user review of staging): single `Round N` stages replaced
   by one `Round N` stage PER FIELD (`swiss-round-{r}-field-{f}`, explicit int
   `swissRound`/`swissField` on stage data); games parented by assigned field.
   Per-stage Progress buttons and the per-game field chip removed again; the side
   panel (standings table) owns the single Generate-next-round button. Legacy
   single-stage states are preserved untouched; new rounds backfill per-field
   stages on demand.
