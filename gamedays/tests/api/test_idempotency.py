"""Idempotent log writes: one submission per ``client_id``, at most once.

The scorecard v2 outbox retries a queued write with the same ``client_id``
until the server answers. That retry must never duplicate rows, and a write
that fails must leave no claim behind so the retry can still apply.
"""

from unittest import mock
from uuid import uuid4

from django.contrib.auth.models import User
from django.urls import reverse
from knox.models import AuthToken
from rest_framework.test import APITestCase

from gamedays.constants import API_GAMELOG
from gamedays.models import Gameresult, Gameinfo, GameLogSubmission, GameSetup, TeamLog
from gamedays.service.gamelog import GameLogCreator
from gamedays.tests.setup_factories.db_setup import DBSetup


class GamelogSubmissionTestCase(APITestCase):
    def setUp(self):
        self.gameday = DBSetup().g62_status_empty()
        self.game = Gameinfo.objects.first()
        self.url = reverse(API_GAMELOG, kwargs={"id": self.game.pk})
        self.user = User.objects.first()
        self.authenticate(self.user)

    def authenticate(self, user):
        token = AuthToken.objects.create(user)[1]
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")

    def payload(self, client_id=None, event=None, team="A1", half=1):
        data = {
            "team": team,
            "gameId": self.game.pk,
            "half": half,
            "event": event or [{"name": "Touchdown", "player": "19"}],
        }
        if client_id is not None:
            data["client_id"] = client_id
        return data

    def submissions(self):
        return GameLogSubmission.objects.filter(gameinfo=self.game)


class TestIdempotentSubmission(GamelogSubmissionTestCase):
    def test_same_client_id_is_applied_once(self):
        client_id = str(uuid4())
        first = self.client.post(self.url, self.payload(client_id), format="json")
        second = self.client.post(self.url, self.payload(client_id), format="json")

        assert first.status_code == 201
        assert second.status_code == 200
        assert second.json() == first.json()
        assert (
            TeamLog.objects.filter(gameinfo=self.game, event="Touchdown").count() == 1
        )
        assert self.submissions().count() == 1

    def test_duplicate_submission_does_not_duplicate_touchdown_and_pat(self):
        client_id = str(uuid4())
        event = [
            {"name": "Touchdown", "player": "19"},
            {"name": "1-Extra-Punkt", "player": "7"},
        ]
        first = self.client.post(
            self.url, self.payload(client_id, event), format="json"
        )
        second = self.client.post(
            self.url, self.payload(client_id, event), format="json"
        )

        assert first.status_code == 201
        assert second.status_code == 200
        assert second.json() == first.json()
        # One submission, two rows (Touchdown + PAT share a sequence).
        assert TeamLog.objects.filter(gameinfo=self.game).count() == 2
        assert sorted(
            TeamLog.objects.filter(gameinfo=self.game).values_list("event", flat=True)
        ) == ["1-Extra-Punkt", "Touchdown"]

    def test_different_client_ids_each_apply(self):
        first = self.client.post(self.url, self.payload(str(uuid4())), format="json")
        second = self.client.post(self.url, self.payload(str(uuid4())), format="json")

        assert first.status_code == 201
        assert second.status_code == 201
        assert TeamLog.objects.filter(gameinfo=self.game).count() == 2
        assert self.submissions().count() == 2

    def test_post_without_client_id_still_works(self):
        """The old app sends no client id: every post writes, no claim."""
        first = self.client.post(self.url, self.payload(), format="json")
        second = self.client.post(self.url, self.payload(), format="json")

        assert first.status_code == 201
        assert second.status_code == 201
        assert TeamLog.objects.filter(gameinfo=self.game).count() == 2
        assert not self.submissions().exists()

    def test_invalid_client_id_is_a_400(self):
        response = self.client.post(self.url, self.payload("not-a-uuid"), format="json")

        assert response.status_code == 400
        assert response.json() == {"client_id": "must be a UUID"}
        assert not TeamLog.objects.filter(
            gameinfo=self.game, event="Touchdown"
        ).exists()
        assert not self.submissions().exists()

    def test_failed_write_does_not_leave_a_submission_behind(self):
        client_id = str(uuid4())
        real_write = GameLogCreator._create_with_sequence
        calls = {"count": 0}

        def flaky_write(creator, sequence):
            calls["count"] += 1
            if calls["count"] == 1:
                raise ValueError("write blew up half way")
            return real_write(creator, sequence)

        with mock.patch.object(
            GameLogCreator,
            "_create_with_sequence",
            autospec=True,
            side_effect=flaky_write,
        ):
            with self.assertRaises(ValueError):
                self.client.post(self.url, self.payload(client_id), format="json")
            assert not self.submissions().exists()

            # The retry with the same client id applies: the claim rolled back
            # together with the rows.
            response = self.client.post(
                self.url, self.payload(client_id), format="json"
            )

        assert response.status_code == 201
        assert self.submissions().count() == 1
        assert (
            TeamLog.objects.filter(gameinfo=self.game, event="Touchdown").count() == 1
        )

    def test_submission_is_scoped_to_the_game(self):
        other_game = Gameinfo.objects.exclude(pk=self.game.pk).first()
        other_url = reverse(API_GAMELOG, kwargs={"id": other_game.pk})
        other_team = Gameresult.objects.get(gameinfo=other_game, isHome=True).team
        client_id = str(uuid4())

        first = self.client.post(self.url, self.payload(client_id), format="json")
        second = self.client.post(
            other_url,
            {
                "team": str(other_team.pk),
                "gameId": other_game.pk,
                "half": 1,
                "event": [{"name": "Touchdown", "player": "19"}],
                "client_id": client_id,
            },
            format="json",
        )

        assert first.status_code == 201
        assert second.status_code == 201
        assert GameLogSubmission.objects.filter(client_id=client_id).count() == 2


