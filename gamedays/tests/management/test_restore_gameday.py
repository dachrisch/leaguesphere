import os
import tempfile

from django.core.management import CommandError, call_command
from django.test import TestCase

from gamedays.models import Gameinfo, Gameresult, TeamLog
from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    GameresultFactory,
    TeamLogFactory,
)


class RestoreGamedayCommandTest(TestCase):
    def _build_gameday(self):
        """A gameday with one game, two results and a team log -- the shape
        that a publish/wipe destroys."""
        gameday = GamedayFactory()
        gi = GameinfoFactory(gameday=gameday, stage="P1", standing="Gruppe 1")
        GameresultFactory(gameinfo=gi, fh=3, sh=4, isHome=True)
        GameresultFactory(gameinfo=gi, fh=1, sh=2, isHome=False)
        # author FK is explicit so the test never depends on a user id 1 existing
        TeamLogFactory(gameinfo=gi, sequence=1, event="Touchdown", half=1,
                       input="TD", author=gameday.author)
        return gameday, gi

    def _wipe_and_republish(self, gameday):
        """Simulate the incident: the original games are deleted and an empty
        replacement game is published from the (stale) canvas."""
        Gameinfo.objects.filter(gameday_id=gameday.id).delete()
        return GameinfoFactory(gameday=gameday, stage="WIPED")

    def test_export_then_restore_roundtrip(self):
        gameday, gi = self._build_gameday()
        with tempfile.TemporaryDirectory() as tmp:
            export_path = os.path.join(tmp, "gd.json")
            call_command("restore_gameday", gameday=gameday.id, export=export_path)

            wiped = self._wipe_and_republish(gameday)
            self.assertEqual(
                Gameresult.objects.filter(gameinfo__gameday_id=gameday.id).count(), 0)

            call_command("restore_gameday", gameday=gameday.id,
                         load=export_path, execute=True, backup_dir=tmp)

            # original gameinfo restored with its ORIGINAL pk
            self.assertTrue(Gameinfo.objects.filter(pk=gi.pk).exists())
            # results and logs are back
            self.assertEqual(
                Gameresult.objects.filter(gameinfo__gameday_id=gameday.id).count(), 2)
            self.assertEqual(
                TeamLog.objects.filter(gameinfo__gameday_id=gameday.id).count(), 1)
            # the empty re-published game is gone
            self.assertFalse(Gameinfo.objects.filter(pk=wiped.pk).exists())
            # a pre-image rollback backup was written
            self.assertTrue(any(f.startswith(f"gameday_{gameday.id}_preimage_")
                                for f in os.listdir(tmp)))

    def test_dry_run_makes_no_changes(self):
        gameday, gi = self._build_gameday()
        with tempfile.TemporaryDirectory() as tmp:
            export_path = os.path.join(tmp, "gd.json")
            call_command("restore_gameday", gameday=gameday.id, export=export_path)

            wiped = self._wipe_and_republish(gameday)

            # no --execute -> dry run
            call_command("restore_gameday", gameday=gameday.id,
                         load=export_path, backup_dir=tmp)

            # nothing changed: original still absent, wiped row still present
            self.assertFalse(Gameinfo.objects.filter(pk=gi.pk).exists())
            self.assertTrue(Gameinfo.objects.filter(pk=wiped.pk).exists())
            self.assertEqual(
                Gameresult.objects.filter(gameinfo__gameday_id=gameday.id).count(), 0)

    def test_refuses_wrong_gameday_file(self):
        gameday, _ = self._build_gameday()
        other = GamedayFactory(name="Other")
        with tempfile.TemporaryDirectory() as tmp:
            export_path = os.path.join(tmp, "gd.json")
            call_command("restore_gameday", gameday=gameday.id, export=export_path)

            # applying that file against a different gameday id must be rejected
            with self.assertRaises(CommandError):
                call_command("restore_gameday", gameday=other.id,
                             load=export_path, execute=True, backup_dir=tmp)

    def test_refuses_empty_export(self):
        empty = GamedayFactory(name="Empty")
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(CommandError):
                call_command("restore_gameday", gameday=empty.id,
                             export=os.path.join(tmp, "gd.json"))
