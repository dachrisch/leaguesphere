import base64
import shutil
import tempfile
from datetime import date, timedelta
from io import StringIO
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase, override_settings

from gamedays.tests.setup_factories.factories import TeamFactory
from passcheck.tests.setup_factories.factories_passcheck import PlayerlistFactory

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


class ImportPassPhotosTest(TestCase):
    def setUp(self):
        self.photo_root = tempfile.mkdtemp()
        self.source = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.photo_root, ignore_errors=True)
        self.addCleanup(shutil.rmtree, self.source, ignore_errors=True)
        self.override = override_settings(PASS_PHOTO_ROOT=self.photo_root)
        self.override.enable()
        self.addCleanup(self.override.disable)

        self.playerlist = PlayerlistFactory(
            team=TeamFactory(name="Home"),
            joined_on=date.today() - timedelta(days=30),
        )
        self.person = self.playerlist.player.person
        self.pass_number = self.playerlist.player.pass_number
        self.file = Path(self.source) / f"{self.pass_number}.png"
        self.file.write_bytes(PNG)

    def run_command(self, **options):
        stdout = StringIO()
        call_command("import_pass_photos", dir=self.source, stdout=stdout, **options)
        return stdout.getvalue()

    def test_imports_the_photo_without_consent_by_default(self):
        self.run_command()

        self.person.refresh_from_db()
        self.assertTrue(self.person.photo)
        self.assertIsNotNone(self.person.photo_updated_at)
        self.assertIsNone(self.person.photo_consent_at)

    def test_consent_flag_records_consent(self):
        self.run_command(consent=True)

        self.person.refresh_from_db()
        self.assertIsNotNone(self.person.photo_consent_at)

    def test_dry_run_writes_nothing(self):
        self.run_command(dry_run=True)

        self.person.refresh_from_db()
        self.assertFalse(self.person.photo)
        self.assertIsNone(self.person.photo_updated_at)

    def test_unknown_pass_number_is_reported(self):
        self.file.rename(Path(self.source) / "999999.png")

        output = self.run_command()

        self.assertIn("999999", output)
