"""
Django management command to populate the database with realistic sample data
for user manual screenshot capture.

Usage:
    python manage.py populate_screenshot_data
    python manage.py populate_screenshot_data --clear  # Clear existing data first
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.db import transaction
from datetime import datetime, timedelta

from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import (
    TeamFactory, UserFactory, AssociationFactory,
    GamedayFactory, SeasonFactory, LeagueFactory
)
from gamedays.models import Team, Gameday, Season, League, Association


class Command(BaseCommand):
    help = 'Populate database with realistic sample data for user manual screenshots'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing data before populating',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting sample data population...'))

        if options['clear']:
            self.stdout.write(self.style.WARNING('Clearing existing data...'))
            self._clear_data()

        with transaction.atomic():
            self._create_sample_data()

        self.stdout.write(self.style.SUCCESS('Sample data population complete!'))
        self._print_summary()

    def _clear_data(self):
        """Clear existing game data (but keep users)"""
        Gameday.objects.all().delete()
        Team.objects.all().delete()
        League.objects.all().delete()
        Season.objects.all().delete()
        Association.objects.all().delete()
        self.stdout.write(self.style.SUCCESS('  Existing data cleared'))

    def _create_sample_data(self):
        """Create comprehensive sample data"""
        self.stdout.write('Creating sample data...')

        # Create users
        self._create_users()

        # Create associations
        self._create_associations()

        # Create realistic teams
        self._create_realistic_teams()

        # Create multiple seasons and leagues
        self._create_seasons_and_leagues()

        # Create gamedays with different states
        self._create_gamedays()

        self.stdout.write(self.style.SUCCESS('  Sample data created'))

    def _create_users(self):
        """Create sample users"""
        self.stdout.write('  Creating users...')

        # Admin user
        if not User.objects.filter(username='admin').exists():
            User.objects.create_superuser(
                username='admin',
                email='admin@leaguesphere.test',
                password='admin123',
                first_name='Admin',
                last_name='User'
            )

        # Staff user
        if not User.objects.filter(username='staff_user').exists():
            UserFactory(
                username='staff_user',
                first_name='Staff',
                last_name='Member',
                is_staff=True
            )

        # Regular users
        for i in range(3):
            username = f'user{i+1}'
            if not User.objects.filter(username=username).exists():
                UserFactory(
                    username=username,
                    first_name=f'User',
                    last_name=f'{i+1}',
                    is_staff=False
                )

    def _create_associations(self):
        """Create sample associations"""
        self.stdout.write('  Creating associations...')

        associations = [
            {'abbr': 'AFVD', 'name': 'American Football Verband Deutschland'},
            {'abbr': 'BaWü', 'name': 'Baden-Württemberg'},
            {'abbr': 'Bayern', 'name': 'Bayerischer American Football Verband'},
            {'abbr': 'Berlin', 'name': 'Berlin-Brandenburg'},
        ]

        for assoc_data in associations:
            AssociationFactory(**assoc_data)

    def _create_realistic_teams(self):
        """Create teams with realistic German flag football team names"""
        self.stdout.write('  Creating realistic teams...')

        teams = [
            # Real-sounding German flag football teams
            {'name': 'Berlin Adler', 'location': 'Berlin', 'description': 'Berlin Adler Flag Football Team'},
            {'name': 'München Rangers', 'location': 'München', 'description': 'München Rangers Flag Football'},
            {'name': 'Hamburg Blue Devils', 'location': 'Hamburg', 'description': 'Hamburg Blue Devils'},
            {'name': 'Frankfurt Pirates', 'location': 'Frankfurt', 'description': 'Frankfurt Pirates Flag Football'},
            {'name': 'Stuttgart Scorpions', 'location': 'Stuttgart', 'description': 'Stuttgart Scorpions'},
            {'name': 'Köln Falcons', 'location': 'Köln', 'description': 'Köln Falcons Flag Football Team'},
            {'name': 'Düsseldorf Rhinos', 'location': 'Düsseldorf', 'description': 'Düsseldorf Rhinos'},
            {'name': 'Leipzig Lions', 'location': 'Leipzig', 'description': 'Leipzig Lions Flag Football'},
            {'name': 'Dresden Demons', 'location': 'Dresden', 'description': 'Dresden Demons'},
            {'name': 'Hannover Hawks', 'location': 'Hannover', 'description': 'Hannover Hawks Flag Football'},
            {'name': 'Nürnberg Nightmares', 'location': 'Nürnberg', 'description': 'Nürnberg Nightmares'},
            {'name': 'Dortmund Destroyers', 'location': 'Dortmund', 'description': 'Dortmund Destroyers'},
            {'name': 'Bremen Braves', 'location': 'Bremen', 'description': 'Bremen Braves Flag Football'},
            {'name': 'Karlsruhe Knights', 'location': 'Karlsruhe', 'description': 'Karlsruhe Knights'},
            {'name': 'Mannheim Mavericks', 'location': 'Mannheim', 'description': 'Mannheim Mavericks'},
            {'name': 'Augsburg Arrows', 'location': 'Augsburg', 'description': 'Augsburg Arrows Flag Football'},
        ]

        for team_data in teams:
            TeamFactory(**team_data)

        # Create official team
        TeamFactory(name='Schiedsrichter', location='Deutschland', description='Offizielle')

    def _create_seasons_and_leagues(self):
        """Create multiple seasons and leagues"""
        self.stdout.write('  Creating seasons and leagues...')

        # Current season
        SeasonFactory(name='2025')
        SeasonFactory(name='2024')

        # Different league types
        LeagueFactory(name='Bundesliga')
        LeagueFactory(name='Regionalliga Nord')
        LeagueFactory(name='Regionalliga Süd')
        LeagueFactory(name='Landesliga')

    def _create_gamedays(self):
        """Create gamedays in various states"""
        self.stdout.write('  Creating gamedays with different states...')

        db_setup = DBSetup()

        # 1. Upcoming gameday (empty, for wizard demonstration)
        self.stdout.write('    - Creating upcoming empty gameday...')
        upcoming = db_setup.create_empty_gameday()
        upcoming.name = 'Spieltag Nord - Runde 1'
        upcoming.date = (datetime.now() + timedelta(days=14)).strftime('%Y-%m-%d')
        upcoming.save()

        # 2. Gameday with qualifying games in progress
        self.stdout.write('    - Creating gameday with qualifying games...')
        qualifying = db_setup.g62_qualify_finished()
        qualifying.name = 'Berlin Cup - Vorrunde'
        qualifying.date = datetime.now().strftime('%Y-%m-%d')
        qualifying.save()

        # 3. Finished gameday (for standings and results)
        self.stdout.write('    - Creating finished gameday...')
        finished = db_setup.g62_finished()
        finished.name = 'München Tournament - Finale'
        finished.date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        finished.save()

        # 4. Another finished gameday for league table
        self.stdout.write('    - Creating second finished gameday...')
        finished2 = db_setup.g72_finished()
        finished2.name = 'Hamburg Open - Finalrunde'
        finished2.date = (datetime.now() - timedelta(days=14)).strftime('%Y-%m-%d')
        finished2.save()

        # 5. Main round gameday
        self.stdout.write('    - Creating main round gameday...')
        main_round = db_setup.create_main_round_gameday(status='beendet', number_teams=5)
        main_round.name = 'Bundesliga Spieltag 3'
        main_round.date = (datetime.now() - timedelta(days=21)).strftime('%Y-%m-%d')
        main_round.save()

        # 6. Gameday with game officials for officials screenshots
        self.stdout.write('    - Creating gameday with officials...')
        with_officials = db_setup.g62_finished()
        with_officials.name = 'Stuttgart Cup - Tag 1'
        with_officials.date = (datetime.now() - timedelta(days=3)).strftime('%Y-%m-%d')
        with_officials.save()

        # Add officials to some games (using gameinfo_set for reverse relation)
        for gameinfo in with_officials.gameinfo_set.all()[:2]:
            db_setup.create_game_officials(gameinfo)

    def _print_summary(self):
        """Print summary of created data"""
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=== Sample Data Summary ==='))
        self.stdout.write(f'Users: {User.objects.count()}')
        self.stdout.write(f'Associations: {Association.objects.count()}')
        self.stdout.write(f'Teams: {Team.objects.count()}')
        self.stdout.write(f'Seasons: {Season.objects.count()}')
        self.stdout.write(f'Leagues: {League.objects.count()}')
        self.stdout.write(f'Gamedays: {Gameday.objects.count()}')
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('Login credentials:'))
        self.stdout.write('  Admin: admin / admin123')
        self.stdout.write('  Staff: staff_user / (use Django shell to set password)')
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('Database is ready for screenshot capture!'))
