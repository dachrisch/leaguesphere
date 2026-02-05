/**
 * Smart Referee Assignment Utility
 *
 * Assigns referee teams to games using smart round-robin distribution.
 * Ensures each team refs the least number of times, and never refs when they're playing.
 *
 * @module refAssignment
 */

import type { GameNode, StageNode, GlobalTeam } from '../types/flowchart';
import type { TeamReference } from '../types/designer';
import { formatTeamReference } from './teamReference';

/**
 * Assign referees to games using smart round-robin algorithm
 *
 * Algorithm:
 * 1. For each game, identify the 2 playing teams
 * 2. Find all teams NOT playing in this game
 * 3. Pick the team with the least ref assignments so far
 * 4. Assign that team as the referee
 *
 * @param games - All games in the tournament
 * @param stages - All stages (to determine round/group)
 * @param teams - All available teams in the tournament
 * @param homeTeamRef - Function to resolve home team reference to team name
 * @param awayTeamRef - Function to resolve away team reference to team name
 * @returns Updated games with officials assigned
 */
export function assignRefereesToGames(
  games: GameNode[],
  stages: StageNode[],
  teams: GlobalTeam[],
  homeTeamRef?: (ref: TeamReference | null, gameId: string) => string | null,
  awayTeamRef?: (ref: TeamReference | null, gameId: string) => string | null
): GameNode[] {
  // Track how many times each team has been assigned as a referee
  const refCount = new Map<string, number>();

  // Initialize ref counts
  teams.forEach((team) => {
    refCount.set(team.name, 0);
  });

  // Get team names from all teams
  const teamNames = new Set(teams.map((t) => t.name));

  // Process each game and assign referee
  return games.map((game) => {
    // Get home and away team names
    let homeName: string | null = null;
    let awayName: string | null = null;

    if (game.data.homeTeam) {
      homeName = game.data.homeTeam;
    } else if (homeTeamRef) {
      homeName = homeTeamRef(game.data.homeTeamDynamic, game.id);
    }

    if (game.data.awayTeam) {
      awayName = game.data.awayTeam;
    } else if (awayTeamRef) {
      awayName = awayTeamRef(game.data.awayTeamDynamic, game.id);
    }

    // Find teams NOT playing in this game
    const playingTeams = new Set<string>();
    if (homeName) playingTeams.add(homeName);
    if (awayName) playingTeams.add(awayName);

    // Filter to available teams (not playing) and sort by ref count (ascending = least refs first)
    const availableRefs = Array.from(teamNames)
      .filter((teamName) => !playingTeams.has(teamName))
      .sort((a, b) => (refCount.get(a) ?? 0) - (refCount.get(b) ?? 0));

    // Assign the team with least refs
    if (availableRefs.length > 0) {
      const assignedRef = availableRefs[0];
      refCount.set(assignedRef, (refCount.get(assignedRef) ?? 0) + 1);

      // Create static team reference for the assigned referee
      const officialRef: TeamReference = {
        type: 'static',
        name: assignedRef,
      };

      return {
        ...game,
        data: {
          ...game.data,
          official: officialRef,
        },
      };
    }

    // If no available ref (shouldn't happen with >2 teams), leave as is
    return game;
  });
}
