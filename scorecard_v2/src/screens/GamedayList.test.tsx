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
    league_display: "Landesliga",
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
  props: { today?: string } = {},
) {
  const onSelect = vi.fn();
  render(
    <GamedayList
      gamedays={gamedays}
      onSelect={onSelect}
      today={props.today ?? TODAY}
    />,
  );
  return { onSelect };
}

describe("GamedayList", () => {
  it("shows the screen header with today's date", () => {
    renderList([makeGameday()]);

    expect(screen.getByText("Scorecard")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Meine Spieltage" }),
    ).toBeInTheDocument();

    const sub = screen.getByText(/^Heute ·/);
    expect(sub).toHaveTextContent("26");
    expect(sub).toHaveTextContent("Okt");
  });

  it("formats the given today instead of the first gameday's date", () => {
    renderList([makeGameday(), makeGameday({ id: 2, date: "2026-10-27" })], {
      today: "2026-11-02",
    });

    const sub = screen.getByText(/^Heute ·/);
    expect(sub).toHaveTextContent("Nov");
    expect(sub).not.toHaveTextContent("Okt");
  });

  it("renders name, date, start, league and address of every gameday", () => {
    renderList([
      makeGameday(),
      makeGameday({ id: 2, name: "Liga Süd", start: "14:30" }),
    ]);

    expect(screen.getAllByRole("button")).toHaveLength(2);

    const card = screen.getByRole("button", { name: /Herbstturnier/ });
    expect(card).toHaveTextContent("26");
    expect(card).toHaveTextContent("Okt");
    expect(card).toHaveTextContent("10:00 Uhr");
    expect(card).toHaveTextContent("Landesliga");
    expect(card).toHaveTextContent("Sportpark Nord, Feld 2");

    expect(screen.getByRole("button", { name: /Liga Süd/ })).toHaveTextContent(
      "14:30 Uhr",
    );
    expect(screen.getByText("2 Spieltage")).toBeInTheDocument();
  });

  it("hides the address row when the gameday has no address", () => {
    renderList([makeGameday({ address: "" })]);

    const card = screen.getByRole("button", { name: /Herbstturnier/ });
    expect(card.querySelector(".day-address")).toBeNull();
    expect(card).toHaveTextContent("Landesliga");
  });

  it("offers cards as buttons and calls onSelect with the clicked gameday", async () => {
    const first = makeGameday();
    const second = makeGameday({ id: 2, name: "Liga Süd" });
    const { onSelect } = renderList([first, second]);

    const card = screen.getByRole("button", { name: /Herbstturnier/ });
    expect(card).toHaveAttribute("type", "button");

    await userEvent.click(card);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(first);
  });

  it("passes the second card's gameday when it is clicked", async () => {
    const first = makeGameday();
    const second = makeGameday({ id: 2, name: "Liga Süd" });
    const { onSelect } = renderList([first, second]);

    await userEvent.click(screen.getByRole("button", { name: /Liga Süd/ }));

    expect(onSelect).toHaveBeenCalledWith(second);
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

  it.each([
    ["IN_PROGRESS", TODAY, "läuft"],
    ["COMPLETED", TODAY, "beendet"],
    ["PUBLISHED", TODAY, "offen"],
    ["PUBLISHED", "2026-10-27", "bald"],
  ] as const)(
    "shows the %s tag label for %s",
    (status, date, label) => {
      renderList([makeGameday({ status, date })], { today: TODAY });

      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it("renders an empty state when there are no gamedays", () => {
    renderList([]);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Keine Spieltage für heute");
    expect(status).toHaveTextContent(
      "Nur Spieltage, an denen du eingeteilt bist, erscheinen hier.",
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Keine Spieltage für heute" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("gamedayTag", () => {
  it.each([
    ["IN_PROGRESS", TODAY, "live", "läuft"],
    ["COMPLETED", TODAY, "done", "beendet"],
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
    const formatted = formatGamedayDate("2026-10-26");
    expect(formatted).toContain("26");
    expect(formatted).toContain("Okt");
  });

  it("falls back to the raw value for an impossible calendar date", () => {
    expect(formatGamedayDate("2026-02-31")).toBe("2026-02-31");
    expect(formatGamedayDate("2026-13-01")).toBe("2026-13-01");
  });

  it("passes an unexpected value through", () => {
    expect(formatGamedayDate("26.10.2026")).toBe("26.10.2026");
  });
});
