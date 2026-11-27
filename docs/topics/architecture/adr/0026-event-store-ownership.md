# [0026] Event store ownership and the v2/legacy boundary

## Status

**Accepted 2026-11-26** (approved by the maintainer; roadmap §4.3–4.5 were
already final).

**Owner:** the maintainer. In the historical Q1 wording "Leon" owned the
scorecard scope and his sign-off was still outstanding; that sign-off is no
longer required. See `docs/topics/planning/current/2026-10-28-scorecard-event-architecture.md`.

This ADR supersedes Q1 of that document. The old "Leon — default in force"
wording is historical and is retained there for traceability.

## Context

The scorecard event architecture separated *recording* (the v2 app writes
sport-neutral `GameEvent`s) from *meaning* (the server projects them into
`GameState` for the liveticker). The migration from the legacy `TeamLog` read
path was a strangler: when this ADR was written the flag
`SCORECARD_EVENT_FEED` was off by default, both write paths were live, and every
v1 gamelog write also emitted a shadow event so the event store looked
populated. Phase 2 Layer 5 removed the shadow write and Layer 6 removed the
flag; the event path is now permanent.

Three facts forced an explicit decision before the cutover:

1. There is no per-game owner field. `Gameinfo.event_source` was designed but
   never added (`gameevents/models.py:8-10`); adding it now would need a schema
   migration, which breaks the shared-DB ref/cand equivalence model and forces a
   second database copy.
2. Reconciliation skips a large legacy set — **6,369 games** recorded on the
   agent stage at the 2026-11-26 measurement, with an `id` cutoff in the
   acceptance record — that has no v2 event projection. The set is defined by
   the rule "rows and no `source=v2` event, id ≤ cutoff", not by that number.
3. The global flag is an emergency switch, not a permanent shape; leaving it in
   place forever keeps two code paths alive indefinitely.

Roadmap decisions §4.3–4.5 are final: the event store has an owner, events are
truth for v2 games, and the legacy games are left on the legacy path with no
backfill. This ADR records that decision and makes it discoverable.

## Decision

- **The event store is owned by the maintainer.** This closes Q1 of the
  2026-10-28 architecture document; it is not an open question any more.
- **Events are the source of truth for v2 games.** This is the **target state**
  implemented by the flag-cutover layer: at the time of this decision the feed
  serves any game with any event from `GameState` and the liveticker does not
  filter on source. Only a game with a `source=v2` event
  (`GameEvent.Source.V2`, written by the canonical event endpoint) will be read
  from its `GameState` after the cutover; the existing `needs_reconciliation`
  and missing-projection escape hatches remain. The feed will still return every
  event of a v2-owned game, including legacy-sourced corrections.
- **The accepted legacy games stay on the legacy read path. There is no
  backfill.** The exit condition for Phase 2 is "zero unreconciled v2 games;
  the legacy set is explicitly accepted and documented" — not "all games are
  event-sourced". A shadow-only game (`source=legacy`) is legacy for reads even
  though its events are retained as an append-only audit record.
- **Manual result edits on a v2 game are events.** `PATCH
  /api/gameinfo/<id>/result/` on a v2-owned game appends a
  `correction/result` event with `source=staff` (the existing
  `GameEvent.Source.STAFF`; `v2` stays reserved for the canonical endpoint and
  `legacy` for the old scorecard). It carries the entered total and the score
  it replaced (`payload.before`) and sets the projected score; it writes no
  `TeamLog` row. A `staff` event never makes a game v2-owned, and games that
  are not v2-owned keep writing `Gameresult` only.
- **No per-game schema field.** The discriminator is the existing
  `GameEvent.source` column, so no migration and no second database copy are
  needed.
- **Shadow writes and the global flag are removed only after a gameday
  rehearsal on the agent stage.** There is **no prod soak**. Until then the
  flag-off path must remain behaviourally equivalent; the cutover layers are
  stacked last and marked *MERGE ONLY AFTER GAMEDAY REHEARSAL*.

## Consequences

- v2 games are replayable from the event log; corrections and sport templates
  have a foundation.
- The legacy games are an explicitly accepted, documented set, measured by
  `check_game_projection --all --report` (count + SHA-256 digest + per-season
  counts, with an id cutoff), not by carrying raw ids in a public repository.
  The stage had 6,369 such games at the recorded run.
- Reads use `GameEvent.source` rather than a dedicated owner column; there is no
  schema migration and the shared-DB ref/cand model survives the phase.
- The cutover is maintainer-gated: a full simulated gameday on the agent stage
  with `ref` vs `cand` (both cutover layers in cand), a clean
  `check_game_projection --all` with zero `v2_drift`/`v2_flagged`, and passing
  `scorecard_v2` e2e scenarios. There is **no prod soak**. Deleting the flag
  removes the emergency switch, which is why those layers sit last.

## References

- [Architecture remediation roadmap](../../planning/current/2026-11-25-architecture-remediation-roadmap.md) §4.3–4.5
- [Scorecard event architecture](../../planning/current/2026-10-28-scorecard-event-architecture.md) — Q1 (superseded)
- [Phase 2 plan](../../planning/current/2026-11-25-phase2-plan.md)
- [Scorecard events operations guide](../guides/scorecard-events-operations.md)
