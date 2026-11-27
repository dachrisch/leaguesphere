"""Render tests for the officials self-service UI copy and mobile layout.

Covers the team-column link target, the help hint, the "Entfernen" wording,
the "Anzahl Spiele" rename and the table-responsive/content-section fix.
"""

import re
from datetime import date

from django.test import Client, TestCase
from django.urls import reverse

from gamedays.tests.setup_factories.factories import (
    GameresultFactory,
    GamedayFactory,
    GameinfoFactory,
    GameOfficialFactory,
    TeamFactory,
)
from officials.constants import MOODLE_LOGGED_IN_USER
from officials.tests.setup_factories.db_setup_officials import DbSetupOfficials
from officials.tests.setup_factories.factories_officials import (
    OfficialExternalGamesFactory,
    OfficialFactory,
)

SEASON = date.today().year
LIST_URL_NAME = "view-officials-game-officials-appearance"
TEAM_GAMELIST_URL_NAME = "view-officials-game-officials-appearance-for-team-and-year"
TEAM_OVERVIEW_URL_NAME = "view-officials-list-for-team"
PROFILE_URL_NAME = "view-officials-profile-gamelist"
DFFL_DELETE_URL_NAME = "view-officials-selfservice-dffl-delete"
EXTERNAL_DELETE_URL_NAME = "view-officials-selfservice-external-delete"
MULTI_ADD_URL_NAME = "view-officials-selfservice-external-multi-add"
HELP_URL = "/help/offizielle-einsaetze/"
HELP_ICON = "bi bi-question-circle"
HELP_TEXT = "Einsätze müssen selbst gepflegt werden. Wie das funktioniert?"


class UiCopyTestBase(TestCase):
    def setUp(self):
        self.associations = DbSetupOfficials.create_production_associations()
        self.team = TeamFactory(
            name="Copy Team", description="Copy-Team-Beschreibung eindeutig"
        )
        self.official = OfficialFactory(
            first_name="Max", last_name="Mustermann", team=self.team
        )
        self.other = OfficialFactory(
            first_name="Erika", last_name="Musterfrau", team=self.team
        )
        self.client = Client()
        self.login()

    def login(self, official=None):
        session = self.client.session
        session[MOODLE_LOGGED_IN_USER] = (official or self.official).pk
        session.save()

    def make_row(self, official=None):
        gameday = GamedayFactory(date=date(SEASON, 5, 1), name="Spieltag UI Copy")
        gameinfo = GameinfoFactory(gameday=gameday, officials=self.team)
        GameresultFactory(gameinfo=gameinfo, team=self.team, isHome=True)
        GameresultFactory(
            gameinfo=gameinfo, team=TeamFactory(name="Gast Copy"), isHome=False
        )
        row = GameOfficialFactory(
            gameinfo=gameinfo,
            official=official or self.official,
            name="Max Mustermann",
            position="Referee",
        )
        return gameday, row

    def external_entry(self):
        return OfficialExternalGamesFactory(
            official=self.official,
            number_games=2,
            date=date(SEASON, 5, 2),
            notification_date=date(SEASON, 5, 3),
            position="Referee",
            association=self.associations["AFCVT"],
            halftime_duration=20,
            reporter_name="Eva Beispiel",
            comment="",
        )

    def einsaetze(self):
        return self.client.get(reverse(LIST_URL_NAME)).content.decode()

    def team_gamelist(self):
        return self.client.get(
            reverse(
                TEAM_GAMELIST_URL_NAME,
                kwargs={"pk": self.team.pk, "season": SEASON},
            )
        ).content.decode()

    def profile(self):
        return self.client.get(
            reverse(
                PROFILE_URL_NAME,
                kwargs={"pk": self.official.pk, "season": SEASON},
            )
        ).content.decode()

    def multi_add(self):
        return self.client.get(reverse(MULTI_ADD_URL_NAME)).content.decode()


