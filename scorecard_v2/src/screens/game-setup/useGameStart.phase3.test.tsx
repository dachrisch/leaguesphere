import { act, renderHook, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ApiError, apiGet, apiPost, apiPut, setDeviceId } from "../../api/client";
import type { GameLog } from "../../api/types";
import { rememberQuarterback } from "../../app/quarterback";
import { getDeviceId } from "../../device";
import { cachedGet } from "../../offline/snapshot";
import { lockFrom, takeOver } from "../../session/lock";
import { useGameStart } from "./useGameStart";
import type { StartCrewLine } from "../../components/sheets/StartConfirmation";

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiPut: vi.fn(),
    setDeviceId: vi.fn(),
  };
});
vi.mock("../../device", () => ({ getDeviceId: vi.fn(() => "dev-1") }));
vi.mock("../../app/quarterback", () => ({ rememberQuarterback: vi.fn() }));
vi.mock("../../offline/snapshot", () => ({
  cachedGet: vi.fn(),
  snapshotKey: { log: (id: number) => `log-${id}` },
}));
vi.mock("../../session/ids", () => ({ newOpId: vi.fn(() => "op-1") }));
vi.mock("../../session/lock", () => ({ lockFrom: vi.fn(), takeOver: vi.fn() }));

const apiGetMock = apiGet as unknown as Mock;
const apiPostMock = apiPost as unknown as Mock;
const apiPutMock = apiPut as unknown as Mock;
const setDeviceIdMock = setDeviceId as unknown as Mock;
const cachedGetMock = cachedGet as unknown as Mock;
const getDeviceIdMock = getDeviceId as unknown as Mock;
const lockFromMock = lockFrom as unknown as Mock;
const takeOverMock = takeOver as unknown as Mock;
const rememberMock = rememberQuarterback as unknown as Mock;

const team = (name: string | null): GameLog["home"] =>
  ({ name }) as unknown as GameLog["home"];

const log = (over: Partial<GameLog> = {}): GameLog => ({
  gameId: 42,
  isFirstHalf: true,
  home: team("Ravens"),
  away: team("Wolves"),
  ...over,
});

type Overrides = Parameters<typeof useGameStart>[0];

function useHarness(overrides: Partial<Overrides>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSetup, setHasSetup] = useState(false);
  const [setupAccepted, setSetupAccepted] = useState(false);
  const [possessionSent, setPossessionSent] = useState(false);
  const [lockedElsewhere, setLockedElsewhere] = useState(false);
  const [canRelease, setCanRelease] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [takeOverError, setTakeOverError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const inFlightRef = useRef(false);
  const [onStarted] = useState(() => vi.fn());
  const args: Overrides = {
    id: 42,
    setupPath: "/api/game/42/setup",
    logPath: "/api/gamelog/42",
    eventsPath: "/api/game/42/events",
    crewPath: "/api/game/42/officials",
    inFlightRef,
    loading: false,
    finished: false,
    offline: false,
    readOnly,
    dirty,
    setupAccepted,
    possessionSent,
    toss: "home",
    possession: "home",
    direction: "Süd",
    qbHome: null,
    qbAway: null,
    home: "Ravens",
    away: "Wolves",
    crewLines: [] as StartCrewLine[],
    crewPayload: [],
    setSaving,
    setError,
    setHasSetup,
    setSetupAccepted,
    setDirty,
    setPossessionSent,
    setLockedElsewhere,
    setCanRelease,
    setReadOnly,
    setTakingOver,
    setTakeOverError,
    setConfirmOpen,
    onStarted,
    ...overrides,
  };
  const start = useGameStart(args);
  return {
    ...start,
    args,
    onStarted,
    inFlightRef,
    state: {
      saving,
      error,
      hasSetup,
      setupAccepted,
      possessionSent,
      lockedElsewhere,
      canRelease,
      readOnly,
      takingOver,
      takeOverError,
      confirmOpen,
      dirty,
    },
  };
}

