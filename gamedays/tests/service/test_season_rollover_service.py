from django.test import TestCase

from gamedays.models import SeasonLeagueTeam
from gamedays.service.season_rollover_service import (
    RolloverSummary,
    copy_league_teams,
    previous_season,
)
from gamedays.tests.setup_factories.factories import (
    LeagueFactory,
    SeasonFactory,
    SeasonLeagueTeamFactory,
    TeamFactory,
)


class TestPreviousSeason(TestCase):
    def setUp(self):
        self.season_2024 = SeasonFactory(name="2024/2025")
        self.season_2025 = SeasonFactory(name="2025/2026")
        self.season_2026 = SeasonFactory(name="2026/2027")

    def test_picks_the_season_directly_before_the_target(self):
        assert previous_season(self.season_2026) == self.season_2025
        assert previous_season(self.season_2025) == self.season_2024

    def test_returns_none_for_the_oldest_season(self):
        assert previous_season(self.season_2024) is None

    def test_ignores_seasons_that_sort_after_the_target(self):
        SeasonFactory(name="2027/2028")

        assert previous_season(self.season_2026) == self.season_2025

    def test_ignores_the_target_itself(self):
        assert previous_season(self.season_2025).pk != self.season_2025.pk


class TestCopyLeagueTeams(TestCase):
    def setUp(self):
        self.source = SeasonFactory(name="2025/2026")
        self.target = SeasonFactory(name="2026/2027")
        self.league_a = LeagueFactory(name="Premier Division")
        self.league_b = LeagueFactory(name="League One")
        self.teams_a = [
            TeamFactory(name="Dragons", description="Zenith Dragons"),
            TeamFactory(name="Panthers", description="Solar Panthers"),
        ]
        self.teams_b = [TeamFactory(name="Wolves", description="Quantum Wolves")]
        SeasonLeagueTeamFactory(
            season=self.source, league=self.league_a, teams=self.teams_a
        )
        SeasonLeagueTeamFactory(
            season=self.source, league=self.league_b, teams=self.teams_b
        )

    def test_copies_rows_and_team_sets(self):
        summary = copy_league_teams(self.source, self.target)

        assert summary == RolloverSummary(created=2, skipped=0)
        copied = SeasonLeagueTeam.objects.get(season=self.target, league=self.league_a)
        assert set(copied.teams.all()) == set(self.teams_a)
        copied_b = SeasonLeagueTeam.objects.get(
            season=self.target, league=self.league_b
        )
        assert set(copied_b.teams.all()) == set(self.teams_b)

    def test_is_idempotent(self):
        copy_league_teams(self.source, self.target)

        summary = copy_league_teams(self.source, self.target)

        assert summary == RolloverSummary(created=0, skipped=2)
        assert SeasonLeagueTeam.objects.filter(season=self.target).count() == 2

    def test_skips_leagues_already_configured_for_the_target(self):
        SeasonLeagueTeamFactory(
            season=self.target, league=self.league_a, teams=self.teams_b
        )

        summary = copy_league_teams(self.source, self.target)

        assert summary == RolloverSummary(created=1, skipped=1)
        untouched = SeasonLeagueTeam.objects.get(
            season=self.target, league=self.league_a
        )
        assert set(untouched.teams.all()) == set(self.teams_b)

    def test_reports_nothing_for_a_source_without_assignments(self):
        empty = SeasonFactory(name="2019/2020")

        summary = copy_league_teams(empty, self.target)

        assert summary == RolloverSummary(created=0, skipped=0)
        assert SeasonLeagueTeam.objects.filter(season=self.target).count() == 0
