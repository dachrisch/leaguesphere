import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SyncBadge, {
  badgeState,
  failedLabel,
  hasDetails,
  pauseReason,
  SyncDetails,
  syncLabel,
} from "./SyncBadge";
import type { SyncStatus } from "../session/useSyncStatus";
import type { StoredOp } from "../offline/types";

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

/** A stored op, for the lists only {@link SyncDetails} renders. */
function op(overrides: Partial<StoredOp> = {}): StoredOp {
  return {
    id: "op-1",
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
    ...overrides,
  };
}

describe("the inline chip", () => {
  it("renders the state on its own, without the block or its details", () => {
    use(makeStatus({ failed: 1, failedOps: [op({ failed: true })] }));
    const { container } = render(<SyncBadge gameId={42} variant="inline" />);

    expect(
      screen.getByRole("button", { name: /1 abgelehnt/ }),
    ).toBeInTheDocument();
    // The app bar gets one chip; the lists stay with the screen.
    expect(container.querySelector(".syncbar")).toBeNull();
    expect(container.querySelector(".syncfailed")).toBeNull();
  });

  it("is a plain labelled span while there is nothing to retry", () => {
    use(makeStatus());
    render(<SyncBadge gameId={42} variant="inline" />);

    expect(screen.getByText("Synchron")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTitle("Übertragung: Synchron")).toBeInTheDocument();
  });

  it("names the action on the tappable chip", async () => {
    use(makeStatus({ pending: 2 }));
    render(<SyncBadge gameId={42} variant="inline" />);

    const chip = screen.getByRole("button", {
      name: "Übertragung: 2 warten – jetzt versuchen",
    });
    expect(chip).toHaveAttribute("title", "Übertragung: 2 warten – jetzt versuchen");
    await userEvent.click(chip);

    expect(flushAll).toHaveBeenCalledTimes(1);
  });

  it("renders from a status the screen already holds", () => {
    // The screen read the outbox once; the hook would say "Synchron" here.
    use(makeStatus());
    render(<SyncBadge status={makeStatus({ pending: 1 })} variant="inline" />);
    expect(screen.getByText("1 warten")).toBeInTheDocument();

    render(<SyncDetails status={makeStatus({ paused: "device" })} />);
    expect(
      screen.getByRole("region", { name: "Übertragungsdetails" }),
    ).toBeInTheDocument();
  });

  it("renders no details from a clean status it was handed", () => {
    use(makeStatus({ failed: 1 }));
    const { container } = render(<SyncDetails status={makeStatus()} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("SyncDetails", () => {
  it("renders nothing while the queue is clean", () => {
    use(makeStatus());
    const { container } = render(<SyncDetails gameId={42} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("explains a pause and drops the ops only the session blocks", async () => {
    const current = makeStatus({
      paused: "auth",
      pending: 1,
      pendingOps: [op({ id: "op-stuck" })],
    });
    use(current);
    render(<SyncDetails gameId={42} />);

    expect(
      screen.getByText(/Die Anmeldung ist abgelaufen/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 Eintrag wartet auf die Anmeldung"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    expect(current.drop).toHaveBeenCalledWith("op-stuck");
  });

  it("counts several blocked ops in the plural", () => {
    use(
      makeStatus({
        paused: "auth",
        pending: 2,
        pendingOps: [op({ id: "op-a" }), op({ id: "op-b" })],
      }),
    );
    render(<SyncDetails gameId={42} />);

    expect(
      screen.getByText("2 Einträge warten auf die Anmeldung"),
    ).toBeInTheDocument();
  });

  it("lists rejected ops with retry and drop", async () => {
    const current = makeStatus({
      failed: 1,
      failedOps: [op({ failed: true, failedReason: "Ungültiger Eintrag" })],
    });
    use(current);
    render(<SyncDetails gameId={42} />);

    expect(screen.getByText("1 Eintrag abgelehnt")).toBeInTheDocument();
    expect(screen.getByText("Ungültiger Eintrag")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Erneut versuchen" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Verwerfen" }));

    expect(current.retry).toHaveBeenCalledWith("op-1");
    expect(current.drop).toHaveBeenCalledWith("op-1");
  });

  it("falls back to a generic reason for a rejection without one", () => {
    use(makeStatus({ failed: 1, failedOps: [op({ failed: true })] }));
    render(<SyncDetails gameId={42} />);

    expect(screen.getByText("Unbekannter Fehler")).toBeInTheDocument();
  });
});

describe("badgeState", () => {
  it("maps one status onto the chip's word, tone and action", () => {
    expect(badgeState(makeStatus())).toMatchObject({
      label: "Synchron",
      tone: "ok",
      actionable: false,
    });
    expect(badgeState(makeStatus({ pending: 2 }))).toMatchObject({
      label: "2 warten",
      tone: "wait",
      actionable: true,
    });
    expect(badgeState(makeStatus({ pending: 2, online: false }))).toMatchObject({
      label: "Offline · 2",
      tone: "off",
      actionable: true,
    });
    expect(badgeState(makeStatus({ paused: "device", pending: 1 }))).toMatchObject({
      label: "Pausiert · anderes Gerät",
      tone: "off",
      actionable: true,
    });
  });

  it("only offers the droppable list for an expired session", () => {
    const stuck = op({ id: "op-stuck" });

    expect(
      badgeState(makeStatus({ paused: "auth", pending: 1, pendingOps: [stuck] }))
        .droppable,
    ).toEqual([stuck]);
    expect(
      badgeState(makeStatus({ paused: "device", pending: 1, pendingOps: [stuck] }))
        .droppable,
    ).toEqual([]);
  });
});

describe("hasDetails", () => {
  it("is false only for a clean, unpaused queue", () => {
    expect(hasDetails(makeStatus())).toBe(false);
    expect(hasDetails(makeStatus({ pending: 1 }))).toBe(false);
    expect(hasDetails(makeStatus({ failed: 1 }))).toBe(true);
    expect(hasDetails(makeStatus({ paused: "device" }))).toBe(true);
    expect(
      hasDetails(makeStatus({ paused: "auth", pending: 1, pendingOps: [op()] })),
    ).toBe(true);
  });
});
