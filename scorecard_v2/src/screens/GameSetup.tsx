import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError, apiGet, apiPut, setDeviceId } from "../api/client";
import type {
  Game,
  GameLog,
  GameSetup as GameSetupPayload,
  Official,
  TeamOfficial,
} from "../api/types";
import Screen from "../components/Screen";
import { getDeviceId } from "../device";
import { formatGameTime } from "./GameList";

interface GameSetupScreenProps {
  game: Game;
  /** Called with the freshly loaded log once the server accepted the start. */
  onStarted: (log: GameLog) => void;
}

type Side = "home" | "away";
type Direction = "Ost" | "West";

/**
 * The five crew slots the old scorecard writes (`scorecard/src/actions/
 * objects.js`). `position` is the wire value; `label` is the German role the
 * crew sees. A game imported from another source may still carry a free-text
 * position — those rows are shown unchanged and never rewritten.
 */
const CREW_SLOTS = [
  { position: "Scorecard Judge", label: "Scorecard Judge" },
  { position: "Referee", label: "Schiedsrichter" },
  { position: "Down Judge", label: "Down Judge" },
  { position: "Field Judge", label: "Field Judge" },
  { position: "Side Judge", label: "Side Judge" },
] as const;

/** Legacy/translated crew positions that belong to one of the five slots. */
const POSITION_ALIASES: Record<string, string> = {
  referee: "Referee",
  schiedsrichter: "Referee",
};

function canonicalPosition(position: string): string {
  return POSITION_ALIASES[position.trim().toLowerCase()] ?? position.trim();
}

interface CrewSlot {
  position: string;
  label: string;
  official: number | null;
  name: string | null;
}

/** Body of `PUT /api/game/<pk>/officials` (`GameOfficialSerializer`). */
interface CrewWrite {
  position: string;
  official: number | null;
  name: string | null;
}

type LicenceState = "valid" | "expired" | "missing";

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

function slotsFromCrew(crew: Official[]): CrewSlot[] {
  return CREW_SLOTS.map((slot) => {
    const row = crew.find(
      (entry) => canonicalPosition(entry.position) === slot.position,
    );
    return {
      position: slot.position,
      label: slot.label,
      official: row?.official ?? null,
      name: row?.name ?? null,
    };
  });
}

/** `{}` means "not prepared yet"; a single filled field makes it a resume. */
function hasSavedSetup(setup: GameSetupPayload): boolean {
  return [setup.ctResult, setup.direction, setup.fhPossession].some(
    (value) => typeof value === "string" && value.trim() !== "",
  );
}

/**
 * Read a saved side back into v2's `home`/`away`. Older games stored the team
 * *name* (and the coin toss as `Gewonnen`/`Verloren`, which cannot name a
 * team), so anything unrecognised falls back to the home side.
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

function describeStartError(error: unknown): {
  message: string;
  readOnly: boolean;
} {
  const detail =
    error instanceof ApiError && typeof error.detail === "string"
      ? error.detail.trim()
      : "";
  if (error instanceof ApiError && error.status === 409) {
    if (detail.includes("anderen Gerät")) {
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

function initials(name: string | null): string {
  if (name === null) {
    return "?";
  }
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * `Ost → West` with the arrow drawn as SVG.
 *
 * The self-hosted Inter/Barlow latin subsets (and some field devices) have no
 * U+2192 glyph, which renders as a tofu box. The arrow is therefore drawn, and
 * the character stays in the accessible text — the summary and the buttons
 * still read "Ost → West" to screen readers.
 */
function DirectionText({ from, to }: { from: string; to: string }) {
  return (
    <>
      {from}{" "}
      <svg
        aria-hidden="true"
        className="dirarrow"
        focusable="false"
        viewBox="0 0 16 8"
      >
        <path
          d="M0.5 4h14M11.5 1l3.5 3-3.5 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>{" "}
      <span className="sr-only">→</span>{" "}
      {to}
    </>
  );
}

interface SegmentedProps {
  label: string;
  value: string;
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
 * possession, direction and the start/save sequence.
 *
 * The game is started by the backend when `PUT /setup` creates the setup row;
 * everything before that is local. An expired or missing licence warns without
 * blocking — the button needs a second tap ("Trotzdem starten") so a lapsed
 * licence cannot strand a gameday.
 */
export default function GameSetupScreen({
  game,
  onStarted,
}: GameSetupScreenProps) {
  const { id, officialsId, home, away, field, scheduled } = game;
  const crewPath = `/api/game/${id}/officials`;
  const setupPath = `/api/game/${id}/setup`;
  const teamPath = `/api/officials/team/${officialsId}/list`;
  const logPath = `/api/gamelog/${id}`;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slots, setSlots] = useState<CrewSlot[]>([]);
  const [teamOfficials, setTeamOfficials] = useState<TeamOfficial[]>([]);
  const [teamError, setTeamError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hasSetup, setHasSetup] = useState(false);

