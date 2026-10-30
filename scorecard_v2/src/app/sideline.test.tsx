import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { confirmTap, useWakeLock } from "./sideline";

function Holder({ active }: { active: boolean }) {
  useWakeLock(active);
  return null;
}

/** A `navigator.wakeLock` whose sentinels record their release. */
function stubWakeLock() {
  const sentinels: { release: ReturnType<typeof vi.fn> }[] = [];
  const request = vi.fn(async () => {
    const sentinel = { release: vi.fn(async () => undefined) };
    sentinels.push(sentinel);
    return sentinel;
  });
  vi.stubGlobal("navigator", { ...navigator, wakeLock: { request } });
  return { request, sentinels };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useWakeLock", () => {
  it("keeps the screen on while active and releases it on unmount", async () => {
    const { request, sentinels } = stubWakeLock();

    const view = render(<Holder active />);
    await act(async () => undefined);

    expect(request).toHaveBeenCalledWith("screen");
    view.unmount();
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
  });

  it("asks for nothing while inactive", async () => {
    const { request } = stubWakeLock();

    render(<Holder active={false} />);
    await act(async () => undefined);

    expect(request).not.toHaveBeenCalled();
  });

  it("asks again when the page becomes visible (the browser drops the lock on hide)", async () => {
    const { request } = stubWakeLock();
    render(<Holder active />);
    await act(async () => undefined);

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(request).toHaveBeenCalledTimes(2);
  });

  it("tolerates a browser without the API or a refused request", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      wakeLock: { request: vi.fn(async () => Promise.reject(new Error("no"))) },
    });

    expect(() => render(<Holder active />)).not.toThrow();
    await act(async () => undefined);

    vi.stubGlobal("navigator", { ...navigator, wakeLock: undefined });
    expect(() => render(<Holder active />)).not.toThrow();
  });
});

describe("confirmTap", () => {
  it("gives a short vibration where the device has one", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, vibrate });

    confirmTap();

    expect(vibrate).toHaveBeenCalledWith(15);
  });

  it("does nothing on a device without vibration", () => {
    vi.stubGlobal("navigator", { ...navigator, vibrate: undefined });

    expect(() => confirmTap()).not.toThrow();
  });
});
