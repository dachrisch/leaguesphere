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
    time: formatTime(game.scheduled),
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
      teamName = own.team_name || teamName;
      const entry = buildEntry(gameday, game, teamId);
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

  return { teamId, teamName, past, upcoming };
}
