import pytest
from gamedays.models import Gameday, Gameinfo, Gameresult, Team, Season, League
from gamedays.service.bracket_resolution import BracketResolutionService
from datetime import date
from django.contrib.auth.models import User


@pytest.mark.django_db
class TestBracketResolutionService:
    """Test bracket reference resolution when game results are entered"""

    def setup_method(self):
        """Create test fixtures"""
        self.user = User.objects.create_user(username="test", password="test")
        self.season = Season.objects.create(name="2026")
        self.league = League.objects.create(name="Test")

        self.team_a = Team.objects.create(
            name="Team A", description="Team A Desc", location="City"
        )
        self.team_b = Team.objects.create(
            name="Team B", description="Team B Desc", location="City"
        )
        self.team_c = Team.objects.create(
            name="Team C", description="Team C Desc", location="City"
        )
        self.team_d = Team.objects.create(
            name="Team D", description="Team D Desc", location="City"
        )

        self.gameday = Gameday.objects.create(
            name="Test",
            season=self.season,
            league=self.league,
            date=date(2026, 2, 3),
            start="10:00",
            author=self.user,
        )

        # Create a simple bracket:
        # Game 1: Team A vs Team B
        # Game 2: "Winner of Game 1" vs Team C
        self.game1 = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled="10:00",
            field=1,
            officials=self.team_a,
            stage="Group",
            standing="Final",
        )

        self.game2 = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled="11:00",
            field=1,
            officials=self.team_a,
            stage="Semi",
            standing="Final",
        )

        # Create results for game 1
        Gameresult.objects.create(gameinfo=self.game1, team=self.team_a, isHome=True)
        Gameresult.objects.create(gameinfo=self.game1, team=self.team_b, isHome=False)

        # Game 2 has a bracket reference (will be resolved after game 1 result)
        Gameresult.objects.create(
            gameinfo=self.game2, team=None, isHome=True, pa=None
        )  # "Winner of Game 1"
        Gameresult.objects.create(gameinfo=self.game2, team=self.team_c, isHome=False)

    def test_resolve_bracket_reference_winner(self):
        """Test resolving 'Winner of Game X' reference"""
        service = BracketResolutionService()

        # Enter result for game 1: Team A wins 3-1
        home_result = Gameresult.objects.get(gameinfo=self.game1, isHome=True)
        away_result = Gameresult.objects.get(gameinfo=self.game1, isHome=False)
        home_result.fh = 2
        home_result.sh = 1
        home_result.save()
        away_result.fh = 1
        away_result.sh = 0
        away_result.save()

        # Resolve bracket references for game 2
        resolved_team = service.resolve_winner_reference(
            game_id=self.game1.id, gameday=self.gameday
        )

        assert resolved_team == self.team_a

    def test_cannot_resolve_when_result_missing(self):
        """Test that resolution fails gracefully when result not yet entered"""
        service = BracketResolutionService()

        # Try to resolve without entering game 1 result
        with pytest.raises(ValueError, match="Cannot resolve"):
            service.resolve_winner_reference(
                game_id=self.game1.id, gameday=self.gameday
            )

    def test_get_unresolved_bracket_references(self):
        """Test identifying which games have unresolved bracket references"""
        service = BracketResolutionService()

        # Game 2 should have unresolved references
        unresolved = service.get_unresolved_references(gameday=self.gameday)

        assert self.game2.id in [g.id for g in unresolved]
