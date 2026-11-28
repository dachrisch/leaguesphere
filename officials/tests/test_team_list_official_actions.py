"""Staff-only claim/unassign actions on /officials/team/<pk>/list/.

The "Geleitete Spiele" table reuses matchreport's report renderer. Those
claim/unassign links must only be exposed to staff on the team list, and
their ``?next=`` must point back at the team list page (not at the
matchreport gameday detail page, which is the renderer's default).
"""

from datetime import date, datetime

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from django.utils.http import urlencode

from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    GameOfficialFactory,
    GameresultFactory,
    TeamFactory,
)
from matchreport.constants import REPORT_TABLE_RENDER_CONFIG
from matchreport.service.officiated_games_service import get_team_officiated_games
from officials.urls import OFFICIALS_LIST_FOR_TEAM
from officials.tests.setup_factories.factories_officials import OfficialFactory

CLAIM_URL_NAME = "view-officials-selfservice-claim"
UNASSIGN_URL_NAME = "view-officials-selfservice-unassign"


class TestTeamListOfficialActions(TestCase):
    def setUp(self):
        self.year = datetime.today().year
        self.team = TeamFactory(pk=69, name="team-69-actions")
        self.gameday = GamedayFactory(date=date(self.year, 5, 1))
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
        self.team_list_url = reverse(
            OFFICIALS_LIST_FOR_TEAM, kwargs={"pk": self.team.pk}
        )

    def test_staff_team_list_has_actions_with_encoded_team_list_next(self):
        self.client.force_login(
            User.objects.create_user(
                username="staff-user", password="pw", is_staff=True
            )
        )

        response = self.client.get(self.team_list_url)
        content = response.content.decode()

        expected_next = urlencode({"next": self.team_list_url})
        self.assertEqual(expected_next, "next=%2Fofficials%2Fteam%2F69%2Flist%2F")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Geleitete Spiele", content)
        self.assertIn("Zuordnen", content)
        self.assertIn("Zuordnung aufheben", content)
        self.assertIn(self.claim_url, content)
        self.assertIn(self.unassign_url, content)
        self.assertEqual(content.count(f"?{expected_next}"), 2)

    def test_non_staff_team_list_has_no_actions(self):
        self.client.force_login(
            User.objects.create_user(
                username="plain-user", password="pw", is_staff=False
            )
        )

        response = self.client.get(self.team_list_url)
        content = response.content.decode()

        self.assertEqual(response.status_code, 200)
        self.assertIn("Geleitete Spiele", content)
        self.assertNotIn("Zuordnen", content)
        self.assertNotIn("Zuordnung aufheben", content)
        self.assertNotIn(self.claim_url, content)
        self.assertNotIn(self.unassign_url, content)

    def test_service_default_still_omits_action_links(self):
        games = get_team_officiated_games(
            self.team.pk, self.year, REPORT_TABLE_RENDER_CONFIG
        )

        refs = games[0]["refs"]
        self.assertNotIn("Aktion", refs)
        self.assertNotIn(self.claim_url, refs)
        self.assertNotIn(self.unassign_url, refs)

    def test_service_opt_in_uses_the_provided_next_path(self):
        games = get_team_officiated_games(
            self.team.pk,
            self.year,
            REPORT_TABLE_RENDER_CONFIG,
            include_official_actions=True,
            next_path=self.team_list_url,
        )

        refs = games[0]["refs"]
        expected_next = urlencode({"next": self.team_list_url})
        self.assertIn("Zuordnen", refs)
        self.assertIn("Zuordnung aufheben", refs)
        self.assertEqual(refs.count(f"?{expected_next}"), 2)
