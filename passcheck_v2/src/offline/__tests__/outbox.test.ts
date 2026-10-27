import { beforeEach, expect, vi } from "vitest";

import { clearOutbox, enqueue, flush, list, pendingCount } from "../outbox";
import type { PendingSave } from "../outbox";

function entry(clientId = "c1"): PendingSave {
  return {
    id: clientId,
    teamId: 1,
    gamedayId: 7,
    createdAt: 1000,
    payload: {
      official_name: "M. Weber",
      note: null,
      roster: [{ id: 12, jersey_number: 7 }],
      client_id: clientId,
      device_id: "device-a",
    },
  };
}

beforeEach(async () => {
  await clearOutbox();
});

it("keeps an enqueued save across a reload", async () => {
  await enqueue(entry("c1"));

  expect(await list()).toHaveLength(1);
  expect(await pendingCount()).toBe(1);
});

it("flushes once and keeps the entry when the request fails", async () => {
  await enqueue(entry("c1"));
  const send = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(undefined);

  await expect(flush(send)).resolves.toEqual({ sent: 0, pending: 1 });
  await expect(flush(send)).resolves.toEqual({ sent: 1, pending: 0 });
  expect(send).toHaveBeenCalledTimes(2);
});

it("does not enqueue the same client id twice", async () => {
  await enqueue(entry("c1"));
  await enqueue(entry("c1"));
  const send = vi.fn().mockResolvedValue(undefined);

  await expect(flush(send)).resolves.toEqual({ sent: 1, pending: 0 });
  expect(send).toHaveBeenCalledTimes(1);
});

it("flushes in creation order and stops at the first failure", async () => {
  await enqueue({ ...entry("c2"), createdAt: 2000 });
  await enqueue({ ...entry("c1"), createdAt: 1000 });
  const send = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("offline"));

  await expect(flush(send)).resolves.toEqual({ sent: 1, pending: 1 });
  expect(send.mock.calls[0][0].id).toBe("c1");
  expect((await list()).map((item) => item.id)).toEqual(["c2"]);
});
