"""Public Swiss standings page served through liveticker (no sign-in)."""

import datetime

from django.contrib.auth.models import User
from django.test import TestCase

from gamedays.models import Gameinfo, Gameresult, Gameday, League, Season, Team
from gameday_designer.service.swiss_tournament_service import SwissTournamentService


def make_gameday():
    season = Season.objects.create(name="2026")
    league = League.objects.create(name="Swiss Public League")
    user = User.objects.create(username="swiss-public-author")
    return Gameday.objects.create(
        name="Swiss Public Gameday",
        season=season,
        league=league,
        date=datetime.date.today(),
        start=datetime.time(9, 0),
        format="swiss",
        author=user,
    )


def make_teams(n):
    return [
        Team.objects.create(name=f"PubT{i}", description=f"Public team {i}",
                            location="Test City")
        for i in range(n)
    ]


def complete_game(game_id, home_score=10, away_score=0):
    game = Gameinfo.objects.get(pk=game_id)
    for result in Gameresult.objects.filter(gameinfo=game):
        result.fh = home_score if result.isHome else away_score
        result.sh = 0
        result.save()
    game.status = Gameinfo.STATUS_COMPLETED
    game.save()


class TestSwissStandingsPublicView(TestCase):
    def test_404_for_unknown_gameday(self):
        response = self.client.get("/liveticker/swiss/424242/standings/")
        self.assertEqual(response.status_code, 404)

    def test_friendly_page_without_swiss_setup(self):
        gameday = make_gameday()

        response = self.client.get(f"/liveticker/swiss/{gameday.pk}/standings/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "keine Schweizer-Tabelle")

    def test_renders_standings_after_round_one(self):
        gameday = make_gameday()
        teams = make_teams(4)
        service = SwissTournamentService(gameday)
        service.setup(
            seed_team_ids=[t.pk for t in teams],
            rounds=2,
            fields=2,
            game_duration=30,
        )
        generated = service.generate_round()
        for game_id in generated["game_ids"]:
            game = Gameinfo.objects.get(pk=game_id)
            for result in Gameresult.objects.filter(gameinfo=game):
                result.fh = 10 if result.isHome else 0
                result.sh = 0
                result.save()
            game.status = Gameinfo.STATUS_COMPLETED
            game.save()
        self.assertEqual(len(generated["game_ids"]), 2)

        response = self.client.get(f"/liveticker/swiss/{gameday.pk}/standings/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-testid="swiss-public-standings"')
        self.assertContains(response, "Runde 1/2")
        home_team = Gameresult.objects.get(
            gameinfo_id=generated["game_ids"][0], isHome=True
        ).team
        self.assertContains(response, home_team.description)
