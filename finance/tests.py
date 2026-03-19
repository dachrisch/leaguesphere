from decimal import Decimal
from django.test import TestCase, Client
from django.contrib.auth.models import User
from gamedays.models import League, Season, Team, Gameday, Gameinfo, Gameresult
from .models import LeagueSeasonFinancialConfig, LeagueSeasonDiscount, FinancialSettings
from .services import FinanceService


class FinanceServiceTest(TestCase):
    def setUp(self):
        self.user = User.objects.create(id=1, username="admin")
        self.season = Season.objects.create(name="2026")
        self.league = League.objects.create(name="DFFL")
        self.team1 = Team.objects.create(
            name="Team A", description="Team A Desc", location="Berlin"
        )
        self.team2 = Team.objects.create(
            name="Team B", description="Team B Desc", location="Hamburg"
        )

        # Default settings
        self.settings = FinancialSettings.objects.create(
            default_rate_per_team_season=Decimal("100.00"),
            default_rate_per_team_gameday=Decimal("20.00"),
        )

    def test_calculate_costs_season_model(self):
        config = LeagueSeasonFinancialConfig.objects.create(
            league=self.league,
            season=self.season,
            cost_model=LeagueSeasonFinancialConfig.MODEL_SEASON,
        )
        gameday = Gameday.objects.create(
            name="Gameday 1",
            league=self.league,
            season=self.season,
            date="2026-03-15",
            start="10:00",
            author=self.user,
        )
        gi = Gameinfo.objects.create(
            gameday=gameday,
            scheduled="10:00",
            field=1,
            officials=self.team2,
            stage="Main",
            standing="P1",
        )
        Gameresult.objects.create(gameinfo=gi, team=self.team1, isHome=True)

        costs = FinanceService.calculate_costs(config)
        # team1 plays, team2 officials → 2 unique teams × 100.00
        self.assertEqual(costs["gross"], Decimal("200.00"))
        self.assertEqual(costs["net"], Decimal("200.00"))

    def test_calculate_costs_gameday_model(self):
        config = LeagueSeasonFinancialConfig.objects.create(
            league=self.league,
            season=self.season,
            cost_model=LeagueSeasonFinancialConfig.MODEL_GAMEDAY,
        )

        gameday = Gameday.objects.create(
            name="Gameday 1",
            league=self.league,
            season=self.season,
            date="2026-03-15",
            start="10:00",
            author=self.user,
        )

        # Team 1 plays, Team 2 officials
        gi = Gameinfo.objects.create(
            gameday=gameday,
            scheduled="10:00",
            field=1,
            officials=self.team2,
            stage="Main",
            standing="P1",
        )
        Gameresult.objects.create(gameinfo=gi, team=self.team1, isHome=True)

        costs = FinanceService.calculate_costs(config)
        # 2 unique teams * 20.00 = 40.00
        self.assertEqual(costs["gross"], Decimal("40.00"))

    def test_discounts_fixed_and_percent(self):
        config = LeagueSeasonFinancialConfig.objects.create(
            league=self.league,
            season=self.season,
            cost_model=LeagueSeasonFinancialConfig.MODEL_SEASON,
            base_rate_override=Decimal("100.00"),
        )
        gameday = Gameday.objects.create(
            name="Gameday 1",
            league=self.league,
            season=self.season,
            date="2026-03-15",
            start="10:00",
            author=self.user,
        )
        gi = Gameinfo.objects.create(
            gameday=gameday,
            scheduled="10:00",
            field=1,
            officials=self.team2,
            stage="Main",
            standing="P1",
        )
        Gameresult.objects.create(gameinfo=gi, team=self.team1, isHome=True)

        # Fixed global discount
        LeagueSeasonDiscount.objects.create(
            config=config,
            discount_type=LeagueSeasonDiscount.TYPE_FIXED,
            value=Decimal("10.00"),
        )
        # Percent global discount
        LeagueSeasonDiscount.objects.create(
            config=config,
            discount_type=LeagueSeasonDiscount.TYPE_PERCENTAGE,
            value=Decimal("10.00"),
        )

        costs = FinanceService.calculate_costs(config)
        # Gross = 2 teams × 100 = 200
        # Fixed discount = 10
        # Percent discount = 10% of 200 = 20
        # Total discount = 30, net = 170
        self.assertEqual(costs["gross"], Decimal("200.00"))
        self.assertEqual(costs["discount"], Decimal("30.00"))
        self.assertEqual(costs["net"], Decimal("170.00"))

    def test_gameday_model_global_discount(self):
        config = LeagueSeasonFinancialConfig.objects.create(
            league=self.league,
            season=self.season,
            cost_model=LeagueSeasonFinancialConfig.MODEL_GAMEDAY,
            base_rate_override=Decimal("20.00"),
        )
        gameday = Gameday.objects.create(
            name="Gameday 1",
            league=self.league,
            season=self.season,
            date="2026-03-15",
            start="10:00",
            author=self.user,
        )
        gi = Gameinfo.objects.create(
            gameday=gameday,
            scheduled="10:00",
            field=1,
            officials=self.team2,
            stage="Main",
            standing="P1",
        )
        Gameresult.objects.create(gameinfo=gi, team=self.team1, isHome=True)

        LeagueSeasonDiscount.objects.create(
            config=config,
            discount_type=LeagueSeasonDiscount.TYPE_FIXED,
            value=Decimal("5.00"),
        )

        costs = FinanceService.calculate_costs(config)
        # Gross = 2 teams × 20 = 40; fixed global discount = 5; net = 35
        self.assertEqual(costs["gross"], Decimal("40.00"))
        self.assertEqual(costs["discount"], Decimal("5.00"))
        self.assertEqual(costs["net"], Decimal("35.00"))

    def test_discount_has_no_team_field(self):
        """Discounts are per-config, not per-team."""
        config = LeagueSeasonFinancialConfig.objects.create(
            league=self.league,
            season=self.season,
            cost_model=LeagueSeasonFinancialConfig.MODEL_SEASON,
            base_rate_override=Decimal("50.00"),
        )
        # Should be creatable without a team argument
        discount = LeagueSeasonDiscount(
            config=config,
            discount_type=LeagueSeasonDiscount.TYPE_FIXED,
            value=Decimal("5.00"),
            description="Early bird",
        )
        # team field should not exist
        self.assertFalse(hasattr(discount, "team"))

    def test_dummy_teams_excluded_from_participation(self):
        dummy_team = Team.objects.create(
            name="Gewinner Spiel 4", description="", location="dummy"
        )
        config = LeagueSeasonFinancialConfig.objects.create(
            league=self.league,
            season=self.season,
            cost_model=LeagueSeasonFinancialConfig.MODEL_SEASON,
            base_rate_override=Decimal("100.00"),
        )
        gameday = Gameday.objects.create(
            name="Gameday 1",
            league=self.league,
            season=self.season,
            date="2026-03-15",
            start="10:00",
            author=self.user,
        )
        # real team plays, dummy team officiates
        gi = Gameinfo.objects.create(
            gameday=gameday,
            scheduled="10:00",
            field=1,
            officials=dummy_team,
            stage="Main",
            standing="P1",
        )
        Gameresult.objects.create(gameinfo=gi, team=self.team1, isHome=True)

        costs = FinanceService.calculate_costs(config)
        # Only team1 counts (dummy officiating team excluded)
        self.assertEqual(costs["live_participation_count"], 1)
        self.assertEqual(costs["gross"], Decimal("100.00"))


class FinanceAccessControlTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.finance_url = "/finance/dashboard/"  # dashboard URL

        self.bumbleflies_staff = User.objects.create_user(
            username="bf_admin", email="admin@bumbleflies.de", password="pass"
        )
        self.bumbleflies_staff.is_staff = True
        self.bumbleflies_staff.save()

        self.other_staff = User.objects.create_user(
            username="other_admin", email="admin@other.de", password="pass"
        )
        self.other_staff.is_staff = True
        self.other_staff.save()

        self.regular_user = User.objects.create_user(
            username="regular", email="user@bumbleflies.de", password="pass"
        )

    def test_bumbleflies_staff_can_access_finance(self):
        self.client.login(username="bf_admin", password="pass")
        response = self.client.get(self.finance_url)
        self.assertEqual(response.status_code, 200)

    def test_other_staff_redirected_to_home(self):
        self.client.login(username="other_admin", password="pass")
        response = self.client.get(self.finance_url)
        self.assertRedirects(response, "/", fetch_redirect_response=False)

    def test_non_staff_redirected_to_home(self):
        self.client.login(username="regular", password="pass")
        response = self.client.get(self.finance_url)
        self.assertRedirects(response, "/", fetch_redirect_response=False)

    def test_unauthenticated_redirected_to_home(self):
        response = self.client.get(self.finance_url)
        self.assertRedirects(response, "/", fetch_redirect_response=False)

    def test_bumbleflies_staff_sees_finance_menu(self):
        self.client.login(username="bf_admin", password="pass")
        response = self.client.get("/")
        menu_groups = response.context.get("menu_items", {})
        finance_group = menu_groups.get("Finance", {})
        self.assertTrue(
            finance_group.get("items"),
            "Finance menu group should have items for bumbleflies staff",
        )

    def test_other_staff_does_not_see_finance_menu(self):
        self.client.login(username="other_admin", password="pass")
        response = self.client.get("/")
        menu_groups = response.context.get("menu_items", {})
        finance_group = menu_groups.get("Finance", {})
        self.assertFalse(
            finance_group.get("items"),
            "Finance menu group should have no items for non-bumbleflies staff",
        )

    def test_unauthenticated_does_not_see_finance_menu(self):
        response = self.client.get("/")
        menu_groups = response.context.get("menu_items", {})
        finance_group = menu_groups.get("Finance", {})
        self.assertFalse(
            finance_group.get("items"),
            "Finance menu group should have no items for unauthenticated users",
        )
