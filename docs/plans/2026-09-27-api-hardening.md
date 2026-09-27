# LeagueSphere API Hardening (issues #1980/#1981/#1983) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the game write APIs return proper 4xx (400/404/409) instead of 500 on invalid input, guard illegal game status transitions, and ship the scorecard favicon + a hash-route regression test.

**Architecture:** Backend (Django + DRF) hardening of `gamedays/api/game_views.py` and `gamedays/service/wrapper/gameinfo_wrapper.py`; frontend polish in the `scorecard` React SPA. One branch + PR per issue: #1980 → #1981 → #1983 (they overlap in the same files, so sequencing avoids merge conflicts).

**Tech Stack:** Python/Django/DRF (`pytest`), React/Vitest (jsdom).

---

## Branch 1: `fix/1980-game-write-4xx` → PR for #1980

### Task 1: F1 failing tests (gamelog 400 validation)

**Files:**
- Modify: `gamedays/tests/api/test_game_views.py` (class `TestGameLog`, after line 195)

**Step 1: Write the failing tests**

```python
def test_post_team_log_rejects_string_event(self):
    DBSetup().g62_status_empty()
    first_game = Gameinfo.objects.first()
    response = self.app.post_json(
        reverse(API_GAMELOG, kwargs={"id": first_game.pk}),
        {
            "team": "A1",
            "gameId": first_game.pk,
            "half": 1,
            "event": "NotARealEventXYZ",
        },
        headers=DBSetup().get_token_header(),
        expect_errors=True,
    )
    assert response.status_code == HTTPStatus.BAD_REQUEST

def test_post_team_log_rejects_invalid_half(self):
    DBSetup().g62_status_empty()
    first_game = Gameinfo.objects.first()
    response = self.app.post_json(
        reverse(API_GAMELOG, kwargs={"id": first_game.pk}),
        {
            "team": "A1",
            "gameId": first_game.pk,
            "half": "XX",
            "event": [{"name": "Touchdown", "player": "19"}],
        },
        headers=DBSetup().get_token_header(),
        expect_errors=True,
    )
    assert response.status_code == HTTPStatus.BAD_REQUEST

def test_post_team_log_rejects_entry_without_name(self):
    DBSetup().g62_status_empty()
    first_game = Gameinfo.objects.first()
    response = self.app.post_json(
        reverse(API_GAMELOG, kwargs={"id": first_game.pk}),
        {
            "team": "A1",
            "gameId": first_game.pk,
            "half": 1,
            "event": [{"player": "19"}],
        },
        headers=DBSetup().get_token_header(),
        expect_errors=True,
    )
    assert response.status_code == HTTPStatus.BAD_REQUEST
```

**Step 2: Run to verify RED**

Run: `pytest gamedays/tests/api/test_game_views.py::TestGameLog -v`
Expected: FAIL (today returns 500)

### Task 2: F1 implement payload validation

**Files:**
- Modify: `gamedays/api/game_views.py:87-106` (`GameLogAPIView.post`)

**Step 3: Write minimal implementation**

Add helper + call at the top of `post`:

```python
def _validate_gamelog_payload(data):
    event = data.get("event")
    half = data.get("half")
    if not isinstance(event, list) or not event:
        raise ValidationError({"event": "must be a non-empty list of event objects"})
    for entry in event:
        if not isinstance(entry, dict):
            raise ValidationError({"event": "each entry must be an object"})
        name = entry.get("name")
        if not isinstance(name, str) or not name:
            raise ValidationError({"event": "each entry must have a non-empty 'name'"})
    if half not in (1, 2):
        raise ValidationError({"half": "must be 1 or 2"})
```

Import `ValidationError` from `rest_framework.exceptions`.

**Step 4: Run to verify GREEN**

Run: `pytest gamedays/tests/api/test_game_views.py::TestGameLog -v`
Expected: PASS

**Step 5: Commit** `fix(gamedays): return 400 for malformed gamelog payloads`

### Task 3: F2 failing 404 tests

**Files:**
- Modify: `gamedays/tests/api/test_game_views.py` (`TestGameHalftime`, `TestGameFinalize`, `TestGamePossessionAPIView`)

**Step 1: Write the failing tests**

```python
def test_halftime_unknown_game_404(self):
    response = self.app.put_json(
        reverse(API_GAME_HALFTIME, kwargs={"pk": 999999}),
        headers=DBSetup().get_token_header(),
        expect_errors=True,
    )
    assert response.status_code == HTTPStatus.NOT_FOUND
```
(same for `API_GAME_FINALIZE` and `API_GAME_POSSESSION`)

**Step 2: Run to verify RED** — expect FAIL (500 today)

### Task 4: F2 implement 404 handling

**Files:**
- Modify: `gamedays/api/game_views.py:149-153, 160-170, 210-214`

**Step 3: Write minimal implementation**

Wrap `GameService(kwargs.get("pk"))` in `try/except Gameinfo.DoesNotExist: raise NotFound(detail=f"No game found for gameId {pk}")` in `GameHalftimeAPIView.put`, `GameFinalizeUpdateView.update`, `GamePossessionAPIView.put`.

**Step 4: Run to verify GREEN**

Run: `pytest gamedays/tests/api/test_game_views.py -v`
Expected: PASS

**Step 5: Commit** `fix(gamedays): return 404 for halftime/finalize/possession on unknown game`

### Task 5: Concurrency (reproduce-first, decision gate)

