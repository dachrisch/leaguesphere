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

  it("keeps the bar to back, badge and the account menu", () => {
    const { container } = render(
      <AppHeader
        badge={<span>3 warten</span>}
        kicker="Scorecard"
        onBack={vi.fn()}
        onLogout={vi.fn()}
        title="Feld 2"
      />,
    );

    // The standalone theme button and the word "Abmelden" are gone.
    expect(
      screen.queryByRole("button", { name: "Design: automatisch" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Abmelden" })).toBeNull();

    const right = container.querySelector(".appbar-right") as HTMLElement;
    const order = [...right.children].map((child) => child.className);
    expect(order).toHaveLength(2);
    expect(order[0]).toContain("appbar-badge");
    expect(order[1]).toContain("account");
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

  it("opens the account menu with the identity and logout", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(
      <CurrentUserProvider user={{ id: 1, username: "scorecard-test" }}>
        <AppHeader
          kicker="Scorecard"
          onLogout={onLogout}
          title="Feld 2"
        />
      </CurrentUserProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Konto" });
    expect(
      trigger.querySelector(".avatar"),
    ).toHaveTextContent("ST");
    expect(trigger.querySelector(".avatar")).toHaveAttribute(
      "title",
      "Angemeldet als scorecard-test",
    );

    await user.click(trigger);

    const menu = screen.getByRole("dialog", { name: "Konto" });
    expect(menu).toHaveTextContent("Angemeldet als scorecard-test");
    expect(
      within(menu).getByRole("button", { name: "Auto" }),
    ).toBeInTheDocument();

    await user.click(within(menu).getByRole("button", { name: "Abmelden" }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("keeps the account trigger even without a signed-in user", () => {
    const { container } = render(
      <AppHeader kicker="Scorecard" title="Feld 2" />,
    );

    expect(screen.getByRole("button", { name: "Konto" })).toBeInTheDocument();
    expect(container.querySelector(".avatar svg")).not.toBeNull();
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
    // Only the account menu remains on the right.
    expect(container.querySelectorAll(".appbar-right > *")).toHaveLength(1);
  });

  it("passes the badge through the shared screen frame", async () => {
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
    const user = userEvent.setup();
    await user.click(within(header).getByRole("button", { name: "Konto" }));
    expect(
      within(header).getByRole("button", { name: "Auto" }),
    ).toBeInTheDocument();
  });
});
