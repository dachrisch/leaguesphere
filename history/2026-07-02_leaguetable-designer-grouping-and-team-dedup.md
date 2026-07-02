# LeagueTable — Designer-league grouping collapse + duplicate-membership de-dup

**Date:** 2026-07-02
**Branch:** `fix/leaguetable-designer-grouping`
**PR:** dachrisch/leaguesphere#1448
**Type:** Bugfix (league table)

## Problem

Two defects surfaced on the `ff-bl` league table (`/leaguetable/ff-bl/`):

1. **Spurious grouping** — the table exploded into one colored band per game
   (`Game 1 … Game 12`, `Gruppe 1`, `Initial`) instead of a single flat table. Only leagues
   published via the **Gameday Designer** were affected; classic leagues were fine.
2. **Inflated totals** — game/point counts were wildly off (teams showing up to **72** games when
   they had really played ≤18), and varied 6–72 across teams.

## Root causes

### 1. `Gameinfo.standing` is overloaded
The league table groups rows by `Gameinfo.standing` (the "Runde" column;
`ranking/engine.py` `TieBreakerEngine.rank`, `gamedays/service/builders.py:30`). The classic
scheduler wrote a small, *shared* set of labels there (`Gruppe 1`, `HF`, `P1`…). The **Gameday
Designer** reuses `standing` as a **unique per-game match id** (`gameGenerators.ts` → `Game N`),
which its bracket progression requires (`canvas_progression_service.py:49,59` does
`Gameinfo.objects.get(standing=…)` — needs uniqueness). So every game became its own band, and the
field cannot simply be rewritten without breaking progression.

### 2. Duplicate `SeasonLeagueTeam` memberships → 4× fan-out
The league-table builder merges game results onto the team list from
`SeasonLeagueTeam` (`league_table_service.py`). For (ff-bl, season 6) there are **two**
`SeasonLeagueTeam` objects holding (nearly) the same teams, so each team appeared **twice** in the
base list. That fanned out every game once on the team merge **and again** on the opponent
self-join → **exactly 4× inflation** (ratio 4.00; ground-truth games were 2–18, table showed 8–72).
Pre-existing and independent of the grouping — the `72` was already in the original prod screenshot.

## Investigation (stage = prod clone)

Verified against the `leaguesphere_stage` DB (prod clone on `lehel.xyz`):
- Classic `ff-bl` golden reference: `standing = "Gruppe 1"` for all 130 games → one flat table.
- Only `ff-bl` (of all non-`group_by_leagues` leagues) has Designer gamedays; the only other
  Designer user, `afvh_u13`, has no league-table config (no table rendered).
- Duplicate-membership spread: **only ff-bl s6** is affected — every other league-season is clean,
  so the de-dup is a no-op elsewhere.

## Fix

**Grouping (designer-scoped, low risk).** Do not touch `standing` or progression. When a
league-season contains any Designer-published gameday, collapse the grouping key to the league name
— reusing the existing `group_by_leagues` override.
- `league_table/service/datatypes.py` — `LeagueConfig.collapse_standing_to_league`, True iff a
  non-excluded gameday of the league-season has a `GamedayDesignerState`.
- `league_table/service/ranking/engine.py` — `compute_league_table` applies
  `STANDING = LEAGUE__NAME` when `group_by_leagues` **or** `collapse_standing_to_league`.

**De-dup (robust everywhere).**
- `league_table/service/league_table_service.py` — `_get_games_with_results_as_dataframe` now
  `drop_duplicates()` the team frame before merging, so duplicate memberships can't inflate totals.

**Supporting fixes (same branch).**
- `container/spinup_test_db.sh` — resolved `test_user.sql` relative to the script dir (`${0:A:h}`);
  it previously read from the caller's CWD, so `--fresh` never created the DB `user` and every
  DB test errored access-denied. This unblocked the MariaDB test runs.
- `gameday_designer/tests/test_api.py` — warmed the request path before two `assert_num_queries`
  blocks. Those exact-count assertions leaked the maintenance-middleware `SiteConfiguration`
  cache-miss query (+ a connection `SELECT 1`) when cold; adding tests reshuffled xdist scheduling
  and flipped one red on CI. Pre-existing brittleness (master fails them in isolation too).

## Which `SeasonLeagueTeam` is the true roster (ff-bl s6)

- `id=324` (26 teams) is a **strict subset** of `id=398` (27 teams).
- The only difference: `398` also contains **"Schloßberg Kings"**, which **played** finished games;
  `324` is missing it. All 22 teams that played are present in `398`.
- ⇒ **`id=398` is the true, complete roster (keep). `id=324` is a stale earlier version (delete).**
  A new SLT was created with the added team instead of editing the old one — that is how the
  duplicate (and the 4× inflation) arose.

## Files changed
- `league_table/service/datatypes.py`, `league_table/service/ranking/engine.py`,
  `league_table/service/league_table_service.py`
- `gameday_designer/tests/test_api.py`, `container/spinup_test_db.sh`
- Tests: `league_table/tests/service/test_datatypes.py` (new, collapse flag ×3),
  `league_table/tests/service/ranking/test_engine.py` (collapse override),
  `league_table/tests/service/test_league_table.py` (duplicate-membership de-dup, TDD RED→GREEN)
- Docs: `docs/superpowers/plans/2026-07-02-leaguetable-designer-grouping.md` (+ `-followup.md`)

## Verification
- `league_table`: 23 passed on real MariaDB (`servyy-test.lxd`). Full CI-equivalent suite
  (`pytest -n 4 --nomigrations`): 673 passed, 7 skipped, 1 xfailed. CI (CircleCI `python`) green.
- Stage functional check (after deploying `v3.31.6-rc.1` of the collapse fix): `ff-bl` "Runde" bands
  collapsed from `Game 1…12 / Gruppe 1 / Initial` to `FF BL (22) + Initial (5)`.
- De-dup validated on stage data: ground-truth games 2–18; table was ground-truth × 4 (ratio 4.00);
  `.distinct()`/`drop_duplicates()` reduces the base list 53 → 27 with zero duplicate team ids.

## Deployment
- `deploy.sh stage` → `v3.31.6-rc.1` (collapse fix); CI `deploy_staging` pushed `:staging`, watchtower
  (5-min) rolled it onto the host; verified live. **The de-dup fix (commit `a41f49f7`) is on the
  branch but not yet on stage** — needs another `deploy.sh stage` (→ `rc.2`) or the PR merge.
- Not merged to master (merge auto-deploys production via CI) — awaiting review.

## Known issues / follow-ups (deferred, documented in the plan `-followup.md`)
1. **Designer tournaments (group + placement) with a league table** — the collapse would fold
   placement games (`P1`, `HF`) into the flat table. No such data exists today (ff-bl is pure
   round-robin). Proper fix: persist a dedicated league-table group at publish time and keep
   `standing` as the unique match id.
2. **ff-bl s6 duplicate `SeasonLeagueTeam` data cleanup** — delete `id=324`, keep `id=398`. Not
   required for correctness (code fix is robust); still worth removing to de-clutter admin/roster
   views, and understanding *why* a second SLT was created to prevent recurrence.
