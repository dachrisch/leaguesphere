from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.utils import timezone
from gamedays.models import Team, Season, League, Association, SeasonLeagueTeam
import random
from datetime import datetime, timedelta


class Command(BaseCommand):
    help = 'Seed demo database with synthetic data for demo.leaguesphere.app'

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

        # Create demo users by role
        self.create_demo_users()
        self.stdout.write("✓ Created demo user accounts")

        self.stdout.write(self.style.SUCCESS("✅ Demo data seeding completed successfully!"))

    def create_associations(self):
        """Create demo associations representing different regional governing bodies."""
        associations_data = [
            {'abbr': 'MPL', 'name': 'Metropolitan Premier League'},
            {'abbr': 'UNC', 'name': 'United Nations Cup'},
            {'abbr': 'CSF', 'name': 'Continental Soccer Federation'},
            {'abbr': 'RSF', 'name': 'Regional Soccer Federation'},
        ]
        associations = []
        for data in associations_data:
            assoc, created = Association.objects.get_or_create(
                abbr=data['abbr'],
                defaults={'name': data['name']}
            )
            associations.append(assoc)
        return associations

    def create_leagues(self):
        """Create demo leagues."""
        league_names = [
            'Premier Division',
            'Championship Division',
            'League One',
            'League Two',
        ]
        leagues = []
        for name in league_names:
            league, created = League.objects.get_or_create(
                name=name,
                defaults={'slug': name.lower().replace(' ', '-')}
            )
            leagues.append(league)
        return leagues

    def create_seasons(self):
        """Create demo seasons."""
        season_names = [
            '2023/2024',
            '2024/2025',
            '2025/2026',
        ]
        seasons = []
        for name in season_names:
            season, created = Season.objects.get_or_create(
                name=name,
                defaults={'slug': name.lower().replace('/', '-')}
            )
            seasons.append(season)
        return seasons

    def create_teams(self, associations):
        """Create demo teams with predefined data."""
        team_data = [
            {'name': 'Phoenix United', 'description': 'The rising bird team from the north'},
            {'name': 'Stellar Strikers', 'description': 'Bright stars of the south'},
            {'name': 'Velocity FC', 'description': 'Speed and precision football'},
            {'name': 'Thunder Titans', 'description': 'Mighty and powerful'},
            {'name': 'Crystal Eagles', 'description': 'Pure and soaring high'},
            {'name': 'Quantum Wolves', 'description': 'Advanced and fierce'},
            {'name': 'Solar Panthers', 'description': 'Energetic and athletic'},
            {'name': 'Nexus Rockets', 'description': 'Connected and fast'},
            {'name': 'Zenith Dragons', 'description': 'Peak performance team'},
            {'name': 'Horizon Falcons', 'description': 'Looking forward and determined'},
            {'name': 'Infinity Cougars', 'description': 'Endless potential and strength'},
            {'name': 'Aurora Leopards', 'description': 'Beautiful dawn athletes'},
        ]

        teams = []
        for team_info in team_data:
            team, created = Team.objects.get_or_create(
                name=team_info['name'],
                defaults={
                    'description': team_info['description'],
                    'location': f"Demo City {random.randint(1, 50)}",
                    'association': random.choice(associations),
                }
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

    def create_demo_users(self):
        """Create demo user accounts with predefined credentials."""
        demo_accounts = [
            {
                'username': 'admin@demo.local',
                'email': 'admin@demo.local',
                'password': 'DemoAdmin123!',
                'is_staff': True,
                'is_superuser': True,
            },
            {
                'username': 'referee@demo.local',
                'email': 'referee@demo.local',
                'password': 'DemoRef123!',
                'is_staff': False,
                'is_superuser': False,
            },
            {
                'username': 'manager@demo.local',
                'email': 'manager@demo.local',
                'password': 'DemoMgr123!',
                'is_staff': False,
                'is_superuser': False,
            },
            {
                'username': 'user@demo.local',
                'email': 'user@demo.local',
                'password': 'DemoUser123!',
                'is_staff': False,
                'is_superuser': False,
            },
        ]

        for account in demo_accounts:
            user, created = User.objects.get_or_create(
                username=account['username'],
                defaults={
                    'email': account['email'],
                    'is_staff': account['is_staff'],
                    'is_superuser': account['is_superuser'],
                    'first_name': account['username'].split('@')[0].title(),
                }
            )
            if created:
                user.set_password(account['password'])
                user.save()
