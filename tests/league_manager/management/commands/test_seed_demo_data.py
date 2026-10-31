import pytest
from django.core.management import call_command
from django.db.models import Count

from gamedays.models import GameOfficial, Gameday, Gameinfo, Team
from league_manager.management.commands.seed_demo_data import (
    Command as SeedDemoData,
)
from officials.models import Official
from officials.service.officials_repository_service import OfficialsRepositoryService
from passcheck.models import PlayerlistGameday

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


@pytest.mark.django_db
class TestSeedDemoDataRosters:
    """The scorecard's jersey picker reads the roster of the gameday (the
    passcheck snapshot), so every seeded game needs players on both sides —
    otherwise the demo only ever shows "Kein Kader geladen"."""

    def test_every_seeded_game_has_a_roster_for_both_teams(
        self, client, django_user_model
    ):
        call_command("seed_demo_data")
        client.force_login(django_user_model.objects.create_user("roster-check"))

        games = Gameinfo.objects.all()
        assert games
        for game in games:
            response = client.get(f"/api/game/{game.pk}/roster")
            assert response.status_code == 200
            sides = {row["side"] for row in response.json()}
            assert sides == {"home", "away"}, (game.pk, sides)

    def test_checking_in_again_adds_no_second_roster_entry(self):
        call_command("seed_demo_data")
        first = PlayerlistGameday.objects.count()

        added = SeedDemoData().create_gameday_rosters(list(Gameday.objects.all()))

        assert first > 0
        assert added == 0
        assert PlayerlistGameday.objects.count() == first