class TestDeviceLock(GamelogSubmissionTestCase):
    def put_setup(self, device=""):
        data = {
            "ctResult": "won",
            "direction": "arrow_forward",
            "fhPossession": "HOME",
        }
        if device:
            data["device_id"] = device
        return self.client.put(
            reverse("api-game-setup", kwargs={"pk": self.game.pk}),
            data,
            format="json",
        )

    def post_log(self, device=None, client_id=None):
        headers = {"HTTP_X_SCORECARD_DEVICE": device} if device else {}
        return self.client.post(
            self.url, self.payload(client_id), format="json", **headers
        )

    def test_second_device_cannot_take_over_a_started_game(self):
        assert self.put_setup("device-a").status_code == 200
        Gameinfo.objects.get(pk=self.game.pk)  # the setup did start the game

        conflict = self.put_setup("device-b")
        assert conflict.status_code == 409
        assert conflict.json() == {
            "detail": "Dieses Spiel läuft auf einem anderen Gerät.",
            "device_id": "device-a",
        }
        assert GameSetup.objects.get(gameinfo=self.game).device_id == "device-a"

        assert self.put_setup("device-a").status_code == 200
        assert self.put_setup().status_code == 200

    def test_setup_without_device_id_is_still_accepted(self):
        assert self.put_setup().status_code == 200
        assert GameSetup.objects.get(gameinfo=self.game).device_id == ""

    def test_setup_get_does_not_expose_the_device_id(self):
        assert self.put_setup("device-a").status_code == 200

        response = self.client.get(
            reverse("api-game-setup", kwargs={"pk": self.game.pk})
        )

        assert response.status_code == 200
        assert "device_id" not in response.json()

    def test_log_post_from_another_device_is_rejected(self):
        assert self.put_setup("device-a").status_code == 200

        conflict = self.post_log("device-b")

        assert conflict.status_code == 409
        assert conflict.json() == {
            "detail": "Dieses Spiel läuft auf einem anderen Gerät.",
            "device_id": "device-a",
        }
        assert not TeamLog.objects.filter(
            gameinfo=self.game, event="Touchdown"
        ).exists()
        assert not self.submissions().exists()

    def test_log_post_from_another_device_in_the_body_is_rejected(self):
        """The device may ride in the payload instead of the header."""
        assert self.put_setup("device-a").status_code == 200

        conflict = self.client.post(
            self.url, {**self.payload(), "device_id": "device-b"}, format="json"
        )

        assert conflict.status_code == 409
        assert conflict.json() == {
            "detail": "Dieses Spiel läuft auf einem anderen Gerät.",
            "device_id": "device-a",
        }
        assert not TeamLog.objects.filter(
            gameinfo=self.game, event="Touchdown"
        ).exists()
        assert not self.submissions().exists()

    def test_padded_device_ids_are_normalised(self):
        """A padded id in the setup body is stored stripped and matches the
        (also padded) header of later writes."""
        assert self.put_setup("  device-a  ").status_code == 200
        assert GameSetup.objects.get(gameinfo=self.game).device_id == "device-a"

        assert self.post_log("  device-a  ").status_code == 201
        assert self.post_log("  device-b  ").status_code == 409

    def test_padded_client_id_is_still_the_same_submission(self):
        client_id = str(uuid4())

        first = self.client.post(
            self.url, self.payload(f"  {client_id}  "), format="json"
        )
        second = self.client.post(self.url, self.payload(client_id), format="json")

        assert first.status_code == 201
        assert second.status_code == 200
        assert self.submissions().count() == 1
        assert (
            TeamLog.objects.filter(gameinfo=self.game, event="Touchdown").count() == 1
        )

    def test_null_device_id_on_setup_is_accepted(self):
        """``null`` is not a device: it must not 400 and must not release."""
        response = self.client.put(
            reverse("api-game-setup", kwargs={"pk": self.game.pk}),
            {
                "ctResult": "won",
                "direction": "arrow_forward",
                "fhPossession": "HOME",
                "device_id": None,
            },
            format="json",
        )

        assert response.status_code == 200
        assert GameSetup.objects.get(gameinfo=self.game).device_id == ""

    def test_log_post_from_the_locking_device_is_accepted(self):
        assert self.put_setup("device-a").status_code == 200

        assert self.post_log("device-a").status_code == 201

    def test_log_post_without_device_header_is_still_accepted(self):
        """The old app sends no device at all."""
        assert self.put_setup("device-a").status_code == 200

        assert self.post_log().status_code == 201

    def test_log_post_accepts_the_device_in_the_body(self):
        assert self.put_setup("device-a").status_code == 200

        response = self.client.post(
            self.url,
            {**self.payload(), "device_id": "device-a"},
            format="json",
        )

        assert response.status_code == 201

    def test_staff_can_release_the_device_lock(self):
        assert self.put_setup("device-a").status_code == 200
        staff = DBSetup().create_new_user(username="staff", is_staff=True)
        self.authenticate(staff)

        response = self.client.delete(
            reverse("api-game-device", kwargs={"pk": self.game.pk})
        )

        assert response.status_code == 204
        # The other device can now take the game over.
        assert self.post_log("device-b").status_code == 201

    def test_release_lets_the_new_device_claim_the_setup(self):
        assert self.put_setup("device-a").status_code == 200
        self.authenticate(DBSetup().create_new_user(username="staff", is_staff=True))
        assert (
            self.client.delete(
                reverse("api-game-device", kwargs={"pk": self.game.pk})
            ).status_code
            == 204
        )

        assert self.put_setup("device-b").status_code == 200
        assert GameSetup.objects.get(gameinfo=self.game).device_id == "device-b"

    def test_replayed_op_is_accepted_after_a_handover(self):
        """A replayed, already-applied op must drain its outbox even when the
        lock moved on: the device check only guards NEW submissions.

        Without this the replay would 409 forever after a staff release plus a
        handover, and the outbox could never clear -- blocking the finalize.
        """
        client_id = str(uuid4())
        assert self.put_setup("device-a").status_code == 200
        assert self.post_log("device-a", client_id).status_code == 201

        self.authenticate(DBSetup().create_new_user(username="staff", is_staff=True))
        assert (
            self.client.delete(
                reverse("api-game-device", kwargs={"pk": self.game.pk})
            ).status_code
            == 204
        )
        self.authenticate(self.user)
        # Device B takes the game over.
        assert self.put_setup("device-b").status_code == 200
        assert GameSetup.objects.get(gameinfo=self.game).device_id == "device-b"

        # Device A retries the op it already got a 201 for.
        replay = self.post_log("device-a", client_id)

        assert replay.status_code == 200
        assert replay.json()["gameId"] == self.game.pk
        assert (
            TeamLog.objects.filter(gameinfo=self.game, event="Touchdown").count() == 1
        )
        assert self.submissions().count() == 1

    def test_historic_duplicate_setup_rows_do_not_break_the_lock(self):
        """Two setup rows for one game (no unique constraint, historic data)
        must neither 500 the read/release nor hide the lock."""
        assert self.put_setup("device-a").status_code == 200
        first = GameSetup.objects.get(gameinfo=self.game)
        GameSetup.objects.create(
            gameinfo=self.game,
            ctResult="won",
            direction="arrow_forward",
            fhPossession="HOME",
            device_id="device-z",
        )

        response = self.client.get(
            reverse("api-game-setup", kwargs={"pk": self.game.pk})
        )
        assert response.status_code == 200

        # The lock is read from (and enforced by) the oldest row.
        assert self.post_log("device-a").status_code == 201
        assert self.post_log("device-b").status_code == 409

        self.authenticate(DBSetup().create_new_user(username="staff", is_staff=True))
        release = self.client.delete(
            reverse("api-game-device", kwargs={"pk": self.game.pk})
        )
        assert release.status_code == 204
        first.refresh_from_db()
        assert first.device_id == ""

    def put_with_device(self, url_name, data=None, device=None):
        headers = {"HTTP_X_SCORECARD_DEVICE": device} if device else {}
        return self.client.put(
            reverse(url_name, kwargs={"pk": self.game.pk}),
            data or {},
            format="json",
            **headers,
        )

    def test_halftime_from_another_device_is_rejected(self):
        assert self.put_setup("device-a").status_code == 200

        conflict = self.put_with_device("api-game-halftime", device="device-b")

        assert conflict.status_code == 409
        assert conflict.json() == {
            "detail": "Dieses Spiel läuft auf einem anderen Gerät.",
            "device_id": "device-a",
        }
        assert Gameinfo.objects.get(pk=self.game.pk).status == "1. Halbzeit"

        assert (
            self.put_with_device("api-game-halftime", device="device-a").status_code
            == 200
        )

    def test_finalize_from_another_device_is_rejected(self):
        assert self.put_setup("device-a").status_code == 200

        conflict = self.put_with_device(
            "api-game-finalize", {"note": "x"}, device="device-b"
        )

        assert conflict.status_code == 409
        assert conflict.json() == {
            "detail": "Dieses Spiel läuft auf einem anderen Gerät.",
            "device_id": "device-a",
        }
        assert Gameinfo.objects.get(pk=self.game.pk).status == "1. Halbzeit"

        # The locking device may finalize.
        assert (
            self.put_with_device(
                "api-game-finalize", {"note": "x"}, device="device-a"
            ).status_code
            == 200
        )
        assert Gameinfo.objects.get(pk=self.game.pk).status == "beendet"

    def test_possession_from_another_device_is_rejected(self):
        assert self.put_setup("device-a").status_code == 200
        home = Gameresult.objects.get(gameinfo=self.game, isHome=True).team
        away = Gameresult.objects.get(gameinfo=self.game, isHome=False).team
        target = home.name if self.game.in_possession == away.name else away.name

        conflict = self.put_with_device(
            "api-game-possession", {"team": target}, device="device-b"
        )

        assert conflict.status_code == 409
        assert conflict.json() == {
            "detail": "Dieses Spiel läuft auf einem anderen Gerät.",
            "device_id": "device-a",
        }
        assert Gameinfo.objects.get(pk=self.game.pk).in_possession != target

        assert (
            self.put_with_device(
                "api-game-possession", {"team": target}, device="device-a"
            ).status_code
            == 200
        )
        assert Gameinfo.objects.get(pk=self.game.pk).in_possession == target

    def test_undo_from_another_device_is_rejected(self):
        assert self.put_setup("device-a").status_code == 200
        assert self.post_log("device-a").status_code == 201
        row = TeamLog.objects.get(gameinfo=self.game, event="Touchdown")

        conflict = self.client.delete(
            self.url,
            {"team_log_id": row.pk},
            format="json",
            HTTP_X_SCORECARD_DEVICE="device-b",
        )

        assert conflict.status_code == 409
        assert conflict.json() == {
            "detail": "Dieses Spiel läuft auf einem anderen Gerät.",
            "device_id": "device-a",
        }
        assert not TeamLog.objects.get(pk=row.pk).isDeleted

        response = self.client.delete(
            self.url,
            {"team_log_id": row.pk},
            format="json",
            HTTP_X_SCORECARD_DEVICE="device-a",
        )

        assert response.status_code == 200
        assert TeamLog.objects.get(pk=row.pk).isDeleted

    def test_normal_user_cannot_release_the_device_lock(self):
        assert self.put_setup("device-a").status_code == 200
        self.authenticate(
            DBSetup().create_new_user(username="official", is_staff=False)
        )

        response = self.client.delete(
            reverse("api-game-device", kwargs={"pk": self.game.pk})
        )

        assert response.status_code == 403
        assert self.post_log("device-b").status_code == 409

    def test_blank_device_id_does_not_release_the_lock(self):
        assert self.put_setup("device-a").status_code == 200

        # The old app sends nothing; a blank field must not clear the lock
        # either (only the staff endpoint releases it).
        response = self.client.put(
            reverse("api-game-setup", kwargs={"pk": self.game.pk}),
            {
                "ctResult": "won",
                "direction": "arrow_forward",
                "fhPossession": "HOME",
                "device_id": "",
            },
            format="json",
        )

        assert response.status_code == 200
        assert GameSetup.objects.get(gameinfo=self.game).device_id == "device-a"

    def test_release_without_setup_is_a_404(self):
        staff = DBSetup().create_new_user(username="staff", is_staff=True)
        self.authenticate(staff)

        response = self.client.delete(
            reverse("api-game-device", kwargs={"pk": self.game.pk})
        )

        assert response.status_code == 404

    def test_release_unknown_game_is_a_404(self):
        staff = DBSetup().create_new_user(username="staff", is_staff=True)
        self.authenticate(staff)

        response = self.client.delete(reverse("api-game-device", kwargs={"pk": 666}))

        assert response.status_code == 404

    def test_old_app_payloads_still_work(self):
        """The v1 payload: no client id, no device anywhere."""
        response = self.client.post(
            self.url,
            {
                "team": "A1",
                "gameId": self.game.pk,
                "half": 1,
                "event": [
                    {"name": "Touchdown", "player": "19"},
                    {"name": "1-Extra-Punkt", "player": "7"},
                ],
            },
            format="json",
        )

        assert response.status_code == 201
        assert TeamLog.objects.filter(gameinfo=self.game).count() == 2
        assert not self.submissions().exists()
