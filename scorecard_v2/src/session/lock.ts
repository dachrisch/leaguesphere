/**
 * The per-game device lock, read when a game opens and lifted by staff.
 *
 * The lock itself lives on the server (`GameSetup.device_id`, first device
 * wins). Without a read on open a second phone only learns about it on its
 * first write — a 409 after the official already tapped. The setup read
 * answers `locked_elsewhere` for a request that names its device, and
 * `can_release_lock` for staff, who may lift it (`DELETE …/device`) when the
 * holding phone is lost or dead.
 */
import { apiDelete, apiPut, setDeviceId } from "../api/client";
import { getDeviceId } from "../device";

export interface LockState {
  lockedElsewhere: boolean;
  canRelease: boolean;
}

export interface LockAnswer {
  locked_elsewhere?: boolean;
  can_release_lock?: boolean;
}

/**
 * The lock state a fresh setup read carries, or `null` when it cannot tell
 * (an older server without the flag). Never read it from a stored snapshot:
 * a lock is live state.
 */
export function lockFrom(answer: LockAnswer | null | undefined): LockState | null {
  if (typeof answer?.locked_elsewhere !== "boolean") {
    return null;
  }
  return {
    lockedElsewhere: answer.locked_elsewhere,
    canRelease: answer.can_release_lock === true,
  };
}

/**
 * Staff take-over: lift the lock, then claim the game for this device (the
 * first id written after a release wins, like at the start). The caller
 * resumes the paused queue once this resolves.
 */
export async function takeOver(gameId: number): Promise<void> {
  const deviceId = getDeviceId();
  await apiDelete(`/api/game/${gameId}/device`);
  await apiPut(`/api/game/${gameId}/setup`, { device_id: deviceId }, { deviceId });
  setDeviceId(deviceId);
}
