# league_table/ — CLAUDE.md

> Module guide. For repo-wide commands, testing setup, and deployment policy see the [root CLAUDE.md](../CLAUDE.md).

## Purpose
Computes and serves **league standings** — points, wins/losses, and tie-breakers — for both
group-phase and overall-league formats.

## Role in the system
A read/compute layer over game results owned by [gamedays](../gamedays/CLAUDE.md). It defines the
ranking rules (rulesets, tie-break steps, point adjustments) and produces the tables shown in the
web UI and exposed for export.

## Key models (`models.py`)
`LeagueGroup`, `LeagueRuleset`, `TieBreakStep`, `LeagueRulesetTieBreak`, `LeagueSeasonConfig`,
`OverrideOfficialGamedaySetting`, `TeamPointAdjustments`.

## Service layer (`service/`)
Standings logic is centralized here so the web UI and exports stay consistent — **change ranking
behavior here, not in views:**
- `league_table.py`, `league_table_service.py` — table assembly.
- `ranking/` — ranking + tie-break resolution.
- `leaguetable_repository.py` — data access; `datatypes.py` — value types;
  `leaguetable_settings.py` — configuration.

## Routes (`urls.py`)
- `<str:league>/<str:season>/` — standings for a league+season.
- `<str:league>/` — league overview.
- `all-games/` — full game list.

## Conventions & gotchas
- Tie-break ordering is data-driven (`TieBreakStep` / `LeagueRulesetTieBreak`); extend the ruleset
  models rather than hard-coding comparison logic.
- `TeamPointAdjustments` applies manual point corrections — factor it in for any new aggregation.

## Tests
```bash
cd leaguesphere && pytest league_table
```
