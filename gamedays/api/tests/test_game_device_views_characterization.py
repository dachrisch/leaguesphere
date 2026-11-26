"""Characterization of the device-lock/finalize/config seams before extraction.

Pins every branch of the helpers and views about to move into
``gamedays/api/game_device_views.py``; exact query counts are asserted on the
DB-touching paths.
"""

import uuid
from http import HTTPStatus
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from gameevents.models import GameEvent
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory

from gamedays.api.game_device_views import (
    ConfigPenalties,
    ConfigRules,
    GameDeviceLockAPIView,
    GameFinalizeUpdateView,
    GameHalftimeAPIView,
    _client_id,
    _device_conflict,
    _device_lock_response,
    _finished_game_response,
    _requested_device,
    _submission_already_applied,
    _validate_gamelog_payload,
)
from gamedays.models import Gameinfo, GameLogSubmission, GameSetup
from gamedays.service.wrapper.gameinfo_wrapper import IllegalGameTransition
from gamedays.tests.setup_factories.factories import GameinfoFactory, UserFactory


class DeviceHelperCharacterization(TestCase):
    def test_finished_game_response(self):
        conflict = _finished_game_response(SimpleNamespace(status="beendet"))
        assert conflict.status_code == HTTPStatus.CONFLICT
        assert _finished_game_response(SimpleNamespace(status="Geplant")) is None
        assert _finished_game_response(SimpleNamespace()) is None

    def test_device_conflict_and_requested_device(self):
        assert _device_conflict("abc", "abc") is None
        assert _device_conflict("abc", "") is None
        conflict = _device_conflict("abc", "other")
        assert conflict.status_code == HTTPStatus.CONFLICT
        assert conflict.data["device_id"] == "abc"
        request = APIRequestFactory().post("/", HTTP_X_SCORECARD_DEVICE="  phone-a  ")
        assert _requested_device(request, {"device_id": "phone-b"}) == "phone-a"
        request = APIRequestFactory().post("/")
        assert _requested_device(request, {"device_id": "phone-b"}) == "phone-b"
        assert _requested_device(request, {}) == ""

    def test_device_lock_response_uses_stored_value(self):
        game = GameinfoFactory()
        with patch(
            "gamedays.api.game_device_views.stored_device", return_value="stored"
        ) as stored:
            request = APIRequestFactory().post("/", HTTP_X_SCORECARD_DEVICE="other")
            conflict = _device_lock_response(request, game.pk, {"device_id": "other"})
            assert conflict.status_code == HTTPStatus.CONFLICT
            stored.assert_called_once_with(game.pk)

    def test_client_id_accepts_none_uuid_and_rejects_junk(self):
        assert _client_id(None) is None
        assert _client_id("") is None
        identifier = uuid.uuid4()
        assert _client_id(f"  {identifier}  ") == identifier
        with self.assertRaises(ValidationError):
            _client_id("not-a-uuid")

    def test_submission_already_applied_checks_both_homes(self):
        game = GameinfoFactory()
        submitted = uuid.uuid4()
        other = uuid.uuid4()
        with self.assertNumQueries(2):
            assert _submission_already_applied(game, submitted) is False
        GameLogSubmission.objects.create(gameinfo=game, client_id=submitted)
        with self.assertNumQueries(1):
            assert _submission_already_applied(game, submitted) is True
        GameEvent.objects.create(
            game=game,
            seq=1,
            client_id=str(other),
            type="score",
            client_at=timezone.now(),
        )
        with self.assertNumQueries(2):
            assert _submission_already_applied(game, other) is True
        assert _submission_already_applied(game, None) is False

    def test_gamelog_payload_validation(self):
        valid = {"event": [{"name": "touchdown"}], "half": 1}
        assert _validate_gamelog_payload(valid) is None
        for payload in (
            {},
            {"event": "touchdown", "half": 1},
            {"event": [], "half": 1},
            {"event": ["touchdown"], "half": 1},
            {"event": [{}], "half": 1},
            {"event": [{"name": 3}], "half": 1},
            {"event": [{"name": "touchdown"}], "half": 3},
        ):
            with self.assertRaises(ValidationError):
                _validate_gamelog_payload(payload)


