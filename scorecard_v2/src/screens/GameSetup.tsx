import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ApiError, apiGet, apiPost, apiPut, setDeviceId } from "../api/client";
import type {
  CrewPosition,
  Game,
  GameLog,
  GameSetup as GameSetupPayload,
  Official,
  RosterPlayer,
  TeamOfficial,
} from "../api/types";
import DirectionText, {
  directionFromWire,
  type Direction,
} from "../components/DirectionText";
import Screen from "../components/Screen";
import PersonPicker from "../components/PersonPicker";
import JerseyPicker from "../components/JerseyPicker";
import { errorMessage } from "../components/sheets/errors";
import StartConfirmation, { startBlockers } from "../components/sheets/StartConfirmation";
import TeamLogo from "../components/TeamLogo";
import { ChevronRight, SwapArrows, Whistle } from "../components/icons";
import { initials } from "../components/initials";
import { getDeviceId } from "../device";
import { rememberQuarterback } from "../app/quarterback";
import { cachedGet, cachedGetMeta, snapshotKey } from "../offline/snapshot";
import { newOpId } from "../session/ids";
import { lockFrom, takeOver, type LockAnswer } from "../session/lock";
import { formatGameTime } from "./GameList";
import { useArmed } from "./useArmed";
import {
  LICENCE_TONE,
  Segmented,
  describeStartError,
  hasSavedSetup,
  normaliseSide,
  normaliseToss,
  rowDisplayName,
  sideTeam,
  slotHasValue,
  slotsFromCrew,
  teamLabel,
  type CrewSlot,
  type Side,
} from "./game-setup/crew";
import { useCrewSetup } from "./game-setup/useCrewSetup";

interface GameSetupScreenProps {
  game: Game;
  /** Called with the freshly loaded log once the server accepted the start. */
  onStarted: (log: GameLog) => void;
  /** Header chrome owned by the flow. */
  onBack?: () => void;
  onLogout?: () => void;
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
  const eventsPath = `/api/game/${id}/events`;
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
  /**
   * Another device holds the game's lock, as the live setup read answered.
   *
   * The warning the officials missed before kickoff (meeting 2026-11-05,
   * 14:47): two people prepared the same game and only found out on the first
   * write. The server compares the request's device header itself — the stored
   * id is write-only and never comes back — so this is read from
   * `locked_elsewhere`, never from a stored payload.
   */
  const [lockedElsewhere, setLockedElsewhere] = useState(false);
  /**
   * Staff may lift the lock (`DELETE …/device`). The server answers this with
   * the same read that reports `locked_elsewhere`; without it the warning
   * would promise a take-over the device cannot perform.
   */
  const [canRelease, setCanRelease] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [takeOverError, setTakeOverError] = useState<string | null>(null);
  // Taking a game over locks the other device out: the button asks once more.
  const { armed, arm, disarm } = useArmed<"takeover">();
  const confirming = armed === "takeover";

  const [toss, setToss] = useState<Side | null>(null);
  const [possession, setPossession] = useState<Side | null>(null);
  const [direction, setDirection] = useState<Direction | null>(null);
  /**
   * The quarterback each team starts with, chosen before kickoff so the play
   * sheet does not ask on the first pass. A typing aid: it is stored with the
   * setup and remembered per device when the game starts.
   */
  const [qbHome, setQbHome] = useState<number | null>(null);
  const [qbAway, setQbAway] = useState<number | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[] | null>(null);

