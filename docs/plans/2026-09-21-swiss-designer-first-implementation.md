# Swiss Designer-First Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move Swiss round control out of `SwissControlModal` into the designer canvas (Stages = Rounds with per-round Progress buttons) plus a full-override adjust modal.

**Architecture:** Backend `setup()` seeds Field/Stage/Game canvas nodes and `generate_round()` accepts confirmed overrides and writes both `Gameinfo` rows and canvas nodes; frontend `StageSection` headers own the Progress buttons and a new `SwissRoundAdjustModal` handles preview + full manual override.

**Tech Stack:** Django (DRF) + React/TypeScript (Bootstrap), axios `designerApi`, existing `SwissRoundResolver`.

**Worktree:** `/home/cda/dev/leaguesphere/.worktrees/feat-1970-swiss-designer-first`, branch `feat/1970-swiss-designer-first` (from `db1cb27c`). Design doc: `docs/plans/2026-09-21-swiss-designer-first-design.md`.

---

### Task 0: Baseline verification

**Files:** none (verification only).

**Step 1: Confirm clean tree**

Run: `git status -sb` in the worktree.
Expected: only `?? docs/plans/2026-09-21-swiss-designer-first-design.md`.

**Step 2: Backend baseline**

Run: `pytest gameday_designer -x -q` (needs LXC test DB per `gameday_designer/CLAUDE.md`).
Expected: PASS. If DB unavailable, record the blocker and proceed to frontend tasks first.

**Step 3: Frontend baseline**

Run: `npm run test:run` in `gameday_designer/`.
Expected: PASS.

**Step 4: Lint baseline**

Run: `npm run eslint` in `gameday_designer/`.
Expected: ZERO errors (CI blocks merge).

---

### Task 1: Dry-run round preview endpoint (backend, TDD)

**Files:**
- Modify: `gameday_designer/service/swiss_tournament_service.py` (split `generate_round()` resolve vs materialize; add `preview_round() -> dict`)
- Modify: `gameday_designer/views.py:710-734` (`SwissGenerateRoundView`: `?dry_run=true` resolves without DB write)
- Test: `gameday_designer/tests/test_swiss_api.py` (dry-run returns pairings/bye/times, creates zero `Gameinfo`)

**Step 1: Write the failing test**

```python
def test_generate_round_dry_run_creates_nothing(auth_client, swiss_gameday):
    resp = auth_client.post(f"/api/designer/gamedays/{swiss_gameday.pk}/swiss/generate-round/?dry_run=true")
    assert resp.status_code == 200
    assert resp.json()["round"] == 1
    assert len(resp.json()["pairings"]) > 0
    assert Gameinfo.objects.filter(gameday=swiss_gameday).count() == 0
```

**Step 2: Run test to verify it fails**

Run: `pytest gameday_designer/tests/test_swiss_api.py -q`
Expected: FAIL (`dry_run` still materializes / 400).

**Step 3: Implement `preview_round()` + `dry_run` branch in the view**

```python
# service
def preview_round(self) -> dict:
    config = self._require_config()
    # same resolve logic as generate_round(), no _materialize_round call
    ...
# views.py SwissGenerateRoundView.post:
if request.query_params.get("dry_run") == "true":
    return Response(SwissTournamentService(gameday).preview_round())
```

**Step 4: Run test to verify it passes**

Run: `pytest gameday_designer/tests/test_swiss_api.py -q`
Expected: PASS.

**Step 5: Commit**

```bash
git add gameday_designer/service/swiss_tournament_service.py gameday_designer/views.py gameday_designer/tests/test_swiss_api.py
git commit -m "feat(swiss): add dry-run round preview without materializing"
```

---

### Task 2: `setup()` seeds designer canvas nodes (backend, TDD)

**Files:**
- Modify: `gameday_designer/service/swiss_tournament_service.py` (`setup()` also writes Field `1..F`, Stage `Round 1..N`, placeholder Game nodes `Swiss R{r}-G{i}` for rounds `2..N` into `GamedayDesignerState.state_data["nodes"]`)
- Test: `gameday_designer/tests/test_swiss_tournament_service.py` (nodes created, R1 resolved later, placeholders have no teams)

**Step 1: Write the failing test**

