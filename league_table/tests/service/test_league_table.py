import pathlib

import pandas as pd

from league_table.service.league_table_service import LeagueTableService


# ToDo extract method for reuseability
def get_df_from_json(filename):
    return pd.read_json(
        pathlib.Path(__file__).parent / "testdata/{0}".format(filename), orient="table"
    )


def _team_row(team_id):
    return {
        "team_id": team_id,
        "league_id": 10,
        "teams__id": team_id,
        "teams__description": f"Team {team_id}",
        "team__description": f"Team {team_id}",
        "league__name": "League",
    }


def _result_row(team_id, is_home, fh, sh, pa):
    return {
        "gameinfo": 100,
        "team_id": team_id,
        "team__description": f"Team {team_id}",
        "fh": fh,
        "sh": sh,
        "pa": pa,
        "isHome": is_home,
        "gameinfo__standing": "Gruppe 1",
        "gameinfo__status": "beendet",
    }


def test_duplicate_team_memberships_do_not_inflate_game_rows():
    """A team registered via multiple SeasonLeagueTeam rows for the same league
    (see ff-bl s6) must not have its games fanned out by the team merge and the
    opponent self-join (which otherwise multiplies games/points by ~4x)."""
    # each team appears twice in the base list (duplicate membership)
    team_and_league_ids = [_team_row(1), _team_row(1), _team_row(2), _team_row(2)]
    # exactly one finished game between the two teams
    results = [
        _result_row(1, is_home=True, fh=10, sh=10, pa=0),
        _result_row(2, is_home=False, fh=0, sh=0, pa=20),
    ]

    df = LeagueTableService(None)._get_games_with_results_as_dataframe(
        results, team_and_league_ids
    )

    games_team_1 = df[(df["team_id"] == 1) & (df["gameinfo"].notna())]
    games_team_2 = df[(df["team_id"] == 2) & (df["gameinfo"].notna())]
    assert len(games_team_1) == 1
    assert len(games_team_2) == 1


# class TestLeagueTable(TestCase):
#
#     def test_empty_league_table(self):
#         DBSetup().create_empty_gameday()
#         league_table = LeagueTable()
#         assert league_table.get_standing(Season.objects.first()).empty
#
#     def test_league_table(self):
#         DBSetup().g72_finished()
#         DBSetup().g62_finished()
#         expected_overall_table = get_df_from_json('league_table_overall.json')
#         league_table = LeagueTable()
#         assert league_table.get_standing(Season.objects.first()).to_json() == expected_overall_table.to_json()
#
#     def test_league_table_multiple_season(self):
#         test_season = Season.objects.create(name='test season')
#         another_season = Season.objects.create(name='another season')
#         any_season = Season.objects.create(name='any season')
#         DBSetup().g62_finished(season=test_season)
#         DBSetup().g72_finished(season=another_season)
#         DBSetup().g62_finished(season=any_season)
#         DBSetup().g72_finished(season=any_season)
#         expected_overall_table = get_df_from_json('league_table_overall.json')
#         league_table = LeagueTable()
#         assert league_table.get_standing(any_season).to_json() == expected_overall_table.to_json()
#
#     def test_league_table_by_division_current_year_implicit(self):
#         DBSetup().g72_finished()
#         DBSetup().g62_finished()
#         season = Season.objects.first()
#         west = League.objects.create(name='west')
#         south = League.objects.create(name='south')
#         teams_A = Team.objects.filter(name__startswith='A')
#         teams_B = Team.objects.filter(name__startswith='B')
#         for team in teams_A:
#             SeasonLeagueTeam.objects.create(season=season, league=south, team=team)
#         for team in teams_B:
#             SeasonLeagueTeam.objects.create(season=season, league=west, team=team)
#         expected_overall_table = get_df_from_json('league_table_division_south.json')
#         league_table = LeagueTable()
#         assert league_table.get_standing(season=season, league='south').to_json() == expected_overall_table.to_json()
#
#     def test_league_table_by_division_for_multiple_seasons(self):
#         test_season = Season.objects.create(name='test season')
#         another_season = Season.objects.create(name='another season')
#         any_season = Season.objects.create(name='any season')
#         all_seasons = [test_season, another_season, any_season]
#         DBSetup().g62_finished(season=test_season)
#         DBSetup().g72_finished(season=another_season)
#         DBSetup().g62_finished(season=any_season)
#         DBSetup().g72_finished(season=any_season)
#         west = League.objects.create(name='west')
#         south = League.objects.create(name='south')
#         teams_A = Team.objects.filter(name__startswith='A')
#         teams_B = Team.objects.filter(name__startswith='B')
#         for season in all_seasons:
#             for team in teams_A:
#                 SeasonLeagueTeam.objects.create(season=season, league=south, team=team)
#             for team in teams_B:
#                 SeasonLeagueTeam.objects.create(season=season, league=west, team=team)
#         expected_overall_table = get_df_from_json('league_table_division_south.json')
#         league_table = LeagueTable()
#         assert league_table.get_standing(league='south',
#                                          season=any_season).to_json() == expected_overall_table.to_json()
#
#     def test_league_table_by_illegal_league_name(self):
#         DBSetup().g72_finished()
#         DBSetup().g62_finished()
#         league_table = LeagueTable()
#         assert league_table.get_standing(season=Season.objects.first(), league='non existent league').empty

from django.test import TestCase
from league_table.service.league_table_service import LeagueTableService
from league_table.models import LeagueSeasonConfig
from gamedays.models import League, Season


class TestLeagueTableService(TestCase):
    def setUp(self):
        self.season = Season.objects.create(name="2026", slug="2026")
        self.league = League.objects.create(name="Test League", slug="test-league")
        self.league_season_config = LeagueSeasonConfig.objects.create(
            league=self.league, season=self.season
        )

    def test_get_league_name_with_valid_config(self):
        service = LeagueTableService(self.league_season_config)
        assert service.get_league_name() == "Test League"

    def test_get_league_name_with_none_config(self):
        service = LeagueTableService(None)
        assert service.get_league_name() is None

    def test_get_league_name_uses_select_related(self):
        from league_table.service.leaguetable_repository import LeagueTableRepository
        config = LeagueTableRepository.get_league_season_config_by_slug(
            "test-league", "2026"
        )
        service = LeagueTableService(config)
        league_name = service.get_league_name()
        assert league_name == "Test League"

