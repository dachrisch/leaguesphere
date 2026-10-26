from datetime import date, timedelta

from django.test import TestCase
from django.urls import reverse

from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    GameresultFactory,
    TeamFactory,
    UserFactory,
)
from passcheck.api.urls import API_PASSCHECK_SERVICE_PLAYERS
from passcheck.models import (
    EligibilityRule,
    PasscheckVerification,
    PlayerlistGameday,
    TeamRelationship,
)
from passcheck.tests.setup_factories.factories_passcheck import PlayerlistFactory


class RosterWriteTestSetup(TestCase):
    """An officials team checking a team that plays on today's gameday."""

    def setUp(self):
        self.officials = TeamFactory(name="Officials")
        self.user = UserFactory(username=self.officials.name, is_staff=False)
        self.auth = DBSetup().get_token_header(self.user)
        self.headers = {"Authorization": self.auth["Authorization"]}
        self.gameday = GamedayFactory()
        self.game = GameinfoFactory(gameday=self.gameday, officials=self.officials)
        self.home = TeamFactory(name="Home")
        GameresultFactory(gameinfo=self.game, team=self.home, isHome=True)
        self.away = TeamFactory(name="Away")
        GameresultFactory(gameinfo=self.game, team=self.away, isHome=False)
        self.team = self.home
        self.player = PlayerlistFactory(
            team=self.team,
            jersey_number=7,
            joined_on=date.today() - timedelta(days=30),
        )
        self.url = reverse(
            API_PASSCHECK_SERVICE_PLAYERS,
            kwargs={"pk": self.team.pk, "gameday": self.gameday.pk},
        )

    def put(self, roster, **extra):
        payload = {"official_name": "M. Weber", "note": None, "roster": roster}
        payload.update(extra)
        return self.client.put(
            self.url,
            payload,
            content_type="application/json",
            headers=self.headers,
        )


class TestRosterWriteValidation(RosterWriteTestSetup):
    def test_rejects_player_outside_the_team_roster(self):
        other_player = PlayerlistFactory(team=TeamFactory(name="Other"))

        response = self.put([{"id": other_player.pk, "jersey_number": 7}])

        self.assertEqual(response.status_code, 400)
        self.assertIn(str(other_player.pk), response.json()["errors"])

    def test_rejects_duplicate_jersey_numbers(self):
        teammate = PlayerlistFactory(team=self.team, jersey_number=8)
        roster = [
            {"id": self.player.pk, "jersey_number": 12},
            {"id": teammate.pk, "jersey_number": 12},
        ]

        response = self.put(roster)

        self.assertEqual(response.status_code, 400)
        self.assertIn("bereits vergeben", response.json()["errors"][str(teammate.pk)])

    def test_rejects_jersey_out_of_range(self):
        response = self.put([{"id": self.player.pk, "jersey_number": 100}])

        self.assertEqual(response.status_code, 400)
        self.assertIn(str(self.player.pk), response.json()["errors"])

    def test_rejects_below_minimum_player_strength(self):
        EligibilityRule.objects.create(
            league=self.gameday.league,
            max_gamedays=10,
            minimum_player_strength=11,
        )

        response = self.put([])

        self.assertEqual(response.status_code, 400)
        self.assertIn("Mindestspielstärke", response.json()["errors"]["team"])

    def test_rejects_player_joined_after_gameday(self):
        late_player = PlayerlistFactory(
            team=self.team,
            jersey_number=9,
            joined_on=self.gameday.date + timedelta(days=1),
        )

        response = self.put([{"id": late_player.pk, "jersey_number": 9}])

        self.assertEqual(response.status_code, 400)
        self.assertIn(str(late_player.pk), response.json()["errors"])

    def test_rejects_a_player_who_left_before_the_gameday(self):
        former_player = PlayerlistFactory(
            team=self.team,
            jersey_number=10,
            joined_on=self.gameday.date - timedelta(days=30),
            left_on=self.gameday.date - timedelta(days=1),
        )

        response = self.put([{"id": former_player.pk, "jersey_number": 10}])

        self.assertEqual(response.status_code, 400)
        self.assertIn(str(former_player.pk), response.json()["errors"])

    def test_accepts_a_player_from_a_relationship_additional_team(self):
        additional_team = TeamFactory(name="Additional")
        relationship = TeamRelationship.objects.create(
            team=self.team, league=self.gameday.league
        )
        relationship.additional_teams.add(additional_team)
        additional_player = PlayerlistFactory(team=additional_team)

        response = self.put([{"id": additional_player.pk, "jersey_number": 15}])

        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            PlayerlistGameday.objects.filter(
                playerlist=additional_player,
                gameday=self.gameday,
                gameday_jersey=15,
            ).exists()
        )

    def test_accepts_a_legacy_payload_without_client_id(self):
        response = self.put([{"id": self.player.pk, "jersey_number": 7}])

        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            PasscheckVerification.objects.filter(
                team=self.team, gameday=self.gameday
            ).exists()
        )


class TestRosterWritePermission(RosterWriteTestSetup):
    def test_rejects_a_user_who_does_not_officiate_the_gameday(self):
        stranger = UserFactory(username="Stranger", is_staff=False)

        auth = DBSetup().get_token_header(stranger)
        response = self.client.put(
            self.url,
            {
                "official_name": "M. Weber",
                "roster": [{"id": self.player.pk, "jersey_number": 7}],
            },
            content_type="application/json",
            headers={"Authorization": auth["Authorization"]},
        )

        self.assertEqual(response.status_code, 403)

    def test_rejects_a_playing_team_that_does_not_officiate(self):
        playing_user = UserFactory(username=self.home.name, is_staff=False)

        auth = DBSetup().get_token_header(playing_user)
        response = self.client.put(
            self.url,
            {
                "official_name": "M. Weber",
                "roster": [{"id": self.player.pk, "jersey_number": 7}],
            },
            content_type="application/json",
            headers={"Authorization": auth["Authorization"]},
        )

        self.assertEqual(response.status_code, 403)

    def test_rejects_a_gameday_that_is_not_today(self):
        other_gameday = GamedayFactory(date=date.today() - timedelta(days=1))
        other_game = GameinfoFactory(gameday=other_gameday, officials=self.officials)
        GameresultFactory(gameinfo=other_game, team=self.team, isHome=True)
        url = reverse(
            API_PASSCHECK_SERVICE_PLAYERS,
            kwargs={"pk": self.team.pk, "gameday": other_gameday.pk},
        )

        response = self.client.put(
            url,
            {
                "official_name": "M. Weber",
                "roster": [{"id": self.player.pk, "jersey_number": 7}],
            },
            content_type="application/json",
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 403)

    def test_staff_may_write_any_gameday(self):
        staff = UserFactory(username="staff", is_staff=True)
        auth = DBSetup().get_token_header(staff)
        other_gameday = GamedayFactory(date=date.today() - timedelta(days=2))
        url = reverse(
            API_PASSCHECK_SERVICE_PLAYERS,
            kwargs={"pk": self.team.pk, "gameday": other_gameday.pk},
        )

        response = self.client.put(
            url,
            {
                "official_name": "M. Weber",
                "roster": [{"id": self.player.pk, "jersey_number": 7}],
            },
            content_type="application/json",
            headers={"Authorization": auth["Authorization"]},
        )

        self.assertEqual(response.status_code, 200)
