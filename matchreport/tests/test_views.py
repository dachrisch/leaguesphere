from datetime import date
from http import HTTPStatus
from unittest.mock import patch
import csv
import io

import pytest
from django.contrib.auth.models import User
from django.test import TestCase, TransactionTestCase
from django.urls import reverse
from django_webtest import WebTest
from django_webtest.compat import is_authenticated
from django_webtest.response import DjangoWebtestResponse

from gamedays.constants import (
    LEAGUE_GAMEDAY_DETAIL,
    LEAGUE_GAMEDAY_LIST,
    LEAGUE_GAMEDAY_CREATE,
    LEAGUE_GAMEDAY_DELETE,
    LEAGUE_GAMEDAY_UPDATE,
    LEAGUE_GAMEDAY_GAMEINFOS_UPDATE,
    LEAGUE_GAMEDAY_GAMEINFOS_DELETE,
    LEAGUE_GAMEDAY_GAMEINFOS_WIZARD,
    LEAGUE_GAMEDAY_GAME_DETAIL,
    LEAGUE_GAMEDAY_LEAGUE_STATISTICS,
)
from gamedays.forms import (
    GamedayForm,
    GamedayGaminfoFieldsAndGroupsForm,
    GamedayFormatForm,
    GameinfoForm,
)
from gamedays.models import (
    Gameday,
    League,
    Gameinfo,
    TeamLog,
    Gameresult,
    GameSetup,
    Team,
)
from gamedays.service.builders import TableContextBuilder
from gamedays.service.gameday_service import (
    EmptySchedule,
    EmptyFinalTable,
    EmptyQualifyTable,
    EmptyDefenseStatisticTable,
    EmptyOffenseStatisticTable,
    EmptyEventsTable,
    EmptySplitScoreTable,
)
from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    GameOfficialFactory,
    LeagueFactory,
    SeasonFactory,
    TeamFactory,
    UserFactory,
)

from league_table.tests.setup_factories.factories_leaguetable import (
    LeagueSeasonConfigFactory,
)
from matchreport.constants import (
    MATCHREPORT_GAMEDAY_DETAIL,
    MATCHREPORT_GAMEDAY_LIST_AND_YEAR,
    MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
    MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD,
    MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD_AND_LEAGUE,
    MATCHREPORT_GAMEDAY_PASSCHECK_DOWNLOAD,
)
from officials.tests.setup_factories.factories_officials import (
    OfficialFactory,
    OfficialLicenseFactory,
    OfficialLicenseHistoryFactory,
)
from passcheck.service.passcheck_service import PasscheckServicePlayers
from passcheck.tests.setup_factories.db_setup_passcheck import DbSetupPasscheck


class TestMatchreportGamedayDetailPermissions(WebTest):

    def test_matchreport_as_normal_user(self):
        gameday = DBSetup().g62_with_tiebreak_finished()
        resp = self.client.get(
            reverse(MATCHREPORT_GAMEDAY_DETAIL, kwargs={"pk": gameday.pk})
        )

        assert resp.status_code == HTTPStatus.FOUND
        assert f"/login/?next=/matchreport/gameday/{gameday.pk}" in resp.url

    def test_matchreport_as_staff(self):
        gameday = DBSetup().g62_with_tiebreak_finished()
        self.app.set_user(UserFactory(is_staff=True))
        resp = self.app.get(
            reverse(MATCHREPORT_GAMEDAY_DETAIL, kwargs={"pk": gameday.pk})
        )

        assert resp.status_code == HTTPStatus.OK


