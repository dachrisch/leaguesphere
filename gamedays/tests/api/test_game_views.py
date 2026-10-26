import json
import pathlib
import re
from datetime import timedelta
from http import HTTPStatus

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django_webtest import WebTest
from rest_framework.reverse import reverse
from rest_framework.test import APITestCase

from gamedays.api.game_views import GamesToWhistleAPIView
from gamedays.constants import (
    API_GAMELOG,
    API_CONFIG_SCORECARD_PENALTIES,
    API_GAME_POSSESSION,
    API_GAME_FINALIZE,
    API_GAME_HALFTIME,
    API_GAME_OFFICIALS,
    API_GAME_SETUP,
    API_GAMEDAY_WHISTLEGAMES,
)
from gamedays.models import Gameinfo, Gameresult, GameOfficial, GameSetup, TeamLog, Team
from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import PersonFactory
from passcheck.models import PasscheckVerification
from passcheck.tests.setup_factories.factories_passcheck import (
    PlayerFactory,
    PlayerlistFactory,
    PlayerlistGamedayFactory,
)


class TestRetrieveUpdateOfficials(WebTest):

    def test_create_officials(self):
        DBSetup().g62_status_empty()
        last_game = Gameinfo.objects.last()
        assert len(GameOfficial.objects.all()) == 0
        response = self.app.put_json(
            reverse(API_GAME_OFFICIALS, kwargs={"pk": last_game.pk}),
            [
                {"name": "Saskia", "position": "referee"},
                {"name": "Franz", "position": "side jude"},
            ],
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.OK
        assert len(GameOfficial.objects.all()) == 2

    def test_officials_will_be_updated(self):
        DBSetup().g62_status_empty()
        last_game = Gameinfo.objects.last()
        DBSetup().create_game_officials(last_game)
        assert len(GameOfficial.objects.all()) == 5
        response = self.app.put_json(
            reverse(API_GAME_OFFICIALS, kwargs={"pk": last_game.pk}),
            [
                {"name": "Saskia", "position": "Referee"},
                {"name": "Franz", "position": "Side Judge"},
            ],
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.OK
        assert len(GameOfficial.objects.all()) == 5

    def test_officials_get(self):
        DBSetup().g62_status_empty()
        last_game = Gameinfo.objects.last()
        DBSetup().create_game_officials(last_game)
        response = self.app.get(
            reverse(API_GAME_OFFICIALS, kwargs={"pk": last_game.pk})
        )
        assert response.status_code == HTTPStatus.OK
        assert len(response.json) == 5


class TestGameSetup(WebTest):

    def test_game_setup_create(self):
        DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.last()
        gamesetup = {
            "ctResult": "won",
            "direction": "arrow_forward",
            "fhPossession": "HOME",
        }
        assert len(GameSetup.objects.all()) == 0
        response = self.app.put_json(
            reverse(API_GAME_SETUP, kwargs={"pk": first_game.pk}),
            gamesetup,
            headers=DBSetup().get_token_header(),
        )
        assert len(GameSetup.objects.all()) == 1
        assert response.status_code == HTTPStatus.OK
        assert response.json == gamesetup
        first_game: Gameinfo = Gameinfo.objects.last()
        assert first_game.status == "1. Halbzeit"

    def test_game_setup_update(self):
        DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.last()
        first_game.status = "2. Halbzeit"
        first_game.gameStarted = "11:00"
        first_game.save()
        DBSetup().create_gamesetup(first_game)

        gamesetup = {
            "ctResult": "won",
            "direction": "arrow_forward",
            "fhPossession": "HOME",
        }
        assert len(GameSetup.objects.all()) == 1
        response = self.app.put_json(
            reverse(API_GAME_SETUP, kwargs={"pk": first_game.pk}),
            gamesetup,
            headers=DBSetup().get_token_header(),
        )
        assert len(GameSetup.objects.all()) == 1
        assert response.status_code == HTTPStatus.OK
        assert response.json == gamesetup
        first_game: Gameinfo = Gameinfo.objects.last()
        assert first_game.status == "2. Halbzeit"
        assert str(first_game.gameStarted) == "11:00:00"

    def test_invalid_setup_payload_does_not_create_a_row(self):
        DBSetup().g62_status_empty()
        game = Gameinfo.objects.last()
        response = self.app.put_json(
            reverse(API_GAME_SETUP, kwargs={"pk": game.pk}),
            {
                "ctResult": "x" * 101,
                "direction": "Ost",
                "fhPossession": "home",
            },
            headers=DBSetup().get_token_header(),
            status=HTTPStatus.BAD_REQUEST,
        )
        assert response.status_code == HTTPStatus.BAD_REQUEST
        assert not GameSetup.objects.filter(gameinfo=game).exists()
        assert Gameinfo.objects.get(pk=game.pk).status != "1. Halbzeit"

    def test_rejected_start_leaves_no_setup_row(self):
        DBSetup().g62_status_empty()
        game = Gameinfo.objects.last()
        game.status = "1. Halbzeit"
        game.save()
        assert not GameSetup.objects.filter(gameinfo=game).exists()

        response = self.app.put_json(
            reverse(API_GAME_SETUP, kwargs={"pk": game.pk}),
            {
                "ctResult": "won",
                "direction": "arrow_forward",
                "fhPossession": "HOME",
            },
            headers=DBSetup().get_token_header(),
            status=HTTPStatus.CONFLICT,
        )

        assert response.status_code == HTTPStatus.CONFLICT
        assert response.json["detail"] == "Dieser Spielstatus erlaubt keinen Spielstart."
        assert not GameSetup.objects.filter(gameinfo=game).exists()

    def test_game_setup_get(self):
        DBSetup().g62_status_empty()
        last_game = Gameinfo.objects.last()
        DBSetup().create_gamesetup(last_game)
        response = self.app.get(reverse(API_GAME_SETUP, kwargs={"pk": last_game.pk}))
        assert response.status_code == HTTPStatus.OK
        assert response.json == {
            "ctResult": "won",
            "direction": "arrow_forward",
            "fhPossession": "AWAY",
        }

    def test_game_setup_not_found_(self):
        response = self.app.get(reverse(API_GAME_SETUP, kwargs={"pk": 666}))
        assert response.status_code == HTTPStatus.OK
        assert response.json == {}


class TestGameLog(WebTest):
    @staticmethod
    def without_time(value):
        if isinstance(value, dict):
            return {
                key: TestGameLog.without_time(item)
                for key, item in value.items()
                if key != "time"
            }
        if isinstance(value, list):
            return [TestGameLog.without_time(item) for item in value]
        return value

    def test_game_not_found_exception(self):
        response = self.app.get(
            reverse(API_GAMELOG, kwargs={"id": 666}), expect_errors=True
        )
        assert response.status_code == HTTPStatus.NOT_FOUND

    def test_get_team_log(self):
        gameinfo = DBSetup().create_teamlog_home_and_away()
        response = self.app.get(reverse(API_GAMELOG, kwargs={"id": gameinfo.pk}))
        assert response.status_code == HTTPStatus.OK
        with open(
            pathlib.Path(__file__).parent / "../service/testdata/teamlog.json"
        ) as f:
            expected_gamelog = json.load(f)
        expected_gamelog["gameId"] = gameinfo.pk
        expected_gamelog["home"]["id"] = Gameresult.objects.get(
            gameinfo=gameinfo, isHome=True
        ).team_id
        expected_gamelog["away"]["id"] = Gameresult.objects.get(
            gameinfo=gameinfo, isHome=False
        ).team_id
        assert self.without_time(response.json) == expected_gamelog
        for side in ("home", "away"):
            for half in ("firsthalf", "secondhalf"):
                for entry in response.json[side][half]["entries"]:
                    assert entry["time"].endswith("+00:00")

    def test_post_team_log(self):
        DBSetup().g62_status_empty()
        another_user = DBSetup().create_new_user()
        first_game = Gameinfo.objects.first()
        response = self.app.post_json(
            reverse(API_GAMELOG, kwargs={"id": first_game.pk}),
            {
                "team": "A1",
                "gameId": first_game.pk,
                "half": 1,
                "event": [
                    {"name": "Touchdown", "player": "19"},
                    {"name": "1-Extra-Punkt", "player": "7"},
                ],
            },
            headers=DBSetup().get_token_header(another_user),
        )
        assert response.status_code == HTTPStatus.CREATED
        assert TeamLog.objects.first().author == another_user
        assert response.json == {
            "away": {
                "id": Team.objects.get(name="A2").pk,
                "firsthalf": {"entries": [], "score": 0},
                "name": "A2",
                "score": 0,
                "secondhalf": {"entries": [], "score": 0},
            },
            "gameId": first_game.pk,
            "home": {
                "id": Team.objects.get(name="A1").pk,
                "firsthalf": {
                    "entries": [{"pat1": 7, "sequence": 1, "td": 19}],
                    "score": 7,
                },
                "name": "A1",
                "score": 7,
                "secondhalf": {"entries": [], "score": 0},
            },
            "isFirstHalf": True,
        }

    def test_post_team_log_with_empty_pat(self):
        DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.first()
        response = self.app.post_json(
            reverse(API_GAMELOG, kwargs={"id": first_game.pk}),
            {
                "team": "A1",
                "gameId": first_game.pk,
                "half": 1,
                "event": [
                    {"name": "Touchdown", "player": "19"},
                    {"name": "1-Extra-Punkt", "player": ""},
                ],
            },
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.CREATED
        assert response.json == {
            "gameId": first_game.pk,
            "away": {
                "id": Team.objects.get(name="A2").pk,
                "name": "A2",
                "score": 0,
                "firsthalf": {"entries": [], "score": 0},
                "secondhalf": {"entries": [], "score": 0},
            },
            "home": {
                "id": Team.objects.get(name="A1").pk,
                "name": "A1",
                "score": 6,
                "firsthalf": {
                    "score": 6,
                    "entries": [{"pat1": None, "sequence": 1, "td": 19}],
                },
                "secondhalf": {"entries": [], "score": 0},
            },
            "isFirstHalf": True,
        }

    def test_post_team_log_rejects_string_event(self):
        DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.first()
        response = self.app.post_json(
            reverse(API_GAMELOG, kwargs={"id": first_game.pk}),
            {
                "team": "A1",
                "gameId": first_game.pk,
                "half": 1,
                "event": "NotARealEventXYZ",
            },
            headers=DBSetup().get_token_header(),
            expect_errors=True,
        )
        assert response.status_code == HTTPStatus.BAD_REQUEST

    def test_post_team_log_rejects_invalid_half(self):
        DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.first()
        response = self.app.post_json(
            reverse(API_GAMELOG, kwargs={"id": first_game.pk}),
            {
                "team": "A1",
                "gameId": first_game.pk,
                "half": "XX",
                "event": [{"name": "Touchdown", "player": "19"}],
            },
            headers=DBSetup().get_token_header(),
            expect_errors=True,
        )
        assert response.status_code == HTTPStatus.BAD_REQUEST

    def test_post_team_log_rejects_entry_without_name(self):
        DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.first()
        response = self.app.post_json(
            reverse(API_GAMELOG, kwargs={"id": first_game.pk}),
            {
                "team": "A1",
                "gameId": first_game.pk,
                "half": 1,
                "event": [{"player": "19"}],
            },
            headers=DBSetup().get_token_header(),
            expect_errors=True,
        )
        assert response.status_code == HTTPStatus.BAD_REQUEST

    def test_post_team_log_change_of_possession(self):
        DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.first()
        response = self.app.post_json(
            reverse(API_GAMELOG, kwargs={"id": first_game.pk}),
            {
                "team": "A1",
                "gameId": first_game.pk,
                "half": 1,
                "event": [{"name": "Turnover"}],
            },
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.CREATED
        assert response.json == {
            "gameId": first_game.pk,
            "isFirstHalf": True,
            "home": {
                "id": Team.objects.get(name="A1").pk,
                "name": "A1",
                "score": 0,
                "firsthalf": {
                    "score": 0,
                    "entries": [{"sequence": 1, "cop": True, "name": "Turnover"}],
                },
                "secondhalf": {"score": 0, "entries": []},
            },
            "away": {
                "id": Team.objects.get(name="A2").pk,
                "name": "A2",
                "score": 0,
                "firsthalf": {"score": 0, "entries": []},
                "secondhalf": {"score": 0, "entries": []},
            },
        }

    def test_post_team_log_updates_score(self):
        DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.first()
        # Start unscored: fixture scores without gamelog entries are kept (#1988).
        Gameresult.objects.filter(gameinfo=first_game).update(fh=None, sh=None, pa=None)
        response = self.app.post_json(
            reverse(API_GAMELOG, kwargs={"id": first_game.pk}),
            {
                "team": "A1",
                "gameId": first_game.pk,
                "half": 1,
                "event": [
                    {"name": "Touchdown", "player": "19"},
                    {"name": "2-Extra-Punkte", "player": "7"},
                ],
            },
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.CREATED
        home: Gameresult = Gameresult.objects.get(gameinfo=first_game, isHome=True)
        away: Gameresult = Gameresult.objects.get(gameinfo=first_game, isHome=False)
        assert home.fh == 8
        assert away.fh == 0

    def test_score_is_updated_with_multiple_entries(self):
        DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.first()
        # Start unscored: fixture scores without gamelog entries are kept (#1988).
        Gameresult.objects.filter(gameinfo=first_game).update(fh=None, sh=None, pa=None)
        self.app.post_json(
            reverse(API_GAMELOG, kwargs={"id": first_game.pk}),
            {
                "team": "A1",
                "gameId": first_game.pk,
                "half": 1,
                "event": [
                    {"name": "Touchdown", "player": "19"},
                    {"name": "1-Extra-Punkt", "player": "7"},
                ],
            },
            headers=DBSetup().get_token_header(),
        )
        self.app.post_json(
            reverse(API_GAMELOG, kwargs={"id": first_game.pk}),
            {
                "team": "A1",
                "gameId": first_game.pk,
                "half": 1,
                "event": [
                    {"name": "Touchdown", "player": "19"},
                    {"name": "Safety (+2)", "player": "7"},
                ],
            },
            headers=DBSetup().get_token_header(),
        )
        self.app.post_json(
            reverse(API_GAMELOG, kwargs={"id": first_game.pk}),
            {
                "team": "A2",
                "gameId": first_game.pk,
                "half": 2,
                "event": [
                    {"name": "Touchdown", "player": "19"},
                    {"name": "2-Extra-Punkte", "player": ""},
                ],
            },
            headers=DBSetup().get_token_header(),
        )
        self.app.post_json(
            reverse(API_GAMELOG, kwargs={"id": first_game.pk}),
            {
                "team": "A2",
                "gameId": first_game.pk,
                "half": 2,
                "event": [{"name": "Turnover"}],
            },
            headers=DBSetup().get_token_header(),
        )
        home: Gameresult = Gameresult.objects.get(gameinfo=first_game, isHome=True)
        away: Gameresult = Gameresult.objects.get(gameinfo=first_game, isHome=False)
        assert home.fh == 15
        assert home.sh == 0
        assert away.fh == 0
        assert away.sh == 6

    def test_team_log_entry_is_deleted(self):
        gameinfo = DBSetup().create_teamlog_home_and_away()
        response = self.app.delete_json(
            reverse(API_GAMELOG, kwargs={"id": gameinfo.pk}),
            {"sequence": 2},
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.OK
        json_response = response.json
        assert json_response["home"]["score"] == 34
        assert json_response["home"]["firsthalf"]["entries"][1]["isDeleted"]

    def test_delete_team_log_denied_for_anonymous(self):
        gameinfo = DBSetup().create_teamlog_home_and_away()
        response = self.app.delete_json(
            reverse(API_GAMELOG, kwargs={"id": gameinfo.pk}),
            {"sequence": 2},
            expect_errors=True,
        )
        assert response.status_code == HTTPStatus.UNAUTHORIZED
        assert not TeamLog.objects.filter(
            gameinfo=gameinfo, sequence=2, isDeleted=True
        ).exists()

    def test_delete_team_log_denied_for_unrelated_user(self):
        gameinfo = DBSetup().create_teamlog_home_and_away()
        unrelated = DBSetup().create_new_user(username="unrelated", is_staff=False)
        response = self.app.delete_json(
            reverse(API_GAMELOG, kwargs={"id": gameinfo.pk}),
            {"sequence": 2},
            headers=DBSetup().get_token_header(unrelated),
            expect_errors=True,
        )
        assert response.status_code == HTTPStatus.FORBIDDEN
        assert not TeamLog.objects.filter(
            gameinfo=gameinfo, sequence=2, isDeleted=True
        ).exists()

    def test_delete_team_log_allowed_for_entry_author(self):
        DBSetup().g62_status_empty()
        logger = DBSetup().create_new_user(username="logger", is_staff=False)
        first_game = Gameinfo.objects.first()
        self.app.post_json(
            reverse(API_GAMELOG, kwargs={"id": first_game.pk}),
            {
                "team": "A1",
                "gameId": first_game.pk,
                "half": 1,
                "event": [
                    {"name": "Touchdown", "player": "19"},
                    {"name": "1-Extra-Punkt", "player": "7"},
                ],
            },
            headers=DBSetup().get_token_header(logger),
        )
        response = self.app.delete_json(
            reverse(API_GAMELOG, kwargs={"id": first_game.pk}),
            {"sequence": 1},
            headers=DBSetup().get_token_header(logger),
        )
        assert response.status_code == HTTPStatus.OK
        assert TeamLog.objects.filter(
            gameinfo=first_game, sequence=1, isDeleted=True
        ).exists()


class TestManualScoreSurvivesGamelogWrites(WebTest):
    """Regression for #1988: a score entered in the designer results editor
    (no gamelog entries) was wiped by the next scorecard gamelog write."""

    def _enter_manual_score(self, game, halftime, final):
        response = self.app.patch_json(
            reverse("api-gamedays-game-result", kwargs={"pk": game.pk}),
            {"halftime_score": halftime, "final_score": final},
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.OK

    def _post_touchdown(self, game, team):
        response = self.app.post_json(
            reverse(API_GAMELOG, kwargs={"id": game.pk}),
            {
                "team": team,
                "gameId": game.pk,
                "half": 1,
                "event": [
                    {"name": "Touchdown", "player": "19"},
                    {"name": "1-Extra-Punkt", "player": "7"},
                ],
            },
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.CREATED

    def _delete_sequence(self, game, sequence):
        response = self.app.delete_json(
            reverse(API_GAMELOG, kwargs={"id": game.pk}),
            {"sequence": sequence},
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.OK

    def _scores(self, game):
        home = Gameresult.objects.get(gameinfo=game, isHome=True)
        away = Gameresult.objects.get(gameinfo=game, isHome=False)
        return (home.fh, home.sh, home.pa), (away.fh, away.sh, away.pa)

    def test_manual_score_survives_gamelog_add_and_delete(self):
        DBSetup().g62_status_empty()
        game = Gameinfo.objects.first()
        self._enter_manual_score(
            game, {"home": 14, "away": 7}, {"home": 28, "away": 14}
        )

        self._post_touchdown(game, "A1")
        assert self._scores(game) == ((21, 14, 14), (7, 7, 35))

        self._delete_sequence(game, 1)
        assert self._scores(game) == ((14, 14, 14), (7, 7, 28))

    def test_manual_score_survives_deleting_earlier_gamelog_entry(self):
        DBSetup().g62_status_empty()
        game = Gameinfo.objects.first()
        self._post_touchdown(game, "A1")
        self._enter_manual_score(
            game, {"home": 21, "away": 7}, {"home": 35, "away": 14}
        )

        self._delete_sequence(game, 1)
        assert self._scores(game) == ((14, 14, 14), (7, 7, 28))

    def test_repeated_delete_does_not_change_score_again(self):
        DBSetup().g62_status_empty()
        game = Gameinfo.objects.first()
        self._enter_manual_score(
            game, {"home": 14, "away": 7}, {"home": 28, "away": 14}
        )
        self._post_touchdown(game, "A1")

        self._delete_sequence(game, 1)
        self._delete_sequence(game, 1)
        assert self._scores(game) == ((14, 14, 14), (7, 7, 28))


class TestGameHalftime(WebTest):
    def test_halftime_submitted(self):
        DBSetup().g62_status_empty()
        first_game: Gameinfo = Gameinfo.objects.first()
        self.app.put_json(
            reverse(API_GAME_SETUP, kwargs={"pk": first_game.pk}),
            {"ctResult": "won", "direction": "arrow_forward", "fhPossession": "HOME"},
            headers=DBSetup().get_token_header(),
        )
        response = self.app.put_json(
            reverse(API_GAME_HALFTIME, kwargs={"pk": first_game.pk}),
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.OK
        first_game = Gameinfo.objects.first()
        assert first_game.status == "2. Halbzeit"
        assert re.match(r"^(0\d|1\d|2[0-3]):[0-5]\d", str(first_game.gameHalftime))

    def test_halftime_unknown_game_404(self):
        DBSetup().create_new_user()
        response = self.app.put_json(
            reverse(API_GAME_HALFTIME, kwargs={"pk": 999999}),
            headers=DBSetup().get_token_header(),
            expect_errors=True,
        )
        assert response.status_code == HTTPStatus.NOT_FOUND

    def test_halftime_requires_started_game(self):
        DBSetup().g62_status_empty()
        first_game: Gameinfo = Gameinfo.objects.first()
        assert first_game.status == "Geplant"
        response = self.app.put_json(
            reverse(API_GAME_HALFTIME, kwargs={"pk": first_game.pk}),
            headers=DBSetup().get_token_header(),
            expect_errors=True,
        )
        assert response.status_code == HTTPStatus.CONFLICT
        assert response.json == {"detail": "Dieser Spielstatus erlaubt keine Halbzeit."}
        assert Gameinfo.objects.first().status == "Geplant"

    def test_halftime_after_finalize_conflict(self):
        DBSetup().g62_status_empty()
        first_game: Gameinfo = Gameinfo.objects.first()
        first_game.status = "beendet"
        first_game.save()
        response = self.app.put_json(
            reverse(API_GAME_HALFTIME, kwargs={"pk": first_game.pk}),
            headers=DBSetup().get_token_header(),
            expect_errors=True,
        )
        assert response.status_code == HTTPStatus.CONFLICT
        assert response.json == {"detail": "Dieser Spielstatus erlaubt keine Halbzeit."}
        assert Gameinfo.objects.first().status == "beendet"


class TestGameFinalize(WebTest):
    def test_game_is_finalized(self):
        DBSetup().g62_status_empty()
        first_game: Gameinfo = Gameinfo.objects.last()
        self.app.put_json(
            reverse(API_GAME_SETUP, kwargs={"pk": first_game.pk}),
            {"ctResult": "won", "direction": "arrow_forward", "fhPossession": "AWAY"},
            headers=DBSetup().get_token_header(),
        )
        self.app.put_json(
            reverse(API_GAME_HALFTIME, kwargs={"pk": first_game.pk}),
            headers=DBSetup().get_token_header(),
        )
        response = self.app.put_json(
            reverse(API_GAME_FINALIZE, kwargs={"pk": first_game.pk}),
            {
                "homeCaptain": "Home Captain",
                "awayCaptain": "Away Captain",
                "note": "some final note",
                "hasFinalScoreChanged": True,
            },
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.OK
        gamesetup = GameSetup.objects.get(gameinfo=first_game)
        assert gamesetup.homeCaptain == "Home Captain"
        assert gamesetup.awayCaptain == "Away Captain"
        assert gamesetup.hasFinalScoreChanged is True
        assert gamesetup.note == "some final note"
        first_game: Gameinfo = Gameinfo.objects.last()
        assert first_game.status == "beendet"
        assert re.match(r"^(0\d|1\d|2[0-3]):[0-5]\d", str(first_game.gameFinished))

    def test_finalize_unknown_game_404(self):
        DBSetup().create_new_user()
        response = self.app.put_json(
            reverse(API_GAME_FINALIZE, kwargs={"pk": 999999}),
            {"note": "x"},
            headers=DBSetup().get_token_header(),
            expect_errors=True,
        )
        assert response.status_code == HTTPStatus.NOT_FOUND

    def test_finalize_requires_started_game(self):
        DBSetup().g62_status_empty()
        first_game: Gameinfo = Gameinfo.objects.first()
        assert first_game.status == "Geplant"
        response = self.app.put_json(
            reverse(API_GAME_FINALIZE, kwargs={"pk": first_game.pk}),
            {"note": "x"},
            headers=DBSetup().get_token_header(),
            expect_errors=True,
        )
        assert response.status_code == HTTPStatus.CONFLICT
        assert response.json == {"detail": "Dieser Spielstatus erlaubt kein Spielende."}
        assert Gameinfo.objects.first().status == "Geplant"

    def test_finalize_allowed_from_first_half(self):
        DBSetup().g62_status_empty()
        first_game: Gameinfo = Gameinfo.objects.first()
        self.app.put_json(
            reverse(API_GAME_SETUP, kwargs={"pk": first_game.pk}),
            {"ctResult": "won", "direction": "arrow_forward", "fhPossession": "HOME"},
            headers=DBSetup().get_token_header(),
        )
        assert Gameinfo.objects.first().status == "1. Halbzeit"
        response = self.app.put_json(
            reverse(API_GAME_FINALIZE, kwargs={"pk": first_game.pk}),
            {"note": "x"},
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.OK
        assert Gameinfo.objects.first().status == "beendet"


class TestGamesToWhistlePasscheck(WebTest):
    """The whistle rows carry the passcheck state the v2 game list renders.

    ``PasscheckVerification`` is one row per team per gameday; a game counts as
    verified only when *both* of its teams are. The trap: ``id_home``/``id_away``
    in the whistle payload are ``Gameresult`` pks, not ``Team`` pks.
    """

    def setUp(self):
        self.gameday = DBSetup().g62_status_empty()
        # Pick a game whose home team was created *after* the away team: a
        # team-pk sort would put away first, so the test really pins the
        # requested home-first, jersey-ordered output.
        self.game = next(
            game
            for game in Gameinfo.objects.filter(gameday=self.gameday)
            if game.gameresult_set.get(isHome=True).team_id
            > game.gameresult_set.get(isHome=False).team_id
        )
        self.home_result = Gameresult.objects.get(gameinfo=self.game, isHome=True)
        self.away_result = Gameresult.objects.get(gameinfo=self.game, isHome=False)
        self.home = self.home_result.team
        self.away = self.away_result.team
        # The test only discriminates while a Gameresult pk differs from its
        # Team pk — equal values would let a team-pk comparison pass by luck.
        assert str(self.home_result.pk) != str(self.home_result.team_id)
        assert str(self.away_result.pk) != str(self.away_result.team_id)

    def _whistle_rows(self):
        response = self.app.get(
            reverse(
                API_GAMEDAY_WHISTLEGAMES,
                kwargs={"pk": self.gameday.pk, "team": "*"},
            ),
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.OK
        return response.json

    def test_games_to_whistle_reports_passcheck_state(self):
        rows = self._whistle_rows()

        assert rows
        assert all(row["passcheck"] is False for row in rows)
        assert [row["id"] for row in rows].count(self.game.pk) == 1

    def test_games_to_whistle_passcheck_is_true_for_two_verified_teams(self):
        for team in (self.home, self.away):
            PasscheckVerification.objects.create(
                gameday=self.gameday,
                team=team,
                official_name="Kontrolle",
                user=self.gameday.author,
            )

        rows = {row["id"]: row for row in self._whistle_rows()}

        assert rows[self.game.pk]["passcheck"] is True
        assert [game_id for game_id, row in rows.items() if row["passcheck"]] == [
            self.game.pk
        ]

    def test_games_to_whistle_passcheck_ignores_other_gamedays(self):
        # Same two teams verified for *another* gameday: this gameday's game
        # must stay unverified, so the flag has to be scoped by gameday.
        other_gameday = DBSetup().create_empty_gameday()
        for team in (self.home, self.away):
            PasscheckVerification.objects.create(
                gameday=other_gameday,
                team=team,
                official_name="Kontrolle",
                user=self.gameday.author,
            )

        rows = {row["id"]: row for row in self._whistle_rows()}

        assert rows[self.game.pk]["passcheck"] is False

    def test_games_to_whistle_reports_false_for_a_bracket_placeholder(self):
        placeholder = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled="09:00",
            field=1,
            stage="Finalrunde",
            standing="P5",
            officials=Team.objects.first(),
        )
        Gameresult.objects.create(gameinfo=placeholder, team=None, isHome=True)
        Gameresult.objects.create(gameinfo=placeholder, team=None, isHome=False)

        rows = {row["id"]: row for row in self._whistle_rows()}

        assert rows[placeholder.pk]["passcheck"] is False

    def test_passcheck_annotation_costs_two_queries(self):
        games = [
            {
                "id": self.game.pk,
                "id_home": str(self.home_result.pk),
                "id_away": str(self.away_result.pk),
            }
        ]

        with CaptureQueriesContext(connection) as queries:
            GamesToWhistleAPIView._annotate_passcheck(games, self.gameday.pk)

        assert len(queries.captured_queries) == 2
        assert games[0]["passcheck"] is False


class TestGameRosterAPIView(APITestCase):
    def setUp(self):
        self.gameday = DBSetup().g62_status_empty()
        # Home team created *after* the away team, so only an explicit
        # home-first sort produces the expected order (see the roster test).
        self.game = next(
            game
            for game in Gameinfo.objects.filter(gameday=self.gameday)
            if game.gameresult_set.get(isHome=True).team_id
            > game.gameresult_set.get(isHome=False).team_id
        )
        self.home = Gameresult.objects.get(gameinfo=self.game, isHome=True).team
        self.away = Gameresult.objects.get(gameinfo=self.game, isHome=False).team
        self.client.force_authenticate(user=self.gameday.author)

    def _add_player(
        self,
        team,
        jersey,
        last_name,
        *,
        first_name="Test",
        gameday=None,
        left_on=None,
        joined_on=None,
    ):
        playerlist = PlayerlistFactory(
            team=team,
            player=PlayerFactory(
                person=PersonFactory(first_name=first_name, last_name=last_name),
                pass_number="12345",
            ),
            jersey_number=jersey,
            left_on=left_on,
            joined_on=joined_on or self.gameday.date,
        )
        PlayerlistGamedayFactory(
            playerlist=playerlist,
            gameday=gameday or self.gameday,
            gameday_jersey=jersey,
        )

    def _roster(self, game):
        return self.client.get(reverse("api-game-roster", kwargs={"pk": game.pk}))

    def _placeholder_game(self):
        placeholder = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled="09:00",
            field=1,
            stage="Finalrunde",
            standing="P5",
            officials=Team.objects.first(),
        )
        Gameresult.objects.create(gameinfo=placeholder, team=None, isHome=True)
        Gameresult.objects.create(gameinfo=placeholder, team=None, isHome=False)
        return placeholder

    def test_game_roster_lists_only_active_players_of_this_game(self):
        self._add_player(self.home, 7, "Muster")
        self._add_player(self.home, 9, "", first_name="NurVorname")
        self._add_player(self.away, 11, "Testmann")

        # Left before the gameday: snapshotted, but no longer eligible.
        self._add_player(
            self.home,
            12,
            "Ehemalig",
            left_on=self.gameday.date - timedelta(days=1),
        )
        # Active, but on a team that does not play this game.
        other_team_id = (
            Gameresult.objects.filter(
                gameinfo__gameday=self.gameday, team__isnull=False
            )
            .exclude(team_id__in=[self.home.pk, self.away.pk])
            .values_list("team_id", flat=True)
            .first()
        )
        self._add_player(Team.objects.get(pk=other_team_id), 13, "Fremdteam")
        # A home player snapshotted for a different gameday only.
        self._add_player(
            self.home,
            14,
            "AndererTag",
            gameday=DBSetup().create_empty_gameday(),
        )
        # Joined after the gameday: not yet eligible.
        self._add_player(
            self.home,
            15,
            "Zukunft",
            joined_on=self.gameday.date + timedelta(days=1),
        )

        response = self._roster(self.game)

        assert response.status_code == HTTPStatus.OK
        assert response.data == [
            {"side": "home", "jersey": 7, "name": "Muster"},
            {"side": "home", "jersey": 9, "name": "NurVorname"},
            {"side": "away", "jersey": 11, "name": "Testmann"},
        ]
        # Home first, then by jersey — no sorting in the test that could hide
        # a regression in the server-side order.
        assert [row["side"] for row in response.data] == ["home", "home", "away"]
        # Jersey and surname only — the pass number never leaves the server.
        assert all(set(row) == {"side", "jersey", "name"} for row in response.data)
        assert "12345" not in response.text

    def test_game_roster_name_falls_back_to_first_name_then_null(self):
        self._add_player(self.home, 7, "", first_name="")
        self._add_player(self.home, 9, "", first_name="NurVorname")

        response = self._roster(self.game)

        assert response.data == [
            {"side": "home", "jersey": 7, "name": None},
            {"side": "home", "jersey": 9, "name": "NurVorname"},
        ]

    def test_game_roster_query_count_is_flat(self):
        url = reverse("api-game-roster", kwargs={"pk": self.game.pk})

        with self.assertNumQueries(3):
            response = self.client.get(url)
        assert response.status_code == HTTPStatus.OK

        for jersey in range(1, 41):
            self._add_player(self.home, jersey, f"Spieler{jersey}")

        with self.assertNumQueries(3):
            response = self.client.get(url)
        assert len(response.data) == 40

    def test_game_roster_is_empty_for_a_bracket_placeholder(self):
        # A roster exists for a real team of the gameday; the placeholder game
        # still has to answer empty instead of dumping every player of the day.
        self._add_player(self.home, 7, "Muster")

        response = self._roster(self._placeholder_game())

        assert response.status_code == HTTPStatus.OK
        assert response.data == []

    def test_game_roster_requires_authentication(self):
        self.client.force_authenticate(user=None)

        response = self._roster(self.game)

        assert response.status_code == HTTPStatus.UNAUTHORIZED


class TestConfigPenaltiesAPIView(WebTest):
    def test_get_penalty_list(self):
        response = self.app.get(reverse(API_CONFIG_SCORECARD_PENALTIES))
        assert response.status_code == HTTPStatus.OK
        assert len(response.json) >= 1


class TestGamePossessionAPIView(WebTest):
    def test_put_game_possession(self):
        DBSetup().g62_status_empty()
        last_game: Gameinfo = Gameinfo.objects.last()
        assert last_game.in_possession == "A1"
        response = self.app.put_json(
            reverse(API_GAME_POSSESSION, kwargs={"pk": last_game.pk}),
            {"team": "B1"},
            headers=DBSetup().get_token_header(),
        )
        assert response.status_code == HTTPStatus.OK
        assert Gameinfo.objects.last().in_possession == "B1"

    def test_possession_unknown_game_404(self):
        DBSetup().create_new_user()
        response = self.app.put_json(
            reverse(API_GAME_POSSESSION, kwargs={"pk": 999999}),
            {"team": "A1"},
            headers=DBSetup().get_token_header(),
            expect_errors=True,
        )
        assert response.status_code == HTTPStatus.NOT_FOUND

    def test_put_game_possession_rejects_unknown_team(self):
        DBSetup().g62_status_empty()
        last_game: Gameinfo = Gameinfo.objects.last()
        response = self.app.put_json(
            reverse(API_GAME_POSSESSION, kwargs={"pk": last_game.pk}),
            {"team": "Not A Real Team XYZ"},
            headers=DBSetup().get_token_header(),
            expect_errors=True,
        )
        assert response.status_code == HTTPStatus.BAD_REQUEST
        assert Gameinfo.objects.last().in_possession == "A1"
