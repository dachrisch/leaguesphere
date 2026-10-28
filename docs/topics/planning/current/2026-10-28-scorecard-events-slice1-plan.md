# Scorecard Events — Slice 1 Implementation Plan

**Design:** [Scorecard Event Architecture](./2026-10-28-scorecard-event-architecture.md) (decisions taken 2026-10-28).
**Goal of this slice:** the scorecard app stops writing game state. Its writes become append-only events; the server projects them into today's `TeamLog` shape and serves a feed the liveticker consumes. No app release is required for any task here.

**Branch:** `feat/gameevents-slice1`, off `master`. **No migrations in `gamedays`** — a new app keeps this independent of the scorecard stack (`0046`/`0047`) and Passcheck (`0048`).

---

## Vocabulary (slice 1)

Envelope: `type` + `code` + `side` + `player` + `period` + `payload`.

| `type` | `code` examples | Projected `TeamLog.event` |
|---|---|---|
| `score` | `touchdown`, `pat1`, `pat2`, `safety`, `overtime` | `Touchdown`, `1-Extra-Punkt`, `2-Extra-Punkte`, `Safety`, `Overtime` |
| `penalty` | the configured penalty name | `Strafe` (+ `input` = code) |
| `possession` | `home` / `away` | change-of-possession row (`cop`) |
| `period` | `half_time`, `end` | `Halbzeit` marker / game end |
| `timeout` | `home` / `away` | `Auszeit` |
| `time` | — | `Spielzeit` (payload: minutes) |
| `correction` | `undo` | flips `isDeleted` on the target row |

`TeamLog.half` follows `period` (1/2 today). Values (`Touchdown` = 6, …) stay where they are today — the sport definition that replaces them is slice 2.

---

## T1 — the `gameevents` app and its models

**Files:** `gameevents/{__init__,apps,models,admin}.py`, `gameevents/migrations/0001_initial.py`

- `GameEvent`: `game` (FK `gamedays.Gameinfo`), `seq`, `client_id`, `type`, `code`, `side`, `player`, `period`, `payload` (JSON), `undo_of` (self FK, null), `source`, `client_at`, `received_at`; `UniqueConstraint(game, seq)` and `(game, client_id)`; append-only (no `save()` override — enforced by tests and by never exposing an update path).
- `GameState`: `OneToOne(game)`, `score_home`, `score_away`, `period`, `in_possession`, `last_seq`, `updated_at`.
- `Gameinfo.event_source` is **not** added here (it lives in `gamedays`); slice 1 derives the owner from the presence of events. Record that as a follow-up.
- Admin: read-only listing (no add/change/delete) so the store cannot be edited by hand.
- **Acceptance:** migration applies on an empty DB; both constraints reject duplicates; admin has no write permissions.

## T2 — the projector (pure, no database)

**Files:** `gameevents/service/projector.py`, `gameevents/tests/test_projector.py`

- `apply(state: GameStateValue, event: GameEventValue) -> (GameStateValue, list[TeamLogRow])` with one handler per `type`; `GameStateValue`/`TeamLogRow` are plain dataclasses, so the logic is testable without Django.
- `correction`/`undo` reverses the target's effect (score back, row marked deleted) and never removes the target.
- **Golden test (the acceptance for the whole slice):** for every payload the v2 app sends today, projector output equals the rows `GameLogService` writes today — same `event` names, `player`, `input`, `value`, `half`, `cop`, `isDeleted`. A table of real payloads captured from `GameLogSubmission` fixtures.

## T3 — append endpoint and service

**Files:** `gameevents/api/{urls,views,serializers}.py`, `gameevents/service/append.py`, `gameevents/tests/api/test_append.py`, wiring in `league_manager/urls.py`

`POST /api/game/<id>/events` — the existing `/api/gamelog/<id>` payload is accepted unchanged and translated to the envelope server-side (`from_legacy_event`), so **no app release** is needed.

