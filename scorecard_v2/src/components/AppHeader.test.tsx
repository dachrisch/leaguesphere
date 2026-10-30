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
  it("renders the title and the context line", () => {
    render(
      <AppHeader sub="Herbsttag · Landesliga" title="Feld 2" />,
    );

    expect(
      screen.getByRole("heading", { name: "Feld 2", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Herbsttag · Landesliga")).toBeInTheDocument();
  });

  it("keeps the bar to back, badge and the account menu", () => {
    const { container } = render(
      <AppHeader
        badge={<span>3 warten</span>}
       
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
    render(<AppHeader onBack={onBack} title="Feld 2" />);

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
      <AppHeader title="Feld 2" />,
    );

    expect(screen.getByRole("button", { name: "Konto" })).toBeInTheDocument();
    expect(container.querySelector(".avatar svg")).not.toBeNull();
  });

  it("is a single bar: no brand line above the title", () => {
    const { container } = render(<AppHeader title="Feld 2" />);

    expect(container.querySelector(".app-meta")).toBeNull();
    expect(screen.queryByText("LeagueSphere")).toBeNull();
  });

  it("puts the title and context line inside the bar, between back and account", () => {
    const { container } = render(
      <AppHeader onBack={vi.fn()} sub="Herbsttag" title="Feld 2" />,
    );

    const bar = container.querySelector(".appbar") as HTMLElement;
    const heading = screen.getByRole("heading", { name: "Feld 2", level: 1 });
    expect(bar).toContainElement(heading);
    expect(bar).toContainElement(screen.getByText("Herbsttag"));
    const order = [...bar.children].map((child) => child.className);
    expect(order).toEqual(["appbar-left", "appbar-title", "appbar-right"]);
  });

  it("leaves the screen without a footer; the legal links live in the account menu", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Screen title="Feld 2">
        <p>Inhalt</p>
      </Screen>,
    );

    expect(container.querySelector(".app-footer")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Konto" }));
    const menu = screen.getByRole("dialog", { name: "Konto" });
    expect(within(menu).getByRole("link", { name: "Impressum" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Datenschutz" })).toBeInTheDocument();
  });

  it("omits the badge slot when the screen has nothing to report", () => {
    const { container } = render(
      <AppHeader title="Feld 2" />,
    );

    expect(container.querySelector(".appbar-badge")).toBeNull();
    // Only the account menu remains on the right.
    expect(container.querySelectorAll(".appbar-right > *")).toHaveLength(1);
  });

  it("passes the badge through the shared screen frame", async () => {
    render(
      <Screen
        badge={<span>Offline · 2</span>}
       
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