  const [toss, setToss] = useState<Side>("home");
  const [possession, setPossession] = useState<Side>("home");
  const [direction, setDirection] = useState<Direction>("Ost");

  const [saving, setSaving] = useState(false);
  const [confirmPending, setConfirmPending] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch crew, team officials and setup. Deliberately does not touch the
   * loading flags before the first await: a synchronous `setState` in an effect
   * cascades, so the initial state is already "loading" and {@link retry}
   * raises it again for a user-initiated reload.
   */
  const load = useCallback(async () => {
    try {
      const [crew, team, setup] = await Promise.all([
        apiGet<Official[]>(crewPath),
        apiGet<TeamOfficial[]>(teamPath).catch(() => {
          setTeamError(true);
          return [];
        }),
        apiGet<GameSetupPayload>(setupPath),
      ]);
      setSlots(slotsFromCrew(crew ?? []));
      setTeamOfficials(team ?? []);
      const saved = hasSavedSetup(setup ?? {});
      setHasSetup(saved);
      if (saved) {
        setToss(normaliseSide(setup.ctResult, home, away));
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
  }, [crewPath, setupPath, teamPath, home, away]);

  useEffect(() => {
    // `load` only writes state after its first `await`; the rule cannot see
    // through the async call and reports the mount fetch as a cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const retry = (): void => {
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
    (slot: CrewSlot): string | null => {
      if (slot.official !== null) {
        const person = teamByOfficial.get(slot.official);
        if (person !== undefined) {
          return personName(person);
        }
      }
      return slot.name?.trim() || null;
    },
    [teamByOfficial],
  );

  const licenceOf = useCallback(
    (slot: CrewSlot): Licence => {
      if (slot.official === null) {
        return { state: "missing", label: "keine Lizenz" };
      }
      const person = teamByOfficial.get(slot.official);
      if (person === undefined || !person.license) {
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
   * One warning for the whole crew. Free-text crew rows and officials from
   * another team cannot be judged here, so only linked team licences count.
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

  const filled = slots.filter(
    (slot) =>
      CREW_SLOTS.some((known) => known.position === slot.position) &&
      (slot.official !== null || (slot.name ?? "").trim() !== ""),
  ).length;

  const chooseOfficial = (index: number, raw: string): void => {
    const official = raw === "" ? null : Number(raw);
    const person =
      official === null ? undefined : teamByOfficial.get(official);
    setSlots((current) =>
      current.map((slot, position) => {
        if (position !== index) {
          return slot;
        }
        return {
          ...slot,
          official,
          name: person === undefined ? null : personName(person),
        };
      }),
    );
    setDirty(true);
    setConfirmPending(false);
  };

  const crewPayload: CrewWrite[] = slots.map((slot) => ({
    position: slot.position,
    official: slot.official,
    name:
      slot.official === null
        ? slot.name?.trim() || null
        : (displayName(slot) ?? slot.name),
  }));

  const sideTeam = (side: Side): string | null => (side === "home" ? home : away);
  const [directionFrom, directionTo] =
    direction === "Ost" ? ["Ost", "West"] : ["West", "Ost"];

  const start = async (): Promise<void> => {
    if (saving || loading || readOnly) {
      return;
    }
    if (licenceIssues.length > 0 && !confirmPending) {
      setConfirmPending(true);
      return;
    }
    setSaving(true);
    setError(null);
    const deviceId = getDeviceId();
    try {
      if (dirty) {
        await apiPut<Official[]>(crewPath, crewPayload);
      }
      await apiPut<GameSetupPayload>(setupPath, {
        ctResult: toss,
        direction,
        fhPossession: possession,
        device_id: deviceId,
      });
      // Only claim the session once the server accepted the start: a device
      // that lost the lock must not start stamping its id on later requests.
      setDeviceId(deviceId);
      const log = await apiGet<GameLog>(logPath);
      setSaving(false);
      onStarted(log);
    } catch (startFailure) {
      const failure = describeStartError(startFailure);
      setSaving(false);
      setError(failure.message);
      if (failure.readOnly) {
        setReadOnly(true);
      }
    }
  };

  let startLabel: string;
  if (readOnly) {
    startLabel = "Nur lesen";
  } else if (saving) {
    startLabel = "Startet …";
  } else if (confirmPending) {
    startLabel = "Trotzdem starten";
  } else if (hasSetup) {
    startLabel = "Fortsetzen";
  } else {
    startLabel = `Spiel starten · ${formatGameTime(scheduled)}`;
  }

  return (
    <Screen
      kicker="Scorecard"
      sub={`${teamLabel(home)} – ${teamLabel(away)} · ${formatGameTime(
        scheduled,
      )} · Feld ${field}`}
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
          <button className="setlink" onClick={retry} type="button">
            Erneut laden
          </button>
        </div>
      ) : null}

      {!loading && loadError === null ? (
        <div className="prep">
          <section className="block">
            <div className="blockhead">
              <h2>Offizielle</h2>
              {filled === CREW_SLOTS.length ? (
                <span className="okchip">vollständig</span>
              ) : (
                <span className="chip-miss">
                  {filled}/{CREW_SLOTS.length}
                </span>
              )}
            </div>
            {teamError ? (
              <p className="setupnote" role="status">
                Die Offiziellen des Teams konnten nicht geladen werden.
              </p>
            ) : null}
            {slots.length === 0 ? (
              <p className="setupnote">Noch keine Offiziellen eingetragen.</p>
            ) : null}
            {slots.map((slot, index) => {
              const licence = licenceOf(slot);
              const name = displayName(slot);
              const selected = slot.official === null ? "" : String(slot.official);
              const personMissing =
                slot.official !== null && !teamByOfficial.has(slot.official);
              return (
                <div className="offrow" key={slot.position}>
                  <span aria-hidden="true" className="offava">
                    {initials(name)}
                  </span>
                  <span className="offnm">
                    <select
                      aria-label={`${slot.label}: Offiziellen wählen`}
                      className="offsel"
                      disabled={readOnly}
                      onChange={(event) =>
                        chooseOfficial(index, event.target.value)
                      }
                      value={selected}
                    >
                      {personMissing ? (
                        <option value={selected}>
                          {name ?? `Offizieller ${selected}`}
                        </option>
                      ) : null}
                      <option value="">
                        {slot.official === null && name !== null
                          ? name
                          : "Offiziellen wählen"}
                      </option>
                      {teamOfficials.map((person) => (
                        <option key={person.id} value={person.id}>
                          {personName(person)}
                        </option>
                      ))}
                    </select>
                    <span className="offrole">{slot.label}</span>
                  </span>
                  <span className={`lic lic-${licence.state === "valid" ? "ok" : licence.state === "expired" ? "warn" : "missing"}`}>
                    {licence.label}
                  </span>
                </div>
              );
            })}
          </section>

          {licenceIssues.length > 0 ? (
            <div className="setupwarn" role="alert">
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
              <span>Das Spiel lässt sich trotzdem starten.</span>
            </div>
          ) : null}

          <Segmented
            disabled={readOnly}
            label="Münzwurf"
            onChange={(value) => {
              setToss(value as Side);
              setConfirmPending(false);
            }}
            options={[
              { value: "home", label: teamLabel(home) },
              { value: "away", label: teamLabel(away) },
            ]}
            value={toss}
          />

          <Segmented
            disabled={readOnly}
            label="Erster Ballbesitz"
            onChange={(value) => {
              setPossession(value as Side);
              setConfirmPending(false);
            }}
            options={[
              { value: "home", label: teamLabel(home) },
              { value: "away", label: teamLabel(away) },
            ]}
            value={possession}
          />

          <Segmented
            disabled={readOnly}
            label="Richtung"
            onChange={(value) => {
              setDirection(value as Direction);
              setConfirmPending(false);
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
              <a className="setlink" href="/passcheck/">
                Passcheck-Seite
              </a>
              .
            </p>
          </section>

          <p className="setupnote" id="setup-summary">
            {teamLabel(sideTeam(toss))} gewinnt den Münzwurf · Ballbesitz{" "}
            {teamLabel(sideTeam(possession))} · Richtung{" "}
            <DirectionText from={directionFrom} to={directionTo} />
          </p>

          {error !== null ? (
            <p className="seterror" role="alert">
              {error}
            </p>
          ) : null}

          <div className="setupfoot">
            <button
              className="startbtn"
              disabled={saving || readOnly}
              onClick={() => void start()}
              type="button"
            >
              {startLabel}
            </button>
          </div>
        </div>
      ) : null}
    </Screen>
  );
}
