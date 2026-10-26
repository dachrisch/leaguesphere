import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Gameday } from "../api/types";
import GamedayList, { formatGamedayDate, gamedayTag } from "./GamedayList";

const TODAY = "2026-10-26";

function makeGameday(overrides: Partial<Gameday> = {}): Gameday {
  return {
    id: 1,
    name: "Herbstturnier",
    season: 3,
    league: 7,
    date: TODAY,
    start: "10:00",
    format: "6_2",
    author: 1,
    address: "Sportpark Nord, Feld 2",
    status: "PUBLISHED",
    published_at: "2026-10-20T08:00:00Z",
    updated_at: "2026-10-20T08:00:00Z",
    resource_urls: [],
    ...overrides,
  };
}

function renderList(
  gamedays: Gameday[],
  props: { todayLabel?: string } = {},
) {
  const onSelect = vi.fn();
  render(
    <GamedayList
      gamedays={gamedays}
      onSelect={onSelect}
      todayLabel={props.todayLabel}
    />,
  );
  return { onSelect };
}

describe("GamedayList", () => {
  it("shows the screen header with the gameday date", () => {
    renderList([makeGameday()]);

    expect(screen.getByText("Scorecard")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Meine Spieltage" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Mo., 26. Okt.")).toBeInTheDocument();
  });

  it("prefixes the given today label with Heute", () => {
    renderList([makeGameday()], { todayLabel: "Mo., 26. Okt." });

    expect(screen.getByText("Heute · Mo., 26. Okt.")).toBeInTheDocument();
  });

  it("renders name, date, start and address of every gameday", () => {
    renderList([
      makeGameday(),
      makeGameday({ id: 2, name: "Liga Süd", start: "14:30" }),
    ]);

    expect(screen.getAllByRole("button")).toHaveLength(2);

    const card = screen.getByRole("button", { name: /Herbstturnier/ });
    expect(card).toHaveTextContent("Mo., 26. Okt. · 10:00 Uhr");
    expect(card).toHaveTextContent("Sportpark Nord, Feld 2");

    expect(screen.getByRole("button", { name: /Liga Süd/ })).toHaveTextContent(
      "14:30 Uhr",
    );
    expect(screen.getByText("2 Spieltage")).toBeInTheDocument();
  });

  it("offers cards as buttons and calls onSelect on click", async () => {
    const gameday = makeGameday();
    const { onSelect } = renderList([gameday]);

    const card = screen.getByRole("button", { name: /Herbstturnier/ });
    expect(card).toHaveAttribute("type", "button");

    await userEvent.click(card);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(gameday);
  });

  it("calls onSelect when the card is activated with Enter", async () => {
    const gameday = makeGameday();
    const { onSelect } = renderList([gameday]);

    const card = screen.getByRole("button", { name: /Herbstturnier/ });
    card.focus();
    expect(card).toHaveFocus();

    await userEvent.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith(gameday);
  });

  it("marks a running gameday as live", () => {
    renderList([makeGameday({ status: "IN_PROGRESS" })]);

    expect(screen.getByText("läuft")).toHaveClass("tag", "tag-live");
  });

  it("marks a completed gameday as done", () => {
    renderList([makeGameday({ status: "COMPLETED" })]);

    expect(screen.getByText("fertig")).toHaveClass("tag", "tag-done");
  });

  it("marks an unstarted gameday of today as open", () => {
    renderList([makeGameday()]);

    expect(screen.getByText("offen")).toHaveClass("tag", "tag-open");
  });

  it("renders an empty state when there are no gamedays", () => {
    renderList([]);

    expect(screen.getByText("Keine Spieltage für heute")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Nur Spieltage, an denen du eingeteilt bist, erscheinen hier.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("gamedayTag", () => {
  it.each([
    ["IN_PROGRESS", TODAY, "live", "läuft"],
    ["COMPLETED", TODAY, "done", "fertig"],
    ["PUBLISHED", TODAY, "open", "offen"],
    ["DRAFT", TODAY, "open", "offen"],
    ["PUBLISHED", "2026-10-27", "soon", "bald"],
  ] as const)(
    "maps %s on %s to %s",
    (status, date, variant, label) => {
      expect(gamedayTag(makeGameday({ status, date }), TODAY)).toEqual({
        variant,
        label,
      });
    },
  );
});

describe("formatGamedayDate", () => {
  it("formats an API date in German", () => {
    expect(formatGamedayDate("2026-10-26")).toBe("Mo., 26. Okt.");
  });

  it("passes an unexpected value through", () => {
    expect(formatGamedayDate("26.10.2026")).toBe("26.10.2026");
  });
});
