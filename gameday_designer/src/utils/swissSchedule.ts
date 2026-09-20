/**
 * Swiss round schedule preview math.
 *
 * Mirrors `SwissTournamentService._round_start_times` on the backend
 * (games per round, slots per field, game + 10 min break, sequential
 * rounds from the day start). The backend remains the source of truth for
 * created games; this is only the indicative preview in the setup step.
 */

export const SWISS_BREAK_MINUTES = 10;

export function toMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function toTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function computeSwissRoundTimes(
  teamCount: number,
  rounds: number,
  fields: number,
  gameDuration: number,
  dayStart: string,
): string[] {
  const gamesPerRound = Math.ceil(teamCount / 2);
  const slotsPerField = Math.ceil(gamesPerRound / Math.max(fields, 1));
  const roundLength = slotsPerField * (gameDuration + SWISS_BREAK_MINUTES);
  const start = toMinutes(dayStart);
  return Array.from({ length: rounds }, (_, i) => toTime(start + i * roundLength));
}
