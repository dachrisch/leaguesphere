from django import forms
from django.test import TestCase

from league_table.models import LeagueTableMode
from league_table.tests.setup_factories.factories_leaguetable import (
    LeagueTableModeFactory,
)


class TestLeagueTableModeFormValidation(TestCase):
    """`table_mode` moved off `LeagueSeasonConfig` onto its own named
    `LeagueTableMode` preset — the N-required-unless-default rule (and its
    form-layer coverage) now lives entirely on that model instead."""

    form_class = forms.modelform_factory(LeagueTableMode, fields="__all__")

    def _form_data(self, table_mode, **overrides):
        data = {
            "name": table_mode.name,
            "mode": LeagueTableMode.TABLE_MODE_DEFAULT,
            "top_n": "",
        }
        data.update(overrides)
        return data

    def test_default_mode_without_top_n_is_valid(self):
        table_mode = LeagueTableModeFactory()

        form = self.form_class(data=self._form_data(table_mode), instance=table_mode)
        form.is_valid()

        assert "top_n" not in form.errors

    def test_top_n_gamedays_mode_without_top_n_is_invalid(self):
        table_mode = LeagueTableModeFactory()

        form = self.form_class(
            data=self._form_data(
                table_mode,
                mode=LeagueTableMode.TABLE_MODE_TOP_N_GAMEDAYS,
                top_n="",
            ),
            instance=table_mode,
        )

        assert not form.is_valid()
        assert "top_n" in form.errors

    def test_top_n_games_mode_with_top_n_is_valid(self):
        table_mode = LeagueTableModeFactory()

        form = self.form_class(
            data=self._form_data(
                table_mode, mode=LeagueTableMode.TABLE_MODE_TOP_N_GAMES, top_n=5
            ),
            instance=table_mode,
        )
        form.is_valid()

        assert "top_n" not in form.errors
