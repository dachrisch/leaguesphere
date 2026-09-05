"""Which games a team officiated, and how they're doing on the officials
compliance check - the data behind the "officiated games" section on
`/officials/team/<pk>/list/<year>/` (officials/views.py::OfficialsTeamListView).

This is a different concern from that page's main roster listing
(OfficialService.get_all_officials_with_team_infos): that lists the
officials who *belong* to a team's roster (Official.team); this module
answers "which games did team X actually officiate" - scoped purely by the
coarse Gameinfo.officials assignment on the game itself, not by which team
any individually-recorded official happens to belong to.

Reuses matchreport.service.model_wrapper.MachtreportModelWrapper (one
instance per distinct gameday the team officiated) rather than a leaner,
O(1) bulk query, so the officials table (license level, expiry note,
hyperlinked license number) renders byte-identical to the match report
with no duplicated logic. This is a deliberate, accepted exception to the
usual "query count must not scale with result size" mandate: query cost
here scales with the number of *distinct gamedays* the team officiated in
the season, not O(1) - acceptable for this bounded, occasionally-viewed
team self-service page.
"""

from collections import defaultdict

from gamedays.models import Gameday, Gameinfo
from matchreport.service.model_wrapper import MachtreportModelWrapper
from officials.service.officials_compliance_service import (
    compute_gameday_officials_compliance,
)


def get_officiated_gameinfo_ids(team_id: int, season: int) -> list:
    """Distinct Gameinfo ids where the coarse Gameinfo.officials assignment
    is team_id, in `season` - not games this team's roster officials happen
    to have worked for other teams, and not games where an individually
    recorded official belongs to team_id but the game's own officiating
    assignment names a different team."""
    return list(
        Gameinfo.objects.filter(
            gameday__date__year=season, officials_id=team_id
        ).values_list("id", flat=True)
    )


def get_team_officiated_games(team_id: int, season: int, render_config: dict) -> list:
    """One dict per game team_id officiated in `season`, ordered by date
    ascending:
    {gameinfo_id, gameday_id, gameday_name, date, home, away, game_status,
     is_checked, officials_violations: list[str], refs: <rendered HTML table>}
    """
    gameinfo_ids = get_officiated_gameinfo_ids(team_id, season)
    if not gameinfo_ids:
        return []

    gameinfo_to_gameday = dict(
        Gameinfo.objects.filter(id__in=gameinfo_ids).values_list("id", "gameday_id")
    )
    gameinfo_ids_by_gameday = defaultdict(set)
    for gameinfo_id, gameday_id in gameinfo_to_gameday.items():
        gameinfo_ids_by_gameday[gameday_id].add(gameinfo_id)

    gameday_info = {
        gd["id"]: gd
        for gd in Gameday.objects.filter(id__in=gameinfo_ids_by_gameday.keys()).values(
            "id", "name", "date"
        )
    }
    compliance_by_gameday = compute_gameday_officials_compliance(
        gameinfo_ids_by_gameday.keys()
    )

    games = []
    for gameday_id, team_gameinfo_ids in gameinfo_ids_by_gameday.items():
        compliance = compliance_by_gameday[gameday_id]
        for game in MachtreportModelWrapper(gameday_id).get_gameday_match_report(
            render_config
        ):
            if game["gameinfo_id"] not in team_gameinfo_ids:
                continue
            games.append(
                {
                    **game,
                    "gameday_id": gameday_id,
                    "gameday_name": gameday_info[gameday_id]["name"],
                    "date": gameday_info[gameday_id]["date"],
                    "is_checked": compliance.is_checked,
                    "officials_violations": compliance.game_violations.get(
                        game["gameinfo_id"], []
                    ),
                }
            )

    games.sort(
        key=lambda game: (game["date"], game["scheduled"] is None, game["scheduled"])
    )
    return games
