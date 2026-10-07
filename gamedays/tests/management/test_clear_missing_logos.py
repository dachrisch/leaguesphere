from io import StringIO

from django.core.files.base import ContentFile
from django.core.management import call_command
from django.test import TestCase

from gamedays.tests.setup_factories.factories import TeamFactory


class ClearMissingLogosTest(TestCase):
    def setUp(self):
        self.missing = TeamFactory(name="MissingLogo")
        self.missing.logo.name = "teammanager/logos/gone.png"
        self.missing.save()
        self.present = TeamFactory(name="PresentLogo")
        self.present.logo.save("present.png", ContentFile("bytes"), save=True)
        self.addCleanup(lambda: self.present.logo.delete(save=False))
        self.no_logo = TeamFactory(name="NoLogo")

    def _call(self, dry_run=False):
        out = StringIO()
        call_command("clear_missing_logos", dry_run=dry_run, stdout=out)
        return out.getvalue()

    def test_dry_run_changes_nothing_and_lists_teams(self):
        output = self._call(dry_run=True)

        self.missing.refresh_from_db()
        self.present.refresh_from_db()
        assert self.missing.logo.name == "teammanager/logos/gone.png"
        assert bool(self.present.logo)
        assert "MissingLogo" in output

    def test_execute_clears_only_missing(self):
        self._call(dry_run=False)

        self.missing.refresh_from_db()
        self.present.refresh_from_db()
        self.no_logo.refresh_from_db()
        assert not self.missing.logo
        assert bool(self.present.logo)
        assert not self.no_logo.logo
