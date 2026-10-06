"""Public standings rows, shared by the league-table API and the snapshot.

Both serve the same projection of LeagueTableService.get_standing(), so the
numbers in /api/snapshot/?include=standings always equal the league table
pages.
"""

import json

from league_table.models import LeagueRulesetTieBreak
from league_table.service.league_table_service import LeagueTableService

# Columns of the computed standing worth exposing publicly. Game-level
# internals (opponent ids, per-game result columns) stay internal.
STANDING_COLUMNS = [
    "standing",
    "team_id",
    "team__description",
    "wins",
    "draws",
    "losses",
    "games_played",
    "pf",
    "pa",
    "diff",
    "win_points",
    "win_quotient",
    "league__name",
]


def standing_rows(service: LeagueTableService) -> list[dict]:
    """The computed standing as JSON-ready rows (STANDING_COLUMNS only)."""
    table = service.get_standing()
    columns = [column for column in STANDING_COLUMNS if column in table.columns]
    return json.loads(table[columns].to_json(orient="records"))


def ranking_keys_by_ruleset(ruleset_ids) -> dict[int, list[str]]:
    """Tie-break step keys per ruleset, in ranking order (one query)."""
    keys = {}
    rows = (
        LeagueRulesetTieBreak.objects.filter(ruleset_id__in=set(ruleset_ids))
        .order_by("ruleset_id", "order")
        .values_list("ruleset_id", "step__key")
    )
    for ruleset_id, key in rows:
        keys.setdefault(ruleset_id, []).append(key)
    return keys


def build_standings(configs) -> list[dict]:
    """One public table per LeagueSeasonConfig.

    `standing` is the group label (e.g. "Gruppe 1"), not a position, so each
    row also gets an explicit `group` and `rank` (1-based within its group).
    `ranking` lists the ruleset's tie-break steps in order, so a client can
    tell a table ranked by `win_quotient` from one ranked by points.
    """
    configs = list(configs)
    ranking = ranking_keys_by_ruleset(
        config.ruleset_id for config in configs if config.ruleset_id is not None
    )
    standings = []
    for config in configs:
        rows = standing_rows(LeagueTableService(config))
        previous_group = object()
        rank = 0
        for row in rows:
            group = row.get("standing")
            rank = rank + 1 if group == previous_group else 1
            previous_group = group
            row["group"] = group
            row["rank"] = rank
        standings.append(
            {
                "league": {
                    "id": config.league.pk,
                    "slug": config.league.slug,
                    "name": config.league.name,
                },
                "season": {
                    "id": config.season.pk,
                    "slug": config.season.slug,
                    "name": config.season.name,
                },
                "ranking": ranking.get(config.ruleset_id, []),
                "rows": rows,
            }
        )
    return standings
