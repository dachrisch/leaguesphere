# Scorecard v2 — offline scenario run (2026-11-05)

## What this is

Two independent Chromium processes (own persistent profile, device id,
IndexedDB outbox and service worker) played the field scenarios the team asked
about: phones that go offline, die, return late, or compete for a game. The
tests only observe and assert data-safety invariants; no product code was
changed. The evidence is in `test-reports/offline-scenarios/` (one directory
per test with Playwright traces, plus `report.md` and `findings.md`).

Run it again with:

```bash
scripts/run_scorecard_scenarios.sh              # SQLite, headless
scripts/run_scorecard_scenarios.sh --headed     # watch both phones
scripts/run_scorecard_scenarios.sh --mysql      # MariaDB in servyy-test
scripts/run_scorecard_scenarios.sh -k "s12"     # one scenario
```

The script rebuilds `scorecard_v2` first and always runs the folder with
`--override-ini addopts=`, so the project's `--ignore` cannot hide it.

## Results

| # | Scenario | Outcome | Evidence |
|---|---|---|---|
| S00 | Two processes/IDs, offline is local, kill is real | pass (3 tests) | `…test_s00_harness.py-…/` |
| S01 | A queues 5 entries offline, then returns | pass | `…test_s01_offline_entries_drain_in_order/` |
| S02 | A reloads while offline with a queue | pass | `…test_s02_offline_reload_keeps_the_queue/` |
| S03 | A is killed with a queue, restarts online | pass | `…test_s03_killed_phone_delivers_after_restart/` |
| S04 | A is killed, restarts offline, then returns | pass | `…test_s04_killed_phone_restarts_offline_then_returns/` |
| S05 | A undoes an entry while offline | **xfail F1** | `…test_s05_offline_undo_removes_the_entry_and_its_effect/` |
| S06 | Server applies a write but the answer is lost | pass | `…test_s06_lost_answer_does_not_write_twice/` |
| S07a | Signal drops halfway through a drain | pass | `…test_s07_partial_drain_keeps_the_rest_in_order/` |
| S07b | Hard kill between send and delete | pass | `…test_s07_kill_mid_drain_does_not_duplicate/` |
| S08 | Both club phones on setup, both start | pass | `…test_s08_both_on_setup_the_second_start_is_refused/` |
| S09 | B opens a game A holds, A online | pass | `…test_s09_second_phone_opens_a_held_game_read_only/` |
| S10 | A dies, B needs the game | pass | `…test_s10_club_phone_cannot_continue_when_the_holder_dies/` |
| S11 | Staff B takes over, A died with an empty queue | pass | `…test_s11_staff_take_over_of_a_dead_phone/` |
| S12 | Staff takes over, A returns with 16 queued ops | pass | `…test_s12_late_phone_after_a_staff_takeover/` |
| S13 | A holds a touchdown, B enters a different score | pass | `…test_s13_scores_differ_and_stay_different/` |
| S14 | Game finished on B while A holds a queue | pass | `…test_s14_late_phone_after_the_final_whistle/` |
| S15 | Session expires while A is offline | pass | `…test_s15_session_expiry_pauses_then_drains/` |
| S15b | A different club user logs in | **xfail F3** | `…test_s15_other_user_keeps_the_original_author/` |
| S16 | Badge and queue compared | pass (3 states) | `…test_s16_badge_count_matches_the_queue-*/` |
| S17 | A's device id is cleared, A reopens its game | pass | `…test_s17_new_device_id_locks_a_phone_out_of_its_own_game/` |

Trace directories are under
`test-reports/offline-scenarios/scorecard_v2-tests-e2e_scenarios-…`.

## Findings, ranked

No **data-loss** failure was seen on SQLite: every op that left a phone was
either on the server, still in a visible queue, or explicitly rejected and
listed. The findings are state corruption, UI honesty and audit attribution.

1. **F1 — Offline undo leaves the possession flip queued (S05).** After
   **Turnover** then **Rückgängig** while offline, one `possession` op stayed in
   the queue. On reconnect the Turnover row was absent but the server had moved
   the ball from `home` to `away`. *Seen* in the queue and `GameState`.
2. **F2 — Badge count is stale after undoing a queued op (S05).** The queue held
   1 op while the badge read `Offline · 2`; removing an outbox row does not
   notify the sync engine's counts. *Seen* in the same trace.
3. **F3 — A replayed op changes author when another user logs in (S15b).**
   After the second club user signed in, the delivered events carried
   `author_id = 17` instead of the original `15`. The outbox stores the client
   id, device id and payload, but not the author; the server takes
   `request.user`. *Seen* in `GameEvent.author`.