  const [saving, setSaving] = useState(false);
  // The confirmation sheet between the tap on "Spiel starten" and the write.
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** The official asked to see a complete crew's rows. */
  const [crewOpen, setCrewOpen] = useState(false);
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
      const [crew, team, cachedSetup, positions] = await Promise.all([
        apiGet<Official[]>(crewPath),
        apiGet<TeamOfficial[]>(teamPath).catch(() => {
          setTeamError(true);
          return [];
        }),
        // Preloaded: a device that reloads with no network still shows what
        // was agreed on the coin toss. The read names this device so the
        // server can answer `locked_elsewhere` in the same request.
        cachedGetMeta<GameSetupPayload>(snapshotKey.setup(id), setupPath, {
          deviceId: getDeviceId(),
        }),
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
      const setup = cachedSetup.value;
      const saved = hasSavedSetup(setup ?? {});
      setHasSetup(saved);
      // A lock is live state: a payload read back from the snapshot is as old
      // as the snapshot, so only a fresh answer may raise the warning.
      const lock = cachedSetup.updatedAt === null ? lockFrom(setup) : null;
      setLockedElsewhere(saved && lock?.lockedElsewhere === true);
      setCanRelease(lock?.canRelease === true);
      if (saved) {
        setToss(normaliseToss(setup.ctResult, home, away));
        setPossession(normaliseSide(setup.fhPossession, home, away));
        setDirection(directionFromWire(setup.direction));
        setQbHome(setup.qbHome ?? null);
        setQbAway(setup.qbAway ?? null);
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

  useEffect(() => {
    let active = true;
    // The jersey grid of the pre-game quarterback is the same roster the play
    // sheet uses. A failed read leaves it empty; the keypad still works.
    cachedGet<RosterPlayer[]>(snapshotKey.roster(id), `/api/game/${id}/roster`)
      .then((players) => {
        if (active) {
          setRoster(players ?? []);
        }
      })
      .catch(() => {
        if (active) {
          setRoster([]);
        }
      });
    return () => {
      active = false;
    };
  }, [id]);

  const retryLoad = (): void => {
    setLoading(true);
    setLoadError(null);
    setTeamError(false);
    void load();
  };

  const {
    teamByOfficial,
    displayName,
    licenceOf,
    licenceIssues,
    licenceWarns,
    requiredSlots,
    requiredFilled,
    orderedSlots,
    pickPerson,
    enterFreeText,
    clearSlot,
    crewPayload,
    crewLines,
    takenByOthers,
  } = useCrewSetup({ slots, setSlots, teamOfficials, setDirty });

  /** Change a start field after the setup was accepted → send it again. */
  const resetStartPhases = (): void => {
    setSetupAccepted(false);
    setPossessionSent(false);
  };

  const tossTeam = toss === null ? null : teamLabel(sideTeam(toss, home, away));
  const possessionTeam =
    possession === null ? null : teamLabel(sideTeam(possession, home, away));

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

  /**
   * Re-read the live lock after a start was refused for it. The read at load
   * can predate the other device's start, and only a fresh answer carries
   * `can_release_lock` — without it the warning shows no take-over.
   */
  const refreshLock = async (): Promise<void> => {
    try {
      const answer = await apiGet<GameSetupPayload & LockAnswer>(setupPath, {
        deviceId: getDeviceId(),
      });
      const lock = lockFrom(answer);
      if (lock !== null) {
        setLockedElsewhere(lock.lockedElsewhere);
        setCanRelease(lock.canRelease);
      }
    } catch {
      // Offline: the plain "läuft auf einem anderen Gerät" message stands.
    }
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
          // Always sent (null clears a stored number): the setup row is the
          // one place every device reads the pre-game quarterback from.
          qbHome,
          qbAway,
          device_id: deviceId,
        });
        setHasSetup(true);
        setSetupAccepted(true);
        // The device that starts the game remembers the pre-game quarterbacks
        // at once: its own setup read may still answer the pre-start snapshot.
        if (qbHome !== null) {
          rememberQuarterback(id, "home", qbHome);
        }
        if (qbAway !== null) {
          rememberQuarterback(id, "away", qbAway);
        }
        // Only claim the session once the server accepted the start: a device
        // that lost the lock must not start stamping its id on later requests.
        setDeviceId(deviceId);
      }
      // The log is read before the opening possession is written, not after:
      // the possession event names a *side*, but the screen shows the team
      // *name* (`Team.name`), and the log is the payload that carries it.
      const log = await cachedGet<GameLog>(snapshotKey.log(id), logPath);
      let inPossession = log.inPossession ?? null;
      if (!possessionSent) {
        const team = possession === "home" ? log.home?.name : log.away?.name;
        if (team !== null && team !== undefined && team.trim() !== "") {
          // The opening possession is an event like every other in-game write;
          // `PUT /setup` only stores the toss/direction and the device lock.
          await apiPost(eventsPath, {
            events: [{ type: "possession", code: possession, side: possession }],
            client_id: newOpId(),
          });
          // The log above predates the write and cannot carry the marker yet.
          // The server accepted exactly this side; the next payload replaces
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
        void refreshLock();
      }
    }
  };

