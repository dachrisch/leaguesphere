"""Tests that GamedayScheduleResolutionService registers teams to SeasonLeagueTeam on progression."""

import datetime
from unittest.mock import patch

import pytest
from django.contrib.auth.models import User

from gameday_designer.models import (
    ScheduleTemplate,
    TemplateSlot,
    TemplateApplication,
    TemplateUpdateRule,
    TemplateUpdateRuleTeam,
)
from gamedays.models import (
    Gameday,
    Gameinfo,
    Gameresult,
    League,
    Season,
    SeasonLeagueTeam,
    Team,
)
from gamedays.service.schedule_resolution_service import (
    GamedayScheduleResolutionService,
)


@pytest.mark.django_db
class TestScheduleResolutionRegistersSeasonLeagueTeam:
    def setup_method(self):
        self.user = User.objects.create_user(username="test", password="test")
        self.season = Season.objects.create(name="2025")
        self.league = League.objects.create(name="Süd")
        self.team_home = Team.objects.create(
            name="Winner A", description="A", location="City"
        )
        self.team_away = Team.objects.create(
            name="Winner B", description="B", location="City"
        )
        self.official_team = Team.objects.create(
            name="Official", description="O", location="City"
        )

        self.gameday = Gameday.objects.create(
            name="Finals Day",
            season=self.season,
            league=self.league,
            date=datetime.date.today(),
            start=datetime.time(10, 0),
            author=self.user,
        )

        self.template = ScheduleTemplate.objects.create(
            name="Test Template", num_teams=6, num_fields=1
        )
        TemplateApplication.objects.create(
            gameday=self.gameday, template=self.template, team_mapping={}
        )

        # Final round slot (home/away are references resolved by progression)
        self.final_slot = TemplateSlot.objects.create(
            template=self.template,
            field=1,
            slot_order=0,
            stage="Finals",
            standing="P1",
            home_reference="Winner HF1",
            away_reference="Winner HF2",
        )

        # Update rule: when "Halbfinale" finishes, populate this slot
        self.rule = TemplateUpdateRule.objects.create(
            template=self.template,
            slot=self.final_slot,
            pre_finished="Halbfinale",
        )
        TemplateUpdateRuleTeam.objects.create(
            update_rule=self.rule, role="home", standing="Halbfinale", place=1
        )
        TemplateUpdateRuleTeam.objects.create(
            update_rule=self.rule, role="away", standing="Halbfinale", place=2
        )

        # Target gameinfo for the final
        self.final_gi = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled=datetime.time(12, 0),
            field=1,
            stage="Finals",
            standing="P1",
            officials=self.official_team,
        )
        Gameresult.objects.create(gameinfo=self.final_gi, team=None, isHome=True)
        Gameresult.objects.create(gameinfo=self.final_gi, team=None, isHome=False)

    def test_progression_registers_assigned_teams_to_season_league_team(self):
        """When tournament progression assigns teams to a final round game,
        SeasonLeagueTeam records are created for those teams."""
        team_name_map = {
            (1, "Halbfinale", None): self.team_home.name,
            (2, "Halbfinale", None): self.team_away.name,
        }

        def fake_get_team_by(place, standing, points):
            return team_name_map[(place, standing, points)]

        service = GamedayScheduleResolutionService(self.gameday.pk)
        with patch.object(service.gmw, "get_team_by", side_effect=fake_get_team_by):
            service.update_participants("Halbfinale")

        registered_teams = set(
            SeasonLeagueTeam.objects.filter(
                season=self.season, league=self.league
            ).values_list("team_id", flat=True)
        )
        assert self.team_home.pk in registered_teams
        assert self.team_away.pk in registered_teams
