# Fix: LeagueTable spurious grouping for Gameday-Designer leagues

## Problem

The league table (`/leaguetable/<slug>/`) groups rows into colored bands by `Gameinfo.standing`
(the "Runde" column). For Gameday-Designer–published leagues (e.g. `ff-bl`) every game gets a
**unique per-game** standing (`"Game 1" … "Game N"`, from `gameGenerators.ts:53`), so the table
explodes into one band per game instead of a single flat table.

### Root cause

`Gameinfo.standing` is **overloaded** and has two irreconcilable consumers:

| Consumer | Needs `standing` to be | Location |
|---|---|---|
| League table grouping/bands | a small, *shared* pool/placement label | `league_table/service/ranking/engine.py` (`rank` groups by `STANDING`); `gamedays/service/builders.py:30` (color bands) |
| Canvas bracket progression | a *unique per-game* match ID | `gamedays/service/canvas_progression_service.py:49,59` (`Gameinfo.objects.get(standing=…)` requires uniqueness) |

The classic scheduler wrote a small shared set of labels (`Gruppe 1`, `HF`, `P1`…). The designer
reuses `standing` as the unique match ID needed for winner/loser progression edges. **We cannot
rewrite what the designer writes into `standing`** without breaking progression.

### Verified data (stage = prod clone)

- Classic `ff-bl` golden reference: `standing="Gruppe 1"` for **all 130 games** → one flat table.
- `ff-bl` (league 18, season 6) mixes 1 classic gameday (`Hauptrunde/Gruppe 1`) + 7 designer
  gamedays (`Liga|Preliminary / Game N`).
- `league_group` FK is essentially vestigial DB-wide (1 `LeagueGroup` row, 7 games).
- Real multi-division tables (afvby_u16, ol-nrw, nrw_u13) already work via `group_by_leagues`,
  which overrides `STANDING = LEAGUE__NAME` in `engine.compute_league_table` (`engine.py:197-198`).
- The **only** non-`group_by_leagues` league with designer gamedays is `ff-bl`. All other
  multi-band classic leagues (dffl2, dfflf, nrw_u10, ol_ost, rl-hessen) have **no** designer
  gamedays and must render exactly as today.

## Chosen approach — Option A (designer-scoped, low risk)

Do **not** change the classic path and do **not** change what the designer writes into `standing`
(progression stays intact). Instead, in the **league-table computation only**, when a
league-season contains any Designer-published gameday, collapse the grouping key to the league
name — reusing the exact mechanism `group_by_leagues` already uses.

Concretely this makes `ff-bl` render as a single flat table (band label = league name, e.g.
"FF BL"), merging both its classic and designer games, while every purely-classic league is
untouched.

### Implementation

1. **`league_table/service/datatypes.py`** — add a boolean to `LeagueConfig`, e.g.
   `collapse_standing_to_league: bool`. Compute it in `from_league_season_config` as: does any
   non-excluded gameday of `(league_season_config.league, league_season_config.season)` have a
   related `GamedayDesignerState`? (Exclude `excluded_gameday_ids`.)
   - Query: `GamedayDesignerState.objects.filter(gameday__league=…, gameday__season=…).exclude(gameday_id__in=excluded).exists()`.

2. **`league_table/service/ranking/engine.py`** — in `compute_league_table`, extend the existing
   override:
   ```python
   if self.league_config.group_by_leagues or self.league_config.collapse_standing_to_league:
       df_games[STANDING] = df_games[LEAGUE__NAME]
   ```
   (Reuses the tested `group_by_leagues` path; no new grouping logic.)

3. No schema change, no data migration, no re-publish (existing designer Gameinfos are grouped
   correctly at read time).

### Scope / non-goals

- Placement/playoff (`stageType: RANKING`) games in a designer league would also collapse into the
  single table. `ff-bl` has none, and designer league tables are currently fully broken, so this is
  not a regression. Distinct placement bands for designer tournaments are a **follow-up**, not part
  of this fix.
- The pre-existing "Initial" band (teams with zero finished games, from
  `league_table_service._init_df_with_default_values`) is unchanged and out of scope.

## TDD tasks

Write failing tests first, then implement.

1. **`LeagueConfig.from_league_season_config`**: given a league-season with a gameday that has a
   `GamedayDesignerState`, `collapse_standing_to_league` is `True`; with only classic gamedays it is
   `False`; if the only designer gameday is in `excluded_gameday_ids`, it is `False`.
2. **Engine**: with `collapse_standing_to_league=True`, a `games_with_results` frame carrying
   several distinct `gameinfo__standing` values collapses to a single `STANDING` == league name
   (mirror the existing `group_by_leagues` engine test).
3. **Service (integration, DB)**: a league-season with a designer gameday whose games have distinct
   per-game standings produces a table with a single standing band; a purely-classic multi-standing
   league still yields its multiple bands (guard against regression).

## Verification

- Run the league_table + gamedays suites (see `container/docs/leaguesphere-environments.md` › Test:
  `./container/spinup_test_db.sh --fresh` then `pytest league_table gamedays`).
- Sanity-check intent against stage data: `ff-bl` s6 collapses to one band; `nrw_u10` s5 keeps its
  `Gruppe 1 / Gruppe 2 / HF / P1 / P3 / P5` bands.

## Guardrails

- Branch: `fix/leaguetable-designer-grouping` (leaguesphere repo). Do **not** merge — merging to
  master auto-deploys via CI. Stop after tests pass; report back.
- No production edits. No changes to `canvas_publish_service.py` or `canvas_progression_service.py`.
