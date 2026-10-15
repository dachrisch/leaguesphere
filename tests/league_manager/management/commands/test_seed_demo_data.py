import pytest
from django.core.management import call_command
from django.db.models import Count

from gamedays.models import GameOfficial, Gameinfo, Team
from officials.models import Official
from officials.service.officials_repository_service import OfficialsRepositoryService

OFFICIALS_TEAM_NAME = "Demo Officials"
COUNTED_POSITIONS = {"Referee", "Down Judge", "Field Judge", "Side Judge"}


@pytest.mark.django_db
class TestSeedDemoDataOfficials:
    """The demo needs officials data so the officials help/statistics pages and
    the scorecard official dropdowns are populated for video capture."""

    def test_seed_creates_officials_team_with_officials(self):
        call_command("seed_demo_data")

        officials_team = Team.objects.get(name=OFFICIALS_TEAM_NAME)
        assert Official.objects.filter(team=officials_team).count() >= 4

    def test_seeded_game_officials_use_counted_positions(self):
        call_command("seed_demo_data")

        positions = set(GameOfficial.objects.values_list("position", flat=True))
        assert positions
        assert positions <= COUNTED_POSITIONS

    def test_at_least_one_seeded_official_has_ten_games(self):
        call_command("seed_demo_data")

        per_official = GameOfficial.objects.values("official").annotate(n=Count("id"))
        assert per_official, "no GameOfficial rows were seeded"
        assert max(row["n"] for row in per_official) >= 10

    def test_seeded_games_point_at_the_officials_team(self):
        call_command("seed_demo_data")

        assert Gameinfo.objects.filter(officials__name=OFFICIALS_TEAM_NAME).exists()

    def test_officials_statistics_are_populated(self):
        call_command("seed_demo_data")

        game = Gameinfo.objects.filter(officials__name=OFFICIALS_TEAM_NAME).first()
        assert game is not None
        season = game.gameday.date.year

        statistics = OfficialsRepositoryService().get_officials_statistics_for_season(
            season
        )

        assert statistics["without_external"]
