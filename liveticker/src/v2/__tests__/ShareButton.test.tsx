import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShareButton } from "../components/ShareButton";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ShareButton", () => {
  it("uses the Web Share API when available", async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText: vi.fn() } });

    render(<ShareButton />);
    await userEvent.click(screen.getByRole("button", { name: "Ticker teilen" }));

    expect(share).toHaveBeenCalled();
    expect(await screen.findByText("Geteilt")).toBeInTheDocument();
  });

  it("ignores an aborted native share", async () => {
    const share = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    vi.stubGlobal("navigator", { share, clipboard: { writeText: vi.fn() } });

    render(<ShareButton />);
    await userEvent.click(screen.getByRole("button", { name: "Ticker teilen" }));

    expect(share).toHaveBeenCalled();
    expect(screen.queryByText("Geteilt")).not.toBeInTheDocument();
  });

  it("falls back to copying when Web Share is unavailable", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<ShareButton />);
    await userEvent.click(screen.getByRole("button", { name: "Ticker teilen" }));

    expect(writeText).toHaveBeenCalled();
    expect(await screen.findByText("Link kopiert")).toBeInTheDocument();
  });

  it("falls back to execCommand when the clipboard is blocked", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("blocked");
    });
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const execCommand = vi.fn(() => true);
    const original = document.execCommand;
    document.execCommand = execCommand;

    render(<ShareButton />);
    await userEvent.click(screen.getByRole("button", { name: "Ticker teilen" }));

    expect(execCommand).toHaveBeenCalled();
    expect(await screen.findByText("Link kopiert")).toBeInTheDocument();
    document.execCommand = original;
  });
});
