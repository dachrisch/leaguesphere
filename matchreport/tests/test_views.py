from http import HTTPStatus
from unittest.mock import patch

import pytest
from django.contrib.auth.models import User
from django.test import TestCase
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
from gamedays.models import Gameday, League, Gameinfo, TeamLog, Gameresult, GameSetup
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

from matchreport.constants import MATCHREPORT_GAMEDAY_DETAIL


class TestMatchreportGamedayDetailPermissions(WebTest):

    def test_matchreport_as_normal_user(self):
        gameday = DBSetup().g62_with_tiebreak_finished()
        resp = self.client.get(
            reverse(
                MATCHREPORT_GAMEDAY_DETAIL,
                kwargs={
                    "pk": gameday.pk
                }
            )
        )

        assert resp.status_code == HTTPStatus.FOUND
        assert f"/login/?next=/matchreport/gameday/{gameday.pk}" in resp.url


    def test_matchreport_as_staff(self):
        gameday = DBSetup().g62_with_tiebreak_finished()
        self.app.set_user(UserFactory(is_staff=True))
        resp = self.app.get(
            reverse(
                MATCHREPORT_GAMEDAY_DETAIL,
                kwargs={
                    "pk": gameday.pk
                }
            )
        )

        assert resp.status_code == HTTPStatus.OK

class TestMatchreportGamedayDetailView(TestCase):

    def test_matchreport_no_passchecks(self):
        gameday = DBSetup().g62_with_tiebreak_finished()
        num_games = len(gameday.gameinfo_set.all())
        self.client.force_login(UserFactory(is_staff=True))
        resp = self.client.get(
            reverse(
                MATCHREPORT_GAMEDAY_DETAIL,
                kwargs={
                    "pk": gameday.pk
                }
            )
        )

        assert resp.status_code == HTTPStatus.OK
        context = resp.context_data
        assert context["info"]["passcheck_info_table"] == "<p>An diesem Spieltag gab es keine Passchecks</p>"
        assert len(context["info"]["passcheck_player_data"]) == 0
        assert len(context["info"]["gameday_match_reports"]) == num_games
        assert len(context["info"]["officials"]) == 0

    def test_matchreport_no_gameday_found(self):
        self.client.force_login(UserFactory(is_staff=True))
        resp = self.client.get(
            reverse(
                MATCHREPORT_GAMEDAY_DETAIL,
                kwargs={
                    "pk": 0
                }
            )
        )
        assert resp.status_code == HTTPStatus.NOT_FOUND
