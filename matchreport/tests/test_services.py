from http import HTTPStatus

from django.urls import reverse

from django.contrib.auth.models import User
from django.test import TestCase

from gamedays.api.game_views import GameFinalizeUpdateView
from gamedays.api.serializers import GameFinalizer
from gamedays.constants import API_GAME_FINALIZE
from gamedays.models import Gameinfo, Team, GameSetup
from gamedays.tests.setup_factories.db_setup import DBSetup
from matchreport.service.matchreport_service import (
    MatchreportService,
    EmptyMatchReportService,
    EmptyPasscheckDetailsTable,
)
from passcheck.service.passcheck_service import PasscheckServicePlayers
from passcheck.tests.setup_factories.db_setup_passcheck import DbSetupPasscheck


class TestMatchreportService(TestCase):

    def test_matchreport_service_no_gameday_found(self):
        service = MatchreportService.create(00)
        self.assertIsInstance(service, EmptyMatchReportService)

        default_render_config = dict()

        self.assertEqual(
            service.get_staff_passcheck_details().to_html(),
            EmptyPasscheckDetailsTable().to_html(default_render_config),
        )
        self.assertEqual(
            len(
                service.get_passcheck_player_details(
                    render_config=default_render_config
                )
            ),
            0,
        )
        self.assertEqual(
            len(service.get_gameday_match_reports(render_config=default_render_config)),
            0,
        )

    def test_matchreport_service(self):
        gameday = DBSetup().g62_with_tiebreak_finished()

        all_games = list(gameday.gameinfo_set.all())

        last_game = all_games[-1]

        for game in all_games:

            final_note = ""

            if game.id == last_game.id:
                final_note = "Disqualifikation von #99 von Team A1"

            game_setup, _ = GameSetup.objects.get_or_create(gameinfo_id=game.id)
            serializer = GameFinalizer(
                instance=game_setup,
                data={
                    "homeCaptain": "Home Captain",
                    "awayCaptain": "Away Captain",
                    "note": final_note,
                    "hasFinalScoreChanged": True,
                },
            )
            self.assertTrue(serializer.is_valid())
            serializer.save()

        DBSetup().create_teamlog_flag(
            gameinfo=last_game,
            team=Team.objects.filter(name="A1").first(),
            player=99,
            half=1,
            input_value="Grob unsportliches Verhalten Offense",
        )

        psp = PasscheckServicePlayers()

        all_teams = Team.objects.exclude(name__in=["teamName", "officials"]).all()

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

        ms = MatchreportService.create(gameday.pk)

        staff_passcheck_details = ms.get_staff_passcheck_details()
        self.assertEqual(len(staff_passcheck_details), len(all_teams))

        passcheck_team_player_details = ms.get_passcheck_player_details(
            render_config=dict()
        )

        self.assertEqual(len(passcheck_team_player_details), len(all_teams))
        for team_description, data in passcheck_team_player_details.items():
            self.assertEqual(data.get("num_players", 0), 3)
            self.assertIsNotNone(data.get("player_table", None))

        gameday_match_reports = ms.get_gameday_match_reports(render_config=dict())

        self.assertEqual(len(gameday_match_reports), gameday.gameinfo_set.count())

        for game in gameday_match_reports:
            self.assertEqual(game.get("game_status"), Gameinfo.STATUS_COMPLETED)
            self.assertEqual(
                game.get("end_notes", {}).get("awayCaptain"), "Away Captain"
            )
            self.assertEqual(
                game.get("end_notes", {}).get("homeCaptain"), "Home Captain"
            )

            if game.get("gameinfo_id") == last_game.id:
                self.assertFalse(
                    "In diesem Spiel gab es keine Strafen" in game.get("flags")
                )
                self.assertTrue(
                    "Disqualifikation" in game.get("end_notes", {}).get("note")
                )
                self.assertEqual(game.get("num_flags"), 1)

            else:
                self.assertTrue(
                    "In diesem Spiel gab es keine Strafen" in game.get("flags")
                )
                self.assertEqual(game.get("end_notes", {}).get("note"), "")
                self.assertEqual(game.get("num_flags"), 0)

    def test_matchreport_service_passcheck_player_list(self):
        gameday = DBSetup().g62_with_tiebreak_finished()

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

        ms = MatchreportService.create(gameday.pk)
        player_list = ms.get_passcheck_player_list()

        expected_columns = list(
            {
                "Trikotnr.",
                "Spieler Team",
                "Passnummer",
                "Vorname",
                "Nachname",
                "Geburtsdatum",
                "Geschlecht",
            }
        )
        self.assertEqual(set(player_list.columns), set(expected_columns))
        self.assertEqual(len(player_list), 3 * len(all_teams))

    def test_matchreport_service_empty_passcheck_player_list(self):
        service = MatchreportService.create(0)
        player_list = service.get_passcheck_player_list()

        expected_columns = list(
            {
                "Trikotnr.",
                "Spieler Team",
                "Passnummer",
                "Vorname",
                "Nachname",
                "Geburtsdatum",
                "Geschlecht",
            }
        )
        self.assertEqual(set(player_list.columns), set(expected_columns))
        self.assertEqual(len(player_list), 0)
