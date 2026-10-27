/**
 * "Last server payload + queued ops" — the log the screen shows while the
 * outbox still holds writes.
 *
 * The plan's offline contract is explicit: **the score is never recomputed
 * client-side**. This module therefore never derives a score from the log's
 * events. It keeps the server's score and adds the *delta* of the ops still in
 * the queue, exactly as if they had landed. The next server payload replaces
 * both the rows and the score, which is why nothing here is persisted: a
 * reload rebuilds the same view from the snapshot plus the durable queue.
 *
 * Synthetic rows carry a negative `id`; {@link ReplayResult.opByEventId} maps
 * each one back to the queued op that produced it, so undoing a row that never
 * reached the server removes the op instead of calling `DELETE`.
 */
import type {
  GameLog,
  GameLogEvent,
  GameLogEventInput,
  GameLogTeam,
} from "../api/types";
import type { StoredOp } from "../offline/types";

/** Mirrors `SCORING_EVENT_VALUES` in gamedays/service/gamelog.py. */
const SCORING_VALUES: Record<string, number> = {
  Touchdown: 6,
  Overtime: 1,
  "1-Extra-Punkt": 1,
  "Safety (+1)": 1,
  "2-Extra-Punkte": 2,
  "Safety (+2)": 2,
};

/**
 * Mirrors `GameLogCreator._coerce_player` (`gamedays/service/gamelog.py`):
 * `TeamLog.player` is an unsigned small integer, and anything that is not a
 * jersey number in `0..32767` is dropped to `None` — which scores nothing.
 * A jersey of `"51.85"` is truncated to 51 there; without the same rule here the
 * optimistic score would promise points the server never writes.
 */
const PLAYER_MIN = 0;
const PLAYER_MAX = 32767;

export function coercePlayer(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) {
    return null;
  }
  if (number < PLAYER_MIN || number > PLAYER_MAX) {
    return null;
  }
  return number;
}

/** Events the server stores with `sequence = 0`. */
const EXCLUDED_EVENTS = new Set([
  "Strafe",
  "Spielzeit",
  "Auszeit",
  "First Down",
]);

const HALFTIME_MARKER = "2. Halbzeit gestartet";

type Side = "home" | "away";

export interface ReplayResult {
  log: GameLog;
  /** Synthetic (negative) event id → the queued op that produced it. */
  opByEventId: Map<number, string>;
}

/** One event input as the wire stores it. */
interface EventPayload {
  gameId?: number;
  team?: string;
  half?: number;
  event?: GameLogEventInput[];
}

interface DeletePayload {
  sequence?: number;
  team_log_id?: number;
}

interface PossessionPayload {
  team?: string;
}

function pointsOf(name: string, player: number | null | undefined): number {
  // The server stores value 0 when a scoring event has no usable jersey, so a
  // touchdown without one scores nothing. Mirror that, including the range
  // check: an out-of-range jersey is dropped server-side and must not score
  // here either.
  if (coercePlayer(player) === null) {
    return 0;
  }
  return SCORING_VALUES[name] ?? 0;
}

function sideOf(teamName: string | undefined, log: GameLog): Side | null {
  const token = teamName?.trim().toLowerCase();
  if (token === undefined || token === "") {
    return null;
  }
  if (log.home.name?.trim().toLowerCase() === token) {
    return "home";
  }
  if (log.away.name?.trim().toLowerCase() === token) {
    return "away";
  }
  return null;
}

function halfKey(half: number): "firsthalf" | "secondhalf" {
  return half === 2 ? "secondhalf" : "firsthalf";
}

/**
 * Add a score delta to one side. Kept separate from the rows so the module can
 * never be mistaken for a score calculation: the base score is the server's.
 */
function addScore(
  team: GameLogTeam,
  half: number,
  delta: number,
): GameLogTeam {
  if (delta === 0) {
    return team;
  }
  const key = halfKey(half);
  return {
    ...team,
    score: team.score + delta,
    [key]: { ...team[key], score: team[key].score + delta },
  };
}

