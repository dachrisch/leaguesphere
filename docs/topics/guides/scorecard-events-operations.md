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

## `SCORECARD_EVENT_FEED`

Default **off** (`false`; set the environment variable to `true` to enable).
With the flag off the liveticker runs exactly the query it ran before the
event store existed.

With the flag on, a live game that has events takes its total score from
`GameState` and, while `Gameinfo.status` is in progress, the half it displays
from `GameState.period` (`1. Halbzeit`/`2. Halbzeit`). Which games are live,
upcoming or the previous slot is still selected from `Gameinfo.status` — the
projection never changes the selection. Ticks remain the projected `TeamLog`
rows, so their ordering and text are the ones the widget has always rendered.

A game whose projection is flagged `needs_reconciliation` falls back to its
`TeamLog` rows for that response (one warning per liveticker request names the
games); the public widget never sees the feed's `409` and never blanks a game.
The liveticker ETag includes the projection's `last_seq` while the flag is on,
so an event that writes no tick (a plain possession change) still invalidates a
cached response.

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