```python
def test_setup_seeds_canvas_nodes(swiss_gameday):
    config = SwissTournamentService(swiss_gameday).setup(seed_team_ids=[...], rounds=3, fields=2, game_duration=30)
    nodes = GamedayDesignerState.objects.get(gameday=swiss_gameday).state_data["nodes"]
    stages = [n for n in nodes if n["type"] == "stage"]
    assert [s["data"]["name"] for s in stages] == ["Round 1", "Round 2", "Round 3"]
```

**Step 2: Run test to verify it fails**

Run: `pytest gameday_designer/tests/test_swiss_tournament_service.py -q`
Expected: FAIL (no nodes seeded).

**Step 3: Implement node seeding** (Field nodes `field-{i}`, Stage nodes `swiss-round-{r}` with `progressionMode: 'swiss'`, Game placeholders for `r >= 2`; never overwrite existing non-Swiss nodes — merge by id).

**Step 4: Run test to verify it passes**

Run: `pytest gameday_designer/tests/test_swiss_tournament_service.py gameday_designer/tests/test_swiss_api.py -q`
Expected: PASS.

**Step 5: Commit**

```bash
git add gameday_designer/service/swiss_tournament_service.py gameday_designer/tests/test_swiss_tournament_service.py
git commit -m "feat(swiss): seed Field/Stage/Game canvas nodes on setup"
```

---

### Task 3: `generate_round(overrides)` + node materialization (backend, TDD)

**Files:**
- Modify: `gameday_designer/service/swiss_tournament_service.py` (`generate_round(overrides=None)`; validate + write Game nodes under `swiss-round-{n}`)
- Modify: `gameday_designer/serializers.py:347+` (new `SwissGenerateOverridesSerializer`: pairings, bye_team_id, fields, start_times)
- Modify: `gameday_designer/views.py:710-734` (pass validated overrides through)
- Test: `gameday_designer/tests/test_swiss_api.py` (override bye/field/time accepted; dup team / bye-also-paired / bad time / prior-round-incomplete -> 400 `{error}`)

**Step 1: Write the failing tests** (one per validation + happy-path override; happy path asserts both `Gameinfo` rows AND canvas Game nodes exist for that round).

**Step 2: Run to verify they fail**

Run: `pytest gameday_designer/tests/test_swiss_api.py -q`
Expected: FAIL.

**Step 3: Implement validation + materialization** (override shape: `{pairings: [{home_team_id, away_team_id, field?, start_time?}], bye_team_id?}`; reject unknown/dup teams, bye paired, field out of `1..F`, time not HH:MM).

**Step 4: Run to verify they pass**

Run: `pytest gameday_designer -q`
Expected: PASS.

**Step 5: Commit**

```bash
git add gameday_designer/service/swiss_tournament_service.py gameday_designer/serializers.py gameday_designer/views.py gameday_designer/tests/test_swiss_api.py
git commit -m "feat(swiss): accept full-manual round overrides and materialize canvas nodes"
```

---

### Task 4: Frontend API client (TDD)

**Files:**
- Modify: `gameday_designer/src/api/designerApi.ts` (add `previewSwissRound(gamedayId)` + `generateSwissRound(gamedayId, overrides?)`)
- Test: `gameday_designer/src/api/__tests__/designerApi.test.ts`

**Step 1: Write failing tests** (dry-run GET-ish POST hits `?dry_run=true`; overrides POST body passes through).

**Step 2: Run to verify they fail**

Run: `npm run test:run -- src/api/__tests__/designerApi.test.ts` in `gameday_designer/`
Expected: FAIL.

**Step 3: Implement** (keep existing `generateSwissRound(gamedayId)` signature working; add optional second arg).

**Step 4: Run to verify they pass**

Run: same command. Expected: PASS.

**Step 5: Commit**

```bash
git add gameday_designer/src/api/designerApi.ts gameday_designer/src/api/__tests__/designerApi.test.ts
git commit -m "feat(swiss): add preview + overrides to designerApi"
```

---

### Task 5: Per-round Progress button in `StageSection` (TDD)

**Files:**
- Modify: `gameday_designer/src/components/list/StageSection.tsx` (optional `swiss?: { roundNumber, status: 'current'|'waiting'|'complete', onProgress }` prop; header button `data-testid="swiss-progress-{round}"`)
- Modify: `gameday_designer/src/components/ListCanvas.tsx` (+ `FieldSection.tsx` passthrough: derive per-stage swiss status from `flowState.swiss`)
- Test: new `gameday_designer/src/components/list/__tests__/StageSectionSwiss.test.tsx` (button states: generatable / waiting-for-results / complete-hidden; click calls `onProgress`)

