from datetime import date

from django.test import TestCase

from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    GameOfficialFactory,
    GameresultFactory,
    TeamFactory,
)
from league_table.tests.setup_factories.factories_leaguetable import (
    LeagueSeasonConfigFactory,
)
from matchreport.constants import REPORT_TABLE_RENDER_CONFIG
from officials.service.officiated_games_service import (
    get_officiated_gameinfo_ids,
    get_team_officiated_games,
)
from officials.tests.setup_factories.factories_officials import OfficialFactory


class TestGetOfficiatedGameinfoIds(TestCase):
    def test_coarse_assignment_included_when_no_individual_official(self):
        team = TeamFactory(name="team-a")
        gameday = GamedayFactory(date=date(2027, 5, 1))
        gameinfo = GameinfoFactory(gameday=gameday, officials=team)
        GameOfficialFactory(gameinfo=gameinfo, official=None, position="Referee")

        ids = get_officiated_gameinfo_ids(team.pk, 2027)

        assert ids == [gameinfo.id]

    def test_individual_official_team_match_included(self):
        team = TeamFactory(name="team-a")
        other_team = TeamFactory(name="team-b")
        official = OfficialFactory(team=team)
        gameday = GamedayFactory(date=date(2027, 5, 1))
        # Coarse assignment belongs to a DIFFERENT team, but the individual
        # official recorded on it belongs to `team` - the game is `team`'s.
        gameinfo = GameinfoFactory(gameday=gameday, officials=other_team)
        GameOfficialFactory(gameinfo=gameinfo, official=official, position="Referee")

        ids = get_officiated_gameinfo_ids(team.pk, 2027)

        assert ids == [gameinfo.id]

    def test_coarse_assignment_excluded_when_individual_official_is_a_different_team(
        self,
    ):
        team = TeamFactory(name="team-a")
        other_team = TeamFactory(name="team-b")
        other_official = OfficialFactory(team=other_team)
        gameday = GamedayFactory(date=date(2027, 5, 1))
        # Coarse assignment names `team`, but the individually-recorded
        # official actually belongs to a different team - `team` did NOT
        # officiate this game.
        gameinfo = GameinfoFactory(gameday=gameday, officials=team)
        GameOfficialFactory(
            gameinfo=gameinfo, official=other_official, position="Referee"
        )

        ids = get_officiated_gameinfo_ids(team.pk, 2027)

        assert ids == []

    def test_filters_by_season_year(self):
        team = TeamFactory(name="team-a")
        gameday_2027 = GamedayFactory(date=date(2027, 5, 1))
        gameinfo_2027 = GameinfoFactory(gameday=gameday_2027, officials=team)
        GameOfficialFactory(gameinfo=gameinfo_2027, official=None, position="Referee")

        gameday_2026 = GamedayFactory(date=date(2026, 5, 1))
        gameinfo_2026 = GameinfoFactory(gameday=gameday_2026, officials=team)
        GameOfficialFactory(gameinfo=gameinfo_2026, official=None, position="Referee")

        assert get_officiated_gameinfo_ids(team.pk, 2027) == [gameinfo_2027.id]
        assert get_officiated_gameinfo_ids(team.pk, 2026) == [gameinfo_2026.id]

    def test_does_not_include_games_a_teams_roster_official_worked_for_another_team(
        self,
    ):
        # Regression for the scope requirement: this must answer "which
        # games did TEAM X officiate", not "which games did any official on
        # team X's roster work, for whichever team". Covered again here at
        # the service level even though it's the same case as
        # test_coarse_assignment_excluded_when_individual_official_is_a_different_team,
        # phrased from the "team roster" angle explicitly.
        team = TeamFactory(name="team-a")
        other_team = TeamFactory(name="team-b")
        official_on_team_a_roster = OfficialFactory(team=team)
        gameday = GamedayFactory(date=date(2027, 5, 1))
        gameinfo = GameinfoFactory(gameday=gameday, officials=other_team)
        GameOfficialFactory(
            gameinfo=gameinfo, official=official_on_team_a_roster, position="Referee"
        )

        # This game IS officiated by team-a (via the individual official's
        # own team), regardless of the coarse assignment naming team-b.
        assert get_officiated_gameinfo_ids(team.pk, 2027) == [gameinfo.id]
        # And it must NOT show up under team-b, despite team-b being the
        # coarse assignment - the individual official overrides that.
        assert get_officiated_gameinfo_ids(other_team.pk, 2027) == []


