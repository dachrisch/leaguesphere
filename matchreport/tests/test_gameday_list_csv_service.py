import csv
import io
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
from matchreport.service.gameday_list_csv_service import (
    CSV_HEADER,
    build_gameday_list_csv,
)
from officials.tests.setup_factories.factories_officials import (
    OfficialFactory,
    OfficialLicenseFactory,
    OfficialLicenseHistoryFactory,
)


def _parse(csv_text):
    return list(csv.reader(io.StringIO(csv_text), delimiter=";"))


class TestBuildGamedayListCsv(TestCase):
    def test_header_matches_the_requested_columns(self):
        rows = _parse(build_gameday_list_csv([]))
        assert rows == [CSV_HEADER]

    def test_one_row_per_game_with_teams_and_officiating_team(self):
        home = TeamFactory(name="home-team", description="Home Team")
        away = TeamFactory(name="away-team", description="Away Team")
        officiating_team = TeamFactory(name="ref-crew", description="Referee Crew")
        gameday = GamedayFactory(date=date(2027, 5, 1), name="Spieltag 1")
        gameinfo = GameinfoFactory(gameday=gameday, officials=officiating_team)
        GameresultFactory(gameinfo=gameinfo, team=home, isHome=True)
        GameresultFactory(gameinfo=gameinfo, team=away, isHome=False)

        rows = _parse(build_gameday_list_csv([gameday]))

        assert len(rows) == 2
        row = dict(zip(CSV_HEADER, rows[1]))
        assert row["gameday_id"] == str(gameday.pk)
        assert row["gameday name"] == "Spieltag 1"
        assert row["gameday date"] == "2027-05-01"
        assert row["gameinfo_id"] == str(gameinfo.pk)
        assert row["home"] == "Home Team"
        assert row["away"] == "Away Team"
        assert row["game officials"] == "Referee Crew"
        assert row["violations"] == ""

    def test_violations_are_semicolon_joined(self):
        gameday = GamedayFactory(date=date(2027, 5, 1))
        gameinfo = GameinfoFactory(gameday=gameday)
        LeagueSeasonConfigFactory(
            league=gameday.league,
            season=gameday.season,
            check_officials_automatically=True,
            min_officials_per_game=2,
            min_officials_f1_per_game=1,
        )

        rows = _parse(build_gameday_list_csv([gameday]))

        row = dict(zip(CSV_HEADER, rows[1]))
        assert "Nicht genug Offizielle mit Lizenz" in row["violations"]
        assert "Nicht genug Offizielle mit F1-Lizenz" in row["violations"]
        assert "; " in row["violations"]

    def test_position_license_columns(self):
        gameday = GamedayFactory(date=date(2027, 5, 1))
        gameinfo = GameinfoFactory(gameday=gameday)
        referee = OfficialFactory(team=TeamFactory())
        OfficialLicenseHistoryFactory(
            official=referee,
            license=OfficialLicenseFactory(name="F1"),
            created_at=date(2027, 3, 1),
        )
        GameOfficialFactory(gameinfo=gameinfo, official=referee, position="Referee")

        rows = _parse(build_gameday_list_csv([gameday]))

        row = dict(zip(CSV_HEADER, rows[1]))
        assert row["Referee license"] == "F1"
        assert row["downjudge license"] == ""
        assert row["fieldjudge license"] == ""
        assert row["sidejudge license"] == ""
