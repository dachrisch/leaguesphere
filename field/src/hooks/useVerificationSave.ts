import { useRef, useState } from "react";

import { saveRoster } from "../api/passcheck";
import type { ApiError } from "../api/client";
import type { RosterWriteEntry, SaveRosterPayload } from "../api/types";
import { enqueue } from "../offline/outbox";

const DEVICE_ID_KEY = "field_device_id";

export type SaveInput = {
  officialName: string;
  note: string;
  entries: RosterWriteEntry[];
};

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "done" }
  | { status: "queued" }
  | { status: "error"; errors: Record<string, string>; conflict: string | null };

export function getDeviceId(): string {
  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;
  const generated = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, generated);
  return generated;
}

export function useVerificationSave(teamId: number, gamedayId: number) {
  const [state, setState] = useState<SaveState>({ status: "idle" });
  const clientIdRef = useRef<string | null>(null);
  const deviceIdRef = useRef<string | null>(null);

  const save = async ({ officialName, note, entries }: SaveInput) => {
    // Reuse the id for retries of the same attempt; a reset starts a new one.
    clientIdRef.current ??= crypto.randomUUID();
    deviceIdRef.current ??= getDeviceId();
    const payload: SaveRosterPayload = {
      official_name: officialName,
      note,
      roster: entries,
      client_id: clientIdRef.current,
      device_id: deviceIdRef.current,
    };
    setState({ status: "saving" });
    try {
      await saveRoster(teamId, gamedayId, payload);
      setState({ status: "done" });
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 0) {
        await enqueue({
          id: clientIdRef.current,
          teamId,
          gamedayId,
          payload,
          createdAt: Date.now(),
        });
        setState({ status: "queued" });
        return;
      }
      const errors =
        apiError.status === 400
          ? ((apiError.body as { errors?: Record<string, string> } | undefined)
              ?.errors ?? {})
          : {};
      setState({
        status: "error",
        errors,
        conflict: apiError.status === 409 ? apiError.message : null,
      });
    }
  };

  const reset = () => {
    clientIdRef.current = null;
    setState({ status: "idle" });
  };

  return { state, save, reset };
}