Two observations that are not raised as findings:

- After a staff take-over **and** the final whistle, the late phone's chip read
  `Nur lesen` while its six rejected entries were listed as "6 Einträge
  abgelehnt" below. Both reasons are true; the chip only shows one.
- S12/S13 strand the old phone's queue rather than losing it: 16/16 ops stayed
  on A, and no duplicate `client_id` was written.

## What the scenarios say for Q4 (take-over rules)

- **Today: staff-only take-over.** Safe and deterministic (S11: B writes, A
  returns read-only; S12: A's 16 ops stay visible and are not interleaved with
  B's writes). The cost is S10: a club phone cannot recover the game without
  staff, exactly the meeting's 16:20 case.
- **Any crew phone may take over.** Would fix S10 without staff, but S12/S13
  show the old queue is stranded and the old screen can show a different score
  (S13: A 13, B/server 7). A take-over rule needs to say what happens to the
  old queue: keep it visible and offer retry/drop, and never let the old phone
  resume silently.
- **Explicit hand-off with queue delivery.** S03/S04/S06/S07 show the queue and
  `client_id` dedupe survive kills, lost answers and partial drains, so a
  hand-off could deliver the old queue. It needs author preservation (F3) and
  the undo/possession coupling fixed (F1) first.

## SQLite vs MariaDB

Both databases produced the **same scenario outcomes**: 22 passed, 2 xfailed
(S05/F1 and S15b/F3). SQLite ran with the single-threaded live server the
repository's e2e setup uses; MariaDB ran with the normal threaded server, after
`./container/spinup_test_db.sh --fresh`.

Two differences were in the harness, not the product:

- The MariaDB pass hit one `net::ERR_ABORTED` while navigating to the login page
  after a logout (a navigation race). The harness now retries a transient
  `ERR_ABORTED`; S11 then passed and the full rerun was green.
- A hard kill can lose an uncommitted session cookie. S04 then comes back with
  `Pausiert · Anmeldung` and keeps the queue; the test signs in again and the
  queue drains. The final SQLite run did not need the re-login; either path is
  recorded (`relogin_required` in `report.md`).

**Limitation:** S08 starts the second phone only after the first has started,
as the plan's scenario table specifies. The concurrent first-start race that
`select_for_update` protects on MariaDB is therefore **not** exercised here;
that needs a separate deliberately simultaneous start. No other row-lock
difference appeared.

## Runs

- SQLite, full suite, headless: 22 passed, 2 xfailed (final code).
- MariaDB, full suite: 22 passed, 2 xfailed (final code).
- SQLite, `s0 or s16` (S00 + all single-phone scenarios), three consecutive
  runs: 13 passed, 1 xfailed each time.
- Headed verification: S00 only, 3 passed; two windows side by side. The whole
  suite headed was stopped deliberately: the fixture starts a fresh pair of
  browsers per test (24 tests), so a watchable full run is 48 startups and
  reads as an endless login loop. The full suite was run headless instead.


## Seen vs inferred

- **Seen:** queue rows, badge text, scores, `GameState`, `GameSetup.device_id`,
  `GameEvent.client_id`/`author`, `TeamLog` values, process ids.
- **Inferred:** how a real dead battery or a dead cell connection behaves;
  Chromium's offline emulation is not a radio. The MariaDB race is only as real
  as the two clicks the harness performs.

## Deviations from the plan

- The harness opens a game by its deep link as well as by the day card, because
  staff and the second club user often have no row in their own list. The
  offline reload needs the summary snapshot, which only the deep-link path
  writes; `ensure_offline_capable` therefore reloads once while online.
- The harness generates no device id itself; it waits until the app's own id is
  in the profile's Local Storage LevelDB before a scenario may kill the browser.
  A browser restart after login (the first attempt) was visible as a login
  flicker and is not needed for durability.
- S14 asserts the rejected rows in the details list rather than the chip: the
  chip correctly shows `Nur lesen` because the device lock was also lost.
- S13's screen-score check in `assert_invariants` is skipped for a phone with
  queued ops or a pause; that phone is expected to differ and says so.
- S04 accepts both outcomes after the return: direct delivery, or a
  `Pausiert · Anmeldung` pause followed by a re-login (a hard kill can lose an
  uncommitted session cookie). The queue is asserted intact in both.
- The full suite was run headless. The headed check was S00 (two windows side
  by side, 3 passed); the full headed run was stopped because a fresh pair of
  browsers per test is 48 startups and reads as a login loop.
