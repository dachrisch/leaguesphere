"""Branch characterization for the fix_cryptic_officials command (moved, N3)."""

import copy
from io import StringIO
from types import SimpleNamespace
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from gamedays.models import GamedayDesignerState, Team
from gamedays.tests.setup_factories.factories import GamedayFactory, GameinfoFactory
from gameday_designer.management.commands import fix_cryptic_officials as command
from gameday_designer.service.canvas_publish_service import CanvasPublishService
from gameday_designer.tests.test_fix_cryptic_officials import MINIMAL_CANVAS_STATE


class FixCrypticOfficialsBranchTest(TestCase):
    def setUp(self):
        self.gameday = GamedayFactory()
        GamedayDesignerState.objects.create(
            gameday=self.gameday, state_data=copy.deepcopy(MINIMAL_CANVAS_STATE)
        )

    def _cryptic(self, name):
        return Team.objects.create(name=name, description=name, location="")

    def _call(self, execute=False):
        out = StringIO()
        call_command("fix_cryptic_officials", execute=execute, stdout=out)
        return out.getvalue()

    def test_uuid_of_a_later_game_node_is_found(self):
        cryptic = self._cryptic("loser:game-dddd-eeee-ffff")
        GameinfoFactory(gameday=self.gameday, officials=cryptic)

        output = self._call(execute=True)

        cryptic.refresh_from_db()
        assert cryptic.name == "Verlierer Spiel 2"
        assert "COMMITTED 1 team fix(es)." in output

    def test_cryptic_team_without_referencing_gameinfo_is_unresolvable(self):
        cryptic = self._cryptic("winner:game-aaaa-bbbb-cccc")

        output = self._call(execute=True)

        assert f"Team {cryptic.id} (winner:game-aaaa-bbbb-cccc): " in output
        assert "No referencing Gameinfo found" in output
        assert "No resolvable changes" in output
        cryptic.refresh_from_db()
        assert cryptic.name == "winner:game-aaaa-bbbb-cccc"

    def test_team_rejected_by_python_regex_is_skipped(self):
        """Defensive branch: the DB regex filter and CRYPTIC_RE.match agree on
        SQLite (both use Python's re), so a mismatch can only be simulated."""
        self._cryptic("winner:game-aaaa-bbbb-cccc")
        stand_in = SimpleNamespace(
            pattern=command.CRYPTIC_RE.pattern, match=lambda _name: None
        )

        with patch.object(command, "CRYPTIC_RE", stand_in):
            output = self._call()

        assert "Found 1 cryptic official team(s)." in output
        assert "Unresolvable" not in output
        assert "No resolvable changes" in output

    def test_empty_formatted_label_tries_next_gameinfo_then_gives_up(self):
        """Defensive branch: _format_dynamic_ref never returns "" for the
        winner/loser types the regex allows, so the empty label is simulated."""
        cryptic = self._cryptic("winner:game-aaaa-bbbb-cccc")
        GameinfoFactory(gameday=self.gameday, officials=cryptic)
        GameinfoFactory(gameday=self.gameday, officials=cryptic)

        with patch.object(
            CanvasPublishService, "_format_dynamic_ref", return_value=""
        ) as fmt:
            output = self._call(execute=True)

        assert fmt.call_count == 2
        assert "No referencing Gameinfo found" in output
        cryptic.refresh_from_db()
        assert cryptic.name == "winner:game-aaaa-bbbb-cccc"
