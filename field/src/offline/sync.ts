import { saveRoster } from "../api/passcheck";
import { flush, type FlushResult, type PendingSave } from "./outbox";

/** Drain the outbox through the same endpoint a live save uses. */
export function flushOutbox(): Promise<FlushResult> {
  return flush((save: PendingSave) =>
    saveRoster(save.teamId, save.gamedayId, save.payload)
  );
}
