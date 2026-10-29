# Scorecard Event Architecture

**Goal:** separate *recording* from *meaning*. The scorecard app records what happened as sport-neutral events and nothing else; the server owns the event store, the meaning of those events for a given sport, and who gets told about them. The app stops writing game state to the database.

**Status:** design, decisions taken 2026-10-28 (Q1 provisionally — see below). Slice 1 (event store + projection channel + liveticker) is specified here; later slices are sketched, not committed.

**Companion:** `2026-10-27-scorecard-ideas.md` §5 (`I5.1`, `I9.2`, `I9.3`) and the open question `Q1` (event sourcing yes/no — still Leon's call for the write model of record).

---

## Why

Today `POST /api/gamelog/<game>` carries an event list, and the server immediately flattens it into `TeamLog` rows. `TeamLog` is the truth: the score, the liveticker, statistics, the match report and the league table all read it. Three consequences:

1. **The app's knowledge is baked into the server's write path.** Adding a sport means changing scoring code, not adding a template.
2. **Every consumer recomputes from rows.** The liveticker derives score, period and ticks on each request; statistics would do it again.
3. **Nothing is replayable.** A wrong derivation is repaired in the rows, and the record of what the operator actually entered is gone.

## The target in three layers

| Layer | Owns | Talks to |
|---|---|---|
| **Capture** (app) | the UI, the offline outbox, appending events | one append endpoint |
| **Domain** (server) | the event store, sport definitions, projectors | event store |
| **Distribution** (server) | projection feeds, cursors, subscriptions | consumers |

A new sport is a new **sport definition** (event types, labels, values, period structure) the app fetches — not an app release. A new consumer is a new cursor — not a new endpoint in the write path.

---

## Slice 1 — event store, one projection, the liveticker

**Chosen because** it delivers the store *and* a channel *and* a real consumer without new infrastructure, and it leaves the score visible to every existing reader through the projection.

### Data model

```python
class GameEvent(models.Model):
    game = FK(Gameinfo, related_name="events")
    seq = PositiveIntegerField()          # per game, from the capture client
    client_id = CharField(max_length=64)  # the existing outbox id
    type = CharField(max_length=32)       # score | penalty | possession | period | timeout | correction
    code = CharField(max_length=64)       # sport code, e.g. touchdown, try, goal
    side = CharField(max_length=4)        # home | away | None (period, timeout)
    player = PositiveSmallIntegerField(null=True)   # jersey
    period = PositiveSmallIntegerField()  # 1-based; 1/2 today, 1..4 once quarters exist
    payload = JSONField(default=dict)     # type-specific: penalty code, yards, note
    undo_of = FK("self", null=True)       # compensating event
    source = CharField(max_length=16)     # v2 | legacy | staff
    client_at = DateTimeField()           # device clock, kept, never trusted for order
    received_at = DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [UniqueConstraint(fields=["game", "seq"], name="uniq_event_seq_per_game"),
                       UniqueConstraint(fields=["game", "client_id"], name="uniq_event_client_id_per_game")]
```

Append-only: no updates, no deletes. **Undo is a `correction` event with `undo_of`**, never an `isDeleted` flip — otherwise the log stops being the record.

### Write path

`POST /api/game/<id>/events` (the existing gamelog POST keeps working and becomes an alias while clients migrate):

1. device lock, CSRF, auth — unchanged;
2. `client_id` already stored → `200` with the current state, no second apply;
3. `seq` must equal `max(seq)+1` for the game → otherwise `409 {expected_next}` so the outbox re-syncs instead of guessing;
4. validate the envelope (type/code/side/period), not the sport meaning;
5. **one transaction**: append the events → run the projector → persist `GameState` + the `TeamLog` rows;
6. answer `200` with `{state, cursor}` — the capture client never computes the score.

The projector writes `TeamLog` in **exactly today's shape**, so the liveticker, statistics, match report, league table and the old scorecard keep reading what they already read.

### Projection

```python
class GameState(models.Model):
    game = OneToOne(Gameinfo)
    score_home = IntegerField(default=0)
    score_away = IntegerField(default=0)
    period = IntegerField(default=1)
    in_possession = CharField(max_length=8, null=True)
    last_seq = IntegerField(default=0)
    updated_at = DateTimeField(auto_now=True)
```

`apply(state, event) -> (state, teamlog_rows)` is a **pure function** per event type, unit-tested without a database. `last_seq` is the feed cursor. Everything derivable (score, period) lives here; the event log stays the input.

### Channel

`GET /api/games/<id>/feed?after=<seq>` → `{state, events: [...], cursor}` with the same `ETag`/`304` contract the liveticker widget already speaks (ETag = `last_seq`, so an unchanged game costs a 304).

`GET /api/liveticker/…` (league-wide, the widget's endpoint) is rebuilt on top of the projection + feed: live games from `GameState`/`Gameinfo`, ticks from the stream after a cursor. The widget's payload shape does **not** change, so the UI stays untouched.

### Coexistence and corrections

- **`Gameinfo.event_source`**: `v2` (events are the record, `TeamLog` is its projection), `legacy` (the old scorecard or the designer owns `TeamLog`; the feed is derived from rows, events are read-only history), `null` (unknown → legacy). Set on the first event append.
- **Manual result edits** (`GameResultUpdateAPIView`) and old-scorecard writes: while a game is `v2`, they must emit `correction` events; while it is `legacy`, the feed reads `TeamLog` as today. No third mode.
- **Reconciliation**: `manage.py check_game_projection --game <id>` compares projection ↔ `TeamLog` and exits non-zero on drift; CI runs it over the e2e fixture, and the live path logs a mismatch rather than silently diverging.

### Failure modes the design must answer

| Failure | Behaviour |
|---|---|
| retried POST (device reload) | idempotent by `client_id`, `200`, no duplicate |
| gap or duplicate `seq` | `409 {expected_next}`; outbox replays from there |
| projection raises | transaction rolls back, event **not** stored, client retries |
| event stored, projection impossible (unknown `code`) | reject **before** storing: unknown codes are a 400, not a poison pill |
| projection drift discovered later | `rebuild_game_projection --game <id>` replays the log |
| legacy game has no events | feed derived from `TeamLog`, marked `source=legacy` |

### Tests

- projector: pure-function table tests per type (score, penalty, possession, period, undo, correction);
- write path: idempotency, seq gap → 409, unknown code → 400, device lock unchanged, rollback on projector error;
- channel: cursor advances, `after` returns only newer events, ETag/304, legacy fallback;
- reconciliation: e2e fixture — projection equals `TeamLog` before finalise;
- liveticker: existing widget tests unchanged (payload contract frozen), plus one test that a score event moves the widget's score.

### Rollout

1. **Shadow**: write events in the same transaction as today's `TeamLog`, liveticker untouched. Run the reconciliation check in CI and on stage; nothing user-visible changes.
2. **Channel**: switch the liveticker endpoint to the projection + feed; the widget is unchanged. Rollback = one URL back to the old view.
3. **Truth**: after a stable stage week, make events the only writer for `v2` games and delete the shadow write.

### Explicit non-goals for slice 1

Sport definitions and the template-driven UI (that is `I4.x`), async workers, multi-device fan-in, statistics, quarters (though `period` is in the envelope from day one, so quarters need no schema change), Telegram/fantasy, and replaying historical games.

---

## Later slices (sketch, not committed)

| Slice | What it adds | Depends on |
|---|---|---|
| 2 | Sport definitions: event-type catalogue, values, required fields, period structure; the app renders from the template | slice 1 envelope |
| 3 | A second consumer: statistics (`who caught, who tackled`) from the same stream | slice 1 channels |
| 4 | Async projection + worker, so a slow consumer cannot delay the write path | slice 1, a real second consumer |
| 5 | Telegram / external association webhooks as subscriptions | slice 4 |
| 6 | Quarters and the in-app clock (`I6.1`), now derivable from `period` + timestamps | slice 2 |

## Decisions

Taken 2026-10-28 on the proposals below. Q1 is the only one still open, and its
**default is in force** until Leon answers: slice 1 does not depend on the answer,
because `Gameinfo.event_source` names the owner per game.

### Q1 — Is the event log the record of record, or an audit beside `TeamLog`? *(Leon — default in force)*

It decides whether anything is rebuildable. Audit-only means every consumer keeps
reading `TeamLog`, drift is tolerated, and replay, statistics and sport templates
lose their foundation. Events-lead means `TeamLog` is a projection.

**Decision (default, pending Leon):** events lead **for v2 games**, legacy games keep
the old path, and the old app gets a written sunset criterion so the global answer
follows. `Gameinfo.event_source` expresses this per game, so the choice is a data
decision later, not a schema one. If Leon says "audit only", the store still earns
its keep as an audit log and a channel; nothing in slice 1 is wasted.

### Q2 — Can a correction target any earlier event, or only the last?

**Decision:** during the game, only the most recent live event (what *Rückgängig*
means under time pressure, and a trivial projector); after finalisation, any event,
as a **compensating** entry rather than a rewrite, staff-only.
`undo_of` expresses both; this is policy, not schema.

### Q3 — Retention after the season

A game is a few hundred event rows; a season is well under a million. Replay,
statistics and audit all need the raw log.

**Decision:** keep events forever, index `(game, seq)` and `(received_at)`, and treat
partition-by-season as the escape hatch if size ever becomes real. Rolling up would
delete exactly the data slices 2–3 are built on.

### Q4 — Who may correct?

The device lock answers *who holds the device*, not *who may change the record*;
without a rule a published result can be rewritten silently.

**Decision:** the lock holder while the game runs; **staff only** after finalisation,
with the actor and a reason in `payload`. Nobody edits a published result without
that trail.

### Q5 — A game started in v2 and finished in the old scorecard

Both apps write the same rows today, so this would flip the truth mid-game.

**Decision:** reject it explicitly — an `event_source=v2` game cannot be finished by
the old app (clear message; staff can release the device lock and correct it through
the event log). Silent divergence is the one outcome worth a hard error.