class TestMatchreportGamedayDetailView(TestCase):

    def test_matchreport_no_passchecks(self):
        gameday = DBSetup().g62_with_tiebreak_finished()
        num_games = len(gameday.gameinfo_set.all())
        self.client.force_login(UserFactory(is_staff=True))
        resp = self.client.get(
            reverse(MATCHREPORT_GAMEDAY_DETAIL, kwargs={"pk": gameday.pk})
        )

        assert resp.status_code == HTTPStatus.OK
        context = resp.context_data
        assert (
            context["info"]["passcheck_info_table"]
            == "<p>An diesem Spieltag gab es keine Passchecks</p>"
        )
        assert len(context["info"]["passcheck_player_data"]) == 0
        assert len(context["info"]["gameday_match_reports"]) == num_games
        assert len(context["info"]["officials"]) == 0

    def test_matchreport_no_gameday_found(self):
        self.client.force_login(UserFactory(is_staff=True))
        resp = self.client.get(reverse(MATCHREPORT_GAMEDAY_DETAIL, kwargs={"pk": 0}))
        assert resp.status_code == HTTPStatus.NOT_FOUND

    def test_matchreport_flags_game_missing_officials(self):
        gameday = DBSetup().g62_with_tiebreak_finished()
        num_games = len(gameday.gameinfo_set.all())
        LeagueSeasonConfigFactory(
            league=gameday.league,
            season=gameday.season,
            check_officials_automatically=True,
            min_officials_per_game=1,
        )
        self.client.force_login(UserFactory(is_staff=True))
        # Warm request-path caches so the query count is not order-dependent
        # under parallel (xdist) runs.
        self.client.get(reverse(MATCHREPORT_GAMEDAY_DETAIL, kwargs={"pk": gameday.pk}))

        with self.assertNumQueries(58):
            resp = self.client.get(
                reverse(MATCHREPORT_GAMEDAY_DETAIL, kwargs={"pk": gameday.pk})
            )

        assert resp.status_code == HTTPStatus.OK
        status = resp.context_data["info"]["officials_check_status"]
        assert status.is_checked is True
        # None of this fixture's games have GameOfficial rows assigned.
        assert status.violation_count == num_games
        content = resp.content.decode()
        assert "Nicht genug Offizielle mit Lizenz" in content
        # Violations must be visible at the top level (Spiele section header
        # and each game's always-visible card-header) without needing to
        # expand every collapsed game card and switch to its Schiedsrichter
        # tab.
        assert f"{num_games} Spiel" in content
        # "Offizielle unvollständig" appears once per game in the
        # always-visible card-header badge, and once more in the alert box
        # inside the (collapsed) Schiedsrichter tab pane.
        assert content.count("Offizielle unvollständig") == 2 * num_games

    def test_matchreport_does_not_flag_when_check_disabled(self):
        gameday = DBSetup().g62_with_tiebreak_finished()
        LeagueSeasonConfigFactory(
            league=gameday.league,
            season=gameday.season,
            check_officials_automatically=False,
            min_officials_per_game=1,
        )
        self.client.force_login(UserFactory(is_staff=True))
        # Warm request-path caches so the query count is not order-dependent
        # under parallel (xdist) runs.
        self.client.get(reverse(MATCHREPORT_GAMEDAY_DETAIL, kwargs={"pk": gameday.pk}))

        with self.assertNumQueries(56):
            resp = self.client.get(
                reverse(MATCHREPORT_GAMEDAY_DETAIL, kwargs={"pk": gameday.pk})
            )

        assert resp.status_code == HTTPStatus.OK
        status = resp.context_data["info"]["officials_check_status"]
        assert status.is_checked is False
        assert status.violation_count == 0


