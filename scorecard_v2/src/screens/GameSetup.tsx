import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ApiError, apiGet, apiPut, setDeviceId } from "../api/client";
import type {
  CrewPosition,
  Game,
  GameLog,
  GameSetup as GameSetupPayload,
  Official,
  TeamOfficial,
} from "../api/types";
import DirectionText, { type Direction } from "../components/DirectionText";
import Screen from "../components/Screen";
import PersonPicker from "../components/PersonPicker";
import StartConfirmation, {
  startBlockers,
  type StartCrewLine,
} from "../components/sheets/StartConfirmation";
import TeamLogo from "../components/TeamLogo";
import { initials } from "../components/initials";
import { getDeviceId } from "../device";
import { cachedGet, snapshotKey } from "../offline/snapshot";
import { formatGameTime } from "./GameList";

interface GameSetupScreenProps {
  game: Game;
  /** Called with the freshly loaded log once the server accepted the start. */
  onStarted: (log: GameLog) => void;
  /** Header chrome owned by the flow. */
  onBack?: () => void;
  onLogout?: () => void;
}

type Side = "home" | "away";

interface CrewSlot {
  /** Exact stored position; sent back verbatim when the slot is saved. */
  position: string;
  /** The league's display name for the position, or the raw position. */
  label: string;
  /** Whether an empty slot counts against the completeness counter. */
  required: boolean;
  /** All stored rows for this position; more than one is a data problem. */
  rows: Official[];
  /** First row, editable in place. Unknown and duplicate slots stay read-only. */
  official: number | null;
  name: string | null;
  known: boolean;
  duplicate: boolean;
}

/** Body of `PUT /api/game/<pk>/officials` (`GameOfficialSerializer`). */
interface CrewWrite {
  position: string;
  official: number | null;
  name: string | null;
}

type LicenceState = "valid" | "expired" | "missing" | "unknown";

const LICENCE_TONE: Record<LicenceState, string> = {
  valid: "ok",
  expired: "warn",
  missing: "missing",
  unknown: "unknown",
};

