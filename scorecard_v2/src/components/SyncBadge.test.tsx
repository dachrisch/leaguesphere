import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SyncBadge, { failedLabel, pauseReason, syncLabel } from "./SyncBadge";
import type { SyncStatus } from "../session/useSyncStatus";

const status = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const flushAll = vi.hoisted(() => vi.fn());

vi.mock("../session/useSyncStatus", () => ({
  useSyncStatus: () => status.current,
}));

vi.mock("../session/runtime", () => ({
  getRuntime: () => ({ sync: { flushAll } }),
}));

function makeStatus(overrides: Partial<SyncStatus> = {}): SyncStatus {
  return {
    pending: 0,
    failed: 0,
    failedOps: [],
    pendingOps: [],
    syncing: false,
    paused: null,
    online: true,
    resume: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    drop: vi.fn(async () => undefined),
    refresh: vi.fn(),
    ...overrides,
  };
}

function use(value: SyncStatus): void {
  status.current = value as unknown as Record<string, unknown>;
}

beforeEach(() => {
  flushAll.mockReset();
});

describe("syncLabel", () => {
  it("names every contract state", () => {
    expect(syncLabel({ paused: null, pending: 0, failed: 0, online: true })).toBe(
      "Synchron",
    );
    expect(syncLabel({ paused: null, pending: 3, failed: 0, online: true })).toBe(
      "3 warten",
    );
    expect(syncLabel({ paused: null, pending: 2, failed: 0, online: false })).toBe(
      "Offline · 2",
    );
    expect(syncLabel({ paused: "offline", pending: 0, failed: 0, online: false })).toBe(
      "Offline",
    );
    expect(syncLabel({ paused: "device", pending: 1, failed: 0, online: true })).toBe(
      "Pausiert · anderes Gerät",
    );
    expect(syncLabel({ paused: "auth", pending: 1, failed: 0, online: true })).toBe(
      "Pausiert · Anmeldung",
    );
  });

  it("explains why a queue is paused", () => {
    expect(pauseReason("device")).toContain("anderen Gerät");
    expect(pauseReason("auth")).toContain("Anmeldung");
    expect(pauseReason(null)).toBeNull();
  });

  it("counts rejected entries", () => {
    expect(failedLabel(1)).toBe("1 Eintrag abgelehnt");
    expect(failedLabel(2)).toBe("2 Einträge abgelehnt");
  });

  it("names rejected entries in the badge itself", () => {
    expect(syncLabel({ paused: null, pending: 0, failed: 1, online: true })).toBe(
      "1 abgelehnt",
    );
    expect(syncLabel({ paused: null, pending: 2, failed: 1, online: true })).toBe(
      "2 warten · 1 abgelehnt",
    );
  });
});

describe("SyncBadge", () => {
  it("shows the settled state without an action", () => {
    use(makeStatus());
    render(<SyncBadge gameId={42} />);

    expect(screen.getByText("Synchron")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("counts waiting writes and flushes on a tap", async () => {
    const current = makeStatus({ pending: 3 });
    use(current);
    render(<SyncBadge gameId={42} />);

    const button = screen.getByRole("button", { name: /3 warten/ });
    await userEvent.click(button);

    expect(flushAll).toHaveBeenCalledTimes(1);
  });

  it("shows the offline count", () => {
    use(makeStatus({ pending: 2, online: false }));
    render(<SyncBadge gameId={42} />);

    expect(screen.getByRole("button", { name: /Offline · 2/ })).toBeInTheDocument();
  });

  it("retries a paused queue on a tap", async () => {
    const current = makeStatus({ paused: "device", pending: 1 });
    use(current);
    render(<SyncBadge gameId={42} />);

    expect(screen.getByText(/anderen Gerät/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Pausiert · anderes Gerät/ }),
    );

    expect(current.resume).toHaveBeenCalledTimes(1);
    expect(flushAll).not.toHaveBeenCalled();
  });

  it("lists a rejected op with retry and drop", async () => {
    const current = makeStatus({
      failed: 1,
      failedOps: [
        {
          id: "op-1",
          gameId: 42,
          kind: "event",
          payload: {},
          createdAt: 1,
          attempts: 2,
          deviceId: null,
          seq: 1,
          failed: true,
          failedReason: "Ungültiger Eintrag",
          failedAt: 2,
        },
      ],
    });
    use(current);
    render(<SyncBadge gameId={42} />);

    expect(screen.getByText("1 Eintrag abgelehnt")).toBeInTheDocument();
    expect(screen.getByText("Ungültiger Eintrag")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Erneut versuchen" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Verwerfen" }));

    expect(current.retry).toHaveBeenCalledWith("op-1");
    expect(current.drop).toHaveBeenCalledWith("op-1");
  });

  it("offers Verwerfen for an op the expired session blocks", async () => {
    const current = makeStatus({
      paused: "auth",
      pending: 1,
      pendingOps: [
        {
          id: "op-stuck",
          gameId: 42,
          kind: "event",
          payload: {},
          createdAt: 1,
          attempts: 0,
          deviceId: null,
          seq: 1,
          failed: false,
          failedReason: null,
          failedAt: null,
        },
      ],
    });
    use(current);
    render(<SyncBadge gameId={42} />);

    expect(screen.getByText("Pausiert · Anmeldung")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Verwerfen" }));

    expect(current.drop).toHaveBeenCalledWith("op-stuck");
  });

  it("keeps a device pause free of drop affordances for other work", () => {
    // A device lock is a read-only answer for one game; it must not invite the
    // official to throw away ops that are only waiting.
    use(makeStatus({ paused: "device", pending: 1, pendingOps: [] }));
    render(<SyncBadge gameId={42} />);

    expect(screen.queryByRole("button", { name: "Verwerfen" })).toBeNull();
  });

  it("makes a rejected entry reachable from the badge", async () => {
    const current = makeStatus({ failed: 1 });
    use(current);
    render(<SyncBadge gameId={42} />);

    await userEvent.click(screen.getByRole("button", { name: /1 abgelehnt/ }));

    expect(flushAll).toHaveBeenCalledTimes(1);
  });
});
