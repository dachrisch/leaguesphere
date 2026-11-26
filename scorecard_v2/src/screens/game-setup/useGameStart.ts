import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { apiGet, apiPost, apiPut, setDeviceId } from "../../api/client";
import type {
  GameLog,
  GameSetup as GameSetupPayload,
  Official,
} from "../../api/types";
import { rememberQuarterback } from "../../app/quarterback";
import { errorMessage } from "../../components/sheets/errors";
import { startBlockers } from "../../components/sheets/StartConfirmation";
import type { Direction } from "../../components/DirectionText";
import { getDeviceId } from "../../device";
import { cachedGet, snapshotKey } from "../../offline/snapshot";
import { newOpId } from "../../session/ids";
import { lockFrom, takeOver, type LockAnswer } from "../../session/lock";
import { useArmed } from "../useArmed";
import {
  describeStartError,
  sideTeam,
  teamLabel,
  type Side,
} from "./crew";
import type { StartCrewLine } from "../../components/sheets/StartConfirmation";

interface UseGameStartArgs {
  id: number;
  setupPath: string;
  logPath: string;
  eventsPath: string;
  crewPath: string;
  inFlight: MutableRefObject<boolean>;
  loading: boolean;
  finished: boolean;
  offline: boolean;
  readOnly: boolean;
  dirty: boolean;
  setupAccepted: boolean;
  possessionSent: boolean;
  toss: Side | null;
  possession: Side | null;
  direction: Direction | null;
  qbHome: number | null;
  qbAway: number | null;
  home: string | null;
  away: string | null;
  crewLines: StartCrewLine[];
  crewPayload: { position: string; official: number | null; name: string | null }[];
  setSaving: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setHasSetup: Dispatch<SetStateAction<boolean>>;
  setSetupAccepted: Dispatch<SetStateAction<boolean>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  setPossessionSent: Dispatch<SetStateAction<boolean>>;
  setLockedElsewhere: Dispatch<SetStateAction<boolean>>;
  setCanRelease: Dispatch<SetStateAction<boolean>>;
  setReadOnly: Dispatch<SetStateAction<boolean>>;
  setTakingOver: Dispatch<SetStateAction<boolean>>;
  setTakeOverError: Dispatch<SetStateAction<string | null>>;
  setConfirmOpen: Dispatch<SetStateAction<boolean>>;
  onStarted: (log: GameLog) => void;
}

/** Start/take-over/validation orchestration extracted from GameSetupScreen. */
export function useGameStart({
  id,
  setupPath,
  logPath,
  eventsPath,
  crewPath,
  inFlight,
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
}: UseGameStartArgs) {
  const { armed, arm, disarm } = useArmed<"takeover">();
  const confirming = armed === "takeover";

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

  return {
    confirming,
    arm,
    disarm,
    resetStartPhases,
    tossTeam,
    possessionTeam,
    openConfirmation,
    confirmStart,
    refreshLock,
    runStart,
    runTakeOver,
    retryStart,
  };
}