class TestMatchreportGamedayListView(TestCase):

    def test_renders_without_a_league_selected(self):
        # Regression: the CSV download link in the template must resolve to
        # the no-league URL pattern (not crash with NoReverseMatch) when the
        # page is reached via the bare "<year>/" route.
        GamedayFactory(date=date(2027, 5, 1))
        self.client.force_login(UserFactory(is_staff=True))

        resp = self.client.get(
            reverse(MATCHREPORT_GAMEDAY_LIST_AND_YEAR, kwargs={"season": 2027})
        )

        assert resp.status_code == HTTPStatus.OK
        assert (
            reverse(MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD, kwargs={"season": 2027})
            in resp.content.decode()
        )

    def test_list_shows_checked_and_violation_count(self):
        league = LeagueFactory(name="DKB DFFL")
        season = SeasonFactory(name=2027)
        gameday = GamedayFactory(date=date(2027, 5, 1), league=league, season=season)
        GameinfoFactory(gameday=gameday)
        LeagueSeasonConfigFactory(
            league=league,
            season=season,
            check_officials_automatically=True,
            min_officials_per_game=1,
        )
        self.client.force_login(UserFactory(is_staff=True))
        # Warm request-path caches so the query count is not order-dependent
        # under parallel (xdist) runs.
        self.client.get(
            reverse(
                MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
                kwargs={"season": 2027, "league": "DKB DFFL"},
            )
        )

        with self.assertNumQueries(11):
            resp = self.client.get(
                reverse(
                    MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
                    kwargs={"season": 2027, "league": "DKB DFFL"},
                )
            )

        assert resp.status_code == HTTPStatus.OK
        rows = resp.context["gameday_rows"]
        assert len(rows) == 1
        assert rows[0]["compliance"].is_checked is True
        assert rows[0]["compliance"].violation_count == 1

    def test_list_shows_not_checked_reason(self):
        league = LeagueFactory(name="DKB DFFL")
        season = SeasonFactory(name=2027)
        gameday = GamedayFactory(date=date(2027, 5, 1), league=league, season=season)
        GameinfoFactory(gameday=gameday)
        self.client.force_login(UserFactory(is_staff=True))
        # Warm request-path caches so the query count is not order-dependent
        # under parallel (xdist) runs.
        self.client.get(
            reverse(
                MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
                kwargs={"season": 2027, "league": "DKB DFFL"},
            )
        )

        with self.assertNumQueries(8):
            resp = self.client.get(
                reverse(
                    MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
                    kwargs={"season": 2027, "league": "DKB DFFL"},
                )
            )

        assert resp.status_code == HTTPStatus.OK
        rows = resp.context["gameday_rows"]
        assert len(rows) == 1
        assert rows[0]["compliance"].is_checked is False
        assert rows[0]["compliance"].reason_not_checked == "Keine Konfiguration"

    def test_only_violations_filter_excludes_compliant_gamedays(self):
        league = LeagueFactory(name="DKB DFFL")
        season = SeasonFactory(name=2027)
        LeagueSeasonConfigFactory(
            league=league,
            season=season,
            check_officials_automatically=True,
            min_officials_per_game=1,
        )

        compliant_gameday = GamedayFactory(
            date=date(2027, 5, 1), league=league, season=season, name="Compliant"
        )
        compliant_gameinfo = GameinfoFactory(gameday=compliant_gameday)
        official = OfficialFactory(team=TeamFactory())
        OfficialLicenseHistoryFactory(
            official=official,
            license=OfficialLicenseFactory(name="F1"),
            created_at=date(2027, 4, 1),
        )
        GameOfficialFactory(
            gameinfo=compliant_gameinfo, official=official, position="Referee"
        )

        violating_gameday = GamedayFactory(
            date=date(2027, 5, 8), league=league, season=season, name="Violating"
        )
        GameinfoFactory(gameday=violating_gameday)

        self.client.force_login(UserFactory(is_staff=True))
        # Warm request-path caches so the query count is not order-dependent
        # under parallel (xdist) runs.
        self.client.get(
            reverse(
                MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
                kwargs={"season": 2027, "league": "DKB DFFL"},
            ),
            {"only_violations": "1"},
        )

        with self.assertNumQueries(12):
            resp = self.client.get(
                reverse(
                    MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
                    kwargs={"season": 2027, "league": "DKB DFFL"},
                ),
                {"only_violations": "1"},
            )

        assert resp.status_code == HTTPStatus.OK
        rows = resp.context["gameday_rows"]
        assert len(rows) == 1
        assert rows[0]["gameday"].pk == violating_gameday.pk

    def test_query_count_stays_constant_for_multiple_gamedays(self):
        league = LeagueFactory(name="DKB DFFL")
        season = SeasonFactory(name=2027)
        LeagueSeasonConfigFactory(
            league=league,
            season=season,
            check_officials_automatically=True,
            min_officials_per_game=1,
        )
        for day in range(1, 4):
            gameday = GamedayFactory(
                date=date(2027, 5, day), league=league, season=season
            )
            GameinfoFactory(gameday=gameday)

        self.client.force_login(UserFactory(is_staff=True))
        # Warm request-path caches so the query count is not order-dependent.
        self.client.get(
            reverse(
                MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
                kwargs={"season": 2027, "league": "DKB DFFL"},
            )
        )

        with self.assertNumQueries(11):
            resp = self.client.get(
                reverse(
                    MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
                    kwargs={"season": 2027, "league": "DKB DFFL"},
                )
            )

        assert resp.status_code == HTTPStatus.OK
        assert len(resp.context["gameday_rows"]) == 3


