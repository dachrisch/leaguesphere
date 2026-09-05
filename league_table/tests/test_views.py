from http import HTTPStatus

from django.template.loader import render_to_string
from django.test import SimpleTestCase
from django.urls import reverse
from django_webtest import WebTest

from gamedays.constants import LEAGUE_GAMEDAY_GAMEINFOS_WIZARD
from gamedays.forms import (
    GamedayGaminfoFieldsAndGroupsForm,
    GamedayFormatForm,
    GameinfoForm,
    SCHEDULE_CUSTOM_CHOICE_C,
)
from gamedays.models import Gameinfo, Gameresult, SeasonLeagueTeam
from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import (
    UserFactory,
    GamedayFactory,
    TeamFactory,
)
from gamedays.wizard import FIELD_GROUP_STEP
from league_table.constants import LEAGUE_TABLE_OVERALL_TABLE_BY_SLUG_AND_LEAGUE
from league_table.models import LeagueRulesetTieBreak, LeagueSeasonConfig
from league_table.tests.setup_factories.factories_leaguetable import (
    LeagueGroupFactory,
    LeagueSeasonConfigFactory,
    TieBreakStepFactory,
)

# class TestLeagueTableView(WebTest):
#     def test_league_table_for_year_is_displayed(self):
#         DBSetup().g72_finished()
#         DBSetup().g62_finished()
#         response = self.app.get(reverse('league-table-overall'))
#         assert 'team__name' in response.context['info']['schedule']
#
#     def test_league_table_for_league_is_displayed(self):
#         DBSetup().g72_finished()
#         DBSetup().g62_finished()
#         season = Season.objects.first()
#         west = League.objects.create(name='west')
#         south = League.objects.create(name='south')
#         teams_A = Team.objects.filter(name__startswith='A')
#         teams_B = Team.objects.filter(name__startswith='B')
#         for team in teams_A:
#             SeasonLeagueTeam.objects.create(season=season, league=south, team=team)
#         for team in teams_B:
#             SeasonLeagueTeam.objects.create(season=season, league=west, team=team)
#         response = self.app.get(reverse('league-table-league', kwargs={'season': season, 'league': south}))
#         assert 'team__name' in response.context['info']['schedule']


def _finished_game(gameday, standing, home, away, *, home_score, away_score):
    game = Gameinfo.objects.create(
        gameday=gameday,
        scheduled="10:00",
        field=1,
        officials=home,
        status=Gameinfo.STATUS_COMPLETED,
        stage="Gruppe",
        standing=standing,
    )
    Gameresult.objects.create(
        gameinfo=game, team=home, fh=home_score, sh=0, pa=away_score, isHome=True
    )
    Gameresult.objects.create(
        gameinfo=game, team=away, fh=away_score, sh=0, pa=home_score, isHome=False
    )
    return game


class TestLeagueTableViewModeExplanation(WebTest):
    """The mode-explanation footer (issue #1926) must only render for a
    non-default table mode — the default table's markup stays unchanged."""

    def _setup_league_with_one_game(self, **config_kwargs):
        config = LeagueSeasonConfigFactory(**config_kwargs)
        step = TieBreakStepFactory(key="win_quotient")
        LeagueRulesetTieBreak.objects.create(ruleset=config.ruleset, step=step, order=0)
        league, season = config.league, config.season
        config.leagues_for_league_points.add(league)

        team_a = TeamFactory(name="Team A", description="Team A")
        team_b = TeamFactory(name="Team B", description="Team B")
        membership = SeasonLeagueTeam.objects.create(season=season, league=league)
        membership.teams.add(team_a, team_b)

        gameday = GamedayFactory(season=season, league=league)
        _finished_game(gameday, "Gruppe 1", team_a, team_b, home_score=10, away_score=5)
        return config

    def test_no_explanation_box_for_default_mode(self):
        config = self._setup_league_with_one_game()

        response = self.app.get(
            reverse(
                LEAGUE_TABLE_OVERALL_TABLE_BY_SLUG_AND_LEAGUE,
                kwargs={"league": config.league.slug, "season": config.season.slug},
            )
        )

        assert (
            response.context["current_table_mode"]
            == LeagueSeasonConfig.TABLE_MODE_DEFAULT
        )
        assert "alert-info" not in response.text

    def test_explanation_box_shown_for_top_n_gamedays_mode(self):
        config = self._setup_league_with_one_game(
            table_mode=LeagueSeasonConfig.TABLE_MODE_TOP_N_GAMEDAYS,
            table_mode_top_n=3,
        )

        response = self.app.get(
            reverse(
                LEAGUE_TABLE_OVERALL_TABLE_BY_SLUG_AND_LEAGUE,
                kwargs={"league": config.league.slug, "season": config.season.slug},
            )
        )

        assert (
            response.context["current_table_mode"]
            == LeagueSeasonConfig.TABLE_MODE_TOP_N_GAMEDAYS
        )
        assert response.context["current_table_mode_top_n"] == 3
        assert "alert-info" in response.text
        assert "3" in response.text


