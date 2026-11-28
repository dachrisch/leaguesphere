"""`PlayerlistTransferForm.save` honours `commit` (LSP, architecture scan N1)."""

from unittest.mock import patch

from django.test import TestCase

from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import TeamFactory
from passcheck.forms import PlayerlistTransferForm
from passcheck.models import Playerlist, PlayerlistTransfer
from passcheck.tests.setup_factories.db_setup_passcheck import DbSetupPasscheck


class TestPlayerlistTransferFormSave(TestCase):
    def _form(self):
        user = DBSetup().create_new_user("CommitTeam1", is_staff=False)
        team = DBSetup().create_teams("CommitTeam", 1)[0]
        receiving_team = TeamFactory(name="Commit Receiving Team")
        DbSetupPasscheck.create_playerlist_for_team(team)
        player = Playerlist.objects.first()
        form = PlayerlistTransferForm(
            data={"new_team": receiving_team.pk},
            instance=player,
            initial={"user": user},
            action_type="pending",
        )
        assert form.is_valid(), form.errors
        return form, player

    def test_commit_false_starts_no_transfer(self):
        form, player = self._form()
        with patch("passcheck.forms.TransferService") as service:
            assert form.save(commit=False) is player
        service.assert_not_called()
        assert PlayerlistTransfer.objects.count() == 0

    def test_commit_true_starts_the_transfer(self):
        form, player = self._form()
        assert form.save() is player
        assert PlayerlistTransfer.objects.count() == 1
