import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CurrentUserProvider } from "../app/currentUser";
import AppHeader from "./AppHeader";
import Screen from "./Screen";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeChoice;
});

describe("AppHeader", () => {
  it("renders the kicker, the title and the context line", () => {
    render(
      <AppHeader kicker="Scorecard" sub="Herbsttag · Landesliga" title="Feld 2" />,
    );

    expect(screen.getByText("Scorecard")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Feld 2", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Herbsttag · Landesliga")).toBeInTheDocument();
  });

  it("keeps the theme switch in the bar on a screen without any action", () => {
    render(<AppHeader kicker="Scorecard" title="Feld 2" />);

    expect(
      screen.getByRole("button", { name: "Design: automatisch" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zurück" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Abmelden" })).toBeNull();
  });

  it("makes back icon-only but keeps its name and tooltip", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<AppHeader kicker="Scorecard" onBack={onBack} title="Feld 2" />);

    const back = screen.getByRole("button", { name: "Zurück" });
    expect(back.textContent).toBe("");
    expect(back).toHaveAttribute("title", "Zurück");

    await user.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("keeps Abmelden as a word next to the icon-only controls", async () => {
    const onLogout = vi.fn();
    const user = userEvent.setup();
    render(<AppHeader kicker="Scorecard" onLogout={onLogout} title="Feld 2" />);

    const logout = screen.getByRole("button", { name: "Abmelden" });
    expect(logout).toHaveTextContent("Abmelden");

    await user.click(logout);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("puts the badge in the bar, before theme and logout", () => {
    const { container } = render(
      <AppHeader
        badge={<span>3 warten</span>}
        kicker="Scorecard"
        onBack={vi.fn()}
        onLogout={vi.fn()}
        title="Feld 2"
      />,
    );

    const bar = container.querySelector(".appbar-right");
    expect(bar).not.toBeNull();
    const slot = container.querySelector(".appbar-badge");
    expect(slot).toContainElement(screen.getByText("3 warten"));

    // Badge → theme → logout: the chip never pushes the actions apart.
    const order = [...(bar as HTMLElement).children].map(
      (child) => child.className,
    );
    expect(order).toHaveLength(3);
    expect(order[0]).toContain("appbar-badge");
    expect(order[1]).toContain("theme-toggle");
    expect(order[2]).toContain("appbar-logout");
  });

  it("puts the avatar between the badge and the theme switch", () => {
    const { container } = render(
      <CurrentUserProvider user={{ id: 1, username: "scorecard-test" }}>
        <AppHeader
          badge={<span>3 warten</span>}
          kicker="Scorecard"
          onBack={vi.fn()}
          onLogout={vi.fn()}
          title="Feld 2"
        />
      </CurrentUserProvider>,
    );

    const bar = container.querySelector(".appbar-right");
    const order = [...(bar as HTMLElement).children].map(
      (child) => child.className,
    );
    expect(order).toHaveLength(4);
    expect(order[0]).toContain("appbar-badge");
    expect(order[1]).toContain("avatar");
    expect(order[2]).toContain("theme-toggle");
    expect(order[3]).toContain("appbar-logout");
    expect(
      screen.getByRole("img", { name: "Angemeldet als scorecard-test" }),
    ).toHaveTextContent("ST");
  });

  it("leaves the avatar out when no user is signed in", () => {
    const { container } = render(
      <AppHeader kicker="Scorecard" title="Feld 2" />,
    );

    expect(container.querySelector(".avatar")).toBeNull();
  });

  it("puts the LeagueSphere wordmark before the screen kicker", () => {
    const { container } = render(
      <AppHeader kicker="Scorecard" title="Feld 2" />,
    );

    const meta = container.querySelector(".app-meta");
    expect(meta).not.toBeNull();
    expect(
      within(meta as HTMLElement).getByText("LeagueSphere"),
    ).toBeInTheDocument();
    expect(
      within(meta as HTMLElement).getByText("Scorecard"),
    ).toBeInTheDocument();
    expect(meta?.querySelector(".wordmark-icon")).not.toBeNull();

    // Wordmark · kicker, in that order.
    const order = [...(meta as HTMLElement).children].map(
      (child) => child.className,
    );
    expect(order).toEqual(["wordmark", "wordmark-sep", "kicker"]);
  });

  it("keeps the bar on the steel band and the title on the page surface", () => {
    const { container } = render(
      <AppHeader kicker="Scorecard" title="Feld 2" />,
    );

    const header = container.querySelector(".app-header");
    const bar = container.querySelector(".appbar") as HTMLElement;
    const heading = within(header as HTMLElement).getByRole("heading", {
      level: 1,
    });

    // The bar is the band; kicker and title are siblings below it, on the page.
    expect(header).toContainElement(bar);
    expect(bar).not.toContainElement(heading);
    expect(bar).not.toContainElement(
      container.querySelector(".kicker") as HTMLElement,
    );
  });

  it("pins the footer below the scroll content", () => {
    const { container } = render(
      <Screen kicker="Scorecard" title="Feld 2">
        <p>Inhalt</p>
      </Screen>,
    );

    const main = container.querySelector("main.vscroll") as HTMLElement;
    const footer = container.querySelector(".app-footer");
    expect([...main.children].map((child) => child.tagName)).toEqual(["P"]);
    expect(main.nextElementSibling).toBe(footer);
    expect(footer?.parentElement?.classList.contains("app-shell")).toBe(true);
  });

  it("omits the badge slot when the screen has nothing to report", () => {
    const { container } = render(
      <AppHeader kicker="Scorecard" title="Feld 2" />,
    );

    expect(container.querySelector(".appbar-badge")).toBeNull();
    expect(container.querySelectorAll(".appbar-right > *")).toHaveLength(1);
  });

  it("passes the badge through the shared screen frame", () => {
    render(
      <Screen
        badge={<span>Offline · 2</span>}
        kicker="Scorecard"
        onLogout={vi.fn()}
        title="Feld 2"
      >
        <p>Inhalt</p>
      </Screen>,
    );

    const header = screen.getByRole("banner");
    expect(within(header).getByText("Offline · 2")).toBeInTheDocument();
    expect(
      within(header).getByRole("button", { name: "Design: automatisch" }),
    ).toBeInTheDocument();
  });
});