class DeviceViewCharacterization(TestCase):
    def setUp(self):
        self.user = UserFactory(username="device_staff", is_staff=True)
        self.game = GameinfoFactory()
        self.factory = APIRequestFactory()

    def _request(self, method="put", user=None):
        request = getattr(self.factory, method)("/")
        request.user = user or self.user
        return request

    def test_halftime_rejects_illegal_transition(self):
        with (
            patch(
                "gamedays.api.game_device_views._device_lock_response",
                return_value=None,
            ),
            patch("gamedays.api.game_device_views.GameService") as service,
        ):
            service.return_value.update_halftime.side_effect = IllegalGameTransition(
                "Geplant", "beendet"
            )
            response = GameHalftimeAPIView().put(self._request(), pk=self.game.pk)
        assert response.status_code == HTTPStatus.CONFLICT

    def test_device_conflict_short_circuits_both_views(self):
        conflict = Response({"detail": "locked"}, status=HTTPStatus.CONFLICT)
        with patch(
            "gamedays.api.game_device_views._device_lock_response",
            return_value=conflict,
        ):
            halftime = GameHalftimeAPIView().put(self._request(), pk=self.game.pk)
            finalize = GameFinalizeUpdateView().update(
                Request(self._request()), pk=self.game.pk
            )
        assert halftime is conflict
        assert finalize is conflict

    def test_finalize_creates_a_missing_setup_row(self):
        with (
            patch(
                "gamedays.api.game_device_views._device_lock_response",
                return_value=None,
            ),
            patch("gamedays.api.game_device_views.GameService"),
            patch("gamedays.api.game_device_views.GameFinalizer") as serializer,
        ):
            serializer.return_value.is_valid.return_value = True
            serializer.return_value.data = {"finished": True}
            response = GameFinalizeUpdateView().update(
                Request(self._request()), pk=self.game.pk
            )
        assert response.status_code == HTTPStatus.OK
        assert GameSetup.objects.filter(gameinfo=self.game).count() == 1

    def test_finalize_not_found_and_serializer_errors(self):
        with (
            patch(
                "gamedays.api.game_device_views._device_lock_response",
                return_value=None,
            ),
            patch("gamedays.api.game_device_views.GameService") as service,
        ):
            service.side_effect = Gameinfo.DoesNotExist
            with self.assertRaises(NotFound):
                GameFinalizeUpdateView().update(self._request(), pk=999999)

        GameSetup.objects.create(gameinfo=self.game)
        with (
            patch(
                "gamedays.api.game_device_views._device_lock_response",
                return_value=None,
            ),
            patch("gamedays.api.game_device_views.GameService"),
            patch("gamedays.api.game_device_views.GameFinalizer") as serializer,
        ):
            serializer.return_value.is_valid.return_value = False
            serializer.return_value.errors = {"detail": "invalid"}
            response = GameFinalizeUpdateView().update(
                Request(self._request()), pk=self.game.pk
            )
        assert response.status_code == HTTPStatus.BAD_REQUEST

    def test_device_lock_delete_permissions_and_not_found(self):
        view = GameDeviceLockAPIView()
        plain = UserFactory(username="device_plain", is_staff=False)
        with self.assertRaises(PermissionDenied):
            view.delete(self._request("delete", user=plain), pk=self.game.pk)
        with self.assertRaises(NotFound):
            view.delete(self._request("delete"), pk=999999)
        with self.assertRaises(NotFound):
            view.delete(self._request("delete"), pk=self.game.pk)
        GameSetup.objects.create(gameinfo=self.game)
        with patch("gamedays.api.game_device_views.release_device_lock") as release:
            response = view.delete(self._request("delete"), pk=self.game.pk)
        assert response.status_code == HTTPStatus.NO_CONTENT
        release.assert_called_once_with(self.game.pk)

    def test_config_endpoints_return_catalogue_and_rules(self):
        assert ConfigPenalties().get(self._request("get")).status_code == 200
        assert ConfigRules().get(self._request("get")).status_code == 200
