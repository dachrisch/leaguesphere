"""Seed one self-contained Scorecard v2 test gameday for *today*.

Run it on staging every morning (the stage DB is reset at midnight)::

    ssh cda@lehel.xyz "docker exec leaguesphere_stage.staging-app \
        python manage.py seed_scorecard_demo"

It is idempotent for the same date: rerunning updates the same rows instead of
creating duplicates. Everything is namespaced under a dedicated demo league and
team names, so it never touches real leagues/teams or the league table.
"""

from datetime import date, time

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from gamedays.models import (
    Gameday,
    Gameresult,
    Gameinfo,
    GameOfficial,
    League,
    Person,
    Season,
    SeasonLeagueTeam,
    Team,
)
from league_table.models import LeagueGroup
from officials.models import Official, OfficialLicense, OfficialLicenseHistory
from passcheck.models import (
    PasscheckVerification,
    Player,
    Playerlist,
    PlayerlistGameday,
)

DEFAULT_TEAMS = (
    "Demo Ravens",
    "Demo Wolves",
    "Demo Eagles",
    "Demo Hawks",
)
OFFICIAL_POSITIONS = ("Referee", "Down Judge", "Field Judge", "Side Judge")
DEMO_LEAGUE = "Scorecard Demo League"
DEMO_SEASON = "Scorecard Demo Season"
DEMO_GROUP = "Testgruppe"
PASS_NUMBER_BASE = 9_000_000