function withDelta(log: GameLog, side: Side, half: number, delta: number): void {
  if (side === "home") {
    log.home = addScore(log.home, half, delta);
  } else {
    log.away = addScore(log.away, half, delta);
  }
}

function eventValue(event: GameLogEvent): number {
  return pointsOf(event.event, event.player);
}

/**
 * The log to render: `base` (the last server payload) plus every queued op, in
 * FIFO order. Pure — the base is never mutated.
 *
 * Without a `events` array (a server that predates the field) the rows cannot
 * be replayed and the base log is returned unchanged; the queued count still
 * tells the official that writes are waiting.
 */
export function replayOps(base: GameLog, ops: StoredOp[]): ReplayResult {
  const opByEventId = new Map<number, string>();
  if (!Array.isArray(base.events)) {
    return { log: base, opByEventId };
  }

  const log: GameLog = {
    ...base,
    events: base.events.map((event) => ({ ...event })),
    home: cloneTeam(base.home),
    away: cloneTeam(base.away),
  };
  const events = log.events as GameLogEvent[];
  let nextSeq =
    events.reduce((max, event) => Math.max(max, event.sequence), 0) + 1;
  let nextLocalId = 0;

  for (const op of ops) {
    if (op.kind === "event") {
      const payload = op.payload as EventPayload;
      const inputs = payload.event ?? [];
      const half = payload.half === 2 ? 2 : 1;
      const side = sideOf(payload.team, log);
      const needsSequence = inputs.some(
        (entry) => !EXCLUDED_EVENTS.has(entry.name),
      );
      const sequence = needsSequence ? nextSeq++ : 0;
      for (const entry of inputs) {
        const player = coercePlayer(entry.player);
        const value = pointsOf(entry.name, player);
        if (side !== null) {
          withDelta(log, side, half, value);
        }
        const localId = --nextLocalId;
        opByEventId.set(localId, op.id);
        events.unshift({
          id: localId,
          sequence,
          team: payload.team ?? null,
          event: entry.name,
          player,
          input: entry.input ?? null,
          half,
          cop: entry.name === "Turnover" || entry.name === "Interception",
          isDeleted: false,
          time: new Date(op.createdAt).toISOString(),
        });
      }
      continue;
    }

    if (op.kind === "delete") {
      const payload = op.payload as DeletePayload;
      for (const event of events) {
        if (event.isDeleted) {
          continue;
        }
        const matches =
          payload.team_log_id !== undefined
            ? event.id === payload.team_log_id
            : event.sequence === payload.sequence &&
              !EXCLUDED_EVENTS.has(event.event);
        if (!matches) {
          continue;
        }
        event.isDeleted = true;
        const side = sideOf(event.team ?? undefined, log);
        if (side !== null) {
          withDelta(log, side, event.half, -eventValue(event));
        }
      }
      continue;
    }

    if (op.kind === "possession") {
      log.inPossession = (op.payload as PossessionPayload).team ?? null;
      continue;
    }

    // Halftime: the same two effects the server applies — the half flips and
    // the marker row appears.
    if (log.isFirstHalf) {
      log.isFirstHalf = false;
      const localId = --nextLocalId;
      opByEventId.set(localId, op.id);
      events.unshift({
        id: localId,
        sequence: 0,
        team: null,
        event: HALFTIME_MARKER,
        player: null,
        input: null,
        half: 2,
        cop: false,
        isDeleted: false,
        time: new Date(op.createdAt).toISOString(),
      });
    }
  }

  return { log, opByEventId };
}

function cloneTeam(team: GameLogTeam): GameLogTeam {
  return {
    ...team,
    firsthalf: { ...team.firsthalf, entries: [...team.firsthalf.entries] },
    secondhalf: { ...team.secondhalf, entries: [...team.secondhalf.entries] },
  };
}