class TestLeagueTablePartialWithoutTableModeContext(SimpleTestCase):
    """`leaguetable/league_table.html` is also included by
    gamedays/templates/gamedays/gameday_detail.html (qualify/final tables)
    WITHOUT `current_table_mode` in context — an undefined template variable
    is falsy, so a naive `current_table_mode != "default"` check would show
    the capping columns there too. They must stay hidden."""

    def test_no_capping_columns_render_without_current_table_mode_in_context(self):
        html = render_to_string(
            "leaguetable/league_table.html", {"info": {"table": [], "columns": []}}
        )

        assert "gewertet" not in html
        assert "gesamt" not in html


class TestGameinfoWizardWithLeagueGroup(WebTest):

    # TODO generischer Spielplan erzeugt Gruppen-Select mit den ausgewählten Gruppen und nicht wie in der JSON Datei hinterlegt ist
    def test_wizard_renders_gameinfo_with_league_group_while_generic_format_selected(
        self,
    ):
        group1 = LeagueGroupFactory(name="Group 1")
        group2 = LeagueGroupFactory(
            name="Group 2", season=group1.season, league=group1.league
        )
        teams = DBSetup().create_teams(name="LeagueGroupTeam", number_teams=3)
        user = UserFactory(is_staff=True)
        self.app.set_user(user)
        gameday = GamedayFactory(season=group1.season, league=group1.league)

        field_group_step = self.app.get(
            reverse(LEAGUE_GAMEDAY_GAMEINFOS_WIZARD, kwargs={"pk": gameday.pk})
        )
        assert isinstance(
            field_group_step.context["form"], GamedayGaminfoFieldsAndGroupsForm
        )
        assert field_group_step.context["form"].fields["group_names"].choices == [
            (group1.pk, group1.name),
            (group2.pk, group2.name),
        ]

        field_group_step_form = field_group_step.forms["fields-groups-form"]
        field_group_step_form[f"{FIELD_GROUP_STEP}-format"] = "3_1"
        field_group_step_form[f"{FIELD_GROUP_STEP}-number_fields"] = 1
        field_group_step_form[f"{FIELD_GROUP_STEP}-group_names"] = [group2.pk]

        gameday_format_step = field_group_step_form.submit()
        assert gameday_format_step.status_code == HTTPStatus.OK
        gameday_format_form = gameday_format_step.context["form"][0]
        assert isinstance(gameday_format_form, GamedayFormatForm)
        assert gameday_format_form.fields["group"].label == group2.name

        # gameday_format_step_form = gameday_format_step.forms["gamedays-format-form"]
        # gameday_format_step_form[f"{GAMEDAY_FORMAT_STEP}-0-group"]._forced_values = [
        #     team.pk for team in teams
        # ]
        #
        # gameinfo_update_page = gameday_format_step_form.submit().follow()
        # assert gameinfo_update_page.status_code == HTTPStatus.OK
        # assert gameinfo_update_page.request.path == reverse(
        #     LEAGUE_GAMEDAY_GAMEINFOS_UPDATE, kwargs={"pk": gameday.pk}
        # )
        # assert isinstance(gameinfo_update_page.context["form"][0], GameinfoForm)

    def test_wizard_renders_gameinfo_with_league_group_while_custom_format_selected(
        self,
    ):
        group1 = LeagueGroupFactory(name="Group 1")
        group2 = LeagueGroupFactory(
            name="Group 2", season=group1.season, league=group1.league
        )
        user = UserFactory(is_staff=True)
        self.app.set_user(user)
        gameday = GamedayFactory(season=group1.season, league=group1.league)

        field_group_step = self.app.get(
            reverse(LEAGUE_GAMEDAY_GAMEINFOS_WIZARD, kwargs={"pk": gameday.pk})
        )
        assert isinstance(
            field_group_step.context["form"], GamedayGaminfoFieldsAndGroupsForm
        )

        field_group_step_form = field_group_step.forms["fields-groups-form"]
        field_group_step_form[f"{FIELD_GROUP_STEP}-format"] = SCHEDULE_CUSTOM_CHOICE_C
        field_group_step_form[f"{FIELD_GROUP_STEP}-number_fields"] = 1
        field_group_step_form[f"{FIELD_GROUP_STEP}-group_names"] = [group2.pk]

        gameinfo_create_page = field_group_step_form.submit()
        assert gameinfo_create_page.status_code == HTTPStatus.OK
        assert gameinfo_create_page.request.path == reverse(
            LEAGUE_GAMEDAY_GAMEINFOS_WIZARD, kwargs={"pk": gameday.pk}
        )
        gameinfo_form = gameinfo_create_page.context["form"][0]
        assert isinstance(gameinfo_form, GameinfoForm)
        assert gameinfo_form.fields["standing"].choices == [
            (str(group2.pk), group2.name)
        ]
