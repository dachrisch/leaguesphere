# Scorecard v2 Offline Scenario Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show what Scorecard v2 does today when phones go offline, die, return late or compete for a game, using two independent browsers on one laptop, so the team can decide take-over rules (Q4) from evidence.

**Architecture:** One pytest live server, plus two Chromium processes that each have their own persistent profile, so each browser is a separate device with its own device ID, cookies, IndexedDB queue and service worker. Tests record behaviour in a report and assert data-safety invariants against the server's database. They change no product code.

**Tech Stack:** pytest-django `live_server`, pytest-playwright 1.62 (sync API), Chromium, SQLite by default, MariaDB (LXC) for the concurrency pass.

**Spec:** the Scenarios table below, plus actions C1–C3 and decision Q4 in the [v5 action plan](https://claude.ai/artifact/8hF9jZodVmytLXfMy8MTp3).

## Global Constraints

- Tests only. Do not change `scorecard_v2/src`, `gameevents` or `gamedays`. A bug becomes a strict `xfail` plus a finding; fixes are decided afterwards.
- Local only for now: the new folder stays out of CI. Moving it into CI is a later decision.
- Each browser uses `launch_persistent_context` with its own profile. Never use two contexts in one browser or `storage_state`, because a restart must keep the profile.
- Rebuild the bundle before every run. The committed static folder can be stale: a 31 Oct bundle made the first feasibility run fail.
- Wait on conditions (queue length, badge text, server rows), not fixed sleeps.
- Select tiles with `exact=True`. In the feasibility run `name="Turnover"` appears to have matched another control on the second tap.
- Work in a worktree under `.worktrees/`, on branch `test/scorecard-offline-scenarios`, with signed commits (`git commit -s`). The coordinator session is changing `Tracking.tsx` and `drive.ts`, so run against `master` and keep selectors in the harness.

## What the feasibility run established

Run on 2026-11-05 from a throwaway test on `master`:

| Check | Result |
|---|---|
| Two browsers | Different Chromium processes and different device IDs |
| `context.set_offline(True)` | Affects only that browser. `fetch` fails and the server receives nothing, with the service worker in control |
| Offline reload | The app boots from the service worker and the queue is intact |
| `SIGKILL` of the browser, then a restart on the same profile | Same device ID; the queued event reached the server |
| Second phone, same non-staff account, game held elsewhere | Shows the read-only notice, offers no "Spiel übernehmen" |

Still unexplained, and pinned by S05 and S16: one Turnover plus a second tap left a possession event queued without its Turnover, and the badge said 2 while the store held 1 op. After an offline reload the badge briefly read `1 warten`, then `Offline · 1`, and in an earlier run `Synchron`. The stray tap may have been a test artefact, so treat these as leads, not bugs.

`pgrep` needs `--` before a pattern that starts with dashes. Without it the kill silently found nothing.

## Invariants

Every scenario ends with `assert_invariants`. A violation is a finding.

| ID | Invariant |
|---|---|
| I1 No loss | Each op a phone queued is on the server or still in a queue the user can see |
| I2 No duplicates | No `client_id` writes twice, in `GameEvent` or `TeamLog` |
| I3 Score agrees | `GameState` scores equal the live `TeamLog` totals, and a reloaded online phone shows the same score |
| I4 Honest status | A phone with queued ops never shows `Synchron` once settled, and its badge count equals its queue length |
| I5 Not stuck silently | A stopped queue comes with a visible reason (`Nur lesen`, `Offline`, `Pausiert · Anmeldung`, or a rejection) |

## Scenarios

A and B are phones. "Club" is the same non-staff account on both; "Staff" has `is_staff=True`. The middle column is what the code suggests today, which the test confirms or disproves.

| # | Scenario | Expected from the code | Question it answers |
|---|---|---|---|
| S00 | Harness self-test | Separate processes and IDs, offline is real, kill is real | Can we trust the rest? |
| S01 | A queues 5 entries offline, then returns | Drains in order | Baseline |
| S02 | A reloads while offline with a queue | Queue and screen survive | Does a reload lose data? |
| S03 | A is killed with a queue, restarts online | Queue delivered | Dead battery |
| S04 | A is killed, restarts offline, then returns | Queue kept, then delivered | Dead battery, still no signal |
| S05 | A undoes an entry while offline | Entry and its possession effect both go | The feasibility lead |
| S06 | Server applies a write but the answer is lost | Replay writes nothing | Duplicates |
| S07 | A loses signal halfway through draining | Rest stays queued, order kept | Patchy signal |
| S08 | Club: A and B both on setup, both start | No warning before start; first wins, second gets 409 | C3, meeting 14:47 |
| S09 | Club: B opens a game A holds, A online | B read-only, no take-over | Second device |
| S10 | Club: A dies, B needs the game | B stuck until staff act | Meeting 16:20, the case for Q4 |
| S11 | Staff B takes over, A died with an empty queue | B writes; A returns read-only | Normal take-over |
| S12 | Staff B takes over, A died with 8 queued entries, B records more, A returns | A pauses on 409, entries stranded | Meeting 17:35 |
| S13 | As S12, A's queue holds a touchdown and B enters a different score | Scores differ and stay different | Meeting 18:55, "dann wird es eklig" |
| S14 | Game finished on B while A holds a queue | A is rejected, entries visible | Late phone after the final |
| S15 | Session expires while A is offline | Auth pause, queue survives, drains after login | Long gameday |
| S16 | Badge and queue compared across S01–S05 | Counts match | I4 |
| S17 | A's site data is cleared, then A reopens its own game | New device ID, locked out of its own game | Phone reset |

## Review Focus

1. **Signal returns while the other phone is writing:** A's drain must not interleave with B's writes in a way that breaks order or score. Pinned in S12 by bringing A online during B's entries.
2. **Hard kill during a drain:** a kill between send and delete must replay without a duplicate. Pinned in S07.
3. **A different account returns on A after take-over:** queued ops must keep their original author. Pinned in S15, logging in as the other club user.
4. **New device ID for a phone that still holds the lock:** the owner is locked out, and I5 must still hold. Pinned in S17.
5. **MySQL row locking:** SQLite ignores `select_for_update`, so S08 and S12 can look safe there and race on MySQL. Pinned by the Task 5 MariaDB pass.

---

### Task 1: Two-phone harness and self-test

**Files:**
- Create: `scorecard_v2/tests/e2e_scenarios/conftest.py`
- Create: `scorecard_v2/tests/e2e_scenarios/harness.py`
- Create: `scorecard_v2/tests/e2e_scenarios/test_s00_harness.py`
- Create: `scripts/run_scorecard_scenarios.sh`
- Modify: `pytest.ini` (`addopts`: add `--ignore=scorecard_v2/tests/e2e_scenarios`)
- Modify: `.circleci/scope-exclude.txt` (add `scorecard_v2/tests/e2e_scenarios/.*` and the script)
- Modify: `docs/topics/planning/README.md` (one index line)
- Modify: `scorecard_v2/AGENTS.md` (short "Offline scenario tests" section with the run command)

**Interfaces:**
- Consumes: from `scorecard_v2/tests/e2e/test_scorecard_v2_flow.py`, via `sys.path`: `_seed_game_today`, `_choose_start_fields`, `_tap_start`, `USERNAME`, `PASSWORD`. Import rather than copy, so UI changes on the stack update one place. Do not import `_login` or `_open_game`: `_login` creates the user, and `_open_game` expects the setup screen, which a started game skips.
- Produces, in `harness.py`:
  - `class Phone(name: str, profile: Path, base_url: str, playwright, launch_args: dict, window_x: int)`
  - `start() -> None`, `login(username: str, password: str) -> None`, `open_game() -> None` (day card, then game row, any screen), `start_game() -> None`
  - `offline() -> None`, `online() -> None`, `kill() -> None` (SIGKILL), `restart() -> None`, `close() -> None`
  - `tap_turnover() -> None` (exact name, waits for the queue or server row to grow), `touchdown(jersey: int) -> None`, `undo_last() -> None` (toast "Rückgängig"), `take_over() -> None` (two taps on "Spiel übernehmen")
  - `device_id() -> str`, `queue() -> list[QueuedOp]`, `wait_queue(count: int, timeout_ms: int = 20000) -> None`, `badge() -> str`, `strip() -> str | None`, `score() -> tuple[int, int]`, `shot(label: str) -> None`
  - `@dataclass QueuedOp(id: str, seq: int, kind: str, failed: bool, failed_reason: str | None)`, read from IndexedDB database `scorecard-v2`, store `ops`
  - `@dataclass ServerState(events: list, team_log: list, score_home: int, score_away: int, device_id: str, needs_reconciliation: bool)` and `server_state(game: Gameinfo) -> ServerState`
  - `assert_invariants(game, phones: list[Phone], queued_ids: set[str]) -> None`, implementing I1–I5
  - `Report.observe(scenario: str, key: str, value: object) -> None`
- Fixtures in `conftest.py`: `phones` (yields started A and B, closes both, keeps profiles in `tmp_path`), `club_game`, `staff_user`, `report` (session-scoped; writes `test-reports/offline-scenarios/report.md` at session end).

- [ ] **Step 1: Create the worktree, link `scorecard_v2/node_modules`, confirm the existing e2e passes**

Run: `DJANGO_SETTINGS_MODULE=league_manager.settings.test_sqlite SECRET_KEY=local PYTHONPATH=$PWD .venv/bin/python -m pytest scorecard_v2/tests/e2e/test_scorecard_v2_flow.py -k start_is_refused -q` after `npm --prefix scorecard_v2 run build`.
Expected: 1 passed. Use the main checkout's `.venv` if the worktree has none, with `PYTHONPATH` set to the worktree.

- [ ] **Step 2: Write the failing self-test `test_s00_harness.py`**

```python
@pytest.mark.django_db(transaction=True)
def test_s00_browsers_are_independent_devices(phones, club_game):
    a, b = phones
    assert a.pids() and b.pids() and set(a.pids()).isdisjoint(b.pids())
    assert a.device_id() != b.device_id()

@pytest.mark.django_db(transaction=True)
def test_s00_offline_cuts_only_that_phone(phones, club_game):
    a, b = phones
    a.offline()
    assert a.fetch_status("/api/config/scorecard/penalties") == "failed"
    assert b.fetch_status("/api/config/scorecard/penalties") == 200

@pytest.mark.django_db(transaction=True)
def test_s00_kill_is_real_and_restart_keeps_the_device(phones, club_game):
    a, _ = phones
    device = a.device_id()
    a.kill()
    assert a.pids() == []
    a.restart()
    assert a.device_id() == device
```

Add `pids() -> list[int]` (`pgrep -f -- --user-data-dir=<profile>`) and `fetch_status(path) -> int | str` to `Phone`.

- [ ] **Step 3: Run it and confirm it fails on the missing harness**

Run: `pytest scorecard_v2/tests/e2e_scenarios/test_s00_harness.py -q`
Expected: FAIL at import or fixture setup.

- [ ] **Step 4: Implement `conftest.py` and `harness.py`**

Launch with pytest-playwright's `browser_type_launch_args` fixture so `--headed` and `--slowmo` work. Add `--window-position=<window_x>,0` so A and B sit side by side, at a 600×844 viewport. Start a Playwright trace per phone and save it under `test-reports/offline-scenarios/<test>/<phone>/`. Use the single-threaded live server only when the database engine is SQLite (same class as `scorecard_v2/tests/e2e/conftest.py`). Keep MariaDB threaded so races can occur. Set `DJANGO_ALLOW_ASYNC_UNSAFE=true` before Django imports.

- [ ] **Step 5: Add `scripts/run_scorecard_scenarios.sh`**

Flags: `--headed` (adds `--headed --slowmo 400`), `--mysql` (uses `MYSQL_HOST` from the LXC lookup in the root `CLAUDE.md` and default settings instead of `test_sqlite`), and `-k <expr>`. It always runs `npm --prefix scorecard_v2 run build` first.

- [ ] **Step 6: Verify**

Run: `scripts/run_scorecard_scenarios.sh -k s00`, then the same with `--headed`.
Expected: 3 passed, and two windows visible side by side in the headed run.
Run: `python3 scripts/check_scope_coverage.py` and `pytest scorecard_v2/tests/test_views.py --collect-only -q`.
Expected: coverage check passes; default collection doesn't include `e2e_scenarios`.

- [ ] **Step 7: Commit**

```bash
git add scorecard_v2/tests/e2e_scenarios scripts/run_scorecard_scenarios.sh pytest.ini .circleci/scope-exclude.txt docs/topics/planning scorecard_v2/AGENTS.md
git commit -s -m "test(scorecard-v2): add two-browser harness for offline scenarios"
```

### Task 2: One phone keeps its data (S01–S07, S16)

**Files:**
- Create: `scorecard_v2/tests/e2e_scenarios/test_single_phone.py`

**Interfaces:**
- Consumes: Task 1's `Phone`, `server_state`, `assert_invariants`, `Report`, and fixtures.
- Produces: `started_game(phone, game)` helper in `harness.py`: opens, starts and waits for the tracking heading `Feld 1 · Vorrunde`. Used by Tasks 3 and 4.

- [ ] **Step 1: Write the tests**

```python
def test_s01_offline_entries_drain_in_order(phones, club_game, report):
    a, _ = phones
    started_game(a, club_game)
    a.offline()
    for _ in range(5):
        a.tap_turnover()
    queued = a.queue()
    assert len(server_state(club_game).events) == EVENTS_AFTER_START
    a.online()
    a.wait_queue(0)
    seqs = [event.seq for event in server_state(club_game).events]
    assert seqs == sorted(seqs)
    assert_invariants(club_game, [a], {op.id for op in queued})

def test_s05_offline_undo_removes_the_entry_and_its_effect(phones, club_game, report):
    a, _ = phones
    started_game(a, club_game)
    a.offline()
    a.tap_turnover()
    a.undo_last()
    report.observe("S05", "queue_after_undo", [op.kind for op in a.queue()])
    report.observe("S05", "badge_after_undo", a.badge())
    a.online()
    a.wait_queue(0)
    state = server_state(club_game)
    assert not [e for e in state.events if e.code == "Turnover"]
    assert state.in_possession == POSSESSION_AT_START
```

Add `in_possession: str | None` to `ServerState`. The rest follow the Scenarios table, with these assertions:

| Test | Asserts |
|---|---|
| `test_s02` | Offline reload: same queue IDs, tracking heading visible |
| `test_s03` | `kill()` with 3 queued, `restart()` online, then `open_game()`: all 3 on the server, I1 and I2 |
| `test_s04` | `kill()`, restart offline: queue length unchanged and nothing new on the server; `online()`: delivered |
| `test_s06` | Route `**/api/game/*/events`: `route.fetch()` then `route.abort()` once; after retry exactly one event for that `client_id` |
| `test_s07_partial` | Abort all event requests after the first success: remainder stays queued in order, delivered after unrouting |
| `test_s07_kill_mid_drain` | Hold a response with a route handler, `kill()`, restart: no duplicate `client_id` |
| `test_s16` | Parametrised over the states above, after settling: `badge()` count equals `len(queue())` |

- [ ] **Step 2: Run the file**

Run: `scripts/run_scorecard_scenarios.sh -k "s01 or s02 or s03 or s04 or s05 or s06 or s07 or s16"`
Expected: each test either passes or fails on a named invariant, never on a selector or timeout. Fix harness problems; don't touch product code.

- [ ] **Step 3: Mark real failures**

Replace each confirmed product failure with `@pytest.mark.xfail(strict=True, reason="F<n>: <one line>")` and add it to `test-reports/offline-scenarios/findings.md`, with the trace path.

- [ ] **Step 4: Run it three times to expose flakiness**

Run: `for i in 1 2 3; do scripts/run_scorecard_scenarios.sh -k "s0 or s16" || break; done`
Expected: identical outcomes in all three runs.

- [ ] **Step 5: Commit**

```bash
git add scorecard_v2/tests/e2e_scenarios
git commit -s -m "test(scorecard-v2): pin single-phone offline durability"
```

### Task 3: Second phone and device lock (S08–S10, S17)

**Files:**
- Create: `scorecard_v2/tests/e2e_scenarios/test_second_phone.py`

**Interfaces:**
- Consumes: `started_game`, `Phone`, `server_state`, `assert_invariants`, `Report`.

- [ ] **Step 1: Write the tests**

```python
def test_s10_club_phone_cannot_continue_when_the_holder_dies(phones, club_game, report):
    a, b = phones
    started_game(a, club_game)
    a.offline()
    a.tap_turnover()
    queued = {op.id for op in a.queue()}
    a.kill()

    b.open_game()
    report.observe("S10", "b_badge", b.badge())
    report.observe("S10", "b_strip", b.strip())
    report.observe("S10", "b_can_take_over", b.can_take_over())
    assert b.badge() == "Nur lesen"
    assert b.can_take_over() is False

    a.restart()
    a.open_game()
    a.wait_queue(0)
    assert_invariants(club_game, [a, b], queued)
```

| Test | Asserts and observes |
|---|---|
| `test_s08` | Both on setup: observe whether B shows any warning (feasibility: none). A starts, then B starts: `server_state.device_id` equals A's, B reaches read-only, exactly one start event |
| `test_s09` | B opens the game A holds online: `Nur lesen`, entry tiles unusable, no B events on the server |
| `test_s17` | Clear A's `localStorage` device key and reload: observe whether A is locked out of its own game and what happens to its queue; I1 and I5 |

Add `can_take_over() -> bool` to `Phone`.

- [ ] **Step 2: Run, mark findings as in Task 2**

Run: `scripts/run_scorecard_scenarios.sh -k "s08 or s09 or s10 or s17"`
Expected: pass or a named finding. S10 passing is itself the Q4 evidence: today a club can't recover without staff.

- [ ] **Step 3: Commit**

```bash
git add scorecard_v2/tests/e2e_scenarios
git commit -s -m "test(scorecard-v2): pin device-lock behaviour for a second phone"
```

### Task 4: Take-over and late returns (S11–S15)

**Files:**
- Create: `scorecard_v2/tests/e2e_scenarios/test_takeover.py`

**Interfaces:**
- Consumes: `started_game`, `Phone.take_over`, `staff_user`, `server_state`, `assert_invariants`, `Report`.

- [ ] **Step 1: Write the key test**

```python
def test_s12_late_phone_after_a_staff_takeover(phones, club_game, staff_user, report):
    a, b = phones
    started_game(a, club_game)
    a.offline()
    for _ in range(8):
        a.tap_turnover()
    stranded = {op.id for op in a.queue()}
    a.kill()

    b.logout_and_login(staff_user)
    b.open_game()
    b.take_over()
    for _ in range(3):
        b.tap_turnover()

    a.restart()
    a.open_game()
    b.tap_turnover()  # signal returns while the other phone is writing
    a.settle()

    state = server_state(club_game)
    delivered = stranded & {event.client_id for event in state.events}
    report.observe("S12", "stranded_total", len(stranded))
    report.observe("S12", "delivered", len(delivered))
    report.observe("S12", "still_on_a", len(a.queue()))
    report.observe("S12", "a_badge", a.badge())
    assert_invariants(club_game, [a, b], stranded)
```

Add `settle(timeout_ms: int = 15000) -> None` (returns once the badge and queue stop changing) and `logout_and_login(user) -> None` to `Phone`. If staff can't see the game in their list, open `/scorecard/v2/gameday/<id>/game/<id>/` directly.

| Test | Asserts and observes |
|---|---|
| `test_s11` | A dies with an empty queue, staff B takes over and writes; A returns as `Nur lesen`, I2 and I3 |
| `test_s13` | A holds a touchdown, B enters a different touchdown. Observe A's score, B's score and the server's score after A returns; I1 and I3 |
| `test_s14` | B finalises while A holds 3 entries. A returns: observe the result, assert the rows stay visible as failed and the game stays finished |
| `test_s15` | `clear_cookies` while offline, then `online()`: `Pausiert · Anmeldung`, queue intact. Log in again: delivered |
| `test_s15_other_user` | As above, logging in as a second club user: observe the author on the delivered events |

- [ ] **Step 2: Run, mark findings as in Task 2**

Run: `scripts/run_scorecard_scenarios.sh -k "s11 or s12 or s13 or s14 or s15"`
Expected: pass or a named finding. S12 and S13 are likely to produce findings; they are the meeting's worst case.

- [ ] **Step 3: Commit**

```bash
git add scorecard_v2/tests/e2e_scenarios
git commit -s -m "test(scorecard-v2): pin take-over and late-phone behaviour"
```

### Task 5: MariaDB pass and findings

**Files:**
- Create: `history/2026-11-05_scorecard-offline-scenarios.md`
- Modify: `scorecard_v2/tests/e2e_scenarios/conftest.py` (`Report` output, if the run shows gaps)

**Interfaces:**
- Consumes: all scenario tests.
- Produces: the report and findings the team uses for Q4.

- [ ] **Step 1: Run the whole suite on SQLite, watchable**

Run: `scripts/run_scorecard_scenarios.sh --headed`
Expected: no unexpected outcome; every xfail names a finding.

- [ ] **Step 2: Run the whole suite on MariaDB**

Run: `./container/spinup_test_db.sh --fresh`, then `scripts/run_scorecard_scenarios.sh --mysql`.
Expected: same outcomes as SQLite. Any difference is a finding in its own right, most likely in S08 or S12.

- [ ] **Step 3: Write the history entry**

Cover: what ran and how to rerun it; a table of scenario, outcome and evidence path; findings ranked by data loss first; and for Q4, 2–3 take-over options with what each scenario says about them. Mark what was seen versus what was inferred.

- [ ] **Step 4: Verify gates**

Run: `black --check scorecard_v2/tests/e2e_scenarios && python3 scripts/check_scope_coverage.py`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add history/2026-11-05_scorecard-offline-scenarios.md scorecard_v2/tests/e2e_scenarios
git commit -s -m "docs(scorecard-v2): record offline scenario findings"
```

## Not in this plan

- Fixing anything found, building non-staff take-over, or changing the lock.
- Real phones, real networks or CI. Chromium's offline emulation is not identical to a dead cell connection, so spot-check the top findings on a real phone afterwards.
- Two tabs in one browser: `sync.test.ts` covers the tab coordination.
