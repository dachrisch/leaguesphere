from datetime import date

import pytest
from django.core.management import call_command
from django.db.models import Count

from gamedays.models import GameOfficial, Gameday, Gameinfo, Person, Team
from league_manager.management.commands.seed_demo_data import (
    Command as SeedDemoData,
)
from officials.models import Official
from officials.service.officials_repository_service import OfficialsRepositoryService
from passcheck.models import Player, Playerlist, PlayerlistGameday

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


def _rostered_teams():
    """The demo teams that play a seeded game (placeholders have no team)."""
    return Team.objects.filter(gameresult__isnull=False).distinct()


@pytest.mark.django_db
class TestSeedDemoDataFixedRoster:
    """The demo database survives deploys and is seeded again on each fresh
    container, so the seed must find its players instead of adding new ones:
    every demo team keeps exactly ten, jerseys 1–10."""

    def test_seeding_again_keeps_ten_players_per_team(self):
        call_command("seed_demo_data")
        call_command("seed_demo_data")

        teams = _rostered_teams()
        assert teams
        for team in teams:
            jerseys = sorted(
                Playerlist.objects.filter(team=team).values_list(
                    "jersey_number", flat=True
                )
            )
            assert jerseys == list(range(1, 11)), (team.name, jerseys)

    def test_reseeding_drops_players_an_older_seed_left_behind(self):
        call_command("seed_demo_data")
        team = _rostered_teams().first()
        stray_person = Person.objects.create(
            first_name="Stray", last_name="Player", sex=Person.MALE, year_of_birth=1999
        )
        stray = Playerlist.objects.create(
            team=team,
            player=Player.objects.create(person=stray_person, pass_number="999999"),
            jersey_number=4,
            joined_on=date.today(),
        )

        call_command("seed_demo_data")

        assert not Playerlist.objects.filter(pk=stray.pk).exists()
        assert Playerlist.objects.filter(team=team).count() == 10

    def test_every_roster_has_ten_unique_jerseys_per_side(
        self, client, django_user_model
    ):
        call_command("seed_demo_data")
        call_command("seed_demo_data")
        client.force_login(django_user_model.objects.create_user("roster-size"))

        for game in Gameinfo.objects.filter(gameresult__team__isnull=False).distinct():
            rows = client.get(f"/api/game/{game.pk}/roster").json()
            for side in ("home", "away"):
                jerseys = [row["jersey"] for row in rows if row["side"] == side]
                assert sorted(jerseys) == list(range(1, 11)), (game.pk, side)

    def test_a_gameday_from_an_older_seed_still_gets_its_roster(
        self, client, django_user_model
    ):
        # The demo database keeps the gamedays its first seed dated; a later
        # seed must not give the players a join date after them.
        call_command("seed_demo_data")
        Gameday.objects.update(date=date(2024, 3, 1))
        Playerlist.objects.all().delete()
        call_command("seed_demo_data")
        client.force_login(django_user_model.objects.create_user("old-gameday"))

        game = Gameinfo.objects.filter(gameresult__team__isnull=False).first()
        rows = client.get(f"/api/game/{game.pk}/roster").json()
        assert len([row for row in rows if row["side"] == "home"]) == 10
