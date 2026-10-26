import { beforeEach, expect, vi } from "vitest";

import { saveRoster } from "../../api/passcheck";
import { clearOutbox, enqueue, pendingCount } from "../outbox";
import { flushOutbox } from "../sync";
import type { PendingSave } from "../outbox";

vi.mock("../../api/passcheck", () => ({ saveRoster: vi.fn() }));

const mockedSave = vi.mocked(saveRoster);

function entry(): PendingSave {
  return {
    id: "c1",
    teamId: 1,
    gamedayId: 7,
    createdAt: 1,
    payload: {
      official_name: "M. Weber",
      note: null,
      roster: [{ id: 12, jersey_number: 7 }],
      client_id: "c1",
      device_id: "d1",
    },
  };
}

beforeEach(async () => {
  mockedSave.mockReset();
  await clearOutbox();
});

it("drains the outbox through the roster endpoint", async () => {
  await enqueue(entry());
  mockedSave.mockResolvedValue(undefined);

  await expect(flushOutbox()).resolves.toEqual({ sent: 1, pending: 0 });
  expect(mockedSave).toHaveBeenCalledWith(1, 7, entry().payload);
  expect(await pendingCount()).toBe(0);
});
