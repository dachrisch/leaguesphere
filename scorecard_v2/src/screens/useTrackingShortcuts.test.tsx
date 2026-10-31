import { fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTrackingShortcuts } from "./useTrackingShortcuts";

const DESKTOP = "(min-width: 1280px)";

function handlers() {
  return {
    onTouchdown: vi.fn(),
    onAction: vi.fn(),
    onSwitchPossession: vi.fn(),
    onUndo: vi.fn(),
  };
}

function renderShortcuts(
  callbacks = handlers(),
  options: { readOnly?: boolean; sheetOpen?: boolean } = {},
) {
  const view = renderHook(
    ({ readOnly, sheetOpen }) =>
      useTrackingShortcuts({
        ...callbacks,
        readOnly,
        sheetOpen,
      }),
    {
      initialProps: {
        readOnly: options.readOnly ?? false,
        sheetOpen: options.sheetOpen ?? false,
      },
    },
  );
  return { callbacks, ...view };
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === DESKTOP,
      media: query,
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("useTrackingShortcuts", () => {
  it("keeps one listener and calls the handlers of the latest render", () => {
    // A key pressed right after a render must reach that render's handlers:
    // re-subscribing in an effect left the previous listener live until the
    // effect ran, so an armed tile's second key press still saw it unarmed.
    const addListener = vi.spyOn(window, "addEventListener");
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = renderHook(
      ({ onAction }) =>
        useTrackingShortcuts({
          ...handlers(),
          onAction,
          readOnly: false,
          sheetOpen: false,
        }),
      { initialProps: { onAction: first } },
    );

    rerender({ onAction: latest });
    fireEvent.keyDown(window, { key: "1" });

    const keydowns = addListener.mock.calls.filter(([type]) => type === "keydown");
    expect(keydowns).toHaveLength(1);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(0);
  });

  it("maps T and B to touchdown and possession", () => {
    const { callbacks } = renderShortcuts();

    fireEvent.keyDown(window, { key: "t" });
    fireEvent.keyDown(window, { key: "B" });

    expect(callbacks.onTouchdown).toHaveBeenCalledTimes(1);
    expect(callbacks.onSwitchPossession).toHaveBeenCalledTimes(1);
    expect(callbacks.onAction).not.toHaveBeenCalled();
  });

  it("maps 1–8 to the eight grid actions in order", () => {
    const { callbacks } = renderShortcuts();

    for (let key = 1; key <= 8; key += 1) {
      fireEvent.keyDown(window, { key: String(key) });
    }

    expect(callbacks.onAction.mock.calls).toEqual([
      [0],
      [1],
      [2],
      [3],
      [4],
      [5],
      [6],
      [7],
    ]);
  });

  it("maps Ctrl+Z and Cmd+Z to undo", () => {
    const { callbacks } = renderShortcuts();

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "z", metaKey: true });

    expect(callbacks.onUndo).toHaveBeenCalledTimes(2);
  });

  it("does not fire below the desktop breakpoint", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: false, media: query })),
    );
    const { callbacks } = renderShortcuts();

    fireEvent.keyDown(window, { key: "t" });
    fireEvent.keyDown(window, { key: "1" });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });

    expect(callbacks.onTouchdown).not.toHaveBeenCalled();
    expect(callbacks.onAction).not.toHaveBeenCalled();
    expect(callbacks.onUndo).not.toHaveBeenCalled();
  });

  it("does not fire in read-only mode", () => {
    const { callbacks } = renderShortcuts(handlers(), { readOnly: true });

    fireEvent.keyDown(window, { key: "t" });
    fireEvent.keyDown(window, { key: "b" });
    fireEvent.keyDown(window, { key: "2" });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });

    expect(callbacks.onTouchdown).not.toHaveBeenCalled();
    expect(callbacks.onSwitchPossession).not.toHaveBeenCalled();
    expect(callbacks.onAction).not.toHaveBeenCalled();
    expect(callbacks.onUndo).not.toHaveBeenCalled();
  });

  it("does not fire while a sheet is open", () => {
    const { callbacks } = renderShortcuts(handlers(), { sheetOpen: true });

    fireEvent.keyDown(window, { key: "t" });
    fireEvent.keyDown(window, { key: "1" });

    expect(callbacks.onTouchdown).not.toHaveBeenCalled();
    expect(callbacks.onAction).not.toHaveBeenCalled();
  });

  it("does not fire while another dialog is open", () => {
    const { callbacks } = renderShortcuts();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);

    fireEvent.keyDown(window, { key: "t" });

    expect(callbacks.onTouchdown).not.toHaveBeenCalled();
  });

  it.each(["input", "textarea", "select"])(
    "does not fire while a %s is focused",
    (tagName) => {
      const { callbacks } = renderShortcuts();
      const field = document.createElement(tagName);
      document.body.append(field);
      field.focus();

      fireEvent.keyDown(field, { key: "t" });
      fireEvent.keyDown(field, { key: "1" });

      expect(callbacks.onTouchdown).not.toHaveBeenCalled();
      expect(callbacks.onAction).not.toHaveBeenCalled();
    },
  );

  it("ignores repeats, unrelated keys and modified letter shortcuts", () => {
    const { callbacks } = renderShortcuts();

    fireEvent.keyDown(window, { key: "t", repeat: true });
    fireEvent.keyDown(window, { key: "t", ctrlKey: true });
    fireEvent.keyDown(window, { key: "x" });

    expect(callbacks.onTouchdown).not.toHaveBeenCalled();
  });
});
