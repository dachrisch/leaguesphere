import { teamDisplayName, teamLogo } from './teams';
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
  opponentLogo: string | null;
  isHome: boolean;
  teamScore: number;
  opponentScore: number;
  /** Scores in fixed home : away order, whichever side the team plays. */
  homeScore: number;
  awayScore: number;
}

export interface TeamSchedule {
  teamId: number;
  teamName: string;
  teamLogo: string | null;
  past: ScheduleEntry[];
  upcoming: ScheduleEntry[];
}

export function isFinal(status: string): boolean {
  return status === 'beendet';
}

/** Local calendar date as YYYY-MM-DD (the widget runs in the viewer's browser). */
export function todayIso(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

/** "12:20:00" (or "12:20") -> "12:20". */
export function formatTime(raw: string): string {
  const [hours, minutes] = raw.split(':');
  return hours !== undefined && minutes !== undefined
    ? `${hours}:${minutes}`
    : raw;
}

function buildEntry(
  snapshot: Snapshot,
  gameday: ApiGameday,
  game: ApiGame,
  teamId: number
): ScheduleEntry {
  const own = findTeamResult(game, teamId);
  const opponent = findOpponentResult(game, teamId);
  const isHome = own?.isHome ?? false;
  const teamScore = scoreOf(own);
  const opponentScore = scoreOf(opponent);
  return {
    gamedayId: gameday.id,
    gamedayName: gameday.name,
    date: gameday.date,
    time: formatTime(game.scheduled),
    league: gameday.league_display,
    gameId: game.id,
    status: game.status,
    isFinal: isFinal(game.status),
    isLive: isLive(game.status),
    opponent: teamDisplayName(snapshot, opponent),
    opponentLogo: teamLogo(snapshot, opponent?.team_id ?? null),
    isHome,
    teamScore,
    opponentScore,
    homeScore: isHome ? teamScore : opponentScore,
    awayScore: isHome ? opponentScore : teamScore,
  };
}

const byDate = (a: ScheduleEntry, b: ScheduleEntry) =>
  a.date.localeCompare(b.date) || a.time.localeCompare(b.time);

export function buildTeamSchedule(
  snapshot: Snapshot,
  teamId: number,
  today: string = todayIso()
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
      teamName = teamDisplayName(snapshot, own) || teamName;
      const entry = buildEntry(snapshot, gameday, game, teamId);
      if (entry.isFinal) {
        past.push(entry);
      } else if (gameday.date >= today) {
        // A past-dated game that is still open is stale data, not an upcoming
        // fixture; drop it from both lists.
        upcoming.push(entry);
      }
    }
  }

  past.sort(byDate);
  upcoming.sort(byDate);

  return {
    teamId,
    teamName,
    teamLogo: teamLogo(snapshot, teamId),
    past,
    upcoming,
  };
}