**Step 1-2: Write tests, run, verify FAIL.**

**Step 3: Implement** (readOnly/locked hides button; waiting state shows inline hint, not just toast).

**Step 4: Run**

Run: `npm run test:run -- src/components/list/__tests__/StageSectionSwiss.test.tsx` in `gameday_designer/`
Expected: PASS + `npm run eslint` ZERO errors.

**Step 5: Commit**

```bash
git add gameday_designer/src/components/list/StageSection.tsx gameday_designer/src/components/ListCanvas.tsx gameday_designer/src/components/list/FieldSection.tsx gameday_designer/src/components/list/__tests__/StageSectionSwiss.test.tsx
git commit -m "feat(swiss): per-round Progress button in designer canvas"
```

---

### Task 6: `SwissRoundAdjustModal` with full override (TDD)

**Files:**
- Create: `gameday_designer/src/components/modals/SwissRoundAdjustModal.tsx` (proposed pairings table; per-row home/away selects, bye select, field select, time input; Confirm/Cancel; `data-testid="swiss-adjust-modal"`)
- Modify: `gameday_designer/src/components/ListDesignerApp.tsx:132-160,780-784` (Progress click -> `previewSwissRound` -> open adjust modal; Confirm -> `generateSwissRound(id, overrides)` -> `loadData()`)
- Test: new `gameday_designer/src/components/modals/__tests__/SwissRoundAdjustModal.test.tsx` (swap teams, change bye, edit field/time, Confirm payload shape; backend 400 renders inline error)
- i18n: `gameday_designer/src/i18n/locales/en/modal.json`, `de/modal.json` (new `swissAdjust.*` keys)

**Step 1-2: Write tests, run, verify FAIL.**

**Step 3: Implement** (clone, don't patch, `SwissControlModal.tsx` logic for fetch/error display; `apiErrorMessage` helper reuse).

**Step 4: Run**

Run: `npm run test:run -- src/components/modals/__tests__/SwissRoundAdjustModal.test.tsx` in `gameday_designer/`
Expected: PASS + eslint clean.

**Step 5: Commit**

```bash
git add gameday_designer/src/components/modals/SwissRoundAdjustModal.tsx gameday_designer/src/components/modals/__tests__/SwissRoundAdjustModal.test.tsx gameday_designer/src/components/ListDesignerApp.tsx gameday_designer/src/i18n/locales/en/modal.json gameday_designer/src/i18n/locales/de/modal.json
git commit -m "feat(swiss): adjust modal with full manual override"
```

---

### Task 7: Embedded standings + retire control modal

**Files:**
- Modify: `gameday_designer/src/components/ListDesignerApp.tsx` (render standings panel in designer from `flowState.swiss` + `getSwissStandings`; remove `SwissControlModal` usage; keep `AppHeader` 🏁 button pointing at the panel or drop it)
- Delete: `gameday_designer/src/components/modals/SwissControlModal.tsx` + `__tests__/SwissControlModal.test.tsx` (after Adjust modal covers behavior; update `TemplateLibrarySwissFlow.test.tsx` if it references the old modal)
- Test: update/extend `TemplateLibrarySwissFlow.test.tsx` (template apply -> R1 games visible in canvas, R2 placeholders visible)

**Step 1-2: Write/adjust tests, verify FAIL.**

**Step 3: Implement.**

**Step 4: Run full frontend**

Run: `npm run test:run` + `npm run eslint` in `gameday_designer/`
Expected: PASS, ZERO eslint errors.

**Step 5: Commit**

```bash
git add -A gameday_designer/src
git commit -m "feat(swiss): embed standings in designer, retire control modal"
```

---

### Task 8: Verification + docs

**Step 1:** Run backend shard `pytest gameday_designer -q` — PASS.

**Step 2:** Run frontend `npm run test:run` + `npm run eslint` — PASS / ZERO errors.

**Step 3:** Manual E2E on staging worktree build: template -> R1 visible -> enter results -> Progress R2 -> adjust (swap + bye + field/time) -> Confirm -> R2 visible with overrides; gate check (Progress blocked until results complete).

**Step 4:** Update `docs/plans/2026-09-21-swiss-designer-first-design.md` with any deviations.

**Step 5: Commit**

```bash
git add -A && git commit -m "docs(swiss): record designer-first deviations"
```

Skills to reference during execution: @test-driven-development (every task), @systematic-debugging (on failure), @verification-before-completion (Task 8), @finishing-a-development-branch (after Task 8).