function setup(overrides: Partial<Overrides> = {}) {
  return renderHook(
    ({ over }: { over: Partial<Overrides> }) => useHarness(over),
    { initialProps: { over: overrides } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiGetMock.mockResolvedValue({});
  apiPostMock.mockResolvedValue(undefined);
  apiPutMock.mockResolvedValue(undefined);
  cachedGetMock.mockResolvedValue(log());
  lockFromMock.mockReturnValue(null);
  takeOverMock.mockResolvedValue(undefined);
  getDeviceIdMock.mockReturnValue("dev-1");
});

describe("useGameStart guards (Phase 3 characterization)", () => {
  it("opens the confirmation only when nothing else blocks it", async () => {
    const { result } = setup({ crewLines: [] });
    expect(result.current.tossTeam).toBe("Ravens");
    expect(result.current.possessionTeam).toBe("Ravens");
    act(() => result.current.openConfirmation());
    expect(result.current.state.confirmOpen).toBe(true);

    for (const over of [
      { loading: true },
      { finished: true },
      { offline: true },
      { readOnly: true },
    ]) {
      const closed = setup(over);
      act(() => closed.result.current.openConfirmation());
      expect(closed.result.current.state.confirmOpen).toBe(false);
    }
    const busy = setup({});
    busy.result.current.inFlightRef.current = true;
    act(() => busy.result.current.openConfirmation());
    expect(busy.result.current.state.confirmOpen).toBe(false);

    act(() => result.current.arm("takeover"));
    expect(result.current.confirming).toBe(true);
    act(() => result.current.disarm());
    expect(result.current.confirming).toBe(false);
  });

  it("resets the accepted phases when a start field changes", () => {
    const { result } = setup({ setupAccepted: true, possessionSent: true });
    act(() => result.current.resetStartPhases());
    expect(result.current.state.setupAccepted).toBe(false);
    expect(result.current.state.possessionSent).toBe(false);
  });

  it("confirms by closing the sheet and starting", async () => {
    const { result } = setup({});
    act(() => result.current.openConfirmation());
    await act(async () => result.current.confirmStart());
    expect(result.current.state.confirmOpen).toBe(false);
    expect(apiPutMock).toHaveBeenCalled();
  });

  it("re-reads the lock, tolerating a null answer and an offline failure", async () => {
    const { result } = setup({});
    lockFromMock.mockReturnValueOnce({
      lockedElsewhere: true,
      canRelease: true,
    });
    await act(async () => result.current.refreshLock());
    expect(result.current.state.lockedElsewhere).toBe(true);
    expect(result.current.state.canRelease).toBe(true);

    lockFromMock.mockReturnValueOnce(null);
    await act(async () => result.current.refreshLock());
    expect(result.current.state.lockedElsewhere).toBe(true);

    apiGetMock.mockRejectedValueOnce(new Error("offline"));
    await act(async () => result.current.refreshLock());
    expect(result.current.state.lockedElsewhere).toBe(true);
  });
});

describe("runStart (Phase 3 characterization)", () => {
  it("writes crew, setup and opening possession, then hands over the log", async () => {
    const { result } = setup({ qbHome: 7, qbAway: 11, dirty: true });
    await act(async () => result.current.runStart());
    await waitFor(() => expect(apiPutMock).toHaveBeenCalledTimes(2));
    expect(apiPostMock).toHaveBeenCalledWith("/api/game/42/events", {
      events: [{ type: "possession", code: "home", side: "home" }],
      client_id: "op-1",
    });
    expect(setDeviceIdMock).toHaveBeenCalledWith("dev-1");
    expect(rememberMock).toHaveBeenCalledWith(42, "home", 7);
    expect(rememberMock).toHaveBeenCalledWith(42, "away", 11);
    expect(result.current.state.hasSetup).toBe(true);
    expect(result.current.state.setupAccepted).toBe(true);
    expect(result.current.state.dirty).toBe(false);
    expect(result.current.onStarted).toHaveBeenCalledWith(
      expect.objectContaining({ inPossession: "Ravens" }),
    );
  });

  it("skips already-accepted writes and a missing team name", async () => {
    const accepted = setup({
      setupAccepted: true,
      possessionSent: true,
      qbHome: null,
      qbAway: null,
    });
    await act(async () => accepted.result.current.runStart());
    expect(apiPutMock).not.toHaveBeenCalled();
    expect(apiPostMock).not.toHaveBeenCalled();
    expect(accepted.result.current.onStarted).toHaveBeenCalledWith(
      expect.objectContaining({ inPossession: null }),
    );

    const unnamed = setup({ possessionSent: false });
    cachedGetMock.mockResolvedValueOnce(
      log({ home: team("  ") }),
    );
    await act(async () => unnamed.result.current.runStart());
    expect(apiPostMock).not.toHaveBeenCalled();
    expect(unnamed.result.current.state.possessionSent).toBe(true);

    const away = setup({ possession: "away", possessionSent: false });
    await act(async () => away.result.current.runStart());
    expect(apiPostMock).toHaveBeenCalledWith("/api/game/42/events", {
      events: [{ type: "possession", code: "away", side: "away" }],
      client_id: "op-1",
    });
  });

  it("stops before any write for every start guard", async () => {
    const busy = setup({});
    busy.result.current.inFlightRef.current = true;
    await act(async () => busy.result.current.runStart());
    expect(apiPutMock).not.toHaveBeenCalled();

    for (const over of [
      { loading: true },
      { finished: true },
      { offline: true },
      { readOnly: true },
      { toss: null },
      { possession: null },
      { direction: null },
    ]) {
      const guarded = setup(over);
      await act(async () => guarded.result.current.runStart());
      expect(apiPutMock).not.toHaveBeenCalled();
      expect(guarded.result.current.onStarted).not.toHaveBeenCalled();
    }
    expect(
      setup({ readOnly: true }).result.current.args.readOnly,
    ).toBe(true);
  });

  it("describes a rejected start and switches to read-only on a device lock", async () => {
    const { result } = setup({});
    apiPutMock.mockRejectedValueOnce(
      new ApiError(409, { device_id: "other" }, "locked"),
    );
    await act(async () => result.current.runStart());
    expect(result.current.state.error).toBe("locked");
    expect(result.current.state.readOnly).toBe(true);

    const plain = setup({});
    apiPutMock.mockRejectedValueOnce(new Error("boom"));
    await act(async () => plain.result.current.runStart());
    expect(plain.result.current.state.error).toBe(
      "Der Start ist fehlgeschlagen. Bitte erneut versuchen.",
    );
    expect(plain.result.current.state.readOnly).toBe(false);
  });
});

describe("take-over and retry (Phase 3 characterization)", () => {
  it("takes over, reports failure and always disarms", async () => {
    const { result } = setup({});
    act(() => result.current.arm("takeover"));
    await act(async () => result.current.runTakeOver());
    expect(takeOverMock).toHaveBeenCalledWith(42);
    expect(result.current.state.lockedElsewhere).toBe(false);
    expect(result.current.state.canRelease).toBe(false);
    expect(result.current.state.readOnly).toBe(false);
    expect(result.current.state.takeOverError).toBeNull();
    expect(result.current.confirming).toBe(false);

    const busy = setup({});
    takeOverMock.mockClear();
    busy.result.current.inFlightRef.current = true;
    await act(async () => busy.result.current.runTakeOver());
    expect(takeOverMock).not.toHaveBeenCalled();

    const failing = setup({});
    takeOverMock.mockRejectedValueOnce(new Error("nope"));
    await act(async () => failing.result.current.runTakeOver());
    expect(failing.result.current.state.takeOverError).toContain("Übernehmen hat nicht geklappt");
    expect(failing.result.current.state.takingOver).toBe(false);
  });

  it("retries a forced start after a lock release", async () => {
    // The screen is still read-only when staff releases the device lock
    // (scorecard_v2/AGENTS.md device-lock contract): a plain start stays
    // refused, only the forced retry may write.
    const { result } = setup({ readOnly: true });
    await act(async () => result.current.runStart());
    expect(apiPutMock).not.toHaveBeenCalled();

    await act(async () => result.current.retryStart());
    expect(apiPutMock).toHaveBeenCalledWith(
      "/api/game/42/setup",
      expect.anything(),
    );
    expect(result.current.state.error).toBeNull();
  });
});
