# Phase 2 — accepted legacy set (approved 2026-11-26)

Part of [Phase 2](./2026-11-25-phase2-plan.md) / [#2538](https://github.com/dachrisch/leaguesphere/issues/2538).
Records the exit condition of roadmap decision 5: **zero unreconciled v2 games;
the legacy set is explicitly accepted and documented.** Nothing here changes a
read path and nothing backfills data.

**Status:** measured on the agent stage (servyy-test) on 2026-11-26, before any
cutover. The numbers below come from a real run of
`check_game_projection --all --report` inside `cand`; they are not estimates.

## Definition of the accepted legacy set

A game is legacy when it has `TeamLog` rows but **no `GameEvent` with
`source=v2`**. Two cases are included:

- **no events at all** — the game was written by the legacy scorecard and was
  never shadowed;
- **shadow events only (`source=legacy`)** — the v1 gamelog write emitted an
  event for audit purposes, but no canonical v2 event exists. Per P7 (approved
  2026-11-26) these events stay audit-only and the game keeps the row-based read
  path.

The discriminator is the existing `GameEvent.source` column. There is no
`Gameinfo.event_source` field and no schema migration (P2, approved 2026-11-26).
`needs_reconciliation` on `GameState` remains the escape hatch for a game whose
projection cannot represent its log. The report's `legacy_without_events`
count, per-season counts and SHA-256 digest cover **both** cases; `shadow_only`
is a separate breakdown of the same accepted set. Gates are read from
`v2_drift` and `v2_flagged`, with the source on every drift/flagged entry.

**Cutoff.** The accepted record is frozen at the agent-stage snapshot of
2026-11-26 (`generated_at = 2026-11-26T02:01:48.651647+00:00`): it contains every
legacy game that existed at that instant and no game written afterwards. That
instant is the recorded cutoff. The report itself records `legacy_cutoff = null`
because the measurement run covered the whole frozen snapshot; after new v1
games exist, a regeneration on a later clone must pass `--legacy-cutoff` with
the max game id at the same boundary and publish that id next to its new digest.
A cutoff chosen after the fact cannot reproduce the 6,369-game digest, so no
number is invented here.

## Measured result

| measure | value |
|---|---:|
| accepted legacy games (no-event + shadow-only) | **6,369** |
| games with a v2 event projection | 0 |
| games with drift | 0 |
| games flagged for reconciliation | 0 |
| shadow-only (`source=legacy`) event games (subset of the accepted set) | 0 |

The stage database is a prod clone, so it contains **no event-sourced games at
all**: the flag-on comparison therefore exercises the event path only through
games created by the harness's event-write scenario, not through restored rows.
It happened to have **zero shadow-only games**, so including them in the
accepted set does **not** change any recorded number: 6,369 games, the digest
below and all per-season counts are identical to the earlier no-event-only
measurement. The code and tests now measure the documented definition anyway.
Consequently the recorded `v2_drift = 0` and `v2_flagged = 0` say that no
restored v2 game was available to drift; they do **not** by themselves prove the
event read path, which is exercised by the harness's scenarios and by the
gameday rehearsal (§8.3 of the phase 2 plan).

SHA-256 digest of the sorted ids of the 6,369 accepted games (P3, approved
2026-11-26: store the digest and counts, **not** the raw ids, in the public
repository):

```text
3061721f5d9d7486fc2cd32b35fa0c384459b0b3521dd88c56ec5df1f8801ff6
```

Per-season counts of accepted legacy games (all no-event games on the stage):

| season | legacy games |
|---|---:|
| 1 | 245 |
| 2 | 543 |
| 3 | 972 |
| 4 | 1,379 |
| 5 | 1,545 |
| 6 | 1,685 |
| **total** | **6,369** |

The report also recorded `generated_at = 2026-11-26T02:01:48.651647+00:00`,
`ref_sha = 96ec02b175a62e0e264f51771355ebf806c21797` and
`cand_sha = 3b9f4ecbf29735b301c819b56e06c74601913e7a` (the Layer 2 head).
`legacy_cutoff` is `null` on that run: the frozen snapshot is the boundary, so
the whole accepted set at that instant is covered. Reproducing the digest needs
that same snapshot (or a later run with an explicitly recorded max-id cutoff);
it is not reproducible by guessing a cutoff today. The gate is
`v2_drift == 0` and `v2_flagged == 0`, not the command's exit code alone. The
console output was:

```text
checked 0 event-sourced game(s); skipped 6369 legacy game(s) without events
projection matches the event log
```

## Per-game mode

`--game <id> --report` is a debugging aid, not the acceptance measurement.
There `check_games([id])` reports a legacy game without loading its gameday, so
its season is recorded as `null` in the report's `per_season` map; the `ok`
field counts that skipped legacy check as well. In `--all` mode the season is
joined in the same query and only reconciled games are in `ok`. Both modes are
intended; the recorded acceptance numbers above come from `--all`.

## Regenerate

Run this inside the `cand` container on servyy-test (the role is test-host only
and the report is read-only). On the frozen 2026-11-26 snapshot no cutoff flag is
needed — the snapshot itself bounds the set:

```bash
python manage.py check_game_projection --all \
  --report /tmp/phase2-legacy-report.json \
  --ref-sha 96ec02b175a62e0e264f51771355ebf806c21797 \
  --cand-sha <layer-head-sha>
```

On a later clone, add `--legacy-cutoff <max-id-at-the-new-boundary>` and record
that id together with the new count/digest; the old digest is not the target of
such a run.

The report builder performs no additional queries, so `--all` stays at six
queries. The command's stdout and exit status are unchanged by `--report`.

## No backfill

**No backfill will be performed.** The 6,369 games remain on the legacy read
path permanently; they are not event-sourced and are not repaired, rewritten or
counted as drift. Roadmap decision 5 and ADR-0026 make this an accepted,
documented set rather than a defect. If a sampled v2 game were flagged, the
remedy would be a data-only `rebuild_game_projection --game <id>` on the agent
stage, recorded in the relevant PR — never a code or schema change.
