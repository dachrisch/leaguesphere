#!/usr/bin/env python
"""
Comprehensive test data population for LeagueSphere User Manual
Creates realistic data for all features: Passcheck, Scorecard, Liveticker,
Officials, Teammanager, Gamedays, League Table

This script combines scenarios from multiple test data scripts into one
comprehensive setup that enables capturing screenshots for all user journeys.
"""
import os
import sys
import django
from datetime import datetime, timedelta, time

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'league_manager.settings')
django.setup()

from gamedays.models import Team, Gameday, Gameinfo, GameOfficial, UserProfile
from gamedays.tests.setup_factories.factories import (
    GameinfoFactory, GameresultFactory, GameOfficialFactory, GamedayFactory
)
from passcheck.tests.setup_factories.factories_passcheck import (
    PlayerFactory, PlayerlistFactory, PlayerlistGamedayFactory
)
from passcheck.models import Playerlist
from django.contrib.auth.models import User
from officials.models import Official
from datetime import date


def create_admin_user():
    """Ensure admin user exists for login"""
    print("\n👤 Creating admin user...")
    user, created = User.objects.get_or_create(
        username='admin',
        defaults={
            'email': 'admin@leaguesphere.test',
            'is_staff': True,
            'is_superuser': True,
        }
    )
    if created:
        user.set_password('admin123')
        user.save()
        print(f"   ✅ Created admin user: admin / admin123")
    else:
        print(f"   ℹ️  Admin user already exists: {user.username}")
    return user


def create_teams_with_rosters():
    """Create teams and populate with player rosters"""
    print("\n🏈 Creating teams and player rosters...")

    # Get or create teams (excluding officials team)
    teams = list(Team.objects.exclude(name='Schiedsrichter')[:8])

    if len(teams) < 8:
        print(f"   ⚠️  Only {len(teams)} teams found, creating more...")
        # Create additional teams if needed
        team_data = [
            ("Berlin Adler", "Berlin Adler - Flag Football Team", "Berlin"),
            ("Hamburg Blue Devils", "Hamburg Blue Devils - Flag Football Team", "Hamburg"),
            ("München Rangers", "München Rangers - Flag Football Team", "München"),
            ("Köln Falcons", "Köln Falcons - Flag Football Team", "Köln"),
            ("Frankfurt Pirates", "Frankfurt Pirates - Flag Football Team", "Frankfurt"),
            ("Stuttgart Scorpions", "Stuttgart Scorpions - Flag Football Team", "Stuttgart"),
            ("Düsseldorf Thunder", "Düsseldorf Thunder - Flag Football Team", "Düsseldorf"),
            ("Leipzig Lions", "Leipzig Lions - Flag Football Team", "Leipzig")
        ]
        for i, (name, description, location) in enumerate(team_data):
            if i >= len(teams):
                # Use get_or_create to avoid duplicates
                team, created = Team.objects.get_or_create(
                    name=name,
                    defaults={
                        'description': description,
                        'location': location
                    }
                )
                teams.append(team)
                if created:
                    print(f"   Created team: {name}")

    teams = teams[:8]  # Use first 8 teams
    print(f"   ✅ Using {len(teams)} teams")

    # Create player rosters for first 6 teams
    roster_teams = teams[:6]
    total_players = 0

    # Sample data for realistic players
    first_names = ["Max", "Anna", "Tom", "Lisa", "Jan", "Sarah", "Tim", "Julia", "Ben", "Laura", "Felix", "Nina"]
    last_names = ["Müller", "Schmidt", "Wagner", "Becker", "Hoffmann", "Fischer", "Weber", "Meyer", "Schulz", "Koch", "Bauer", "Richter"]
    positions = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K", "P"]

    for idx, team in enumerate(roster_teams):
        # Check both UserProfile (teammanager) and Playerlist (passcheck)
        existing_userprofiles = UserProfile.objects.filter(team=team).count()
        existing_playerlists = Playerlist.objects.filter(team=team).count()

        if existing_userprofiles > 0:
            print(f"   ℹ️  {team.name}: {existing_userprofiles} UserProfile players already exist")
            total_players += existing_userprofiles
            continue

        print(f"   Creating roster for {team.name}...")
        num_players = 12

        for i in range(num_players):
            # Create UserProfile for teammanager display
            user_profile = UserProfile.objects.create(
                team=team,
                firstname=first_names[i],
                lastname=last_names[i],
                playernumber=i + 1,
                position=positions[i % len(positions)],
                location=team.location,
                birth_date=date(1990 + i, (i % 12) + 1, (i % 28) + 1)
            )
            total_players += 1

            # Also create Playerlist for passcheck compatibility
            if existing_playerlists == 0:
                player = PlayerFactory()
                playerlist = PlayerlistFactory(
                    team=team,
                    player=player,
                    jersey_number=i + 1
                )

    print(f"   ✅ Total players in rosters: {total_players}")
    return teams


