import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ApiError, apiGet } from "../api/client";
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
import StartConfirmation, { startBlockers } from "../components/sheets/StartConfirmation";
import TeamLogo from "../components/TeamLogo";
import { ChevronRight, SwapArrows, Whistle } from "../components/icons";
import { initials } from "../components/initials";
import { getDeviceId } from "../device";
import { cachedGet, cachedGetMeta, snapshotKey } from "../offline/snapshot";
import { lockFrom } from "../session/lock";
import { formatGameTime } from "./GameList";
import {
  crewProgress,
  startLabel as computeStartLabel,
  startReady,
  startState,
} from "./game-setup/start";
import { useGameStart } from "./game-setup/useGameStart";
import {
  LICENCE_TONE,
  Segmented,
  hasSavedSetup,
  normaliseSide,
  normaliseToss,
  rowDisplayName,
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

  const {
    confirming,
    arm,
    resetStartPhases,
    tossTeam,
    possessionTeam,
    openConfirmation,
    confirmStart,
    runTakeOver,
    retryStart,
  } = useGameStart({
    id,
    setupPath,
    logPath,
    eventsPath,
    crewPath,
    inFlightRef: inFlight,
    loading,
    finished,
    offline,
    readOnly,
    dirty,
    setupAccepted,
    possessionSent,
    toss,
    possession,
    direction,
    qbHome,
    qbAway,
    home,
    away,
    crewLines,
    crewPayload,
    setSaving,
    setError,
    setHasSetup,
    setSetupAccepted,
    setDirty,
    setPossessionSent,
    setLockedElsewhere,
    setCanRelease,
    setReadOnly,
    setTakingOver,
    setTakeOverError,
    setConfirmOpen,
    onStarted,
  });

  const startLabel = computeStartLabel(readOnly, offline, saving, hasSetup, scheduled);
  const blockers = startBlockers({
    crew: crewLines,
    tossTeam,
    possessionTeam,
    direction,
  });
  const ready = startReady(blockers);
  const { crewFolded, crewNames, counter } = crewProgress({
    requiredSlots,
    requiredFilled,
    licenceIssues,
    slots,
    crewLines,
    crewOpen,
    displayName,
  });
  const officialsSectionId = "prep-officials";
  const configSectionId = "prep-config";
  const { banner, startWhy } = startState({
    readOnly,
    error,
    offline,
    ready,
    blockers,
  });

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