class TestGetTeamOfficiatedGames(TestCase):
    def test_returns_date_gameday_and_teams(self):
        team = TeamFactory(name="team-a")
        home = TeamFactory(name="home-team", description="Home Team")
        away = TeamFactory(name="away-team", description="Away Team")
        gameday = GamedayFactory(date=date(2027, 5, 1), name="Spieltag 1")
        gameinfo = GameinfoFactory(gameday=gameday, officials=team)
        GameresultFactory(gameinfo=gameinfo, team=home, isHome=True)
        GameresultFactory(gameinfo=gameinfo, team=away, isHome=False)
        GameOfficialFactory(gameinfo=gameinfo, official=None, position="Referee")

        games = get_team_officiated_games(team.pk, 2027, REPORT_TABLE_RENDER_CONFIG)

        assert len(games) == 1
        game = games[0]
        assert game["gameinfo_id"] == gameinfo.id
        assert game["gameday_id"] == gameday.id
        assert game["gameday_name"] == "Spieltag 1"
        assert game["date"] == date(2027, 5, 1)
        assert game["home"]["team_name"] == "Home Team"
        assert game["away"]["team_name"] == "Away Team"
        assert "refs" in game

    def test_attaches_violations_from_compliance_service(self):
        team = TeamFactory(name="team-a")
        gameday = GamedayFactory(date=date(2027, 5, 1))
        gameinfo = GameinfoFactory(gameday=gameday, officials=team)
        GameOfficialFactory(gameinfo=gameinfo, official=None, position="Referee")
        LeagueSeasonConfigFactory(
            league=gameday.league,
            season=gameday.season,
            check_officials_automatically=True,
            min_officials_per_game=1,
        )

        GameresultFactory(gameinfo=gameinfo, isHome=True)
        GameresultFactory(gameinfo=gameinfo, isHome=False)

        games = get_team_officiated_games(team.pk, 2027, REPORT_TABLE_RENDER_CONFIG)

        assert games[0]["is_checked"] is True
        assert len(games[0]["officials_violations"]) == 1

    def test_not_checked_when_no_config_exists(self):
        team = TeamFactory(name="team-a")
        gameday = GamedayFactory(date=date(2027, 5, 1))
        gameinfo = GameinfoFactory(gameday=gameday, officials=team)
        GameOfficialFactory(gameinfo=gameinfo, official=None, position="Referee")
        GameresultFactory(gameinfo=gameinfo, isHome=True)
        GameresultFactory(gameinfo=gameinfo, isHome=False)

        games = get_team_officiated_games(team.pk, 2027, REPORT_TABLE_RENDER_CONFIG)

        assert games[0]["is_checked"] is False
        assert games[0]["officials_violations"] == []

    def test_excludes_games_the_team_did_not_officiate(self):
        team = TeamFactory(name="team-a")
        other_team = TeamFactory(name="team-b")
        gameday = GamedayFactory(date=date(2027, 5, 1))
        team_gameinfo = GameinfoFactory(gameday=gameday, officials=team)
        GameOfficialFactory(gameinfo=team_gameinfo, official=None, position="Referee")
        GameresultFactory(gameinfo=team_gameinfo, isHome=True)
        GameresultFactory(gameinfo=team_gameinfo, isHome=False)
        other_gameinfo = GameinfoFactory(gameday=gameday, officials=other_team)
        GameOfficialFactory(gameinfo=other_gameinfo, official=None, position="Referee")
        GameresultFactory(gameinfo=other_gameinfo, isHome=True)
        GameresultFactory(gameinfo=other_gameinfo, isHome=False)

        games = get_team_officiated_games(team.pk, 2027, REPORT_TABLE_RENDER_CONFIG)

        assert [game["gameinfo_id"] for game in games] == [team_gameinfo.id]

    def test_empty_when_team_officiated_nothing(self):
        team = TeamFactory(name="team-a")

        games = get_team_officiated_games(team.pk, 2027, REPORT_TABLE_RENDER_CONFIG)

        assert games == []
