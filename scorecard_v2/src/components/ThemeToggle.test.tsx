import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_STORAGE_KEY } from "../theme";
import ThemeToggle from "./ThemeToggle";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeChoice;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ThemeToggle", () => {
  it("is an icon-only control whose label names the chosen mode", () => {
    const { container } = render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Design: automatisch" });

    // The bar is tight at 360px: no visible word, but the name stays on the
    // control as accessible name and tooltip.
    expect(button.textContent).toBe("");
    expect(button).toHaveAttribute("title", "Design: automatisch");
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("cycles auto → light → dark → auto and persists each choice", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("matchMedia", undefined);
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Design: automatisch" }));
    let button = screen.getByRole("button", { name: "Design: hell" });
    expect(button).toHaveAttribute("title", "Design: hell");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    await user.click(button);
    button = screen.getByRole("button", { name: "Design: dunkel" });
    expect(button).toHaveAttribute("title", "Design: dunkel");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.click(button);
    expect(
      screen.getByRole("button", { name: "Design: automatisch" }),
    ).toHaveAttribute("title", "Design: automatisch");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("auto");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("starts from a stored dark choice", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    vi.stubGlobal("matchMedia", undefined);

    render(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: "Design: dunkel" }),
    ).toBeInTheDocument();
  });
});