  /**
   * Staff take-over before kickoff: lift the lock, then claim the game for
   * this device (the first id written after a release wins). The start itself
   * stays a separate, confirmed step — this only makes it possible.
   */
  const runTakeOver = async (): Promise<void> => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setTakingOver(true);
    setTakeOverError(null);
    try {
      await takeOver(id);
      setLockedElsewhere(false);
      setCanRelease(false);
      setReadOnly(false);
      setError(null);
    } catch (takeOverFailure) {
      setTakeOverError(
        errorMessage(
          takeOverFailure,
          "Übernehmen hat nicht geklappt. Bitte erneut versuchen.",
        ),
      );
    } finally {
      inFlight.current = false;
      setTakingOver(false);
      disarm();
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

  // One source of truth for "may this start?": the banner and the confirmation
  // sheet both read `startBlockers`, so they cannot drift apart.
  const blockers = startBlockers({
    crew: crewLines,
    tossTeam,
    possessionTeam,
    direction,
  });
  const ready = blockers.length === 0;
  /**
   * A crew with every required slot staffed, every licence valid and nothing
   * to clean up needs no attention: it folds into one row. Anything off keeps
   * the rows open, so the problem is never hidden behind "ändern".
   */
  const crewComplete =
    requiredSlots.length > 0 &&
    requiredFilled === requiredSlots.length &&
    licenceIssues.length === 0 &&
    !slots.some((slot) => slot.duplicate || !slot.known) &&
    !crewLines.some((line) => line.freetext);
  const crewFolded = crewComplete && !crewOpen;
  const crewNames = requiredSlots
    .map((slot) => displayName(slot))
    .filter((value): value is string => value !== null && value.trim() !== "");
  const officialsSectionId = "prep-officials";
  const configSectionId = "prep-config";
  const counter =
    requiredSlots.length === 0
      ? "keine Pflichtposition"
      : `${requiredFilled}/${requiredSlots.length} besetzt`;

  // The banner and the start bar must say the same thing: a complete setup is
  // only "ready" when the bar is not disabled by the device lock or the
  // missing connection. Otherwise the banner names that reason instead of
  // claiming green. Missing input still comes from the same blockers array the
  // confirmation sheet uses.
  const banner = readOnly
    ? {
        tone: "miss" as const,
        title: "Nur lesen",
        lines: [error ?? "Dieses Spiel läuft auf einem anderen Gerät."],
      }
    : offline
      ? {
          tone: "miss" as const,
          title: "Start nur online",
          lines: ["Das Spiel kann nur mit Verbindung gestartet werden."],
        }
      : ready
        ? {
            tone: "ok" as const,
            title: "Bereit zum Starten",
            lines: ["Alle Pflichtangaben sind gesetzt."],
          }
        : {
            tone: "miss" as const,
            title: "Angaben fehlen",
            lines: blockers,
          };

  // The banner can scroll under the sticky start bar, so the bar repeats the
  // first open item: the reason the start is refused is never out of view.
  const openItems = !readOnly && !offline ? blockers : [];
  const startWhy =
    openItems.length === 0
      ? null
      : `Noch offen: ${openItems[0]}${
          openItems.length > 1 ? ` (+${openItems.length - 1} weitere)` : ""
        }`;

  return (
    <Screen
      onBack={onBack}
      onLogout={onLogout}
      title="Spiel vorbereiten"
      wide
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
          <section aria-label="Begegnung" className="matchcard">
            <div className="matchteams">
              <div className="matchteam matchteam-home">
                <TeamLogo className="teamlogo-match" name={home} />
                <span className="matchteam-name">{teamLabel(home)}</span>
              </div>
              <span aria-hidden="true" className="matchvs">
                VS.
              </span>
              <div className="matchteam matchteam-away">
                <TeamLogo className="teamlogo-match" name={away} />
                <span className="matchteam-name">{teamLabel(away)}</span>
              </div>
            </div>
            <p className="matchcontext">
              {formatGameTime(scheduled)} · Feld {field}
            </p>
          </section>

          {finished ? (
            <p className="finishednote" role="status">
              Dieses Spiel ist beendet.
            </p>
          ) : null}

          {lockedElsewhere ? (
            // Deliberately not `.seterror`: that class marks a *failed start*
            // (the harness and the officials read it that way), and this is a
            // warning shown before anyone taps.
            <div className="devicewarn" role="status">
              <p>
                Dieses Spiel hat ein anderes Gerät bereits übernommen. Einträge
                von hier werden abgelehnt, bis die Turnierleitung die Sperre
                freigibt – oder dieses Gerät das Spiel übernimmt.
              </p>
              {confirming ? (
                <p className="devicewarn-sub">
                  Das andere Gerät kann danach nicht mehr schreiben. Nur
                  übernehmen, wenn es ausgefallen ist.
                </p>
              ) : !canRelease ? (
                <p className="devicewarn-sub">
                  Die Turnierleitung kann die Gerätesperre aufheben.
                </p>
              ) : null}
              {takeOverError === null ? null : (
                <p className="devicewarn-sub" role="alert">
                  {takeOverError}
                </p>
              )}
              {canRelease ? (
                <button
                  className={
                    confirming
                      ? "devicewarn-btn is-armed"
                      : "devicewarn-btn"
                  }
                  disabled={takingOver}
                  onClick={() => {
                    if (!confirming) {
                      arm("takeover");
                      return;
                    }
                    void runTakeOver();
                  }}
                  type="button"
                >
                  {takingOver
                    ? "Übernehmen …"
                    : confirming
                      ? "Übernehmen"
                      : "Spiel übernehmen"}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="prepgrid">
            <section aria-labelledby={officialsSectionId} className="block">
              <div className="blockhead">
                <h2 className="sectionhead" id={officialsSectionId}>
                  <span aria-hidden="true" className="sectionicon">
                    <Whistle size={16} />
                  </span>
                  <span aria-hidden="true" className="sectionnum">
                    1.
                  </span>
                  Offizielle
                </h2>
                <span
                  className={
                    requiredFilled === requiredSlots.length
                      ? "okchip"
                      : "chip-miss"
                  }
                >
                  {counter}
                </span>
              </div>
              {teamError ? (
                <p className="setupnote" role="status">
                  Die Offiziellen des Teams konnten nicht geladen werden.
                </p>
              ) : null}

              {crewFolded ? (
                <button
                  aria-expanded={false}
                  className="crewsummary"
                  onClick={() => setCrewOpen(true)}
                  type="button"
                >
                  <span aria-hidden="true" className="crewsummary-ok">
                    ✓
                  </span>
                  <span className="crewsummary-body">
                    <span className="crewsummary-title">
                      Crew vollständig · Lizenzen gültig
                    </span>
                    <span className="crewsummary-names">
                      {crewNames.join(", ")}
                    </span>
                  </span>
                  <span className="crewsummary-edit">ändern</span>
                </button>
              ) : (
                <>
                {orderedSlots.map(({ slot, index }) => {
                  const licence = licenceOf(slot);
                  const name = displayName(slot);
                  const editable = slot.known && !slot.duplicate;
                  const optionalEmpty =
                    !slot.required && slot.known && !slotHasValue(slot);
                  const taken = editable
                    ? takenByOthers(index)
                    : new Set<number>();
                  const duplicateNames = slot.duplicate
                    ? slot.rows
                        .map((row) => rowDisplayName(row, teamByOfficial))
                        .filter((value): value is string => value !== null)
                        .join(", ")
                    : "";

                  const content = (shownName: string, freeText: boolean) => (
                    <>
                      <span
                        aria-hidden="true"
                        className={`offava${optionalEmpty ? " offava-add" : ""}`}
                      >
                        {optionalEmpty ? "+" : initials(name)}
                      </span>
                      <span className="offbody">
                        {optionalEmpty ? (
                          <>
                            <span className="offaddline">
                              <span className="offadd">
                                {slot.label} hinzufügen
                              </span>
                              <span aria-hidden="true" className="offsep">
                                ·
                              </span>
                            </span>
                            <span className="offhint">
                              Optional · ohne Pflicht zur Besetzung
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="offrole">{slot.label}</span>
                            <span className="offmember">
                              {shownName}
                              {freeText ? (
                                <span className="pplink pplink-free">
                                  Freitext
                                </span>
                              ) : null}
                            </span>
                            {licenceWarns(slot) ? (
                              <span className="offhint offhint-warn">
                                Start trotzdem möglich
                              </span>
                            ) : null}
                          </>
                        )}
                      </span>
                      <span className="offmeta">
                        {optionalEmpty ? null : (
                          <span
                            className={`lic lic-${LICENCE_TONE[licence.state]}`}
                          >
                            {licence.label}
                          </span>
                        )}
                        {editable ? (
                          <ChevronRight className="offchev" size={16} />
                        ) : null}
                      </span>
                    </>
                  );

                  return (
                    <Fragment key={`${slot.known ? "known" : "extra"}-${index}`}>
                      <div
                        className={`offrow${optionalEmpty ? " offrow-optional" : ""}`}
                      >
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
                            trigger={({ open, toggle, displayName, linked, empty }) => (
                              <button
                                aria-expanded={open}
                                aria-haspopup="listbox"
                                aria-label={
                                  optionalEmpty
                                    ? `${slot.label} hinzufügen: Offiziellen wählen`
                                    : `${slot.label}: Offiziellen wählen`
                                }
                                className={`offcard${optionalEmpty ? " offcard-add" : ""}`}
                                disabled={readOnly || finished}
                                onClick={toggle}
                                type="button"
                              >
                                {content(displayName, !linked && !empty)}
                              </button>
                            )}
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
                          <div className="offcard offcard-static">
                            {content(name ?? "–", false)}
                          </div>
                        )}
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
                </>
              )}

              <p className="setupnote passcheckline">
                <span className="passchecklabel">Passcheck</span>
                {game.passcheck === true ? (
                  <span className="okchip">Passcheck vollständig</span>
                ) : game.passcheck === false ? (
                  <span className="chip-miss">kein Passcheck</span>
                ) : (
                  <span className="tag tag-soon">unbekannt</span>
                )}
                <a
                  className="setlink passchecklink"
                  href="/passcheck/"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Passcheck-Seite
                </a>
              </p>
            </section>

            <section aria-labelledby={configSectionId} className="block">
              <div className="blockhead">
                <h2 className="sectionhead" id={configSectionId}>
                  <span aria-hidden="true" className="sectionicon">
                    <SwapArrows size={16} />
                  </span>
                  <span aria-hidden="true" className="sectionnum">
                    2.
                  </span>
                  Spielkonfiguration
                </h2>
              </div>
              <div className="configgrid">
                <Segmented
                  disabled={readOnly || finished}
                  hint={`Die Münzwahl hat das Gastteam – ${
                    away === null ? "Gastteam" : teamLabel(away)
                  }.`}
                  label="Münzwurf gewonnen von"
                  onChange={(value) => {
                    setToss(value as Side);
                    resetStartPhases();
                  }}
                  options={[
                    { value: "home", label: teamLabel(home), tone: "home" },
                    { value: "away", label: teamLabel(away), tone: "away" },
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
                    { value: "home", label: teamLabel(home), tone: "home" },
                    { value: "away", label: teamLabel(away), tone: "away" },
                  ]}
                  value={possession}
                />

                <section className="segfield">
                  <h3 className="segtitle">Spielrichtung</h3>
                  {/* The field is played along its long axis: north–south.
                      East–west runs *across* the pitch between the sidelines,
                      so the end zones are Nord and Süd. The arrow points at
                      the end zone the chosen direction attacks. */}
                  <div aria-label="Spielrichtung" className="fielddir" role="group">
                    <span aria-hidden="true" className="fielddir-end">
                      Nord
                    </span>
                    <div className="fielddir-opts">
                      {(
                        [
                          ["Nord", "Nord"],
                          ["Süd", "Süd"],
                        ] as const
                      ).map(([value, target]) => (
                        <button
                          aria-pressed={direction === value}
                          className={
                            direction === value
                              ? `fielddir-opt fielddir-${target} sel`
                              : `fielddir-opt fielddir-${target}`
                          }
                          disabled={readOnly || finished}
                          key={value}
                          onClick={() => {
                            setDirection(value);
                            resetStartPhases();
                          }}
                          type="button"
                        >
                          <DirectionText target={target} />
                        </button>
                      ))}
                    </div>
                    <span aria-hidden="true" className="fielddir-end">
                      Süd
                    </span>
                  </div>
                  <p className="setupnote">
                    Die Wahl der Seite hat immer das Gastteam – das zweit
                    genannte Team.
                  </p>
                </section>

                <section className="segfield">
                  <h3 className="segtitle">Quarterback (optional)</h3>
                  <p className="setupnote">
                    Wird beim ersten Pass vorausgewählt und gilt für jedes
                    Gerät, das das Spiel übernimmt. Im Spiel bleibt der QB
                    änderbar.
                  </p>
                  {(["home", "away"] as const).map((side) => {
                    const name = side === "home" ? home : away;
                    const value = side === "home" ? qbHome : qbAway;
                    const change =
                      side === "home" ? setQbHome : setQbAway;
                    return (
                      <div className="qbsetup" key={side}>
                        <p className="setupnote qbsetup-team">
                          {teamLabel(name)}
                        </p>
                        <JerseyPicker
                          compact
                          disabled={readOnly || finished}
                          groupLabel={`Quarterback ${teamLabel(name)}`}
                          label="QB"
                          onChange={change}
                          optionalLabel="Ohne QB"
                          players={(roster ?? []).filter(
                            (player) => player.side === side,
                          )}
                          value={value}
                        />
                      </div>
                    );
                  })}
                </section>
              </div>
            </section>
          </div>

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
            <>
              <div
                className={`readybar readybar-${banner.tone}`}
                id="readiness"
                role="status"
              >
                <b>{banner.title}</b>
                {banner.tone === "ok" ? (
                  <span>{banner.lines[0]}</span>
                ) : (
                  <ul>
                    {banner.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="setupfoot">
                {startWhy === null ? null : (
                  <p className="setupfoot-why" id="start-why">
                    {startWhy}
                  </p>
                )}
                <button
                  aria-describedby={startWhy === null ? undefined : "start-why"}
                  className="startbtn"
                  disabled={saving || readOnly || offline}
                  onClick={openConfirmation}
                  type="button"
                >
                  {startLabel}
                </button>
              </div>
            </>
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
