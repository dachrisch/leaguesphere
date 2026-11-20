import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShareButton } from "../components/ShareButton";
import { game } from "./fixture";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
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

  it("falls back to copying when the native share fails", async () => {
    const share = vi.fn(async () => {
      throw new Error("not supported");
    });
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });

    render(<ShareButton />);
    await userEvent.click(screen.getByRole("button", { name: "Ticker teilen" }));

    expect(writeText).toHaveBeenCalled();
    expect(await screen.findByText("Link kopiert")).toBeInTheDocument();
  });

  it("reports when neither sharing nor copying works", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn(async () => {
          throw new Error("blocked");
        }),
      },
    });
    const original = document.execCommand;
    document.execCommand = vi.fn(() => false);

    render(<ShareButton />);
    await userEvent.click(screen.getByRole("button", { name: "Ticker teilen" }));

    expect(
      await screen.findByText("Teilen fehlgeschlagen"),
    ).toBeInTheDocument();
    document.execCommand = original;
  });

  it("shows a transient toast when the icon copies the link", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<ShareButton variant="icon" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ticker teilen" }));
    });

    expect(screen.getByText("Link kopiert")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.queryByText("Link kopiert")).not.toBeInTheDocument();
  });

  it("shows a transient toast on the icon error path", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn(async () => {
          throw new Error("blocked");
        }),
      },
    });
    const original = document.execCommand;
    document.execCommand = vi.fn(() => false);

    render(<ShareButton variant="icon" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ticker teilen" }));
    });

    expect(screen.getByText("Teilen fehlgeschlagen")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(
      screen.queryByText("Teilen fehlgeschlagen"),
    ).not.toBeInTheDocument();
    document.execCommand = original;
  });

  it("stays quiet on the icon when the native share sheet opens", async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText: vi.fn() } });

    render(<ShareButton variant="icon" />);
    await userEvent.click(screen.getByRole("button", { name: "Ticker teilen" }));

    expect(share).toHaveBeenCalled();
    expect(screen.queryByText("Geteilt")).not.toBeInTheDocument();
    expect(screen.queryByText("Link kopiert")).not.toBeInTheDocument();
  });

  it("shares the deep link and names both teams", async () => {
    window.history.replaceState({}, "", "/liveticker/v2/?game=1");
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText: vi.fn() } });

    render(<ShareButton game={game} />);
    await userEvent.click(screen.getByRole("button", { name: "Ticker teilen" }));

    const [payload] = share.mock.calls[0] as unknown as [
      { title: string; url: string },
    ];
    expect(payload.title).toBe(
      "Walldorf Wanderers – Düsseldorf Firecats · Liveticker",
    );
    expect(new URL(payload.url).searchParams.get("game")).toBe("1");
  });

  it("falls back to the full team name in the share title", async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText: vi.fn() } });

    render(
      <ShareButton
        game={{
          ...game,
          home: { ...game.home, name: "", full_name: "Full Home" },
          away: { ...game.away, name: "", full_name: "Full Away" },
        }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ticker teilen" }));

    const [payload] = share.mock.calls[0] as unknown as [{ title: string }];
    expect(payload.title).toBe("Full Home – Full Away · Liveticker");
  });
});
