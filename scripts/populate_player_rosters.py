#!/usr/bin/env python
"""
Script to populate player rosters for teams to enable passcheck screenshots
"""
import os
import sys
import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'league_manager.settings')
django.setup()

from passcheck.tests.setup_factories.factories_passcheck import PlayerFactory, PlayerlistFactory, PlayerlistGamedayFactory
from gamedays.models import Team, Gameday
from passcheck.models import Playerlist

def populate_rosters():
    """Create player rosters for the first few teams"""
    teams = Team.objects.exclude(name='Schiedsrichter')[:6]  # First 6 teams
    gamedays = Gameday.objects.all()[:3]  # First 3 gamedays

    print(f"Creating rosters for {len(teams)} teams...")

    for team in teams:
        print(f"\nCreating roster for {team.name}...")

        # Create 10-15 players per team
        num_players = 12
        for i in range(num_players):
            # Create player with realistic data
            player = PlayerFactory()

            # Add to team roster
            playerlist = PlayerlistFactory(
                team=team,
                player=player,
                jersey_number=i + 1
            )

            # Add player to gamedays (eligible for all gamedays)
            for gameday in gamedays:
                PlayerlistGamedayFactory(
                    playerlist=playerlist,
                    gameday=gameday,
                    gameday_jersey=playerlist.jersey_number
                )

            print(f"  - Created player {player.person.first_name} {player.person.last_name} (#{playerlist.jersey_number})")

    print(f"\n✅ Created rosters for {len(teams)} teams with players eligible for {len(gamedays)} gamedays")
    print(f"Total players created: {Playerlist.objects.count()}")

if __name__ == '__main__':
    populate_rosters()
