"""Characterization of the device-lock/finalize/config seams before extraction.

Pins every branch of the helpers and views about to move into
``gamedays/api/game_device_views.py``. The view tests drive real stored
devices and real status transitions (never a patched helper returning its own
value), with exact query counts on every DB-touching path.
"""

import uuid
from http import HTTPStatus
from types import SimpleNamespace

from django.test import TestCase
from django.utils import timezone
from gameevents.models import GameEvent
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.request import Request
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
from gamedays.models import GameLogSubmission, GameSetup
from gamedays.service.wrapper.gameinfo_wrapper import (
    STATUS_FIRST_HALF,
    STATUS_HALFTIME,
)
from gamedays.tests.setup_factories.factories import GameinfoFactory, UserFactory


class DeviceHelperCharacterization(TestCase):
    def test_finished_game_response(self):
        conflict = _finished_game_response(SimpleNamespace(status="beendet"))
        assert conflict.status_code == HTTPStatus.CONFLICT
        assert conflict.data["detail"] == "Dieses Spiel ist beendet."
        assert _finished_game_response(SimpleNamespace(status="Geplant")) is None
        assert _finished_game_response(SimpleNamespace()) is None

    def test_device_conflict_and_requested_device(self):
        assert _device_conflict("abc", "abc") is None
        assert _device_conflict("abc", "") is None
        conflict = _device_conflict("abc", "other")
        assert conflict.status_code == HTTPStatus.CONFLICT
        assert conflict.data["device_id"] == "abc"
        assert conflict.data["detail"] == "Dieses Spiel läuft auf einem anderen Gerät."
        request = APIRequestFactory().post("/", HTTP_X_SCORECARD_DEVICE="  phone-a  ")
        assert _requested_device(request, {"device_id": "phone-b"}) == "phone-a"
        request = APIRequestFactory().post("/")
        assert _requested_device(request, {"device_id": "phone-b"}) == "phone-b"
        assert _requested_device(request, {}) == ""

    def test_device_lock_response_reads_the_stored_device_from_the_db(self):
        """A real stored device must short-circuit both views (no mock)."""
        game = GameinfoFactory()
        request = APIRequestFactory().post("/", HTTP_X_SCORECARD_DEVICE="other")
        assert _device_lock_response(request, game.pk, {"device_id": "other"}) is None
        GameSetup.objects.create(gameinfo=game, device_id="stored-a")
        with self.assertNumQueries(1):
            conflict = _device_lock_response(request, game.pk, {"device_id": "other"})
        assert conflict.status_code == HTTPStatus.CONFLICT
        assert conflict.data == {
            "detail": "Dieses Spiel läuft auf einem anderen Gerät.",
            "device_id": "stored-a",
        }

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

    def _request(self, method="put", user=None, device=None, drf=True):
        headers = {}
        if device:
            headers["HTTP_X_SCORECARD_DEVICE"] = device
        request = getattr(self.factory, method)("/", **headers)
        request.user = user or self.user
        if drf:
            request = Request(request)
            request.user = user or self.user
        return request

    def test_halftime_rejects_illegal_transition(self):
        """A planned game cannot go to halftime: real status, real 409."""
        with self.assertNumQueries(2):
            response = GameHalftimeAPIView().put(self._request(), pk=self.game.pk)
        assert response.status_code == HTTPStatus.CONFLICT
        assert response.data["detail"] == "Dieser Spielstatus erlaubt keine Halbzeit."
        self.game.refresh_from_db()
        assert self.game.status != STATUS_HALFTIME

    def test_device_conflict_short_circuits_both_views(self):
        GameSetup.objects.create(gameinfo=self.game, device_id="stored-a")
        request = self._request(device="other")
        with self.assertNumQueries(2):
            halftime = GameHalftimeAPIView().put(request, pk=self.game.pk)
        assert halftime.status_code == HTTPStatus.CONFLICT
        assert halftime.data["device_id"] == "stored-a"
        with self.assertNumQueries(2):
            finalize = GameFinalizeUpdateView().update(request, pk=self.game.pk)
        assert finalize.status_code == HTTPStatus.CONFLICT
        assert finalize.data["device_id"] == "stored-a"

    def test_halftime_and_finalize_apply_real_transitions(self):
        self.game.status = STATUS_FIRST_HALF
        self.game.save(update_fields=["status"])
        with self.assertNumQueries(7):
            response = GameHalftimeAPIView().put(self._request(), pk=self.game.pk)
        assert response.status_code == HTTPStatus.OK
        self.game.refresh_from_db()
        assert self.game.status == STATUS_HALFTIME
        with self.assertNumQueries(17):
            finalized = GameFinalizeUpdateView().update(
                self._request(), pk=self.game.pk
            )
        assert finalized.status_code == HTTPStatus.OK
        assert finalized.data
        assert GameSetup.objects.filter(gameinfo=self.game).count() == 1

    def test_finalize_not_found_reports_404(self):
        with self.assertRaises(NotFound):
            GameFinalizeUpdateView().update(self._request(), pk=999999)

    def test_finalize_reports_serializer_errors_without_a_write(self):
        self.game.status = STATUS_FIRST_HALF
        self.game.save(update_fields=["status"])
        request = self._request()
        request._full_data = {"hasFinalScoreChanged": [1, 2]}
        response = GameFinalizeUpdateView().update(request, pk=self.game.pk)
        assert response.status_code == HTTPStatus.BAD_REQUEST
        assert "hasFinalScoreChanged" in response.data
        assert GameSetup.objects.get(gameinfo=self.game).homeCaptain == ""

    def test_device_lock_delete_permissions_and_not_found(self):
        view = GameDeviceLockAPIView()
        plain = UserFactory(username="device_plain", is_staff=False)
        with self.assertRaises(PermissionDenied):
            view.delete(self._request("delete", user=plain, drf=False), pk=self.game.pk)
        with self.assertRaises(NotFound):
            view.delete(self._request("delete", drf=False), pk=999999)
        with self.assertRaises(NotFound):
            view.delete(self._request("delete", drf=False), pk=self.game.pk)
        GameSetup.objects.create(gameinfo=self.game, device_id="stored-a")
        with self.assertNumQueries(3):
            response = view.delete(self._request("delete", drf=False), pk=self.game.pk)
        assert response.status_code == HTTPStatus.NO_CONTENT
        self.game.refresh_from_db()
        assert GameSetup.objects.get(gameinfo=self.game).device_id == ""

    def test_config_endpoints_return_non_empty_catalogue_and_rules(self):
        with self.assertNumQueries(0):
            response = ConfigPenalties().get(self._request("get"))
        assert response.status_code == HTTPStatus.OK
        assert response.data  # a handler returning [] must not pass
        with self.assertNumQueries(0):
            response = ConfigRules().get(self._request("get"))
        assert response.status_code == HTTPStatus.OK
        assert response.data