interface Licence {
  state: LicenceState;
  label: string;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-03-04` → `04.03.2026`; anything else is shown as-is. */
export function formatLicenceDate(value: string): string {
  const match = DATE.exec(value);
  if (match === null) {
    return value;
  }
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function teamLabel(name: string | null): string {
  return name !== null && name.trim() !== "" ? name : "–";
}

function personName(person: TeamOfficial): string {
  return `${person.first_name} ${person.last_name}`.trim();
}

function rowDisplayName(
  row: Pick<Official, "official" | "name">,
  team: Map<number, TeamOfficial>,
): string | null {
  if (row.official !== null) {
    const person = team.get(row.official);
    if (person !== undefined) {
      return personName(person);
    }
  }
  return row.name?.trim() || null;
}

/**
 * One slot per configured position plus one read-only slot per unknown one.
 *
 * The slots come from the league's configuration merged onto the server's
 * defaults (`GET /api/officials/crew-positions/game/<id>`), already in display
 * order:
 * associations name and order their crew differently, and only the league
 * knows which slots make a crew complete. `position` stays the exact wire
 * value — the API upserts by that string, so a "clever" alias would leave the
 * stored row untouched and create a second one. Unknown positions are kept and
 * shown; duplicate positions are marked so the screen can refuse to write them
 * (the backend's `get_or_create` would raise `MultipleObjectsReturned`).
 */
function slotsFromCrew(
  crew: Official[],
  positions: CrewPosition[],
): CrewSlot[] {
  const byPosition = new Map<string, Official[]>();
  for (const row of crew) {
    const rows = byPosition.get(row.position);
    if (rows === undefined) {
      byPosition.set(row.position, [row]);
    } else {
      rows.push(row);
    }
  }

  const slots: CrewSlot[] = positions.map((slot) => {
    const rows = byPosition.get(slot.position) ?? [];
    byPosition.delete(slot.position);
    return {
      position: slot.position,
      label: slot.label,
      required: slot.required,
      rows,
      official: rows[0]?.official ?? null,
      name: rows[0]?.name ?? null,
      known: true,
      duplicate: rows.length > 1,
    };
  });

  for (const [position, rows] of byPosition) {
    slots.push({
      position,
      label: position.trim() === "" ? "Ohne Position" : position,
      // A position the league does not configure is a data problem, not a
      // slot: it is shown read-only and never counts as required.
      required: false,
      rows,
      official: rows[0]?.official ?? null,
      name: rows[0]?.name ?? null,
      known: false,
      duplicate: rows.length > 1,
    });
  }

  return slots;
}

/** `{}` means "not prepared yet"; a single filled field makes it a resume. */
function hasSavedSetup(setup: GameSetupPayload): boolean {
  return [setup.ctResult, setup.direction, setup.fhPossession].some(
    (value) => typeof value === "string" && value.trim() !== "",
  );
}

/**
 * Read a saved side back into v2's `home`/`away`. Older games stored the team
 * *name*; anything unrecognised falls back to the home side.
 */
function normaliseSide(
  value: string | undefined,
  home: string | null,
  away: string | null,
): Side {
  const token = (value ?? "").trim().toLowerCase();
  if (token === "away") {
    return "away";
  }
  if (token === "home") {
    return "home";
  }
  if (home !== null && token === home.trim().toLowerCase()) {
    return "home";
  }
  if (away !== null && token === away.trim().toLowerCase()) {
    return "away";
  }
  return "home";
}

/**
 * The old app's coin toss was recorded relative to the *away* side ("Münzwahl
 * hat: away" plus Gewonnen/Verloren), so `gewonnen` means the away team won.
 */
function normaliseToss(
  value: string | undefined,
  home: string | null,
  away: string | null,
): Side {
  const token = (value ?? "").trim().toLowerCase();
  if (token === "gewonnen" || token === "won") {
    return "away";
  }
  if (token === "verloren" || token === "lost") {
    return "home";
  }
  return normaliseSide(value, home, away);
}

/** v2's `Ost`/`West`; the legacy arrow keys map to their best guess. */
function normaliseDirection(value: string | undefined): Direction {
  const token = (value ?? "").trim().toLowerCase();
  if (
    token === "west" ||
    token === "directionright" ||
    token === "arrow_forward"
  ) {
    return "West";
  }
  return "Ost";
}

/** The server sends `device_id` alongside the detail when it holds the lock. */
function carriesDeviceId(body: unknown): boolean {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const value = (body as { device_id?: unknown }).device_id;
  return typeof value === "string" ? value.trim() !== "" : value != null;
}

function describeStartError(error: unknown): {
  message: string;
  readOnly: boolean;
} {
  const detail =
    error instanceof ApiError && typeof error.detail === "string"
      ? error.detail.trim()
      : "";
  if (error instanceof ApiError && error.status === 409) {
    const deviceLock =
      carriesDeviceId(error.body) || detail.includes("anderen Gerät");
    if (deviceLock) {
      return {
        message: detail || "Dieses Spiel läuft auf einem anderen Gerät.",
        readOnly: true,
      };
    }
    return {
      message: detail || "Dieser Spielstatus erlaubt keinen Spielstart.",
      readOnly: false,
    };
  }
  return {
    message: detail || "Der Start ist fehlgeschlagen. Bitte erneut versuchen.",
    readOnly: false,
  };
}

interface SegmentedProps {
  label: string;
  /** `null` while nothing was chosen: an unset field is refused, not defaulted. */
  value: string | null;
  options: { value: string; label: ReactNode }[];
  disabled: boolean;
  onChange: (value: string) => void;
}

/** Two-option switch in the mock's `.seg` language. */
function Segmented({
  label,
  value,
  options,
  disabled,
  onChange,
}: SegmentedProps) {
  return (
    <section className="block">
      <h2 className="blockhead">{label}</h2>
      <div aria-label={label} className="seg" role="group">
        {options.map((option) => (
          <button
            aria-pressed={option.value === value}
            className={option.value === value ? "sel" : undefined}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * Preparation screen: the crew with licence state, coin toss, first
 * possession, direction and the start sequence.
 *
 * The game is started by the backend when `PUT /setup` creates the setup row;
 * everything before that is local. A wrong setup entry costs the whole game, so
 * the first tap only opens a confirmation that restates it, and the start
 * refuses missing input (an empty `required` crew slot, a free-text name
 * without both names, an unchosen toss/possession/direction) instead of
 * confirming it. An invalid licence warns without ever blocking — the
 * confirmation carries that warning, so it does not add a tap of its own.
 */
export default function GameSetupScreen({
  game,
  onStarted,
  onBack,
  onLogout,
}: GameSetupScreenProps) {
  const { id, officialsId, home, away, field, scheduled } = game;
  const crewPath = `/api/game/${id}/officials`;
  const setupPath = `/api/game/${id}/setup`;
  const teamPath = `/api/officials/team/${officialsId}/list`;
  const positionsPath = `/api/officials/crew-positions/game/${id}`;
  const possessionPath = `/api/game/${id}/possession`;
  const logPath = `/api/gamelog/${id}`;

  const finished = game.status.trim().toLowerCase() === "beendet";
  // The start assigns the device lock server-side; it cannot be queued.
  const offline = globalThis.navigator?.onLine === false;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slots, setSlots] = useState<CrewSlot[]>([]);
  const [teamOfficials, setTeamOfficials] = useState<TeamOfficial[]>([]);
  const [teamError, setTeamError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hasSetup, setHasSetup] = useState(false);

  const [toss, setToss] = useState<Side | null>(null);
  const [possession, setPossession] = useState<Side | null>(null);
  const [direction, setDirection] = useState<Direction | null>(null);

  const [saving, setSaving] = useState(false);
  // The confirmation sheet between the tap on "Spiel starten" and the write.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The setup was accepted by the server during this visit. A later failure
  // (possession or log) is retried without touching the setup again.
  const [setupAccepted, setSetupAccepted] = useState(false);
  const [possessionSent, setPossessionSent] = useState(false);

  const inFlight = useRef(false);

  /**
   * Fetch crew, team officials and setup. Deliberately does not touch the
   * loading flags before the first await: a synchronous `setState` in an effect
   * cascades, so the initial state is already "loading" and {@link retryLoad}
   * raises it again for a user-initiated reload.
   */
  const load = useCallback(async () => {
    try {
      const [crew, team, setup, positions] = await Promise.all([
        apiGet<Official[]>(crewPath),
        apiGet<TeamOfficial[]>(teamPath).catch(() => {
          setTeamError(true);
          return [];
        }),
        // Preloaded: a device that reloads with no network still shows what
        // was agreed on the coin toss.
        cachedGet<GameSetupPayload>(snapshotKey.setup(id), setupPath),
        // The league's slots are configuration, not game state, so the last
        // answer is preloaded: if *this* request alone fails (5xx, aborted),
        // the stored slots keep labels and order right. The crew itself is a
        // plain request, so a truly offline reload still ends in the load
        // error below.
        cachedGet<CrewPosition[]>(snapshotKey.crewPositions(id), positionsPath),
      ]);
      if ((positions ?? []).length === 0) {
        // The endpoint answers the five built-in defaults for a league without
        // configuration, so an empty list is a broken answer, not "no slots".
        // Without positions there is nothing to fill in, and an officials step
        // with zero rows (and a "vollständig" chip) would be a lie.
        throw new Error("Die Crew-Positionen des Spiels sind leer.");
      }
      setSlots(slotsFromCrew(crew ?? [], positions));
      setTeamOfficials(team ?? []);
      const saved = hasSavedSetup(setup ?? {});
      setHasSetup(saved);
      if (saved) {
        setToss(normaliseToss(setup.ctResult, home, away));
        setPossession(normaliseSide(setup.fhPossession, home, away));
        setDirection(normaliseDirection(setup.direction));
      }
      setLoading(false);
    } catch (loadFailure) {
      setLoadError(
        loadFailure instanceof ApiError && loadFailure.detail
          ? loadFailure.detail
          : "Die Vorbereitung konnte nicht geladen werden.",
      );
      setLoading(false);
    }
  }, [crewPath, setupPath, teamPath, positionsPath, home, away, id]);

  useEffect(() => {
    // `load` only writes state after its first `await`; the rule cannot see
    // through the async call and reports the mount fetch as a cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const retryLoad = (): void => {
    setLoading(true);
    setLoadError(null);
    setTeamError(false);
    void load();
  };

  const teamByOfficial = useMemo(
    () => new Map(teamOfficials.map((person) => [person.id, person])),
    [teamOfficials],
  );

  const displayName = useCallback(
    (slot: CrewSlot): string | null =>
      rowDisplayName(
        { official: slot.official, name: slot.name },
        teamByOfficial,
      ),
    [teamByOfficial],
  );

  /**
   * Licence validity is the server's verdict for **today** (`is_valid` on the
   * team list), not a forecast for the gameday date. A game weeks ahead can
   * therefore show a licence as valid now even though it may lapse before
   * kickoff, and the other way round.
   */
  const licenceOf = useCallback(
    (slot: CrewSlot): Licence => {
      if (slot.official === null) {
        return { state: "missing", label: "keine Lizenz" };
      }
      const person = teamByOfficial.get(slot.official);
      if (person === undefined) {
        // Not in this team's list: a guest official or a failed team request.
        return { state: "unknown", label: "Lizenz unbekannt" };
      }
      if (!person.license) {
        return { state: "missing", label: "keine Lizenz" };
      }
      if (person.is_valid) {
        return { state: "valid", label: "Lizenz gültig" };
      }
      return {
        state: "expired",
        label:
          person.valid_until === null
            ? "abgelaufen"
            : `abgelaufen seit ${formatLicenceDate(person.valid_until)}`,
      };
    },
    [teamByOfficial],
  );

  /**
   * One warning for the whole crew. Free-text crew rows, officials from
   * another team and unknown positions cannot be judged here, so only linked
   * team licences count.
   */
  const licenceIssues = useMemo(
    () =>
      slots
        .filter((slot) => {
          if (slot.official === null) {
            return false;
          }
          const person = teamByOfficial.get(slot.official);
          return person !== undefined && !person.is_valid;
        })
        .map((slot) => ({
          name: displayName(slot) ?? "Unbekannt",
          role: slot.label,
        })),
    [slots, teamByOfficial, displayName],
  );

  /**
   * Completeness is the league's decision (`required` per slot), not a fixed
   * set of positions. Duplicate rows never count: they cannot be written.
   */
  const requiredSlots = slots.filter((slot) => slot.required);
  const requiredFilled = requiredSlots.filter(
    (slot) =>
      !slot.duplicate &&
      (slot.official !== null || (slot.name ?? "").trim() !== ""),
  ).length;

  const pickPerson = (index: number, person: TeamOfficial): void => {
    setSlots((current) =>
      current.map((slot, position) =>
        position === index
          ? { ...slot, official: person.id, name: personName(person) }
          : slot,
      ),
    );
    setDirty(true);
  };

  /**
   * A guest official who is not in the directory: stored as a name, never as a
   * link. `PersonPicker` only offers this when nothing matched and both names
   * are present, so a resolvable person is not replaced by free text.
   */
  const enterFreeText = (index: number, name: string): void => {
    setSlots((current) =>
      current.map((slot, position) =>
        position === index ? { ...slot, official: null, name } : slot,
      ),
    );
    setDirty(true);
  };

  const clearSlot = (index: number): void => {
    setSlots((current) =>
      current.map((slot, position) =>
        position === index ? { ...slot, official: null, name: null } : slot,
      ),
    );
    setDirty(true);
  };

  /** Change a start field after the setup was accepted → send it again. */
  const resetStartPhases = (): void => {
    setSetupAccepted(false);
    setPossessionSent(false);
  };

  // Duplicate rows are never written: the backend upserts by position and its
  // `get_or_create` raises when two rows share one. Unknown positions are kept
  // verbatim so they survive the save untouched.
  const crewPayload: CrewWrite[] = slots
    .filter((slot) => !slot.duplicate)
    .map((slot) => ({
      position: slot.position,
      official: slot.official,
      name:
        slot.official === null
          ? slot.name?.trim() || null
          : (displayName(slot) ?? slot.name),
    }));

  const sideTeam = (side: Side): string | null => (side === "home" ? home : away);

  /**
   * What the confirmation restates, in the sheet's own shape.
   *
   * `filled` is the slot's own state, not the resolved display name: the team
   * list can fail, or a stored row can carry no name, and a linked official then
   * has no name while the slot is clearly staffed (the picker says "Offizieller
   * 99" and the completeness chip counts it). `editable` mirrors the picker: a
   * duplicate row or a position the league does not configure is shown but
   * cannot be fixed here, so it never becomes the reason a start is refused.
   */
  const crewLines: StartCrewLine[] = slots.map((slot) => {
    const name = displayName(slot);
    return {
      label: slot.label,
      name,
      filled: slot.official !== null || (slot.name ?? "").trim() !== "",
      freetext: slot.official === null && name !== null,
      required: slot.required,
      editable: slot.known && !slot.duplicate,
      duplicate: slot.duplicate,
    };
  });

  const tossTeam = toss === null ? null : teamLabel(sideTeam(toss));
  const possessionTeam =
    possession === null ? null : teamLabel(sideTeam(possession));

  const openConfirmation = (): void => {
    if (inFlight.current || loading || finished || offline || readOnly) {
      return;
    }
    setConfirmOpen(true);
  };

  /**
   * Second tap: the sheet closes first, so a rejected write behaves exactly as
   * it did without a sheet — the failure and the read-only switch are the
   * screen's, not a modal's.
   */
  const confirmStart = (): void => {
    setConfirmOpen(false);
    void runStart();
  };

  /** Officials used by another row, so one person cannot fill two slots. */
  const takenByOthers = (index: number): Set<number> => {
    const taken = new Set<number>();
    slots.forEach((slot, otherIndex) => {
      if (otherIndex === index) {
        return;
      }
      for (const row of slot.rows) {
        if (row.official !== null) {
          taken.add(row.official);
        }
      }
      if (slot.official !== null) {
        taken.add(slot.official);
      }
    });
    return taken;
  };

  const runStart = async (force = false): Promise<void> => {
    if (inFlight.current || loading || finished) {
      return;
    }
    if (offline) {
      setError(
        "Das Spiel kann nur mit Verbindung gestartet werden. Bitte Netz suchen und erneut versuchen.",
      );
      return;
    }
    if (!force && readOnly) {
      return;
    }
    // Belt and braces: the sheet disables its button while a reason is listed,
    // and the retry after a released device lock re-enters here without it.
    if (
      startBlockers({ crew: crewLines, tossTeam, possessionTeam, direction })
        .length > 0 ||
      toss === null ||
      possession === null ||
      direction === null
    ) {
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      if (dirty) {
        await apiPut<Official[]>(crewPath, crewPayload);
        setDirty(false);
      }
      if (!setupAccepted) {
        const deviceId = getDeviceId();
        await apiPut<GameSetupPayload>(setupPath, {
          ctResult: toss,
          direction,
          fhPossession: possession,
          device_id: deviceId,
        });
        setHasSetup(true);
        setSetupAccepted(true);
        // Only claim the session once the server accepted the start: a device
        // that lost the lock must not start stamping its id on later requests.
        setDeviceId(deviceId);
      }
      // The log is read before the opening possession is written, not after:
      // `PUT /possession` stores the team *name* (`Team.name`) and the log is
      // the only payload that carries it. The game row in the list shows the
      // long `Team.description`, which the endpoint rejects with a 400 — the
      // start would otherwise stop right after the setup was accepted.
      const log = await cachedGet<GameLog>(snapshotKey.log(id), logPath);
      let inPossession = log.inPossession ?? null;
      if (!possessionSent) {
        const team = possession === "home" ? log.home?.name : log.away?.name;
        if (team !== null && team !== undefined && team.trim() !== "") {
          await apiPut<void>(possessionPath, { team });
          // The log above predates the write and cannot carry the marker yet.
          // The server accepted exactly this team; the next payload replaces
          // it anyway.
          inPossession = team;
        }
        setPossessionSent(true);
      }
      inFlight.current = false;
      setSaving(false);
      onStarted({ ...log, inPossession });
    } catch (startFailure) {
      inFlight.current = false;
      setSaving(false);
      const described = describeStartError(startFailure);
      setError(described.message);
      if (described.readOnly) {
        setReadOnly(true);
      }
    }
  };

  /** A staff release of the device lock may make the same start work again. */
  const retryStart = (): void => {
    setReadOnly(false);
    setError(null);
    void runStart(true);
  };

  let startLabel: string;
  if (readOnly) {
    startLabel = "Nur lesen";
  } else if (offline) {
    startLabel = "Start nur online";
  } else if (saving) {
    startLabel = "Startet …";
  } else if (hasSetup) {
    startLabel = "Fortsetzen";
  } else {
    startLabel = `Spiel starten · ${formatGameTime(scheduled)}`;
  }

  return (
    <Screen
      kicker="Scorecard"
      onBack={onBack}
      onLogout={onLogout}
      sub={
        <>
          <span className="app-sub-teams">
            <TeamLogo className="teamlogo-inline" name={home} />
            <TeamLogo className="teamlogo-inline" name={away} />
          </span>
          {`${teamLabel(home)} – ${teamLabel(away)} · ${formatGameTime(
            scheduled,
          )} · Feld ${field}`}
        </>
      }
      title="Vorbereitung"
    >
      {loading ? (
        <p className="setupnote" role="status">
          Vorbereitung wird geladen …
        </p>
      ) : null}

      {loadError !== null ? (
        <div className="seterror" role="alert">
          <p>{loadError}</p>
          <button className="setlink" onClick={retryLoad} type="button">
            Erneut laden
          </button>
        </div>
      ) : null}

      {!loading && loadError === null ? (
        <div className="prep">
          {finished ? (
            <p className="finishednote" role="status">
              Dieses Spiel ist beendet.
            </p>
          ) : null}

          <section className="block">
            <div className="blockhead">
              <h2>Offizielle</h2>
              {requiredFilled === requiredSlots.length ? (
                <span className="okchip">vollständig</span>
              ) : (
                <span className="chip-miss">
                  {requiredFilled}/{requiredSlots.length}
                </span>
              )}
            </div>
            {teamError ? (
              <p className="setupnote" role="status">
                Die Offiziellen des Teams konnten nicht geladen werden.
              </p>
            ) : null}
            {slots.map((slot, index) => {
              const licence = licenceOf(slot);
              const name = displayName(slot);
              const editable = slot.known && !slot.duplicate;
              const taken = editable ? takenByOthers(index) : new Set<number>();
              const duplicateNames = slot.duplicate
                ? slot.rows
                    .map((row) => rowDisplayName(row, teamByOfficial))
                    .filter((value): value is string => value !== null)
                    .join(", ")
                : "";
              return (
                <Fragment key={`${slot.known ? "known" : "extra"}-${index}`}>
                  <div className="offrow">
                    <span aria-hidden="true" className="offava">
                      {initials(name)}
                    </span>
                    <span className="offnm">
                      {editable ? (
                        <PersonPicker
                          disabled={readOnly || finished}
                          label={slot.label}
                          onClear={() => clearSlot(index)}
                          onFreeText={(freeText) =>
                            enterFreeText(index, freeText)
                          }
                          onPick={(person) => pickPerson(index, person)}
                          taken={taken}
                          teamId={officialsId}
                          value={{
                            official: slot.official,
                            name:
                              name ??
                              (slot.official === null
                                ? null
                                : `Offizieller ${slot.official}`),
                          }}
                        />
                      ) : (
                        <span className="offname">{name ?? "–"}</span>
                      )}
                      <span className="offrole">{slot.label}</span>
                    </span>
                    <span className={`lic lic-${LICENCE_TONE[licence.state]}`}>
                      {licence.label}
                    </span>
                  </div>
                  {slot.duplicate ? (
                    <p className="setupwarn offwarn" role="alert">
                      Mehrere Einträge für {slot.label} – bitte bereinigen
                      {duplicateNames !== "" ? ` (${duplicateNames})` : ""}
                    </p>
                  ) : null}
                </Fragment>
              );
            })}
            <p className="setupnote">
              Welche Positionen es gibt und welche für die Vollständigkeit
              zählen, legt die Liga fest.
            </p>
          </section>

          {licenceIssues.length > 0 ? (
            <div
              className="setupwarn"
              id="crew-licence-warning"
              role="status"
            >
              <b>
                {licenceIssues.length === 1
                  ? "1 Lizenz ist nicht gültig"
                  : `${licenceIssues.length} Lizenzen sind nicht gültig`}
              </b>
              <span>
                {licenceIssues
                  .map((issue) => `${issue.name} (${issue.role})`)
                  .join(", ")}
              </span>
              <span>
                Das Spiel lässt sich trotzdem starten.
              </span>
            </div>
          ) : null}

          <Segmented
            disabled={readOnly || finished}
            label="Münzwurf"
            onChange={(value) => {
              setToss(value as Side);
              resetStartPhases();
            }}
            options={[
              { value: "home", label: teamLabel(home) },
              { value: "away", label: teamLabel(away) },
            ]}
            value={toss}
          />

          <Segmented
            disabled={readOnly || finished}
            label="Erster Ballbesitz"
            onChange={(value) => {
              setPossession(value as Side);
              resetStartPhases();
            }}
            options={[
              { value: "home", label: teamLabel(home) },
              { value: "away", label: teamLabel(away) },
            ]}
            value={possession}
          />

          <Segmented
            disabled={readOnly || finished}
            label="Richtung"
            onChange={(value) => {
              setDirection(value as Direction);
              resetStartPhases();
            }}
            options={[
              {
                value: "Ost",
                label: <DirectionText from="Ost" to="West" />,
              },
              {
                value: "West",
                label: <DirectionText from="West" to="Ost" />,
              },
            ]}
            value={direction}
          />

          <section className="block">
            <div className="blockhead">
              <h2>Passcheck</h2>
              {game.passcheck === true ? (
                <span className="okchip">Passcheck vollständig</span>
              ) : game.passcheck === false ? (
                <span className="chip-miss">kein Passcheck</span>
              ) : (
                <span className="tag tag-soon">unbekannt</span>
              )}
            </div>
            <p className="setupnote">
              Die Passprüfung selbst läuft auf der{" "}
              <a
                className="setlink"
                href="/passcheck/"
                rel="noopener noreferrer"
                target="_blank"
              >
                Passcheck-Seite
              </a>{" "}
              (neuer Tab – die Vorbereitung bleibt erhalten).
            </p>
          </section>

          <p className="setupnote" id="setup-summary">
            {toss === null || possession === null || direction === null ? (
              <>
                Noch offen:{" "}
                {[
                  toss === null ? "Münzwurf" : null,
                  possession === null ? "Erster Ballbesitz" : null,
                  direction === null ? "Richtung" : null,
                ]
                  .filter((label) => label !== null)
                  .join(", ")}
                . Der Start braucht alle drei Angaben.
              </>
            ) : (
              <>
                {teamLabel(sideTeam(toss))} gewinnt den Münzwurf · Ballbesitz{" "}
                {teamLabel(sideTeam(possession))} · Richtung{" "}
                <DirectionText
                  from={direction}
                  to={direction === "Ost" ? "West" : "Ost"}
                />
              </>
            )}
          </p>

          {error !== null ? (
            <div className="seterror" role="alert">
              <p>{error}</p>
              {readOnly ? (
                <button className="setlink" onClick={retryStart} type="button">
                  Erneut prüfen
                </button>
              ) : null}
            </div>
          ) : null}

          {finished ? null : (
            <div className="setupfoot">
              <button
                aria-describedby={
                  licenceIssues.length > 0 ? "crew-licence-warning" : undefined
                }
                className="startbtn"
                disabled={saving || readOnly || offline}
                onClick={openConfirmation}
                type="button"
              >
                {startLabel}
              </button>
            </div>
          )}
        </div>
      ) : null}

      {confirmOpen ? (
        <StartConfirmation
          away={away}
          crew={crewLines}
          direction={direction}
          field={field}
          home={home}
          licenceIssues={licenceIssues}
          onClose={() => setConfirmOpen(false)}
          onStart={confirmStart}
          passcheck={game.passcheck}
          possessionTeam={possessionTeam}
          time={formatGameTime(scheduled)}
          tossTeam={tossTeam}
        />
      ) : null}
    </Screen>
  );
}
