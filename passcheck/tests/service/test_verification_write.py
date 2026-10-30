from datetime import date, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.test import TestCase

from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    TeamFactory,
    UserFactory,
)
from passcheck.models import PasscheckVerification, PlayerlistGameday
from passcheck.service.passcheck_service import (
    DeviceConflictError,
    PasscheckServicePlayers,
    RosterValidationError,
)
from passcheck.tests.setup_factories.factories_passcheck import PlayerlistFactory


class VerificationWriteTestSetup(TestCase):
    def setUp(self):
        self.team = TeamFactory(name="Home")
        self.gameday = GamedayFactory()
        self.user = UserFactory(username="Officials", is_staff=False)
        self.players = [
            PlayerlistFactory(
                team=self.team,
                jersey_number=jersey,
                joined_on=date.today() - timedelta(days=30),
            )
            for jersey in (7, 8)
        ]
        self.service = PasscheckServicePlayers()

    def payload(self, client_id=None, device_id="", roster=None):
        data = {
            "official_name": "M. Weber",
            "note": None,
            "roster": (
                roster
                if roster is not None
                else [
                    {"id": self.players[0].pk, "jersey_number": 7},
                    {"id": self.players[1].pk, "jersey_number": 8},
                ]
            ),
        }
        if client_id is not None:
            data["client_id"] = str(client_id)
        if device_id:
            data["device_id"] = device_id
        return data

    def write(self, **kwargs):
        return self.service.create_roster_and_passcheck_verification(
            team_id=self.team.pk,
            gameday_id=self.gameday.pk,
            user=self.user,
            data=self.payload(**kwargs),
        )


class TestIdempotentVerification(VerificationWriteTestSetup):
    def test_same_client_id_twice_creates_one_verification(self):
        client_id = uuid4()

        self.write(client_id=client_id, device_id="A")
        self.write(client_id=client_id, device_id="A")

        self.assertEqual(
            PasscheckVerification.objects.filter(
                team=self.team, gameday=self.gameday
            ).count(),
            1,
        )

    def test_same_client_id_retry_does_not_touch_the_roster(self):
        client_id = uuid4()
        self.write(client_id=client_id, device_id="A")
        PlayerlistGameday.objects.filter(gameday=self.gameday).delete()

        self.write(client_id=client_id, device_id="A")

        self.assertEqual(
            PlayerlistGameday.objects.filter(gameday=self.gameday).count(), 0
        )

    def test_second_v2_device_is_rejected(self):
        self.write(client_id=uuid4(), device_id="A")

        with self.assertRaises(DeviceConflictError):
            self.write(client_id=uuid4(), device_id="B")

    def test_the_same_device_may_rewrite(self):
        self.write(client_id=uuid4(), device_id="A")

        self.write(client_id=uuid4(), device_id="A")

        verification = PasscheckVerification.objects.get(
            team=self.team, gameday=self.gameday
        )
        self.assertEqual(verification.device_id, "A")


class TestWriteOrdering(VerificationWriteTestSetup):
    def test_rejected_payload_keeps_the_previous_roster(self):
        self.write()

        with self.assertRaises(RosterValidationError):
            self.write(roster=[{"id": self.players[0].pk, "jersey_number": 100}])

        self.assertEqual(
            PlayerlistGameday.objects.filter(gameday=self.gameday).count(), 2
        )

    def test_legacy_write_without_device_or_client_id_still_works(self):
        self.write()

        self.assertTrue(
            PasscheckVerification.objects.filter(
                team=self.team, gameday=self.gameday
            ).exists()
        )

    def test_legacy_write_after_a_v2_write_is_accepted(self):
        self.write(client_id=uuid4(), device_id="A")

        self.write()

        verification = PasscheckVerification.objects.get(
            team=self.team, gameday=self.gameday
        )
        self.assertEqual(verification.device_id, "")

    def test_v2_write_after_a_legacy_write_is_accepted(self):
        self.write()

        self.write(client_id=uuid4(), device_id="A")

        verification = PasscheckVerification.objects.get(
            team=self.team, gameday=self.gameday
        )
        self.assertEqual(verification.device_id, "A")

    def test_invalid_client_id_is_a_validation_error(self):
        with self.assertRaises(RosterValidationError) as context:
            self.service.create_roster_and_passcheck_verification(
                team_id=self.team.pk,
                gameday_id=self.gameday.pk,
                user=self.user,
                data={**self.payload(), "client_id": "not-a-uuid"},
            )

        self.assertIn("client_id", context.exception.errors)


class TestUniqueConstraints(VerificationWriteTestSetup):
    def test_only_one_verification_per_team_and_gameday(self):
        PasscheckVerification.objects.create(
            team=self.team, gameday=self.gameday, user=self.user, official_name="A"
        )

        from django.db import IntegrityError, transaction

        with self.assertRaises(IntegrityError), transaction.atomic():
            PasscheckVerification.objects.create(
                team=self.team,
                gameday=self.gameday,
                user=self.user,
                official_name="B",
            )

    def test_only_one_gameday_row_per_player(self):
        PlayerlistGameday.objects.create(
            playerlist=self.players[0], gameday=self.gameday, gameday_jersey=7
        )

        from django.db import IntegrityError, transaction

        with self.assertRaises(IntegrityError), transaction.atomic():
            PlayerlistGameday.objects.create(
                playerlist=self.players[0], gameday=self.gameday, gameday_jersey=9
            )


class TestResetDeviceCommand(VerificationWriteTestSetup):
    def test_resets_the_device_for_one_team_and_gameday(self):
        self.write(client_id=uuid4(), device_id="A")
        other_gameday = GamedayFactory()
        PasscheckVerification.objects.create(
            team=self.team,
            gameday=other_gameday,
            user=self.user,
            official_name="Other",
            device_id="B",
        )

        call_command(
            "reset_passcheck_device",
            team=self.team.pk,
            gameday=self.gameday.pk,
        )

        self.assertEqual(
            PasscheckVerification.objects.get(
                team=self.team, gameday=self.gameday
            ).device_id,
            "",
        )
        self.assertEqual(
            PasscheckVerification.objects.get(
                team=self.team, gameday=other_gameday
            ).device_id,
            "B",
        )

    def test_requires_a_scope(self):
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            call_command("reset_passcheck_device")
