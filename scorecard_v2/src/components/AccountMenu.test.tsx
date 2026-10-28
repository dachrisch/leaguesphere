import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CurrentUserProvider } from "../app/currentUser";
import { THEME_STORAGE_KEY } from "../theme";
import AccountMenu from "./AccountMenu";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeChoice;
});

function renderMenu(onLogout?: () => void, username: string | null = "scorecard-test") {
  const user =
    username === null ? null : { id: 1, username };
  render(
    <CurrentUserProvider user={user}>
      <AccountMenu onLogout={onLogout} />
    </CurrentUserProvider>,
  );
  return { trigger: screen.getByRole("button", { name: "Konto" }) };
}

describe("AccountMenu", () => {
  it("is a single account trigger with expanded state", () => {
    const { trigger } = renderMenu(vi.fn());

    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a labelled menu with the identity, the theme choices and logout", async () => {
    const user = userEvent.setup();
    const { trigger } = renderMenu(vi.fn());

    await user.click(trigger);

    const menu = screen.getByRole("dialog", { name: "Konto" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(menu).toHaveTextContent("Angemeldet als scorecard-test");
    expect(screen.getByRole("group", { name: "Design" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abmelden" })).toBeInTheDocument();
    // Focus moves into the menu, not onto the page behind it.
    await waitFor(() => expect(document.activeElement).toBe(menu));
  });

  it("closes on Escape and returns focus to the avatar", async () => {
    const user = userEvent.setup();
    const { trigger } = renderMenu(vi.fn());
    await user.click(trigger);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on a pointer down outside the menu", async () => {
    const user = userEvent.setup();
    const { trigger } = renderMenu(vi.fn());
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(document.body);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the menu open while switching the theme", async () => {
    const user = userEvent.setup();
    const { trigger } = renderMenu(vi.fn());
    await user.click(trigger);

    await user.click(screen.getByRole("button", { name: "Hell" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Hell" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("logs out from the menu and closes it", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    const { trigger } = renderMenu(onLogout);
    await user.click(trigger);

    await user.click(screen.getByRole("button", { name: "Abmelden" }));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers no logout where the flow has none", async () => {
    const user = userEvent.setup();
    const { trigger } = renderMenu(undefined);
    await user.click(trigger);

    expect(screen.queryByRole("button", { name: "Abmelden" })).toBeNull();
    expect(screen.getByRole("group", { name: "Design" })).toBeInTheDocument();
  });

  it("stays reachable without a user and says so", async () => {
    const user = userEvent.setup();
    const { trigger } = renderMenu(vi.fn(), null);
    expect(trigger.querySelector(".avatar svg")).not.toBeNull();

    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Konto" })).toHaveTextContent(
      "Nicht angemeldet",
    );
  });
});