class Command(BaseCommand):
    help = "Seed the Scorecard v2 demo gameday for a date (default: today)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--date",
            type=date.fromisoformat,
            default=None,
            help="Gameday date (YYYY-MM-DD). Defaults to today.",
        )
        parser.add_argument(
            "--name", default="Scorecard v2 Testtag", help="Gameday name."
        )
        parser.add_argument(
            "--username", default="scorecard-test", help="Staff user and crew name."
        )
        parser.add_argument(
            "--password",
            default="ScorecardV2!2026",
            help="Password set on the demo user (stage only).",
        )
        parser.add_argument(
            "--league", default=DEMO_LEAGUE, help="Demo league name."
        )
        parser.add_argument(
            "--season", default=DEMO_SEASON, help="Demo season name."
        )
        parser.add_argument(
            "--address", default="Testfeld", help="Gameday address."
        )
        parser.add_argument(
            "--players-per-team",
            type=int,
            default=14,
            help="Roster size per demo team.",
        )

    def handle(self, *args, **options):
        gameday_date = options["date"] or timezone.localdate()
        username = options["username"].strip()
        teams = DEFAULT_TEAMS
        roster_size = max(1, options["players_per_team"])

        with transaction.atomic():
            user = self._user(username, options["password"])
            officials_team = self._officials_team(username)
            league = self._league(options["league"])
            season = self._season(options["season"])
            demo_teams = [self._team(name) for name in teams]
            season_league = SeasonLeagueTeam.objects.get_or_create(
                season=season, league=league
            )[0]
            season_league.teams.add(*demo_teams)

            gameday = self._gameday(
                options["name"],
                gameday_date,
                season,
                league,
                user,
                options["address"],
            )
            group = LeagueGroup.objects.get_or_create(
                league=league, season=season, name=DEMO_GROUP
            )[0]
            crew = self._crew(officials_team)

            for team in demo_teams:
                self._roster(team, gameday, roster_size)

            games = self._games(gameday, group, officials_team, crew, demo_teams)
            self._passcheck(gameday, user, demo_teams, games)

        self.stdout.write(
            self.style.SUCCESS(
                f"Scorecard demo seeded: gameday {gameday.pk} on {gameday_date} "
                f"with {len(games)} games, {roster_size} players per team, "
                f"user '{username}'."
            )
        )

    # -- pieces ---------------------------------------------------------

    def _user(self, username, password):
        user, created = User.objects.get_or_create(
            username=username,
            defaults={"is_staff": True, "email": f"{username}@example.invalid"},
        )
        if created or not user.check_password(password):
            user.set_password(password)
        user.is_staff = True
        user.save()
        return user

    def _officials_team(self, username):
        team, _ = Team.objects.get_or_create(
            name=username,
            defaults={
                "description": f"Scorecard demo crew ({username})",
                "location": "Demo",
            },
        )
        return team

    def _league(self, name):
        league, _ = League.objects.get_or_create(name=name)
        return league

    def _season(self, name):
        season, _ = Season.objects.get_or_create(name=name)
        return season

    def _team(self, name):
        team, _ = Team.objects.get_or_create(
            name=name,
            defaults={"description": f"{name} (Scorecard demo)", "location": "Demo"},
        )
        return team

    def _gameday(self, name, gameday_date, season, league, user, address):
        gameday, _ = Gameday.objects.get_or_create(
            name=name,
            date=gameday_date,
            defaults={
                "season": season,
                "league": league,
                "start": time(13, 30),
                "format": "6_2",
                "author": user,
                "address": address,
                "status": Gameday.STATUS_PUBLISHED,
                "published_at": timezone.now(),
            },
        )
        gameday.season = season
        gameday.league = league
        gameday.author = user
        gameday.address = address
        gameday.status = Gameday.STATUS_PUBLISHED
        gameday.published_at = gameday.published_at or timezone.now()
        gameday.save()
        return gameday

    def _crew(self, officials_team):
        licence, _ = OfficialLicense.objects.get_or_create(name="F1")
        crew = []
        for index, position in enumerate(OFFICIAL_POSITIONS, start=1):
            official, _ = Official.objects.get_or_create(
                team=officials_team,
                first_name="Demo",
                last_name=f"Offizieller {index}",
            )
            OfficialLicenseHistory.objects.get_or_create(
                official=official,
                license=licence,
                created_at=timezone.localdate(),
                defaults={"result": 1},
            )
            crew.append((position, official))
        return crew

    def _roster(self, team, gameday, roster_size):
        for jersey in range(1, roster_size + 1):
            pass_number = str(PASS_NUMBER_BASE + team.pk * 100 + jersey)
            person = Person.objects.filter(
                first_name="Demo", last_name=f"{team.name.split()[-1]} {jersey}"
            ).first()
            if person is None:
                person = Person.objects.create(
                    first_name="Demo",
                    last_name=f"{team.name.split()[-1]} {jersey}",
                    sex=Person.MALE,
                    year_of_birth=2000,
                )
            player = Player.objects.filter(pass_number=pass_number).first()
            if player is None:
                player = Player.objects.create(
                    person=person, pass_number=pass_number
                )
            playerlist = Playerlist.objects.filter(
                team=team, jersey_number=jersey, left_on__isnull=True
            ).first()
            if playerlist is None:
                playerlist = Playerlist.objects.create(
                    team=team,
                    player=player,
                    jersey_number=jersey,
                )
            PlayerlistGameday.objects.get_or_create(
                playerlist=playerlist,
                gameday=gameday,
                defaults={"gameday_jersey": jersey},
            )

    def _games(self, gameday, group, officials_team, crew, teams):
        matchups = (
            (0, 1, "Testspiel 1", time(13, 30), 1),
            (2, 3, "Testspiel 2", time(13, 30), 2),
            (1, 2, "Testspiel 3", time(14, 40), 1),
            (3, 0, "Testspiel 4", time(14, 40), 2),
        )
        games = []
        for home_index, away_index, stage, scheduled, field in matchups:
            game, _ = Gameinfo.objects.get_or_create(
                gameday=gameday,
                stage=stage,
                defaults={
                    "scheduled": scheduled,
                    "field": field,
                    "status": "Geplant",
                    "standing": group.name,
                    "stage_category": "preliminary",
                    "league_group": group,
                    "officials": officials_team,
                },
            )
            game.scheduled = scheduled
            game.field = field
            game.status = "Geplant"
            game.stage_category = "preliminary"
            game.league_group = group
            game.officials = officials_team
            game.save()
            for is_home, team in ((True, teams[home_index]), (False, teams[away_index])):
                Gameresult.objects.get_or_create(
                    gameinfo=game,
                    team=team,
                    isHome=is_home,
                    defaults={"fh": None, "sh": None, "pa": None},
                )
            for position, official in crew:
                GameOfficial.objects.update_or_create(
                    gameinfo=game,
                    position=position,
                    defaults={
                        "official": official,
                        "name": f"{official.first_name} {official.last_name}",
                    },
                )
            games.append(game)
        return games

    def _passcheck(self, gameday, user, teams, games):
        """Verify the first game's two teams, so both chip states are visible."""
        if not games:
            return
        for team in teams[:2]:
            PasscheckVerification.objects.get_or_create(
                gameday=gameday,
                team=team,
                defaults={"user": user, "official_name": "Scorecard Demo"},
            )
