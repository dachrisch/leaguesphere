# [0026] Event store ownership and the v2/legacy boundary

## Status

Proposed (the user, as sole maintainer, flips this to Accepted in the review PR
before merge; the decision content is not blocked on that flip because roadmap
§4.3–4.5 are already final).

**Owner:** the user (sole maintainer) — the "Leon" named in the historical Q1
of `docs/topics/planning/current/2026-10-28-scorecard-event-architecture.md`.

This ADR supersedes Q1 of that document. The old "Leon — default in force"
wording is historical and is retained there for traceability.

## Context

The scorecard event architecture separated *recording* (the v2 app writes
sport-neutral `GameEvent`s) from *meaning* (the server projects them into
`GameState` for the liveticker). The migration from the legacy `TeamLog` read
path is a strangler: the flag `SCORECARD_EVENT_FEED` is off by default, both
write paths are live, and every v1 gamelog write also emits a shadow event so
the event store looks populated.

Three facts forced an explicit decision before the cutover:

1. There is no per-game owner field. `Gameinfo.event_source` was designed but
   never added (`gameevents/models.py:8-10`); adding it now would need a schema
   migration, which breaks the shared-DB ref/cand equivalence model and forces a
   second database copy.
2. Reconciliation skips a large legacy set — **6,369 games** recorded on the
   agent stage — that has no v2 event projection.
3. The global flag is an emergency switch, not a permanent shape; leaving it in
   place forever keeps two code paths alive indefinitely.

Roadmap decisions §4.3–4.5 are final: the event store has an owner, events are
truth for v2 games, and the legacy games are left on the legacy path with no
backfill. This ADR records that decision and makes it discoverable.

## Decision

- **The event store is owned by the user (sole maintainer).** This closes Q1 of
  the 2026-10-28 architecture document; it is not an open question any more.
- **Events are the source of truth for v2 games.** A game with a `source=v2`
  event projection (`GameEvent.Source.V2`, written by the canonical event
  endpoint) is read from its `GameState`; the existing `needs_reconciliation`
  and missing-projection escape hatches remain.
- **The 6,369 legacy games stay on the legacy read path. There is no
  backfill.** The exit condition for Phase 2 is "zero unreconciled v2 games;
  the legacy set is explicitly accepted and documented" — not "all games are
  event-sourced". A shadow-only game (`source=legacy`) is legacy for reads even
  though its events are retained as an append-only audit record.
- **No per-game schema field.** The discriminator is the existing
  `GameEvent.source` column, so no migration and no second database copy are
  needed.
- **Shadow writes and the global flag are removed only after a prod soak.**
  Until then the flag-off path must remain behaviourally equivalent; the
  cutover layers are stacked last and marked *MERGE ONLY AFTER PROD SOAK*.

## Consequences

- v2 games are replayable from the event log; corrections and sport templates
  have a foundation.
- The 6,369 legacy games are an explicitly accepted, documented set, measured
  by `check_game_projection --all --report` (count + SHA-256 digest + per-season
  counts), not by carrying 6,369 raw ids in a public repository.
- Reads use `GameEvent.source` rather than a dedicated owner column; there is no
  schema migration and the shared-DB ref/cand model survives the phase.
- The cutover is user-gated: the user flips this ADR to Accepted, soaks the
  event path on stage/demo/prod with the flag on, and only then allows the
  shadow-removal and flag-cutover layers to merge. Deleting the flag removes the
  emergency switch, which is why those layers sit last.

## References

- [Architecture remediation roadmap](../../planning/current/2026-11-25-architecture-remediation-roadmap.md) §4.3–4.5
- [Scorecard event architecture](../../planning/current/2026-10-28-scorecard-event-architecture.md) — Q1 (superseded)
- [Phase 2 plan](../../planning/current/2026-11-25-phase2-plan.md)
- [Scorecard events operations guide](../guides/scorecard-events-operations.md)