class TestMatchreportGamedayListCsvDownloadPermissions(WebTest):

    def test_csv_download_as_normal_user(self):
        league = LeagueFactory(name="DKB DFFL")
        season = SeasonFactory(name=2027)
        resp = self.client.get(
            reverse(
                MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD_AND_LEAGUE,
                kwargs={"season": 2027, "league": "DKB DFFL"},
            )
        )

        assert resp.status_code == HTTPStatus.FOUND
        assert "/login/" in resp.url


class TestMatchreportGamedayListCsvDownloadView(TestCase):

    def test_csv_contains_one_row_per_game(self):
        league = LeagueFactory(name="DKB DFFL")
        season = SeasonFactory(name=2027)
        gameday = GamedayFactory(
            date=date(2027, 5, 1), league=league, season=season, name="Spieltag 1"
        )
        gameinfo = GameinfoFactory(gameday=gameday)
        self.client.force_login(UserFactory(is_staff=True))

        resp = self.client.get(
            reverse(
                MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD_AND_LEAGUE,
                kwargs={"season": 2027, "league": "DKB DFFL"},
            )
        )

        assert resp.status_code == HTTPStatus.OK
        assert resp["Content-Type"].startswith("text/csv")
        assert "attachment" in resp["Content-Disposition"]

        csv_body = resp.content.decode("utf-8-sig")
        rows = list(csv.reader(io.StringIO(csv_body), delimiter=";"))
        assert rows[0] == [
            "gameday_id",
            "gameday name",
            "gameday date",
            "gameinfo_id",
            "home",
            "away",
            "game officials",
            "violations",
            "Referee license",
            "downjudge license",
            "fieldjudge license",
            "sidejudge license",
        ]
        assert len(rows) == 2
        assert rows[1][0] == str(gameday.pk)
        assert rows[1][1] == "Spieltag 1"
        assert rows[1][2] == "2027-05-01"
        assert rows[1][3] == str(gameinfo.pk)

    def test_csv_respects_only_violations_filter(self):
        league = LeagueFactory(name="DKB DFFL")
        season = SeasonFactory(name=2027)
        LeagueSeasonConfigFactory(
            league=league,
            season=season,
            check_officials_automatically=True,
            min_officials_per_game=1,
        )
        compliant_gameday = GamedayFactory(
            date=date(2027, 5, 1), league=league, season=season, name="Compliant"
        )
        compliant_gameinfo = GameinfoFactory(gameday=compliant_gameday)
        official = OfficialFactory(team=TeamFactory())
        OfficialLicenseHistoryFactory(
            official=official,
            license=OfficialLicenseFactory(name="F1"),
            created_at=date(2027, 4, 1),
        )
        GameOfficialFactory(
            gameinfo=compliant_gameinfo, official=official, position="Referee"
        )
        violating_gameday = GamedayFactory(
            date=date(2027, 5, 8), league=league, season=season, name="Violating"
        )
        GameinfoFactory(gameday=violating_gameday)

        self.client.force_login(UserFactory(is_staff=True))
        resp = self.client.get(
            reverse(
                MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD_AND_LEAGUE,
                kwargs={"season": 2027, "league": "DKB DFFL"},
            ),
            {"only_violations": "1"},
        )

        csv_body = resp.content.decode("utf-8-sig")
        rows = list(csv.reader(io.StringIO(csv_body), delimiter=";"))
        assert len(rows) == 2
        assert rows[1][1] == "Violating"

    def test_csv_download_without_league_selection(self):
        season = SeasonFactory(name=2027)
        gameday = GamedayFactory(date=date(2027, 5, 1), season=season)
        GameinfoFactory(gameday=gameday)
        self.client.force_login(UserFactory(is_staff=True))

        resp = self.client.get(
            reverse(MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD, kwargs={"season": 2027})
        )

        assert resp.status_code == HTTPStatus.OK
        csv_body = resp.content.decode("utf-8-sig")
        rows = list(csv.reader(io.StringIO(csv_body), delimiter=";"))
        assert len(rows) == 2


class TestMatchreportGamedayPasscheckDownloadPermissions(WebTest):

    def test_passcheck_download_as_normal_user(self):
        gameday = DBSetup().g62_with_tiebreak_finished()
        resp = self.client.get(
            reverse(MATCHREPORT_GAMEDAY_PASSCHECK_DOWNLOAD, kwargs={"pk": gameday.pk})
        )

        assert resp.status_code == HTTPStatus.FOUND
        assert (
            f"/login/?next=/matchreport/gameday/{gameday.pk}/passcheck/download/"
            in resp.url
        )


