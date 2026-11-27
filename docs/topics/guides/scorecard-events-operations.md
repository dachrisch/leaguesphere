# Scorecard Event Store — Feed and Reconciliation

The scorecard writes append-only `GameEvent` rows; `TeamLog` and `GameState`
are projections of that log. This guide covers the read side the liveticker
uses and the two commands that prove (and repair) the projection. Background:
[slice 1 plan](../planning/current/2026-10-28-scorecard-events-slice1-plan.md).

## `GET /api/game/<id>/feed?after=<seq>`

Read-only and public, like the other game read endpoints.

```json
{
  "state": {"score_home": 7, "score_away": 0, "period": 1,
            "in_possession": null, "last_seq": 3},
  "events": [{"seq": 3, "type": "score", "code": "touchdown", "side": "home",
              "player": 7, "period": 1, "payload": {}, "client_id": "…",
              "undo_of": null, "source": "v2"}],
  "cursor": 3
}
```

- `after` returns only events with `seq > after`; `cursor` is the highest `seq`
  in the response, or `state.last_seq` when nothing is new.
- `ETag: "<last_seq>"`. Send it back as `If-None-Match` to get a bodiless
  `304` when nothing was appended.
- Event-sourced games are served from `GameState` + the log.
- **Legacy games** (rows, no events) get the same shape derived from
  `TeamLog`/`Gameinfo` through the existing `GameLog` service: `events: []`,
  `cursor: 0`, and a row-derived ETag (a constant validator would cache a
  changed score).
- A game with neither rows nor events is a coherent `200` (0:0, period 1); an
  unknown id is a `404`.
- `409 {"detail": "…", "needs_reconciliation": true}` means the projection is
  flagged: it is **not** served as a score. Run the rebuild below.

## The event read path (formerly `SCORECARD_EVENT_FEED`)

The event path is now permanent: the flag and its environment variable were
removed in Phase 2 after the gameday rehearsal on the agent stage (there was
no prod soak). A live game takes its total score from
`GameState` and, while `Gameinfo.status` is in progress, the half it displays
from `GameState.period` (`1. Halbzeit`/`2. Halbzeit`). Which games are live,
upcoming or the previous slot is still selected from `Gameinfo.status` — the
projection never changes the selection. Ticks remain the projected `TeamLog`
rows, so their ordering and text are the ones the widget has always rendered.

A game is event-sourced only when it has a `source=v2` event. Games with rows
but no events — and games whose only events are shadow/legacy audit records —
stay on the row-based read path; they are the accepted legacy set (below).
A v2 projection flagged `needs_reconciliation` also falls back to its
`TeamLog` rows for that response (one warning per liveticker request names the
games), so the public widget never sees the feed's `409` and never blanks a
game. The liveticker ETag always includes the projection's `last_seq`, so an
event that writes no tick (a plain possession change) still invalidates a
cached response.

## Manual result edits on a v2 game

