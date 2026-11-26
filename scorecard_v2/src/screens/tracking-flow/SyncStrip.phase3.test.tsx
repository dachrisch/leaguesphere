import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GameLog, GameLogTeam } from "../../api/types";
import { strandedNotice } from "../../session/stranded";
import type { SyncStatus } from "../../session/useSyncStatus";
import { SyncStrip } from "./SyncStrip";

const team = (name: string, score: number): GameLogTeam => ({
  id: 1,
  name,
  score,
  firsthalf: { score: 0, entries: [] },
  secondhalf: { score: 0, entries: [] },
});

const makeLog = (homeScore = 7): GameLog => ({
  gameId: 42,
  isFirstHalf: true,
  inPossession: null,
  events: [],
  home: team("Ravens", homeScore),
  away: team("Wolves", 0),
});

function status(overrides: Partial<SyncStatus> = {}): SyncStatus {
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

function strip(overrides: Partial<SyncStatus>, props: Record<string, unknown> = {}) {
  return render(
    <SyncStrip
      deviceLog={makeLog(13)}
      drained={false}
      onResume={vi.fn()}
      serverLog={makeLog(7)}
      status={status(overrides)}
      {...props}
    />,
  );
}

describe("SyncStrip (Phase 3 characterization)", () => {
  it("stays hidden until there is something to say", () => {
    expect(strip({}).container).toBeEmptyDOMElement();
  });

  it("confirms a drained queue", () => {
    strip({}, { drained: true });
    expect(screen.getByRole("status", { name: "Übertragung" })).toHaveTextContent(
      "✓ Alles gesendet",
    );
  });

  it("names singular and plural pending entries", () => {
    const one = strip({ pending: 1 });
    expect(one.container).toHaveTextContent("1 Eintrag noch nicht übertragen");
    cleanup();
    const many = strip({ pending: 2 });
    expect(many.container).toHaveTextContent("2 Einträge noch nicht übertragen");
  });

  it("explains an offline pause with and without waiting entries", () => {
    strip({ online: false });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Offline · Einträge werden hier gespeichert",
    );
    cleanup();
    strip({ paused: "offline", pending: 3 });
    expect(screen.getByRole("status")).toHaveTextContent(
      "3 Einträge noch nicht übertragen",
    );
  });

  it("describes an auth pause", () => {
    strip({ paused: "auth" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Schreiben gesperrt – bitte neu anmelden.",
    );
  });

  it("names stranded entries and offers a staff take-over only with the rights", () => {
    const onTakeOver = vi.fn(async () => undefined);
    strip({ paused: "device", pending: 2 }, { canRelease: true, onTakeOver });
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).toContain(strandedNotice(2));
    expect(text).toContain("13:0");
    expect(text).toContain("nicht offiziell");
    expect(screen.getByRole("button", { name: "Erneut prüfen" })).toBeTruthy();
    const takeover = screen.getByRole("button", { name: "Spiel übernehmen" });
    fireEvent.click(takeover);
    expect(
      screen.getByRole("button", { name: "Übernehmen" }).className,
    ).toContain("is-armed");
    expect(screen.getByRole("status").textContent).toContain(
      "Das andere Gerät kann danach nicht mehr schreiben.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(onTakeOver).toHaveBeenCalledTimes(1);

    cleanup();
    strip({ paused: "device", pending: 1 });
    expect(screen.getByRole("status").textContent).toContain(
      "Die Turnierleitung kann die Gerätesperre aufheben.",
    );
    expect(screen.queryByRole("button", { name: "Spiel übernehmen" })).toBeNull();
  });

  it("reports a failed take-over and the retry label", async () => {
    const onTakeOver = vi.fn(async () => {
      throw new Error("nope");
    });
    strip({ paused: "device", pending: 1 }, { canRelease: true, onTakeOver });
    fireEvent.click(screen.getByRole("button", { name: "Spiel übernehmen" }));
    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Übernehmen hat nicht geklappt",
    );
    expect(screen.getByRole("button", { name: "Spiel übernehmen" })).toBeTruthy();
  });

  it("leaves the stranded list without a take-over button when the role may not", () => {
    strip({ paused: "device", pending: 1 }, { canRelease: true });
    expect(screen.getByRole("button", { name: "Erneut prüfen" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Spiel übernehmen" })).toBeNull();
  });
});
