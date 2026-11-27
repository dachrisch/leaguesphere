"""The staff-only "Aktion" column must not leak onto the officials-list page.

``MachtreportModelWrapper.get_gameday_match_report()`` is reused by two very
different audiences: the staff-only matchreport gameday detail page and the
"Geleitete Spiele" table on the officials team list, which any authenticated
user can see. The claim/unassign links in that column point at self-service
confirm pages and carry a ``?next=/matchreport/...`` that non-staff cannot
follow, so the column is now opt-in and only the detail view opts in.
"""

from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    GameOfficialFactory,
    GameresultFactory,
    TeamFactory,
)
from matchreport.constants import REPORT_TABLE_RENDER_CONFIG
from matchreport.service.model_wrapper import MachtreportModelWrapper
from officials.service.officiated_games_service import get_team_officiated_games
from officials.tests.setup_factories.factories_officials import OfficialFactory
from officials.urls import OFFICIALS_LIST_FOR_TEAM_AND_YEAR

CLAIM_URL_NAME = "view-officials-selfservice-claim"
UNASSIGN_URL_NAME = "view-officials-selfservice-unassign"


class TestActionColumnIsRoleGated(TestCase):
    def setUp(self):
        self.team = TeamFactory(name="gated-team")
        self.gameday = GamedayFactory(date=date(2027, 5, 1))
        self.gameinfo = GameinfoFactory(gameday=self.gameday, officials=self.team)
        GameresultFactory(gameinfo=self.gameinfo, isHome=True)
        GameresultFactory(gameinfo=self.gameinfo, isHome=False)
        self.game_official = GameOfficialFactory(
            gameinfo=self.gameinfo,
            official=OfficialFactory(team=TeamFactory()),
            position="Referee",
        )
        self.claim_url = reverse(CLAIM_URL_NAME, kwargs={"pk": self.game_official.pk})
        self.unassign_url = reverse(
            UNASSIGN_URL_NAME, kwargs={"pk": self.game_official.pk}
        )

    def _refs(self, **kwargs):
        reports = MachtreportModelWrapper(self.gameday.pk).get_gameday_match_report(
            REPORT_TABLE_RENDER_CONFIG, **kwargs
        )
        return next(
            report["refs"]
            for report in reports
            if report["gameinfo_id"] == self.gameinfo.pk
        )

    def test_default_report_has_no_action_column_or_claim_links(self):
        refs = self._refs()

        self.assertNotIn("Aktion", refs)
        self.assertNotIn(self.claim_url, refs)
        self.assertNotIn(self.unassign_url, refs)

    def test_report_with_actions_has_action_column_and_claim_links(self):
        refs = self._refs(include_official_actions=True)

        self.assertIn("<th>Aktion</th>", refs)
        self.assertIn(self.claim_url, refs)
        self.assertIn(self.unassign_url, refs)

    def test_officiated_games_service_refs_have_no_action_column(self):
        # The path behind officials/templates/officials/officials_list.html's
        # "Geleitete Spiele" table, visible to any authenticated user.
        games = get_team_officiated_games(
            self.team.pk, 2027, REPORT_TABLE_RENDER_CONFIG
        )
        refs = games[0]["refs"]

        self.assertNotIn("Aktion", refs)
        self.assertNotIn(self.claim_url, refs)
        self.assertNotIn(self.unassign_url, refs)

    def test_non_staff_officials_list_has_no_action_links(self):
        self.client.force_login(
            User.objects.create_user(
                username="plain-user", password="pw", is_staff=False
            )
        )

        response = self.client.get(
            reverse(
                OFFICIALS_LIST_FOR_TEAM_AND_YEAR,
                kwargs={"pk": self.team.pk, "season": 2027},
            )
        )
        content = response.content.decode()

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("Aktion", content)
        self.assertNotIn(self.claim_url, content)
        self.assertNotIn(self.unassign_url, content)
