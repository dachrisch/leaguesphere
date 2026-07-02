# Follow-up: placement/tournament games in Designer league tables

Deferred from the fix in
[`2026-07-02-leaguetable-designer-grouping.md`](2026-07-02-leaguetable-designer-grouping.md)
(commit collapsing per-game standings for Gameday-Designer leagues).

## Context

That fix makes a league table collapse to a single flat band (`STANDING = LEAGUE__NAME`) whenever
the league-season contains **any** Designer-published gameday. It is intentionally coarse: it
collapses **all** games of such a league, regardless of tournament phase.

## The deferred limitation

If a future Designer-published league is a **tournament** — i.e. it has a group phase **plus** real
placement/playoff games (`stageType: "RANKING"`, standings like `P1`, `HF`) — **and** it has a
league-table config, the current fix would fold those placement games into the single flat table
instead of surfacing them as their own bands (the way the classic path does for e.g. `nrw_u10`,
`dffl2`).

### Why it is safe to defer now

- Verified against prod-clone (stage) data: the only league-seasons using the Designer today are
  `ff-bl` s6 (pure round-robin, no placement games) and `afvh_u13` s6 (no league-table config, so no
  table is rendered). Neither hits this limitation.
- Designer league tables were fully broken before the fix, so there is no regression — only a
  known gap for a shape of data that does not exist yet.

## Proposed direction when it becomes real

Decouple the two meanings of `Gameinfo.standing` properly (the root conflict documented in the main
plan) rather than collapsing wholesale:

- Persist a dedicated **league-table group** value at publish time in `CanvasPublishService`,
  derived from the game's stage:
  - `stageType == "STANDARD"` (preliminary/league) → a single shared group value (collapse).
  - `stageType == "RANKING"` (placement) → keep the placement label (`P1`, `HF`, …) as its own band.
- Keep `Gameinfo.standing` as the unique per-game match id that
  `CanvasBracketProgressionService` requires (`canvas_progression_service.py:49,59`).
- Have the league table group by the new field, falling back to `standing` for classic games.

This is the "Option B / unified model" alternative that was weighed and deferred; it needs an
additive `Gameinfo` field, a backfill for existing Designer gamedays (without re-publishing, which
would drop results), and re-verification of the ~6 classic multi-band tables.

## Trigger

Revisit when the first Designer-published **tournament** (group + placement) is created for a league
that also has a `LeagueSeasonConfig`.