- device lock (reuse `GameSetup.device_id` + `X-Scorecard-Device`), auth, CSRF — unchanged;
- **device lock: delegated; enforced after #2104 merges** — the lock is not on this branch (it lives on `feat/scorecard-v2`), so the endpoint calls `gamedays.api.game_views._device_lock_response` when it exists and stands down when it does not. Expect the merge conflict in `gamedays/api/game_views.py`; never add a second lock here;
- `client_id` seen → `200 {state, cursor}`, no second apply;
- `seq` ≠ `max+1` → `409 {expected_next}`; unknown `code` → `400` **before** storing;
- one transaction: append → project → `TeamLog` rows + `GameState`;
- `Gameresult` follows through `GameService`'s half-score diff (the legacy writer's rule, not a copy), so a canonical submission is usable for a real game;
- the legacy undo (`DELETE /api/gamelog/<id>`) records a `correction` in the same transaction; a play with no stored event is flagged `GameState.needs_reconciliation` instead of inventing history;
- response: `{state, cursor}`.
- **Acceptance:** duplicate POST is idempotent; gap yields 409 with the expected seq; unknown code stores nothing; projector error rolls the event back; lock rules unchanged; the legacy payload path produces the golden rows of T2 *and* the same `Gameresult` rows; an undo leaves `GameState` equal to a replay and to the rows, twice is a no-op, and an un-evented row is flagged for T6.

## T4 — feed endpoint

**Files:** `gameevents/api/views.py`, `gameevents/service/feed.py`, tests

`GET /api/game/<id>/feed?after=<seq>` → `{state, events, cursor}`; `ETag: "<last_seq>"`, `304` when unchanged. Games with no events → state derived from `TeamLog` (legacy), `events: []`, `cursor: 0`, so the endpoint is always safe to call.

**Acceptance:** `after` returns only newer events; ETag round-trips to 304; a legacy game answers a coherent state; a finished game's state matches its rows.

## T5 — the liveticker consumes the feed (behind a flag)

**Files:** `liveticker/service/liveticker_service.py`, `liveticker/api/views.py`, tests, `league_manager/settings/base.py`

`SCORECARD_EVENT_FEED` (default **off**): when on, live games with events take score/period/ticks from `GameState` + feed; everything else keeps today's query. **The widget payload does not change** — the React app is untouched.

**Acceptance:** with the flag off, byte-identical payload to today (snapshot test); with it on, an event-sourced game reports the same score, period and last 5 ticks as the row-based path (comparison test on the same fixture); the ETag still changes when a new event arrives.

## T6 — reconciliation and rebuild

**Files:** `gameevents/management/commands/{check_game_projection,rebuild_game_projection}.py`, tests, docs

- `check_game_projection [--game ID] [--all]`: compares projected `GameState` + `TeamLog` against replays; non-zero exit on drift, prints the first offending `seq`.
- `rebuild_game_projection --game ID`: truncates the projection for that game and replays the log; refuses when the game is `legacy`.
- **Acceptance:** a deliberately corrupted `<state>`/row is detected with the offending seq; rebuild restores equality; both refuse to touch legacy games.

---

## Order and gates

T1 → T2 (golden test) → T3 → T4 → T5 (flag off by default) → T6.

Each task: failing test first, `pytest` green, `check_migrations`, `check_scope_coverage.py` updated for the new app, one signed commit. T5 stays behind the flag, so the slice can merge without changing what stage serves.

## Explicitly not in this slice

Sport definitions (`I4.x`), the template-driven UI, async workers, statistics, quarters, Telegram/fantasy, replaying historical games, `Gameinfo.event_source` (derived from event presence for now).

## Rollout

1. Merge with `SCORECARD_EVENT_FEED=off` — the append path stores events and keeps writing identical rows; nothing user-visible changes.
2. On stage, run `check_game_projection --all` after a gameday: expect zero drift.
3. Flip the flag, watch the liveticker on one gameday, then keep it on.
