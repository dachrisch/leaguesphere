from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.utils import timezone
from gamedays.models import (
    Team,
    Season,
    League,
    Association,
    SeasonLeagueTeam,
    Gameday,
    Gameinfo,
    GameOfficial,
    Gameresult,
    Person,
)
from officials.models import Official, OfficialLicense, OfficialLicenseHistory
from passcheck.models import Player, Playerlist, PlayerlistGameday
from league_table.models import LeagueGroup
import random
from datetime import datetime, timedelta, date

OFFICIALS_TEAM_NAME = "Demo Officials"
OFFICIAL_POSITIONS = ["Referee", "Down Judge", "Field Judge", "Side Judge"]


# Every demo player joined before any seeded gameday, whenever it was dated.
DEMO_JOINED_ON = date(2000, 1, 1)


class Command(BaseCommand):
    help = "Seed demo database with synthetic data for demo.leaguesphere.app"

    def handle(self, *args, **options):
        self.stdout.write("Starting demo data seeding...")

        # Create demo associations
        associations = self.create_associations()
        self.stdout.write(f"✓ Created {len(associations)} associations")

        # Create demo leagues
        leagues = self.create_leagues()
        self.stdout.write(f"✓ Created {len(leagues)} leagues")

        # Create demo seasons
        seasons = self.create_seasons()
        self.stdout.write(f"✓ Created {len(seasons)} seasons")

        # Create demo teams
        teams = self.create_teams(associations)
        self.stdout.write(f"✓ Created {len(teams)} teams")

        # Create season-league-team relationships
        self.create_season_league_teams(seasons, leagues, teams)
        self.stdout.write("✓ Created season-league-team relationships")

        # Create players for teams
        players_count = self.create_team_players(teams)
        self.stdout.write(f"✓ Created {players_count} players for teams")

        # Create demo users by role
        self.create_demo_users()
        self.stdout.write("✓ Created demo user accounts")

        # Create gamedays with games
        gamedays_count = self.create_gamedays(seasons, leagues, teams)
        self.stdout.write(f"✓ Created {gamedays_count} gamedays with sample games")

        # Check the players in for every seeded gameday (the passcheck
        # snapshot), so the scorecard's jersey picker has a roster to offer.
        gamedays = list(Gameday.objects.filter(season=seasons[-1])) if seasons else []
        rostered = self.create_gameday_rosters(gamedays)
        self.stdout.write(f"✓ Checked in {rostered} players for their gamedays")

        # Create an officials crew and assign them to the seeded games, so the
        # officials statistics pages and the scorecard official dropdowns are
        # populated for demo/help-video capture.
        officials_count = self.create_officials(associations, gamedays)
        self.stdout.write(
            f"✓ Created {officials_count} officials and assigned them to games"
        )

        self.stdout.write(
            self.style.SUCCESS("✅ Demo data seeding completed successfully!")
        )

    def create_associations(self):
        """Create demo associations representing different regional governing bodies."""
        associations_data = [
            {"abbr": "MPL", "name": "Metropolitan Premier League"},
            {"abbr": "UNC", "name": "United Nations Cup"},
            {"abbr": "CSF", "name": "Continental Soccer Federation"},
            {"abbr": "RSF", "name": "Regional Soccer Federation"},
        ]
        associations = []
        for data in associations_data:
            assoc, created = Association.objects.get_or_create(
                abbr=data["abbr"], defaults={"name": data["name"]}
            )
            associations.append(assoc)
        return associations

    def create_leagues(self):
        """Create demo leagues."""
        league_names = [
            "Premier Division",
            "Championship Division",
            "League One",
            "League Two",
        ]
        leagues = []
        for name in league_names:
            league, created = League.objects.get_or_create(
                name=name, defaults={"slug": name.lower().replace(" ", "-")}
            )
            leagues.append(league)
        return leagues

    def create_seasons(self):
        """Create demo seasons."""
        season_names = [
            "2023/2024",
            "2024/2025",
            "2025/2026",
        ]
        seasons = []
        for name in season_names:
            season, created = Season.objects.get_or_create(
                name=name, defaults={"slug": name.lower().replace("/", "-")}
            )
            seasons.append(season)
        return seasons

    def create_teams(self, associations):
        """Create demo teams with predefined data."""
        team_data = [
            {
                "name": "Phoenix United",
                "description": "The rising bird team from the north",
            },
            {"name": "Stellar Strikers", "description": "Bright stars of the south"},
            {"name": "Velocity FC", "description": "Speed and precision football"},
            {"name": "Thunder Titans", "description": "Mighty and powerful"},
            {"name": "Crystal Eagles", "description": "Pure and soaring high"},
            {"name": "Quantum Wolves", "description": "Advanced and fierce"},
            {"name": "Solar Panthers", "description": "Energetic and athletic"},
            {"name": "Nexus Rockets", "description": "Connected and fast"},
            {"name": "Zenith Dragons", "description": "Peak performance team"},
            {
                "name": "Horizon Falcons",
                "description": "Looking forward and determined",
            },
            {
                "name": "Infinity Cougars",
                "description": "Endless potential and strength",
            },
            {"name": "Aurora Leopards", "description": "Beautiful dawn athletes"},
        ]

        teams = []
        for team_info in team_data:
            team, created = Team.objects.get_or_create(
                name=team_info["name"],
                defaults={
                    "description": team_info["description"],
                    "location": f"Demo City {random.randint(1, 50)}",
                    "association": random.choice(associations),
                },
            )
            teams.append(team)
        return teams

    def create_season_league_teams(self, seasons, leagues, teams):
        """Create relationships between seasons, leagues, and teams."""
        # For the latest season (2025/2026), associate teams with leagues
        if seasons:
            latest_season = seasons[-1]  # 2025/2026
            for league in leagues:
                # Distribute teams evenly across leagues
                league_teams = []
                for i in range(3):  # 3 teams per league
                    team_idx = (leagues.index(league) * 3 + i) % len(teams)
                    league_teams.append(teams[team_idx])

                season_league_team, created = SeasonLeagueTeam.objects.get_or_create(
                    season=latest_season,
                    league=league,
                )
                if created or season_league_team.teams.count() == 0:
                    season_league_team.teams.set(league_teams)

    def create_team_players(self, teams):
        """Give every team the same ten players on every run.

        The demo database outlives deploys and each fresh container seeds it
        again, so the roster is fixed: player ``k`` of all teams gets the
        ``k``-th name pair (unique for up to 400 players) and jerseys 1–10.
        Anything else on a demo team's list — left over from an older seed
        that picked names at random — is removed with its gameday check-ins.
        """
        player_count = 0
        first_names = [
            "Michael",
            "David",
            "James",
            "Robert",
            "John",
            "Thomas",
            "Daniel",
            "Matthew",
            "Christopher",
            "Anthony",
            "Sarah",
            "Emma",
            "Lisa",
            "Anna",
            "Jennifer",
            "Maria",
            "Jessica",
            "Laura",
            "Michelle",
            "Sandra",
        ]
        last_names = [
            "Schmidt",
            "Mueller",
            "Schneider",
            "Fischer",
            "Weber",
            "Meyer",
            "Wagner",
            "Becker",
            "Schulz",
            "Hoffmann",
            "Schroeder",
            "Koch",
            "Bauer",
            "Richter",
            "Wolf",
            "Schaefer",
            "Hill",
            "Graham",
            "Thompson",
            "Taylor",
        ]

        roster_size = 10
        kept = []
        for team_index, team in enumerate(teams):
            for jersey in range(1, roster_size + 1):
                k = team_index * roster_size + jersey - 1
                first_name = first_names[k % len(first_names)]
                last_name = last_names[(k // len(first_names) + k) % len(last_names)]

                person = Person.objects.filter(
                    first_name=first_name, last_name=last_name
                ).first()
                if person is None:
                    person = Person.objects.create(
                        first_name=first_name,
                        last_name=last_name,
                        sex=Person.FEMALE if k % 2 else Person.MALE,
                        year_of_birth=1990 + k % 20,
                    )

                player = Player.objects.filter(person=person).first()
                if player is None:
                    player = Player.objects.create(
                        person=person, pass_number=f"{team.id}{jersey:02d}"
                    )

                # A fixed early join date: the gamedays keep the date their
                # first seed gave them, and the roster only counts players
                # who had joined by then.
                playerlist, created = Playerlist.objects.update_or_create(
                    team=team,
                    player=player,
                    defaults={
                        "jersey_number": jersey,
                        "joined_on": DEMO_JOINED_ON,
                        "left_on": None,
                    },
                )
                kept.append(playerlist.pk)
                if created:
                    player_count += 1

        Playerlist.objects.filter(team__in=teams).exclude(pk__in=kept).delete()
        return player_count

    def create_demo_users(self):
        """Create demo user accounts with predefined credentials."""
        demo_accounts = [
            {
                "username": "admin@demo.local",
                "email": "admin@demo.local",
                "password": "DemoAdmin123!",
                "is_staff": True,
                "is_superuser": True,
            },
            {
                "username": "referee@demo.local",
                "email": "referee@demo.local",
                "password": "DemoRef123!",
                "is_staff": False,
                "is_superuser": False,
            },
            {
                "username": "manager@demo.local",
                "email": "manager@demo.local",
                "password": "DemoMgr123!",
                "is_staff": False,
                "is_superuser": False,
            },
            {
                "username": "user@demo.local",
                "email": "user@demo.local",
                "password": "DemoUser123!",
                "is_staff": False,
                "is_superuser": False,
            },
        ]

        for account in demo_accounts:
            user, created = User.objects.get_or_create(
                username=account["username"],
                defaults={
                    "email": account["email"],
                    "is_staff": account["is_staff"],
                    "is_superuser": account["is_superuser"],
                    "first_name": account["username"].split("@")[0].title(),
                },
            )
            if created:
                user.set_password(account["password"])
                user.save()

    def create_gamedays(self, seasons, leagues, teams):
        """Create sample gamedays with groups and games for the latest season."""
        if not seasons or not leagues or not teams:
            return 0

        latest_season = seasons[-1]
        gameday_count = 0
        now = timezone.now()
        admin_user = User.objects.filter(username="admin@demo.local").first()

        if not admin_user:
            return 0

        # Create 2 gamedays per league
        for league in leagues:
            for day_num in range(1, 3):
                gameday_date = now + timedelta(days=day_num * 7)
                gameday_name = f"{league.name} - Spieltag {day_num}"

                gameday, created = Gameday.objects.get_or_create(
                    season=latest_season,
                    league=league,
                    name=gameday_name,
                    defaults={
                        "date": gameday_date.date(),
                        "start": "10:00",
                        "status": (
                            Gameday.STATUS_PUBLISHED
                            if day_num == 1
                            else Gameday.STATUS_DRAFT
                        ),
                        "author": admin_user,
                    },
                )

                if created:
                    gameday_count += 1
                    # Create games for this gameday
                    self.create_games_for_gameday(gameday, league, latest_season, teams)

        return gameday_count

    def create_games_for_gameday(self, gameday, league, season, teams):
        """Create sample games within a gameday."""
        if len(teams) < 2:
            return

        # Create 2 groups with alternating teams
        group_a_teams = teams[0::2][:3]  # Every other team, up to 3
        group_b_teams = teams[1::2][:3]  # Every other team, up to 3

        # Ensure we have at least 2 teams per group
        if len(group_a_teams) < 2:
            group_a_teams = teams[:2]
        if len(group_b_teams) < 2:
            group_b_teams = teams[2:4] if len(teams) >= 4 else [teams[0]]

        scheduled_times = ["10:00", "11:15", "12:30"]
        game_counter = 0

        # Create round-robin games within each group
        for group_idx, group_teams in enumerate([group_a_teams, group_b_teams], 1):
            group_name = f"Gruppe {group_idx}"

            # Create or get LeagueGroup
            league_group, _ = LeagueGroup.objects.get_or_create(
                league=league, season=season, name=group_name
            )

            # Create games between teams in this group
            for i, home_team in enumerate(group_teams):
                for away_team in group_teams[i + 1 :]:
                    scheduled = scheduled_times[game_counter % len(scheduled_times)]

                    # Include the (per-game unique) stage in the lookup, not
                    # just gameday + group - otherwise every game after the
                    # first in a group would match and be skipped, collapsing
                    # the round-robin to a single game per group.
                    gameinfo, created = Gameinfo.objects.get_or_create(
                        gameday=gameday,
                        league_group=league_group,
                        stage=f"Game {game_counter + 1}",
                        defaults={
                            "scheduled": scheduled,
                            "field": (game_counter % 3) + 1,
                            "status": "Geplant",  # All games start as unplayed (Planned)
                            "standing": group_name,
                            "officials": random.choice([home_team, away_team]),
                        },
                    )

                    if created:
                        # Add game results
                        self.create_game_result(gameinfo, home_team, away_team)

                    game_counter += 1

    def create_gameday_rosters(self, gamedays):
        """Check every team playing on a gameday in with its whole player list."""
        checked_in = 0
        for gameday in gamedays:
            team_ids = Gameresult.objects.filter(
                gameinfo__gameday=gameday, team__isnull=False
            ).values("team_id")
            for playerlist in Playerlist.objects.filter(
                team_id__in=team_ids, left_on__isnull=True
            ):
                # update_or_create: a kept player may carry the jersey an
                # older seed gave it, and the roster reads this snapshot.
                _, created = PlayerlistGameday.objects.update_or_create(
                    playerlist=playerlist,
                    gameday=gameday,
                    defaults={"gameday_jersey": playerlist.jersey_number},
                )
                if created:
                    checked_in += 1
        return checked_in

    def create_game_result(self, gameinfo, home_team, away_team):
        """Create game results for home and away teams."""
        home_goals_fh = random.randint(0, 3)
        home_goals_sh = random.randint(0, 3)
        away_goals_fh = random.randint(0, 3)
        away_goals_sh = random.randint(0, 3)

        # Home team result
        Gameresult.objects.get_or_create(
            gameinfo=gameinfo,
            team=home_team,
            isHome=True,
            defaults={
                "fh": home_goals_fh,
                "sh": home_goals_sh,
                "pa": random.randint(6, 12),
            },
        )

        # Away team result
        Gameresult.objects.get_or_create(
            gameinfo=gameinfo,
            team=away_team,
            isHome=False,
            defaults={
                "fh": away_goals_fh,
                "sh": away_goals_sh,
                "pa": random.randint(6, 12),
            },
        )

    def create_officials(self, associations, gamedays):
        """Create an officials crew and assign it to the seeded games.

        Creates a dedicated "Demo Officials" team plus a handful of officials
        with licenses, points every seeded game at that team (so the scorecard
        official dropdowns resolve), and records four GameOfficial positions per
        game. With enough games that gives several officials the >= 10 games the
        statistics leaderboard requires (see
        OfficialsRepositoryService.get_officials_statistics_for_season).

        Returns the number of officials created.
        """
        gameinfos = list(Gameinfo.objects.filter(gameday__in=gamedays).order_by("id"))
        if not gameinfos:
            return 0

        officials_team, _ = Team.objects.get_or_create(
            name=OFFICIALS_TEAM_NAME,
            defaults={
                "description": "Officiating crew for the demo environment",
                "location": "Demo City",
                "association": random.choice(associations) if associations else None,
            },
        )

        licenses = []
        for name in ["F1", "F2", "F3", "F4"]:
            license_obj, _ = OfficialLicense.objects.get_or_create(name=name)
            licenses.append(license_obj)

        first_names = [
            "Alex",
            "Jamie",
            "Robin",
            "Casey",
            "Jordan",
            "Morgan",
            "Taylor",
            "Drew",
        ]
        last_names = [
            "Berger",
            "Klein",
            "Vogel",
            "Hartmann",
            "Krause",
            "Lange",
            "Peters",
            "Reuter",
        ]

        license_year = gameinfos[0].gameday.date.year
        officials = []
        for i in range(len(first_names)):
            official, created = Official.objects.get_or_create(
                external_id=f"DEMO-OFF-{i + 1:02d}",
                defaults={
                    "first_name": first_names[i],
                    "last_name": last_names[i],
                    "team": officials_team,
                    "association": officials_team.association,
                },
            )
            OfficialLicenseHistory.objects.get_or_create(
                official=official,
                license=licenses[i % len(licenses)],
                created_at=date(license_year, 1, 1),
                defaults={"result": 100},
            )
            officials.append(official)

        for game_idx, gameinfo in enumerate(gameinfos):
            if gameinfo.officials_id != officials_team.id:
                gameinfo.officials = officials_team
                gameinfo.save(update_fields=["officials"])
            for pos_idx, position in enumerate(OFFICIAL_POSITIONS):
                official = officials[
                    (game_idx * len(OFFICIAL_POSITIONS) + pos_idx) % len(officials)
                ]
                GameOfficial.objects.get_or_create(
                    gameinfo=gameinfo,
                    position=position,
                    defaults={"official": official},
                )

        return len(officials)