class TestMatchreportGamedayPasscheckDownloadView(TestCase):

    def test_passcheck_download_csv_with_data(self):
        gameday = DBSetup().g62_with_tiebreak_finished()
        self.client.force_login(UserFactory(is_staff=True))

        all_teams = Team.objects.exclude(name__in=["teamName", "officials"]).all()
        psp = PasscheckServicePlayers()

        for team in all_teams:
            DbSetupPasscheck().create_playerlist_for_team(team=team, gamedays=[gameday])

            roster = [
                {
                    "id": playerlist_entry.player.id,
                    "first_name": playerlist_entry.player.person.first_name,
                    "last_name": playerlist_entry.player.person.last_name,
                    "jersey_number": 4,
                    "pass_number": playerlist_entry.player.pass_number,
                    "sex": playerlist_entry.player.person.sex,
                    "gamedays_counter": {"6": 3, "7": 0, "8": 0},
                    "key": idx,
                    "isSelected": True,
                }
                for idx, playerlist_entry in enumerate(team.playerlist_set.all())
            ]

            psp.create_roster_and_passcheck_verification(
                team_id=team.id,
                gameday_id=gameday.id,
                user=User.objects.first(),
                data={
                    "official_name": "Testbert Official",
                    "roster": roster,
                    "note": "Alles gut!",
                },
            )

        # Warm request-path caches (maintenance-mode SiteConfiguration lookup) so the
        # query count is not order-dependent under parallel (xdist) runs.
        self.client.get(
            reverse(MATCHREPORT_GAMEDAY_PASSCHECK_DOWNLOAD, kwargs={"pk": gameday.pk})
        )

        with self.assertNumQueries(5):
            resp = self.client.get(
                reverse(
                    MATCHREPORT_GAMEDAY_PASSCHECK_DOWNLOAD, kwargs={"pk": gameday.pk}
                )
            )

        assert resp.status_code == HTTPStatus.OK
        assert resp["Content-Type"].startswith("text/csv")
        assert "attachment" in resp["Content-Disposition"]
        assert f"passcheck_spieler_{gameday.pk}.csv" in resp["Content-Disposition"]

        csv_body = resp.content.decode("utf-8-sig")
        reader = csv.reader(io.StringIO(csv_body), delimiter=";")
        rows = list(reader)

        expected_headers = [
            "Trikotnr.",
            "Spieler Team",
            "Passnummer",
            "Vorname",
            "Nachname",
            "Geburtsdatum",
            "Geschlecht",
        ]
        assert rows[0] == expected_headers
        assert len(rows) == 1 + (3 * len(all_teams))

    def test_passcheck_download_csv_no_passchecks(self):
        gameday = DBSetup().g62_with_tiebreak_finished()
        self.client.force_login(UserFactory(is_staff=True))

        # Warm request-path caches (maintenance-mode SiteConfiguration lookup) so the
        # query count is not order-dependent under parallel (xdist) runs.
        self.client.get(
            reverse(MATCHREPORT_GAMEDAY_PASSCHECK_DOWNLOAD, kwargs={"pk": gameday.pk})
        )

        with self.assertNumQueries(5):
            resp = self.client.get(
                reverse(
                    MATCHREPORT_GAMEDAY_PASSCHECK_DOWNLOAD, kwargs={"pk": gameday.pk}
                )
            )

        assert resp.status_code == HTTPStatus.OK
        assert resp["Content-Type"].startswith("text/csv")

        csv_body = resp.content.decode("utf-8-sig")
        reader = csv.reader(io.StringIO(csv_body), delimiter=";")
        rows = list(reader)

        expected_headers = [
            "Trikotnr.",
            "Spieler Team",
            "Passnummer",
            "Vorname",
            "Nachname",
            "Geburtsdatum",
            "Geschlecht",
        ]
        assert rows[0] == expected_headers
        assert len(rows) == 1

    def test_passcheck_download_no_gameday_found(self):
        self.client.force_login(UserFactory(is_staff=True))
        resp = self.client.get(
            reverse(MATCHREPORT_GAMEDAY_PASSCHECK_DOWNLOAD, kwargs={"pk": 0})
        )
        assert resp.status_code == HTTPStatus.NOT_FOUND