**Files:**
- Test: `gamedays/tests/api/test_game_views.py` or `gamedays/tests/service/test_gamelog.py`
- Possibly: `gamedays/service/gamelog.py`

**Step 1: Reproduce** with a threaded test (two `GameLogCreator.create()` calls on the same game behind a barrier) and capture the actual traceback.

**Decision gate:**
- Sequence-allocation race → fix in `GameLogCreator.create()` (`gamelog.py:24`): compute `sequence` and save inside a transaction with `select_for_update()` on the Gameinfo row, plus defensive retry on `IntegrityError`.
- Infra-level locking (SQLite) → add regression test documenting the constraint and file a separate infra issue instead of forcing a migration.

**Step 2: Commit** accordingly.

### Task 6: Full verification + push

- Run `pytest gamedays/` (requires the LXC MariaDB test DB per `gamedays/CLAUDE.md:50`)
- Push branch, open PR for #1980.

---

## Branch 2: `fix/1981-possession-transitions` → PR for #1981

### Task 1: possession validation failing test

**Files:**
- Modify: `gamedays/tests/api/test_game_views.py` (`TestGamePossessionAPIView`)

**Step 1: Write the failing test**

```python
def test_put_game_possession_rejects_unknown_team(self):
    DBSetup().g62_status_empty()
    last_game = Gameinfo.objects.last()
    response = self.app.put_json(
        reverse(API_GAME_POSSESSION, kwargs={"pk": last_game.pk}),
        {"team": "Not A Real Team XYZ"},
        headers=DBSetup().get_token_header(),
        expect_errors=True,
    )
    assert response.status_code == HTTPStatus.BAD_REQUEST
```

**Step 2: Run to verify RED** — expect FAIL (200 today)

### Task 2: implement possession validation

**Files:**
- Modify: `gamedays/api/game_views.py:210-214`

**Step 3: Write minimal implementation**

Validate `team` against home/away names and pks (scorecard posts names — `actions/games.js:44-51`), else raise `ValidationError({"team": ...})` → 400.

**Step 4: Run to verify GREEN** — expect PASS. Update existing `test_put_game_possession` to post a real team name.

### Task 3: transition guard failing tests (relaxed rule)

**Files:**
- Modify: `gamedays/tests/api/test_game_views.py` (`TestGameHalftime`, `TestGameFinalize`, `TestGameSetup`)

**Step 1: Write the failing tests**

- halftime on `Geplant` game → 409
- finalize on `Geplant` game → 409
- halftime on finished (`beendet`) game → 409
- happy path `setup PUT → halftime → finalize` stays 200

**Step 2: Run to verify RED** — expect FAIL (200 today)

### Task 4: implement transition guards (relaxed)

**Files:**
- Modify: `gamedays/service/wrapper/gameinfo_wrapper.py:30-46`
- Modify: `gamedays/api/game_views.py` (three views + `GameSetupCreateOrUpdateView.update`)

**Step 3: Write minimal implementation**

```python
class IllegalGameTransition(Exception):
    def __init__(self, current, target):
        super().__init__(f"Cannot transition game from status '{current}' to '{target}'")
        self.current = current
        self.target = target

ALLOWED_TRANSITIONS = {
    STATUS_FIRST_HALF: {"Geplant"},
    STATUS_HALFTIME: {STATUS_FIRST_HALF},
    STATUS_FINISHED: {STATUS_FIRST_HALF, STATUS_HALFTIME},
}
```

Raise from `set_halftime_to_now`/`set_gamestarted_to_now`/`set_game_finished_to_now`. Catch in the three views + setup view → `Response({"detail": str(e)}, status=HTTPStatus.CONFLICT)`.

**Step 4: Run to verify GREEN** — expect PASS.

### Task 5: update existing tests relying on illegal transitions

- `test_game_is_finalized` (`test_game_views.py:434`): walk start→halftime→finalize
- `test_halftime_submitted` (`test_game_views.py:420`): start first

### Task 6: Full verification + push

- UI verification: `Halftime.jsx`/`Finalize.jsx` already gate the flow (Halbzeit button only in first half, Ende in second) — confirm no UI change needed.
- Run `pytest gamedays/`, push branch, open PR for #1981.

---

## Branch 3: `fix/1983-scorecard-favicon-hashroute` → PR for #1983

### Task 1: favicon

**Files:**
- Create: `scorecard/static/scorecard/favicon.ico` (copy from `league_manager/static/league_manager/favicon.ico`)
- Modify: `scorecard/templates/scorecard/index.html` (add `<link rel="icon" href='{% static "scorecard/favicon.ico" %}'>`)
- Test: assert `django.contrib.staticfiles.finders.find('scorecard/favicon.ico')` returns a path

### Task 2: `#/select-game` hash-route regression test

**Files:**
- Create: `scorecard/src/__tests__/…` (new vitest route test)

Set `window.location.hash = '#/select-game'`, mock `axios`, render `<App />`, assert `Bitte einen Spieltag auswählen` appears and Passcheck/Scorecard menu buttons do not.

### Task 3: Full verification + push

- `npm test` + `npm run eslint` in `scorecard/`, push branch, open PR for #1983.

---

## Conventions

- TDD: failing test first, watch RED, minimal GREEN.
- Conventional commits (`fix(gamedays): …`, `fix(scorecard): …`) for release-please.
- Backend tests: `pytest gamedays/tests/api/test_game_views.py -v`; full: `pytest gamedays/`.
- Frontend tests: `npm test` in `scorecard/` (Vitest, jsdom).