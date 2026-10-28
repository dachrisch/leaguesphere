from datetime import date
from io import StringIO

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from gamedays.models import Gameday, Gameresult, Gameinfo, GameOfficial, Team
from passcheck.models import (
    PasscheckVerification,
    Playerlist,
    PlayerlistGameday,
)


class SeedScorecardDemoTest(TestCase):
    def _seed(self, **options):
        out = StringIO()
        options.setdefault("stdout", out)
        call_command("seed_scorecard_demo", **options)
        return out.getvalue()

    def test_seeds_a_today_gameday_with_rosters_and_both_passcheck_states(self):
        self._seed()

        gameday = Gameday.objects.get(
            name="Scorecard v2 Testtag", date=timezone.localdate()
        )
        assert gameday.status == Gameday.STATUS_PUBLISHED
        assert gameday.published_at is not None
        assert gameday.author.username == "scorecard-test"

        games = Gameinfo.objects.filter(gameday=gameday)
        assert games.count() == 4
        assert all(game.status == "Geplant" for game in games)
        assert all(game.officials.name == "scorecard-test" for game in games)
        assert GameOfficial.objects.filter(gameinfo__gameday=gameday).count() == 16
        assert Gameresult.objects.filter(gameinfo__gameday=gameday).count() == 8

        teams = Team.objects.filter(name__startswith="Demo ")
        assert teams.count() == 4
        for team in teams:
            assert (
                PlayerlistGameday.objects.filter(
                    gameday=gameday, playerlist__team=team
                ).count()
                == 14
            )

        verified = PasscheckVerification.objects.filter(gameday=gameday)
        assert verified.count() == 2
        first_game_teams = set(
            Gameresult.objects.filter(gameinfo__gameday=gameday)
            .order_by("gameinfo_id")
            .values_list("team__name", flat=True)[:2]
        )
        assert set(verified.values_list("team__name", flat=True)) == first_game_teams

    def test_is_idempotent_for_the_same_date(self):
        day = date(2026, 10, 28)
        self._seed(date=day)
        counts = (
            Gameday.objects.filter(date=day).count(),
            Gameinfo.objects.filter(gameday__date=day).count(),
            PlayerlistGameday.objects.filter(gameday__date=day).count(),
            PasscheckVerification.objects.filter(gameday__date=day).count(),
        )

        self._seed(date=day)

        assert counts == (
            Gameday.objects.filter(date=day).count(),
            Gameinfo.objects.filter(gameday__date=day).count(),
            PlayerlistGameday.objects.filter(gameday__date=day).count(),
            PasscheckVerification.objects.filter(gameday__date=day).count(),
        )

    def test_sets_the_demo_user_password_and_staff_flag(self):
        self._seed(date=date(2026, 10, 28))

        user = User.objects.get(username="scorecard-test")
        assert user.is_staff is True
        assert user.check_password("ScorecardV2!2026") is True

    def test_custom_date_and_username(self):
        self._seed(date=date(2026, 10, 29), username="custom-crew")

        gameday = Gameday.objects.get(date=date(2026, 10, 29))
        assert gameday.author.username == "custom-crew"
        assert Gameinfo.objects.filter(gameday=gameday).count() == 4

    def test_creates_playerlist_rows_for_each_team(self):
        self._seed(date=date(2026, 10, 28))

        assert Playerlist.objects.filter(team__name__startswith="Demo ").count() == 56
