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

---

# Follow-up: duplicate `SeasonLeagueTeam` data for ff-bl s6 (cleanup deferred)

While verifying the collapse on stage, the ff-bl table showed inflated game totals (up to 72 for
teams that really played ≤18). Root cause: **two `SeasonLeagueTeam` objects exist for
(ff-bl, season 6)** — `id=324` (26 teams) and `id=398` (27 teams), overlapping — so nearly every
team was registered twice. The league-table builder merged results onto that non-unique list,
fanning each game out on the team merge and again on the opponent self-join (~4× inflation).

**Code fix shipped** (`fix(league-table): dedupe team memberships…`): the builder now
`drop_duplicates()` the team list, so duplicate memberships no longer inflate totals. This is a
no-op for every other league-season (spread check: only ff-bl s6 has duplicates).

**Deferred data cleanup — resolved which is true:** `id=324` (26 teams) is a **strict subset** of
`id=398` (27 teams). The only difference is that `398` also contains **"Schloßberg Kings"**, a team
that **actually played** finished games; `324` is missing it. All 22 teams that played are present in
`398`. So:

- **`id=398` is the true, complete roster — keep it.**
- **`id=324` is a stale earlier version — delete it** (a new SLT was created with the added team
  instead of updating the old one, which produced the duplicate).

Also worth understanding *why* a second SLT was created rather than the first being edited, to
prevent recurrence. Not required for correctness — the code fix makes the table robust regardless —
but the duplicate data is still misleading (e.g. in admin / roster views).