def create_today_gameday_with_games(teams):
    """Create a gameday for TODAY with games ready for scoring"""
    print("\n📅 Creating today's gameday with live games...")

    today = datetime.now().date()

    # Get officials team (required for Gameinfo)
    officials_team, _ = Team.objects.get_or_create(
        name='Schiedsrichter',
        defaults={
            'description': 'Schiedsrichter Team',
            'location': 'Deutschland'
        }
    )

    # Try to find existing gameday for today
    gameday = Gameday.objects.filter(date=today).first()

    if gameday:
        print(f"   ℹ️  Gameday already exists: {gameday.name}")
        # Clear existing games
        Gameinfo.objects.filter(gameday=gameday).delete()
    else:
        # Create new gameday using factory (handles season, league, author requirements)
        gameday = GamedayFactory(
            date=today,
            name=f"Flag Football Cup {today.strftime('%d.%m.%Y')}",
            format='RR',  # Round Robin
        )
        print(f"   ✅ Created gameday: {gameday.name}")

    # Create 4 games for the tournament
    now = datetime.now()
    games_data = [
        {
            'home': teams[0],
            'away': teams[1],
            'stage': 'Vorrunde',
            'standing': 'Gruppe A',
            'field': '1',
            'scheduled': (now - timedelta(minutes=10)).time(),  # Started 10 min ago
        },
        {
            'home': teams[2],
            'away': teams[3],
            'stage': 'Vorrunde',
            'standing': 'Gruppe A',
            'field': '2',
            'scheduled': (now + timedelta(minutes=5)).time(),  # Starting soon
        },
        {
            'home': teams[4],
            'away': teams[5],
            'stage': 'Vorrunde',
            'standing': 'Gruppe B',
            'field': '1',
            'scheduled': (now + timedelta(minutes=40)).time(),  # Later
        },
        {
            'home': teams[6],
            'away': teams[7],
            'stage': 'Vorrunde',
            'standing': 'Gruppe B',
            'field': '2',
            'scheduled': (now + timedelta(minutes=40)).time(),  # Later
        },
    ]

    created_games = []
    for i, game_data in enumerate(games_data, 1):
        # Create game directly to avoid factory subfactory issues
        gameinfo = Gameinfo.objects.create(
            gameday=gameday,
            officials=officials_team,
            stage=game_data['stage'],
            standing=game_data['standing'],
            field=game_data['field'],
            scheduled=game_data['scheduled'],
            status='',  # Empty status = ready to play
        )

        # Create home and away team results using factory (they don't create teams)
        GameresultFactory(gameinfo=gameinfo, team=game_data['home'], fh=0, sh=0, pa=0, isHome=True)
        GameresultFactory(gameinfo=gameinfo, team=game_data['away'], fh=0, sh=0, pa=0, isHome=False)

        created_games.append(gameinfo)
        print(f"   Game {i}: {game_data['home'].name} vs {game_data['away'].name} "
              f"(Field {game_data['field']}, {game_data['scheduled'].strftime('%H:%M')})")

    print(f"   ✅ Created {len(created_games)} games for today")
    return gameday, created_games


