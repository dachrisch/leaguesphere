import base64
import os
import shutil
import tempfile
from datetime import date, timedelta

from django.conf import settings
from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    GameresultFactory,
    TeamFactory,
    UserFactory,
)
from passcheck.api.urls import API_PASSCHECK_PHOTO
from passcheck.models import TeamRelationship
from passcheck.tests.setup_factories.factories_passcheck import PlayerlistFactory

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


class PhotoTestSetup(TestCase):
    def setUp(self):
        self.photo_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.photo_root, ignore_errors=True)
        self.override = override_settings(PASS_PHOTO_ROOT=self.photo_root)
        self.override.enable()
        self.addCleanup(self.override.disable)

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
        self.playerlist = PlayerlistFactory(
            team=self.home,
            joined_on=date.today() - timedelta(days=30),
        )
        self.person = self.playerlist.player.person
        self.url = reverse(
            API_PASSCHECK_PHOTO,
            kwargs={"playerlist_id": self.playerlist.pk, "gameday": self.gameday.pk},
        )

    def attach_photo(self, consent=True):
        self.person.photo.save("pass.png", ContentFile(PNG), save=False)
        self.person.photo_updated_at = timezone.now()
        if consent:
            self.person.photo_consent_at = timezone.now()
        self.person.save()

    def get(self, headers=None):
        return self.client.get(self.url, headers=headers or self.headers)


class TestPassPhoto(PhotoTestSetup):
    def test_photo_requires_consent(self):
        self.attach_photo(consent=False)

        self.assertEqual(self.get().status_code, 404)

    def test_revoked_consent_hides_the_photo(self):
        self.attach_photo(consent=True)
        self.assertEqual(self.get().status_code, 200)

        self.person.photo_consent_at = None
        self.person.save(update_fields=["photo_consent_at"])

        self.assertEqual(self.get().status_code, 404)

    def test_missing_photo_is_a_404(self):
        self.person.photo_consent_at = timezone.now()
        self.person.save(update_fields=["photo_consent_at"])

        self.assertEqual(self.get().status_code, 404)

    def test_photo_is_forbidden_for_another_officials_team(self):
        self.attach_photo()
        other_user = UserFactory(username="Other Officials", is_staff=False)
        auth = DBSetup().get_token_header(other_user)

        response = self.get(headers={"Authorization": auth["Authorization"]})

        self.assertEqual(response.status_code, 403)

    def test_photo_is_forbidden_for_a_playing_team(self):
        self.attach_photo()
        playing_user = UserFactory(username=self.home.name, is_staff=False)
        auth = DBSetup().get_token_header(playing_user)

        response = self.get(headers={"Authorization": auth["Authorization"]})

        self.assertEqual(response.status_code, 403)

    def test_photo_is_forbidden_for_a_non_today_gameday(self):
        self.attach_photo()
        other_gameday = GamedayFactory(date=date.today() - timedelta(days=1))
        other_game = GameinfoFactory(gameday=other_gameday, officials=self.officials)
        GameresultFactory(gameinfo=other_game, team=self.home, isHome=True)
        url = reverse(
            API_PASSCHECK_PHOTO,
            kwargs={"playerlist_id": self.playerlist.pk, "gameday": other_gameday.pk},
        )

        self.assertEqual(self.client.get(url, headers=self.headers).status_code, 403)

    def test_photo_response_is_not_cacheable(self):
        self.attach_photo()

        response = self.get()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response["Content-Type"], "image/png")

    def test_photo_for_a_relationship_additional_team_is_allowed(self):
        additional_team = TeamFactory(name="Additional")
        relationship = TeamRelationship.objects.create(
            team=self.home, league=self.gameday.league
        )
        relationship.additional_teams.add(additional_team)
        additional_playerlist = PlayerlistFactory(team=additional_team)
        additional_playerlist.player.person.photo.save(
            "additional.png", ContentFile(PNG), save=False
        )
        additional_playerlist.player.person.photo_consent_at = timezone.now()
        additional_playerlist.player.person.save()
        url = reverse(
            API_PASSCHECK_PHOTO,
            kwargs={
                "playerlist_id": additional_playerlist.pk,
                "gameday": self.gameday.pk,
            },
        )

        self.assertEqual(self.client.get(url, headers=self.headers).status_code, 200)

    def test_staff_may_read_any_photo(self):
        self.attach_photo()
        staff = UserFactory(username="staff", is_staff=True)
        auth = DBSetup().get_token_header(staff)

        response = self.get(headers={"Authorization": auth["Authorization"]})

        self.assertEqual(response.status_code, 200)

    def test_unauthenticated_request_is_rejected(self):
        self.attach_photo()

        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_photo_is_stored_outside_media_root(self):
        self.attach_photo()

        location = os.path.abspath(self.person.photo.storage.location)

        self.assertFalse(location.startswith(os.path.abspath(settings.MEDIA_ROOT)))
