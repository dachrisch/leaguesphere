import { clear, createStore, del, entries, set } from "idb-keyval";

import type { SaveRosterPayload } from "../api/types";

const store = createStore("field", "outbox");

export type PendingSave = {
  id: string;
  teamId: number;
  gamedayId: number;
  payload: SaveRosterPayload;
  createdAt: number;
};

export type FlushResult = {
  sent: number;
  pending: number;
};

export async function enqueue(save: PendingSave): Promise<void> {
  await set(save.id, save, store);
}

export async function list(): Promise<PendingSave[]> {
  const stored = await entries<string, PendingSave>(store);
  return stored
    .map(([, save]) => save)
    .sort((left, right) => left.createdAt - right.createdAt);
}

export async function pendingCount(): Promise<number> {
  return (await list()).length;
}

export async function remove(id: string): Promise<void> {
  await del(id, store);
}

export async function clearOutbox(): Promise<void> {
  await clear(store);
}

async function runFlush(
  send: (save: PendingSave) => Promise<unknown>
): Promise<FlushResult> {
  let sent = 0;
  for (const save of await list()) {
    try {
      await send(save);
      await remove(save.id);
      sent += 1;
    } catch {
      // Keep this entry and everything after it: the log order is the order
      // the official tapped, so a failed send must not let later ones pass.
      break;
    }
  }
  return { sent, pending: await pendingCount() };
}

let inFlight: Promise<FlushResult> | null = null;

/** Single-flight: a second tab or the `online` event cannot double-send. */
export function flush(
  send: (save: PendingSave) => Promise<unknown>
): Promise<FlushResult> {
  if (inFlight) return inFlight;
  inFlight = runFlush(send).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