def link_players_to_gameday(gameday, teams):
    """Link player rosters to gameday for Passcheck eligibility"""
    print("\n✅ Linking player rosters to gameday (for Passcheck)...")

    roster_teams = teams[:6]  # Teams with rosters
    total_linked = 0

    for team in roster_teams:
        playerlists = Playerlist.objects.filter(team=team)

        for playerlist in playerlists:
            # Check if already linked to this gameday
            existing = PlayerlistGamedayFactory._meta.model.objects.filter(
                playerlist=playerlist,
                gameday=gameday
            ).exists()

            if not existing:
                PlayerlistGamedayFactory(
                    playerlist=playerlist,
                    gameday=gameday,
                    gameday_jersey=playerlist.jersey_number
                )
                total_linked += 1

    print(f"   ✅ Linked {total_linked} players to gameday for eligibility checks")
    return total_linked


def create_officials_assignments(games):
    """Create official assignments for games"""
    print("\n👨‍⚖️ Creating officials assignments...")

    # Create some officials (users and Official models)
    officials_team, _ = Team.objects.get_or_create(
        name='Schiedsrichter',
        defaults={
            'description': 'Schiedsrichter Team',
            'location': 'Deutschland'
        }
    )

    official_names = [
        ("Max", "Mustermann"),
        ("Anna", "Schmidt"),
        ("Tom", "Weber"),
        ("Lisa", "Meyer"),
    ]

    officials = []
    for first_name, last_name in official_names:
        # Create User
        user, user_created = User.objects.get_or_create(
            username=f"{first_name.lower()}.{last_name.lower()}",
            defaults={
                'email': f"{first_name.lower()}@officials.test",
                'first_name': first_name,
                'last_name': last_name,
            }
        )
        if user_created:
            user.set_password('official123')
            user.save()

        # Create Official model
        official, official_created = Official.objects.get_or_create(
            first_name=first_name,
            last_name=last_name,
            defaults={'team': officials_team}
        )
        officials.append(official)
        if official_created:
            print(f"   Created official: {first_name} {last_name}")

    print(f"   ✅ Total officials: {len(officials)}")

    # Assign officials to first 2 games
    assigned_count = 0
    for idx, game in enumerate(games[:2]):
        # Assign 2 officials per game (referee positions)
        for position_idx in range(2):
            official = officials[position_idx]

            # Check if already assigned
            existing = GameOfficial.objects.filter(
                gameinfo=game,
                official=official
            ).exists()

            if not existing:
                GameOfficialFactory(
                    gameinfo=game,
                    official=official,
                    position=f"Referee {position_idx + 1}"
                )
                assigned_count += 1

    print(f"   ✅ Assigned {assigned_count} officials to {min(2, len(games))} games")
    return officials


def create_past_gamedays_for_standings(teams):
    """Create some past gamedays with completed games for league table"""
    print("\n📊 Creating past gamedays for league standings...")

    # Get officials team
    officials_team, _ = Team.objects.get_or_create(
        name='Schiedsrichter',
        defaults={
            'description': 'Schiedsrichter Team',
            'location': 'Deutschland'
        }
    )

    past_gamedays = []

    # Create 2-3 past gamedays with completed games
    for weeks_ago in [3, 2, 1]:
        past_date = datetime.now().date() - timedelta(weeks=weeks_ago)

        # Try to find existing gameday
        gameday = Gameday.objects.filter(date=past_date).first()

        if not gameday:
            # Create using factory
            gameday = GamedayFactory(
                date=past_date,
                name=f"Spieltag {4 - weeks_ago}",
                format='RR',
            )
            created = True
        else:
            created = False

        if created:
            # Create 2-3 completed games
            for game_num in range(3):
                home_team = teams[game_num * 2]
                away_team = teams[game_num * 2 + 1]

                # Use factory to create game with results (avoids signal issues)
                gameinfo = GameinfoFactory(
                    gameday=gameday,
                    officials=officials_team,
                    stage='Vorrunde',
                    standing='Gruppe A',
                    field=str(game_num + 1),
                    scheduled=time(14, 0),
                    status='beendet',  # Completed
                )

                # Create results with scores
                GameresultFactory(
                    gameinfo=gameinfo,
                    team=home_team,
                    fh=14,  # Home score
                    sh=0,
                    pa=0,
                    isHome=True
                )
                GameresultFactory(
                    gameinfo=gameinfo,
                    team=away_team,
                    fh=0,  # Away score
                    sh=7,
                    pa=0,
                    isHome=False
                )

            past_gamedays.append(gameday)

    print(f"   ✅ Created {len(past_gamedays)} past gamedays with completed games")
    return past_gamedays


