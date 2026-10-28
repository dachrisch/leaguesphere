/**
 * Wire types for the scorecard v2 API.
 *
 * Each type mirrors the serializer that produces it; field names are the JSON
 * keys, not the Django model attributes. Keep them honest: a field the API
 * does not send stays out, even if a later screen would find it convenient.
 */

/**
 * `GET /api/gameday/list/` and `GET /api/gameday/<pk>/` (`GamedaySerializer`,
 * all model fields). The list endpoint is not paginated and already filters to
 * one day server-side.
 */
export interface Gameday {
  id: number;
  name: string;
  /** Season pk, not a display name. */
  season: number;
  /** League pk, not a display name. */
  league: number;
  /** `league.name` — read-only display field added for the mobile clients. */
  league_display: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** `HH:MM` — the serializer formats the TimeField. */
  start: string;
  format: string;
  /** User pk of the gameday author. */
  author: number;
  address: string;
  status: GamedayStatus;
  published_at: string | null;
  updated_at: string;
  resource_urls: ResourceUrl[];
}

/** Gameday lifecycle (`Gameday.STATUS_CHOICES`), not the per-game status. */
export type GamedayStatus = "DRAFT" | "PUBLISHED" | "IN_PROGRESS" | "COMPLETED";

/** Nested in {@link Gameday} (`ResourceUrlSerializer`). */
export interface ResourceUrl {
  id: number;
  url: string;
  description: string;
}

/**
 * One row of `GET /api/gameday/<pk>/officials/<team>` (`GamesToWhistleAPIView`,
 * team `*` for all games). Columns come from `GamedayService.get_games_to_whistle`.
 *
 * Beware: `id_home`/`id_away` are the primary keys of the two `Gameresult`
 * rows, **not** the `Team` ids — the pandas wrapper renames `Gameresult.id`
 * (the `id_y` merge column) to them. Do not compare them against `team_id`.
 */
export interface Game {
  /** `Gameinfo` pk — the id every game endpoint takes. */
  id: number;
  /** `HH:MM:SS` — pandas serialises the raw TimeField. */
  scheduled: string;
  field: number;
  /** Name of the officials team (the wrapper renames `officials__name`). */
  officials: string;
  /** Officials team pk (the wrapper renames `officials`). */
  officialsId: number;
  stage: string;
  standing: string;
  /** Team descriptions; `null` while a bracket placeholder is unresolved. */
  home: string | null;
  away: string | null;
  /** Regular-time score, `null` until the game has results. */
  points_home: number | null;
  points_away: number | null;
  status: GameStatus;
  /** `Gameresult` pk of the home row (see the warning above). */
  id_home: string;
  /** `Gameresult` pk of the away row (see the warning above). */
  id_away: string;
  /**
   * True only when both teams of the game passed the passcheck. Optional for
   * version skew/rollback only — the endpoint always sends it now. `undefined`
   * means "unknown" (render no chip), which is not the same as `false`.
   */
  passcheck?: boolean;
}

/**
 * `Gameinfo.status` values the app reads. The start flow writes `Geplant` →
 * `1. Halbzeit` → `2. Halbzeit` → `beendet`; `Gestartet` is still written by
 * the designer's result entry (`GameResultUpdateAPIView`), and designer-built
 * rows can carry an empty status.
 */
export type GameStatus =
  | ""
  | "Geplant"
  | "Gestartet"
  | "1. Halbzeit"
  | "2. Halbzeit"
  | "beendet";

/**
 * One crew slot of `GET/PUT /api/game/<pk>/officials/` (`GameOfficialSerializer`).
 * `official` is the linked officials-directory pk when one was picked, `name`
 * the free-text fallback (games imported without a licence row).
 */
export interface Official {
  id: number;
  official: number | null;
  name: string | null;
  position: string;
}

/** The full crew of one game — the GET answers a (possibly empty) list. */
export type Officials = Official[];

/**
 * One crew slot of `GET /api/officials/crew-positions/game/<gameId>`
 * (`CrewPositionScorecardSerializer`), configured per league.
 *
 * `position` is the exact `GameOfficial.position` wire value and is written
 * back verbatim; `label` is only what the operator reads. `required` decides
 * whether an empty slot counts against the completeness chip. A league
 * without configuration answers the built-in defaults, so the list is never
 * empty.
 */
export interface CrewPosition {
  position: string;
  label: string;
  order: number;
  required: boolean;
}

/**
 * `GET/PUT /api/game/<pk>/setup/` (`GameSetupSerializer`). The GET answers
 * `{}` until the game has been prepared, so every field is optional. `PUT`
 * starts the game when it creates the row, and rejects the transition when the
 * game is already running.
 *
 * v2 writes `ctResult`/`fhPossession` as `home`/`away` and `direction` as
 * `Ost`/`West`. The old app wrote team names and `directionLeft`/`Right`, so
 * reads normalise those legacy values.
 */
export interface GameSetup {
  ctResult?: string;
  direction?: string;
  fhPossession?: string;
  /** Added by the device lock (Task 16); ignored by older servers. */
  device_id?: string;
}

/**
 * One entry of `GET /api/officials/team/<teamId>/list/`
 * (`OfficialTeamListScorecardSerializer`). `license` is the licence label
 * (`null` when the person has none) and `valid_until` is `YYYY-MM-DD`.
 */
