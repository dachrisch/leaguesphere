import io
import shutil
import tempfile

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from PIL import Image

from gamedays.models import (
    Association,
    Permissions,
    Team,
    UserPermissions,
    UserProfile,
)


def png_upload(name="logo.png"):
    buffer = io.BytesIO()
    Image.new("RGB", (1, 1), (255, 0, 0)).save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


class EditTeamLogoTest(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        media_override = override_settings(MEDIA_ROOT=self.media_root)
        media_override.enable()
        self.addCleanup(media_override.disable)

        self.association = Association.objects.create(abbr="ASSOC", name="Association")
        self.team = Team.objects.create(
            name="Owning Team",
            description="Owning Team Description",
            location="Nuremberg",
            association=self.association,
        )
        self.other_team = Team.objects.create(
            name="Other Team",
            description="Other Team Description",
            location="Munich",
            association=self.association,
        )
        self.manager = self._teammanager("manager", self.team)
        self.other_manager = self._teammanager("other_manager", self.other_team)

    def _teammanager(self, username, team):
        user = User.objects.create_user(username=username, password="pw")
        profile = UserProfile.objects.create(user=user, team=team)
        permission = Permissions.objects.create(name="Teammanager")
        UserPermissions.objects.create(permission=permission, user=profile)
        return user

    def _edit_url(self, team=None):
        return reverse("editteam", kwargs={"team_id": (team or self.team).pk})

    def _post_data(self, **overrides):
        data = {
            "name": self.team.name,
            "description": self.team.description,
            "location": self.team.location,
            "association": self.association.pk,
            "logo": png_upload(),
        }
        data.update(overrides)
        return data

    def test_teammanager_can_upload_own_team_logo(self):
        self.client.force_login(self.manager)

        response = self.client.post(self._edit_url(), self._post_data())

        assert response.status_code == 302
        self.team.refresh_from_db()
        assert self.team.logo
        assert self.team.logo.name.startswith("teammanager/logos/")
        assert self.team.logo.storage.exists(self.team.logo.name)

    def test_teammanager_cannot_edit_another_team(self):
        self.client.force_login(self.other_manager)

        response = self.client.post(
            self._edit_url(),
            self._post_data(name="Hijacked", description="Hijacked"),
        )

        assert response.status_code == 302
        self.team.refresh_from_db()
        assert self.team.name == "Owning Team"
        assert self.team.description == "Owning Team Description"
        assert not self.team.logo
