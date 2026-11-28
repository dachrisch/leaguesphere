from unittest.mock import patch, MagicMock

from django.test import TestCase, RequestFactory
from django.urls import reverse

from gamedays.models import Team
from officials.urls import OFFICIALS_LIST_FOR_ALL_TEAMS
from passcheck.urls import PASSCHECK_LIST_FOR_ALL_TEAMS
from passcheck.views import AllTeamListView


class TestAllTeamListView(TestCase):
    """
    officials/ no longer uses this shared AllTeamListView (it has its own
    AllTeamsCardListView + template, see officials/tests/test_views.py ::
    TestAllTeamsCardListView) - these tests guard that passcheck's picker,
    which still depends on the shared view/template, keeps working
    unaffected by that change.
    """

    def setUp(self):
        self.factory = RequestFactory()
        self.url_passcheck = reverse(PASSCHECK_LIST_FOR_ALL_TEAMS)
        self.url_officials = reverse(OFFICIALS_LIST_FOR_ALL_TEAMS)

    @patch(
        "gamedays.service.team_repository_service.TeamRepositoryService.get_all_teams"
    )
    def test_all_team_list_view_renders_correct_template(self, mock_get_all_teams):
        # Mock the team data
        mock_teams = [
            MagicMock(spec=Team, description="Team A"),
            MagicMock(spec=Team, description="Team B"),
        ]
        mock_get_all_teams.return_value = mock_teams

        # Use the test client to get the response
        response = self.client.get(self.url_passcheck)

        # Assertions
        assert response.status_code == 200
        # Check template names used
        template_names = [t.name for t in response.templates if t.name is not None]
        assert "team/all_teams_list.html" in template_names
        # Check context
        assert response.context["app"] == "passcheck"

    @patch(
        "gamedays.service.team_repository_service.TeamRepositoryService.get_all_teams"
    )
    def test_all_team_list_view_calls_service_method(self, mock_get_all_teams):
        mock_teams = [MagicMock(spec=Team, description="Team A")]
        mock_get_all_teams.return_value = mock_teams

        request = self.factory.get(self.url_passcheck)

        AllTeamListView.as_view()(request, app="passcheck")

        # Verify that the service method was called
        mock_get_all_teams.assert_called_once()

    def test_officials_route_no_longer_uses_the_shared_view_or_template(self):
        # officials/team/all/list/ and passcheck/team/all/list/ must resolve
        # to different URLs, and the officials one must not render the
        # shared team/all_teams_list.html template anymore.
        assert self.url_officials != self.url_passcheck

        response = self.client.get(self.url_officials)

        assert response.status_code == 200
        template_names = [t.name for t in response.templates if t.name is not None]
        assert "team/all_teams_list.html" not in template_names
        assert "officials/all_teams_card_list.html" in template_names