`PATCH /api/gameinfo/<id>/result/` (the designer's result entry) writes
`Gameresult`. On a v2-owned game it also appends one `correction` event with
`code: "result"` and `source: "staff"`, in the same transaction:

```json
{"seq": 9, "type": "correction", "code": "result", "side": null,
 "payload": {"home": 21, "away": 3, "before": {"home": 6, "away": 0}},
 "undo_of": null, "source": "staff"}
```

- The projector sets `GameState` to `payload.home`/`payload.away`; later
  events add to that score. No `TeamLog` row is written or marked: the rows
  stay the recorded play-by-play, the corrected total is the result's.
- The score comes from the `Gameresult` rows after the edit (`fh + sh` per
  side). If it already equals the projected score (a repeated PATCH, a
  halftime edit that leaves the total alone) nothing is recorded.
- Games without a `source=v2` event (legacy, shadow-only, unscored) keep the
  old behaviour: only `Gameresult` changes, no event, no `GameState`.
- After a manual result, later writes still move `Gameresult` by the half-score
  delta rule (#1988), which stores a half that would go below 0 as 0. When a
  later append (a v2 event, a v2 undo or a legacy DELETE) leaves the projection
  different from `Gameresult`, a further `correction/result` with
  `"reason": "follows_result"` is recorded in the same transaction. Example:
  TD 6:0, then a halftime edit to 0:0, then an undo of the TD ends at 0:0
  everywhere, not -6.
- The scorecard cannot send `correction/result` (400), and a
  `correction/undo` naming one is a 400: edit the result again instead.
- A negative result total is a 400 that rolls the whole edit back.
- `check_game_projection` and `rebuild_game_projection` replay the
  correction like any other event, so they agree with the edited score.

## `check_game_projection`

```bash
python manage.py check_game_projection --game 123
python manage.py check_game_projection --all
```

Replays `GameEvent` (through `gameevents/service/replay.py`) and compares the
result with `GameState` and the `TeamLog` groups the log owns. Prints one line
per game and exits non-zero on drift:

```
game 123: ok (12 events, seq 12)
game 124: DRIFT at seq 7 (rows): row 0: value 0 != 6 (log)
game 125: DRIFT at seq 31 (state): score_home 13 != 7 (log), period 2 != 1 (log)
game 126: skipped (no events, legacy game)
```

`--all` is five queries for a gameday regardless of event count (plus one to
count the skipped legacy games), so it is the after-gameday check. Legacy
games are skipped, never failures. A flagged game is reported as drift (kind
`flag`) with its reconciliation note.

Ownership: the log owns `TeamLog` groups whose `sequence > 0`; sequence 0 is
shared with rows written before the log existed and is not compared row by
row (it does not affect score or period).

## Authors: who recorded a play

`TeamLog.author` is part of the projection, like the score. Each `GameEvent`
records its **actor** in `GameEvent.author` — the `request.user` of the request
that appended it, on both write paths (`POST /api/gamelog/<id>` and
`POST /api/game/<id>/events`); the projector copies that user onto every row the
event produces. It is the *actor*, not a display author: nothing renders it, it
exists so a projected tick names the official who recorded it and so an audit
can say who caused an event.

`TeamLog.author` has a `default=1`, but that id is not a provisioned "system
user" — a database need not have it (MySQL rejects the insert with an FK error,
which is exactly how this bit CI once). So no write path ever leaves the column
to its default:

- the event's actor, when it has one;
- otherwise the game's author — the author of the game's gameday, since
  `Gameinfo` has no author of its own (a rebuild prefers the author of the row
  it replaces, then `--author`, then the game's author);
- otherwise the write is refused with `no author for the event`
  (`400 {"detail": …}` from the endpoint, `CommandError` from the command) — no
  row is written against a user that does not exist.

Events recorded without an actor (`GameEvent.author` null: a system write, or an
event stored before the column existed) keep `null` — an append-only log does
not invent a person.

## `rebuild_game_projection`

```bash
python manage.py rebuild_game_projection --game 124
```

Deletes `GameState` and the row groups the log owns, replays the log, and
clears `needs_reconciliation`. Pre-log rows are left untouched, and existing
rows keep their tick timestamp, so the liveticker's ordering does not change for
the plays that were already correct. Authors follow the log (see above): a rebuilt
row is written for the event's actor, falling back to the author of the row it
replaces and then to the game's author; `--author <user id>` names the user for
actorless rows that replace nothing. It **refuses** a legacy
game (no events): there is no log to replay. `Gameresult` is not rebuilt — it
is maintained by the write path, not derived from the log.

Run `check_game_projection --game <id>` after a rebuild to confirm; the
command is idempotent.

## Accepted legacy set

`check_game_projection --all --report <path>` writes a JSON record of the
reconciliation state without changing the command's stdout, exit status or
six-query budget. Games are classified by `GameEvent.source`: only a game with
a `source=v2` event must reconcile; shadow-only (`source=legacy`) games and
games with rows but no events are the **accepted legacy set** and keep the
row-based read path. There is no `Gameinfo.event_source` field, so no migration
is involved.

The accepted set is recorded by count, SHA-256 digest of its sorted ids, a
`shadow_only` breakdown, per-season counts and an id cutoff (`--legacy-cutoff`)
that makes the digest reproducible — **not** by storing the raw ids in a public
repository. The accepted set and `--legacy-cutoff` shape the report only: stdout
keeps the pre-report meaning, so `skipped N legacy game(s) without events`
counts games with no events at all, and a shadow-only game is counted under
`checked`, never under `skipped`. Every drift/flagged entry carries its `source`; the gate reads
`v2_drift == 0` and `v2_flagged == 0`, not the exit code alone. The agent-stage
measurement (6,369 games; zero drift; zero flagged v2 games) and the
regeneration command are in
[the Phase 2 acceptance record](../planning/current/2026-11-25-phase2-legacy-acceptance.md).
**No backfill is performed**: those games are not rewritten or event-sourced.
A flagged v2 game is repaired with a data-only
`rebuild_game_projection --game <id>`, never a code change.

## Environment after the cutover

There is no flag to set: `SCORECARD_EVENT_FEED` was removed from the settings,
`.env_template` and `deployed/ls.env.staging.template`. Old values left in a
host env file are ignored. The remaining user-gated work is a separate
`dachrisch/servyy-container` cleanup of the stage/demo/prod env files (and the
agent-stage validation override), not an app change.


Validation done on stage for `v5.1.1-rc.1`, for the record:

```
GET /api/game/10402/feed?after=0
  state: {score_home: 7, score_away: 0, period: 1, last_seq: 2}
  events: [{seq: 1, type: score, code: touchdown, player: 23},
           {seq: 2, type: score, code: pat1, player: 7}]
  ETag "2" -> 304 on If-None-Match
manage.py check_game_projection --all
  game 10402: ok (2 events, seq 2); 6369 legacy games skipped
```
