import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { GameLog } from "../api/types";
import type { StoredOp } from "../offline/types";
import type { SyncStatus } from "../session/useSyncStatus";
import StrandedEntries from "./StrandedEntries";

function log(home: number, away: number): GameLog {
  const team = (id: number, name: string, score: number) => ({
    id,
    name,
    score,
    firsthalf: { score, entries: [] },
    secondhalf: { score: 0, entries: [] },
  });
  return {
    gameId: 42,
    isFirstHalf: true,
    inPossession: "Ravens",
    events: [],
    home: team(1, "Ravens", home),
    away: team(2, "Wolves", away),
  };
}

function op(id: string, title = "touchdown"): StoredOp {
  return {
    id,
    gameId: 42,
    kind: "event",
    payload: {
      events: [{ type: "score", code: title, side: "home", period: 1 }],
    },
    createdAt: 1,
    attempts: 0,
    seq: 1,
    failed: false,
    failedReason: null,
    failedAt: null,
  };
}

function status(overrides: Partial<SyncStatus> = {}): SyncStatus {
  return {
    pending: 1,
    failed: 0,
    failedOps: [],
    pendingOps: [op("a")],
    syncing: false,
    paused: "device",
    online: true,
    resume: vi.fn(),
    retry: vi.fn(),
    drop: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

describe("StrandedEntries", () => {
  it("lists the held entries behind one tap, without a retry action", async () => {
    const user = userEvent.setup();
    render(
      <StrandedEntries
        deviceLog={log(7, 0)}
        serverLog={log(7, 0)}
        status={status({ pending: 2, pendingOps: [op("a"), op("b", "pat1")] })}
      />,
    );

    expect(screen.getByText("2 Einträge anzeigen")).toBeInTheDocument();
    await user.click(screen.getByText("2 Einträge anzeigen"));

    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      "Touchdown",
      "1-Extra-Punkt",
    ]);
    expect(screen.queryByRole("button", { name: /verwerfen/i })).toBeNull();
  });

  it("labels the device's own score as not official when it differs", () => {
    render(
      <StrandedEntries
        deviceLog={log(13, 0)}
        serverLog={log(7, 0)}
        status={status()}
      />,
    );

    expect(screen.getByText(/13:0/)).toHaveTextContent("nicht offiziell");
  });

  it("renders nothing while the phone may write", () => {
    render(
      <StrandedEntries
        deviceLog={log(7, 0)}
        serverLog={log(7, 0)}
        status={status({ paused: null })}
      />,
    );

    expect(screen.queryByText(/anzeigen/)).toBeNull();
  });
});
