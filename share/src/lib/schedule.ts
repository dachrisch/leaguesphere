import type { ApiGame, ApiGameResult, ApiGameday, Snapshot } from './types';

export interface ScheduleEntry {
  gamedayId: number;
  gamedayName: string;
  date: string;
  time: string;
  league: string;
  gameId: number;
  status: string;
  isFinal: boolean;
  isLive: boolean;
  opponent: string;
  isHome: boolean;
  teamScore: number;
  opponentScore: number;
}

export interface TeamSchedule {
  teamId: number;
  teamName: string;
  past: ScheduleEntry[];
  upcoming: ScheduleEntry[];
}

export function isFinal(status: string): boolean {
  return status === 'beendet';
}

export function isLive(status: string): boolean {
  return status === 'Gestartet' || status.includes('Halbzeit');
}

export function findTeamResult(
  game: ApiGame,
  teamId: number
): ApiGameResult | null {
  return game.results.find((result) => result.team_id === teamId) ?? null;
}

export function findOpponentResult(
  game: ApiGame,
  teamId: number
): ApiGameResult | null {
  return game.results.find((result) => result.team_id !== teamId) ?? null;
}

function scoreOf(result: ApiGameResult | null): number {
  if (result === null) {
    return 0;
  }
  return (result.fh ?? 0) + (result.sh ?? 0);
}

function buildEntry(
  gameday: ApiGameday,
  game: ApiGame,
  teamId: number
): ScheduleEntry {
  const own = findTeamResult(game, teamId);
  const opponent = findOpponentResult(game, teamId);
  return {
    gamedayId: gameday.id,
    gamedayName: gameday.name,
    date: gameday.date,
    time: game.scheduled,
    league: gameday.league_display,
    gameId: game.id,
    status: game.status,
    isFinal: isFinal(game.status),
    isLive: isLive(game.status),
    opponent: opponent?.team_name ?? '',
    isHome: own?.isHome ?? false,
    teamScore: scoreOf(own),
    opponentScore: scoreOf(opponent),
  };
}

const byDate = (a: ScheduleEntry, b: ScheduleEntry) =>
  a.date.localeCompare(b.date) || a.time.localeCompare(b.time);

export function buildTeamSchedule(
  snapshot: Snapshot,
  teamId: number
): TeamSchedule {
  const past: ScheduleEntry[] = [];
  const upcoming: ScheduleEntry[] = [];
  let teamName = '';

  for (const gameday of snapshot.gamedays) {
    for (const game of gameday.games ?? []) {
      const own = findTeamResult(game, teamId);
      if (own === null) {
        continue;
      }
      teamName = own.team_name || teamName;
      const entry = buildEntry(gameday, game, teamId);
      if (entry.isFinal) {
        past.push(entry);
      } else {
        upcoming.push(entry);
      }
    }
  }

  past.sort(byDate);
  upcoming.sort(byDate);

  return { teamId, teamName, past, upcoming };
}