class TestTeamColumnLink(UiCopyTestBase):
    def test_team_gamelist_links_team_column_to_team_overview(self):
        self.make_row()
        overview = reverse(TEAM_OVERVIEW_URL_NAME, kwargs={"pk": self.team.pk})
        gamelist = reverse(
            TEAM_GAMELIST_URL_NAME,
            kwargs={"pk": self.team.pk, "season": SEASON},
        )

        content = self.team_gamelist()

        assert f'href="{overview}">{self.team.description}</a>' in content
        assert f'href="{gamelist}">{self.team.description}</a>' not in content

    def test_einsaetze_keeps_team_column_link_to_team_gamelist(self):
        self.make_row()
        overview = reverse(TEAM_OVERVIEW_URL_NAME, kwargs={"pk": self.team.pk})
        gamelist = reverse(
            TEAM_GAMELIST_URL_NAME,
            kwargs={"pk": self.team.pk, "season": SEASON},
        )

        content = self.einsaetze()

        assert f'href="{gamelist}">{self.team.description}</a>' in content
        assert f'href="{overview}">{self.team.description}</a>' not in content


class TestHelpHint(UiCopyTestBase):
    def assert_help_hint(self, content):
        assert HELP_ICON in content
        assert HELP_TEXT in content
        assert f'href="{HELP_URL}"' in content
        assert content.index(HELP_TEXT) < content.index("<table")

    def test_einsaetze_has_help_hint(self):
        self.make_row()
        self.assert_help_hint(self.einsaetze())

    def test_profile_gamelist_has_help_hint(self):
        self.external_entry()
        self.assert_help_hint(self.profile())


class TestRemovalCopy(UiCopyTestBase):
    def assert_removal_link(self, content, url):
        match = re.search(
            rf'<a[^>]*href="{re.escape(url)}"[^>]*>.*?</a>', content, re.DOTALL
        )
        assert match, url
        assert "Entfernen" in match.group(0)
        assert "Löschen" not in match.group(0)

    def test_einsaetze_own_row_says_entfernen_with_unlink_icon(self):
        _, row = self.make_row()

        content = self.einsaetze()

        self.assert_removal_link(
            content, reverse(DFFL_DELETE_URL_NAME, kwargs={"pk": row.pk})
        )
        assert "bi bi-person-dash" in content
        assert ">Löschen<" not in content

    def test_profile_dffl_and_external_actions_say_entfernen(self):
        _, row = self.make_row()
        entry = self.external_entry()

        content = self.profile()

        self.assert_removal_link(
            content, reverse(DFFL_DELETE_URL_NAME, kwargs={"pk": row.pk})
        )
        self.assert_removal_link(
            content, reverse(EXTERNAL_DELETE_URL_NAME, kwargs={"pk": entry.pk})
        )
        assert "bi bi-person-dash" in content
        assert ">Löschen<" not in content


class TestSpieleCopy(UiCopyTestBase):
    def test_profile_external_table_renames_hash_spiele_everywhere(self):
        self.external_entry()

        content = self.profile()

        assert "#Spiele" not in content
        assert "Anzahl Spiele" in content
        assert 'data-bs-title="Anzahl Spiele gibt an' in content

    def test_multi_add_renames_hash_spiele_header_and_mobile_label(self):
        content = self.multi_add()

        assert "#Spiele" not in content
        assert '<th scope="col">Anzahl Spiele</th>' in content
        assert (
            '<span class="d-md-none fw-bold d-block">Anzahl Spiele:</span>' in content
        )


class TestResponsiveLayout(UiCopyTestBase):
    def assert_tables_are_wrapped(self, content):
        tables = content.count("<table")
        assert tables > 0
        wrapped = re.findall(r'<div class="table-responsive">\s*<table', content)
        assert len(wrapped) == tables, content

    def test_list_tables_are_inside_table_responsive(self):
        self.make_row()
        self.external_entry()

        self.assert_tables_are_wrapped(self.einsaetze())
        self.assert_tables_are_wrapped(self.profile())

    def test_confirmation_tables_are_inside_table_responsive(self):
        _, row = self.make_row()
        entry = self.external_entry()

        for url in (
            reverse(DFFL_DELETE_URL_NAME, kwargs={"pk": row.pk}),
            reverse(EXTERNAL_DELETE_URL_NAME, kwargs={"pk": entry.pk}),
            reverse("view-officials-selfservice-claim", kwargs={"pk": row.pk}),
        ):
            with self.subTest(url=url):
                self.assert_tables_are_wrapped(self.client.get(url).content.decode())
