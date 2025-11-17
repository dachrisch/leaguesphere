#!/usr/bin/env python
"""
Setup realistic scorecard user journey data
Creates a gameday happening TODAY with games ready for live scoring
"""
import os
import sys
import django
from datetime import datetime, timedelta

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'league_manager.settings')
django.setup()

from gamedays.models import Team, Gameday, Gameinfo
from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import GameinfoFactory, GameresultFactory
from django.contrib.auth.models import User

def setup_scorecard_journey():
    """Setup data for scorecard user journey"""
    print("🏈 Setting up Scorecard User Journey Data...")

    db_setup = DBSetup()

    # Create a gameday for TODAY
    today = datetime.now().date()
    print(f"\n📅 Creating gameday for {today}...")

    # Use existing gameday or create new one
    gameday = Gameday.objects.filter(date=today).first()
    if not gameday:
        gameday = db_setup.create_empty_gameday()
        gameday.name = "Live Spieltag - Flag Football Cup"
        gameday.date = today
        gameday.save()

    print(f"✅ Gameday created: {gameday.name} (ID: {gameday.id})")

    # Clear existing games
    gameday.gameinfo_set.all().delete()

    # Get teams for games
    teams = list(Team.objects.exclude(name='Schiedsrichter')[:8])
    if len(teams) < 8:
        print(f"⚠️  Only {len(teams)} teams available, need at least 8")
        return

    print(f"\n🏆 Creating games with {len(teams)} teams...")

    # Create 4 games for the gameday (typical tournament format)
    games_data = [
        {
            'home': teams[0],
            'away': teams[1],
            'stage': 'Vorrunde',
            'standing': 'Gruppe A',
            'field': '1',
            'scheduled': (datetime.now() - timedelta(minutes=10)).time(),  # Started 10 min ago
            'status': '',  # Not started yet
        },
        {
            'home': teams[2],
            'away': teams[3],
            'stage': 'Vorrunde',
            'standing': 'Gruppe A',
            'field': '2',
            'scheduled': (datetime.now() + timedelta(minutes=5)).time(),  # Starting soon
            'status': '',
        },
        {
            'home': teams[4],
            'away': teams[5],
            'stage': 'Vorrunde',
            'standing': 'Gruppe B',
            'field': '1',
            'scheduled': (datetime.now() + timedelta(minutes=40)).time(),  # Later
            'status': '',
        },
        {
            'home': teams[6],
            'away': teams[7],
            'stage': 'Vorrunde',
            'standing': 'Gruppe B',
            'field': '2',
            'scheduled': (datetime.now() + timedelta(minutes=40)).time(),  # Later
            'status': '',
        },
    ]

    created_games = []
    for i, game_data in enumerate(games_data, 1):
        gameinfo = GameinfoFactory(
            gameday=gameday,
            stage=game_data['stage'],
            standing=game_data['standing'],
            field=game_data['field'],
            scheduled=game_data['scheduled'],
            status=game_data['status'],
        )
        # Create home and away team results (with isHome flag)
        GameresultFactory(gameinfo=gameinfo, team=game_data['home'], fh=0, sh=0, pa=0, isHome=True)
        GameresultFactory(gameinfo=gameinfo, team=game_data['away'], fh=0, sh=0, pa=0, isHome=False)

        created_games.append(gameinfo)
        print(f"  Game {i}: {game_data['home'].name} vs {game_data['away'].name} (Field {game_data['field']}, {game_data['scheduled'].strftime('%H:%M')})")

    # Create some officials assignments for games (optional)
    officials_team = Team.objects.filter(name='Schiedsrichter').first()
    if officials_team:
        print(f"\n👨‍⚖️ Assigning officials...")
        for idx, game in enumerate(created_games[:2]):  # First 2 games get officials
            db_setup.create_game_officials(game)
            home_team = games_data[idx]['home'].name
            away_team = games_data[idx]['away'].name
            print(f"  ✅ Officials assigned to: {home_team} vs {away_team}")

    # Ensure admin user exists
    user = User.objects.filter(username='admin').first()
    if not user:
        user = User.objects.create_superuser(
            username='admin',
            email='admin@test.com',
            password='admin123'
        )
        print(f"\n👤 Created admin user")
    else:
        print(f"\n👤 Admin user exists: {user.username}")

    print(f"\n✅ Scorecard journey data setup complete!")
    print(f"\n📋 Summary:")
    print(f"  Gameday: {gameday.name}")
    print(f"  Date: {gameday.date}")
    print(f"  Games: {len(created_games)}")
    print(f"  First game: {games_data[0]['home'].name} vs {games_data[0]['away'].name}")
    print(f"\n🔐 Login credentials: admin / admin123")
    print(f"🌐 Access scorecard at: http://localhost:8000/scorecard/")
    print(f"\n🎯 User Journey:")
    print(f"  1. Login with admin/admin123")
    print(f"  2. Select gameday: {gameday.name}")
    print(f"  3. Select game: {games_data[0]['home'].name} vs {games_data[0]['away'].name}")
    print(f"  4. Assign officials (if needed)")
    print(f"  5. Start game and score points")
    print(f"  6. Complete game")

    return gameday, created_games

if __name__ == '__main__':
    setup_scorecard_journey()