def print_summary(teams, today_gameday, games, past_gamedays):
    """Print comprehensive summary of created data"""
    print("\n" + "=" * 80)
    print("🎉 COMPLETE USER MANUAL TEST DATA SETUP FINISHED!")
    print("=" * 80)

    print(f"\n📊 SUMMARY:")
    print(f"   Teams: {len(teams)}")
    print(f"   Players in rosters: {Playerlist.objects.count()}")
    print(f"   Today's gameday: {today_gameday.name} ({today_gameday.date})")
    print(f"   Games today: {len(games)}")
    print(f"   Past gamedays: {len(past_gamedays)}")
    print(f"   Officials: {User.objects.filter(username__contains='.').count()}")
    print(f"   Total gamedays: {Gameday.objects.count()}")
    print(f"   Total games: {Gameinfo.objects.count()}")

    print(f"\n🔐 LOGIN CREDENTIALS:")
    print(f"   Admin: admin / admin123")
    print(f"   Officials: max.mustermann / official123")

    print(f"\n🌐 URLS:")
    print(f"   Scorecard: http://localhost:8000/scorecard/")
    print(f"   Passcheck: http://localhost:8000/passcheck/")
    print(f"   Liveticker: http://localhost:8000/liveticker/")
    print(f"   Teammanager: http://localhost:8000/teammanager/")
    print(f"   Officials: http://localhost:8000/officials/")
    print(f"   Gamedays: http://localhost:8000/gamedays/")
    print(f"   League Table: http://localhost:8000/league_table/")
    print(f"   Admin: http://localhost:8000/admin/")

    print(f"\n📸 SCREENSHOT CAPTURE WORKFLOW:")
    print(f"   1. ✅ Teammanager → Select team → View populated roster (72 players!)")
    print(f"   2. ✅ Scorecard → Select gameday → Select game → Score points")
    print(f"   3. ✅ Liveticker → View live games (after scoring in Scorecard)")
    print(f"   4. ✅ Passcheck → Select game → Check player eligibility")
    print(f"   5. ✅ Officials → View assignments → See signup form")
    print(f"   6. ✅ Gamedays → View today's gameday → See past gamedays")
    print(f"   7. ✅ League Table → View standings from past games")

    print(f"\n🎯 PRIORITY 1 SCREENSHOTS (Quick Wins):")
    print(f"   [ ] Liveticker with live games (30 min)")
    print(f"   [ ] Teammanager with {Playerlist.objects.count()} players (45 min)")
    print(f"   [ ] intro.html completion (1 hour)")

    print(f"\n🎯 PRIORITY 2 SCREENSHOTS (Deep Dive):")
    print(f"   [ ] Passcheck full workflow (2-3 hours)")
    print(f"   [ ] Officials signup workflow (1-2 hours)")

    print("\n" + "=" * 80)


def main():
    """Main function to populate all test data"""
    print("🚀 Starting comprehensive test data population...")
    print("This will create data for ALL user manual features\n")

    # 1. Create admin user
    admin_user = create_admin_user()

    # 2. Create teams with player rosters
    teams = create_teams_with_rosters()

    # 3. Create today's gameday with games
    today_gameday, games = create_today_gameday_with_games(teams)

    # 4. Link players to today's gameday (for Passcheck)
    link_players_to_gameday(today_gameday, teams)

    # 5. Create officials assignments
    officials = create_officials_assignments(games)

    # 6. Create past gamedays for league standings
    past_gamedays = create_past_gamedays_for_standings(teams)

    # 7. Print summary
    print_summary(teams, today_gameday, games, past_gamedays)


if __name__ == '__main__':
    main()
