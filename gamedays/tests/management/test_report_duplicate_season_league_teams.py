from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from gamedays.models import SeasonLeagueTeam
from gamedays.tests.setup_factories.factories import (
    LeagueFactory,
    SeasonFactory,
    SeasonLeagueTeamFactory,
    TeamFactory,
)


class ReportDuplicateSeasonLeagueTeamsTest(TestCase):
    def _call(self):
        out = StringIO()
        call_command("report_duplicate_season_league_teams", stdout=out)
        return out.getvalue()

    def test_reports_nothing_when_there_are_no_duplicates(self):
        season = SeasonFactory(name="2026/2027")
        SeasonLeagueTeamFactory(
            season=season, league=LeagueFactory(name="Premier Division")
        )

        output = self._call()

        assert "Keine Duplikate" in output

    def test_reports_existing_duplicate_rows(self):
        """Duplicates cannot be created through the UI, but historic rows exist
        (the admin ``duplicate_entry`` action). v1 reports them instead of adding
        a database constraint."""
        season = SeasonFactory(name="2025/2026")
        league = LeagueFactory(name="Premier Division")
        SeasonLeagueTeamFactory(season=season, league=league, teams=[TeamFactory()])
        # Bypass the form/service layer on purpose: this is historic data.
        SeasonLeagueTeam.objects.create(season=season, league=league)

        output = self._call()

        assert "2025/2026" in output
        assert "Premier Division" in output
        assert "2" in output
        assert "Keine Duplikate" not in output