export interface TeamOfficial {
  id: number;
  first_name: string;
  last_name: string;
  team: string;
  license: string | null;
  valid_until: string | null;
  is_valid: boolean;
}

/**
 * One rendered play in `GET /api/gamelog/<gameId>/` (`GameLogSerializer`).
 *
 * The serializer flattens `TeamLog` rows into one object per `sequence`:
 * a touchdown and its conversion share a sequence, so `td`/`pat1`/`pat2` can
 * appear together. Turnover-like events set `cop` plus `name`/`player`. Every
 * other event (First Down, Strafe, Safety, Spielzeit, Auszeit, …) is keyed by
 * its own German event name with the jersey (or `null`) as value.
 */
export interface LogEntry {
  sequence: number;
  /** ISO-8601 UTC; omitted when the row has no submit time. */
  time?: string;
  /** Undone entries stay in the log, struck through. */
  isDeleted?: boolean;
  /** Change-of-possession marker; pairs with `name` and `player`. */
  cop?: boolean;
  /** Event name of a `cop` entry (Turnover, Interception). */
  name?: string;
  /** Jersey of the player of a `cop` entry. */
  player?: number | null;
  /** Touchdown jersey. */
  td?: number | null;
  /** Jersey of the 1-point conversion. */
  pat1?: number | null;
  /** Jersey of the 2-point conversion. */
  pat2?: number | null;
  /** Overtime jersey. */
  OT?: number | null;
  /** Any other event name; the value is the jersey or `null`. */
  [event: string]: unknown;
}

/** `GET /api/gamelog/<gameId>/` (`GameLogSerializer`). */
export interface GameLog {
  gameId: number;
  /** False once the halftime marker exists. */
  isFirstHalf: boolean;
  /** Team *name* currently in possession, `null` before/without one. */
  inPossession?: string | null;
  /**
   * Every raw `TeamLog` row, newest first — including the non-scoring events
   * (penalties, timeouts, first downs, time) the per-half `entries` omit.
   * Optional for version skew: an older server sends only the scoring entries.
   */
  events?: GameLogEvent[];
  home: GameLogTeam;
  away: GameLogTeam;
}

/**
 * One raw `TeamLog` row of {@link GameLog.events}.
 *
 * Unlike {@link LogEntry} (a rendered play), this is one database row: a
 * touchdown and its conversion are two events, and a penalty is visible.
 */
export interface GameLogEvent {
  /** `TeamLog` pk — the identity a per-row undo sends as `team_log_id`. */
  id: number;
  sequence: number;
  /** Team name, `null` for a game-level marker (start, halftime, end). */
  team: string | null;
  /** Wire event name ("Touchdown", "Strafe", "First Down", …). */
  event: string;
  player: number | null;
  /** Free text: the penalty name, the time, a kickoff note, … */
  input: string | null;
  half: number;
  cop: boolean;
  isDeleted: boolean;
  /** ISO-8601 UTC; anchors the row's local `HH:MM`. */
  time: string;
}

/** One side of a {@link GameLog}, split by half. */
export interface GameLogTeam {
  /** Team pk, `null` for an unresolved bracket placeholder. */
  id: number | null;
  /** Team name (`Team.name`), or the resolved placeholder name. */
  name: string | null;
  /** Total score (`firsthalf.score + secondhalf.score`). */
  score: number;
  firsthalf: GameLogHalf;
  secondhalf: GameLogHalf;
}

/** One half of a {@link GameLogTeam}. */
export interface GameLogHalf {
  score: number;
  entries: LogEntry[];
}

/**
 * `GET /api/game/<gameId>/roster` — jersey plus surname for both teams.
 * Pass numbers never leave the server. `name` is `null` when the person has
 * neither a surname nor a first name.
 */
export interface RosterPlayer {
  side: "home" | "away";
  jersey: number;
  name: string | null;
}

/**
 * One item of `GET /api/config/scorecard/penalties/`. `isPenaltyAgainstOpponent`
 * decides which team a `Strafe` is charged to; the picker must default from it.
 */
export interface Penalty {
  name: string;
  subtext: string;
  isPenaltyAgainstOpponent: boolean;
}

/**
 * One event of a `POST /api/gamelog/<gameId>` body. The server writes exactly
 * one `TeamLog` row per entry and resolves the scoring value from the name.
 *
 * `player` is the jersey (never a name or a pk). A scoring event counts only
 * when `player` is set: the server stores value 0 otherwise, so a touchdown
 * without a jersey scores nothing. `input` is the free text a row shows —
 * the time for `Spielzeit`/`Auszeit`, the penalty name for `Strafe`.
 */
export interface GameLogEventInput {
  name: string;
  player?: number;
  input?: string;
}

/**
 * Body of `POST /api/gamelog/<gameId>`. A touchdown and its conversion are two
 * entries of one request, so they share a sequence.
 */
export interface GameLogWrite {
  gameId: number;
  /** Team *name* (the backend also resolves a pk); the possessing team. */
  team: string;
  /** 1 or 2 — never derived from the current time. */
  half: 1 | 2;
  event: GameLogEventInput[];
}

// `PendingOp` (the outbox record) is deliberately deferred to the outbox task.
