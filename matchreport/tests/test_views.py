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
    UserFactory,
)

from matchreport.constants import (
    MATCHREPORT_GAMEDAY_DETAIL,
    MATCHREPORT_GAMEDAY_PASSCHECK_DOWNLOAD,
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
