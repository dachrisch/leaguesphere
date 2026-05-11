"""
Django management command to seed test data for game progress dashboard.

Usage: python manage.py seed_game_progress
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from gamedays.models import Gameday, Gameinfo, Season, League
from gamedays.models import Team


class Command(BaseCommand):
    help = 'Seed test gamedays with games for game progress dashboard'

    def handle(self, *args, **options):
        # Get or create season and league
        season, created = Season.objects.get_or_create(name='2026')
        league, _ = League.objects.get_or_create(name='Test League')

        # Get first team or use a unique one
        test_team = Team.objects.first()
        if not test_team:
            import uuid
            test_team = Team.objects.create(
                name=f'Test Team {uuid.uuid4().hex[:8]}',
                location=f'Test Loc {uuid.uuid4().hex[:8]}',
                description=f'Test {uuid.uuid4().hex}'
            )

        self.stdout.write(f'Using Season: {season.name}, League: {league.name}\n')

        today = timezone.now().date()

        # Gameday 1: TODAY with mixed game statuses
        self.stdout.write('\n--- Creating TODAY\'s gameday ---')
        gameday_today = Gameday.objects.create(
            name=f'Live Demo - {today.strftime("%d.%m.%Y")}',
            date=today,
            start='10:00',
            season=season,
            league=league,
            format='6_2',
        )
        self.stdout.write(f'✓ Created: {gameday_today.name}')

        games_today = [
            {
                'name': 'Match 1', 'field': 1,
                'time': '10:00', 'status': 'Gestartet', 'started': '10:05'
            },
            {
                'name': 'Match 2', 'field': 2,
                'time': '10:30', 'status': 'Geplant'
            },
            {
                'name': 'Match 3', 'field': 1,
                'time': '11:00', 'status': 'beendet', 'started': '11:00', 'finished': '11:50'
            },
            {
                'name': 'Match 4', 'field': 2,
                'time': '11:30', 'status': 'Gestartet', 'started': '11:35'
            },
        ]

        for game in games_today:
            Gameinfo.objects.create(
                gameday=gameday_today,
                field=game['field'],
                scheduled=game['time'],
                status=game['status'],
                gameStarted=game.get('started'),
                gameFinished=game.get('finished'),
                stage='Regular Season',
                standing='',
                officials=test_team,
            )
            self.stdout.write(f"  • {game['name']} (Field {game['field']}) - {game['status']}")

        # Gameday 2: TOMORROW
        self.stdout.write('\n--- Creating TOMORROW\'s gameday ---')
        tomorrow = today + timedelta(days=1)
        gameday_tomorrow = Gameday.objects.create(
            name=f'Tomorrow Demo - {tomorrow.strftime("%d.%m.%Y")}',
            date=tomorrow,
            start='10:00',
            season=season,
            league=league,
            format='6_2',
        )
        self.stdout.write(f'✓ Created: {gameday_tomorrow.name}')

        games_tomorrow = [
            {'name': 'Match 1', 'field': 1, 'time': '10:00', 'status': 'Geplant'},
            {'name': 'Match 2', 'field': 2, 'time': '10:30', 'status': 'Geplant'},
            {'name': 'Match 3', 'field': 1, 'time': '11:00', 'status': 'Geplant'},
        ]

        for game in games_tomorrow:
            Gameinfo.objects.create(
                gameday=gameday_tomorrow,
                field=game['field'],
                scheduled=game['time'],
                status=game['status'],
                stage='Regular Season',
                standing='',
                officials=test_team,
            )
            self.stdout.write(f"  • {game['name']} (Field {game['field']}) - {game['status']}")

        # Gameday 3: 2 WEEKS FROM NOW
        self.stdout.write('\n--- Creating gameday in 2 weeks ---')
        two_weeks = today + timedelta(days=14)
        gameday_future = Gameday.objects.create(
            name=f'Future Demo - {two_weeks.strftime("%d.%m.%Y")}',
            date=two_weeks,
            start='10:00',
            season=season,
            league=league,
            format='6_2',
        )
        self.stdout.write(f'✓ Created: {gameday_future.name}')

        games_future = [
            {'name': 'Match 1', 'field': 1, 'time': '10:00', 'status': 'Geplant'},
            {'name': 'Match 2', 'field': 2, 'time': '10:30', 'status': 'Geplant'},
        ]

        for game in games_future:
            Gameinfo.objects.create(
                gameday=gameday_future,
                field=game['field'],
                scheduled=game['time'],
                status=game['status'],
                stage='Regular Season',
                standing='',
                officials=test_team,
            )
            self.stdout.write(f"  • {game['name']} (Field {game['field']}) - {game['status']}")

        # Summary
        self.stdout.write(self.style.SUCCESS('\n✓ Seed data created successfully!\n'))
        self.stdout.write(f'Total gamedays: 3')
        self.stdout.write(f'Total games: {sum([len(g) for g in [games_today, games_tomorrow, games_future]])}')
        self.stdout.write('\nLoad the dashboard at: http://127.0.0.1:8000/gamedays/progress/')
