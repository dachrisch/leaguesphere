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

function choice(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

describe("ThemeToggle", () => {
  it("is a labelled group with the three choices", () => {
    render(<ThemeToggle />);

    const group = screen.getByRole("group", { name: "Design" });
    expect(group).toBeInTheDocument();
    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["Auto", "Hell", "Dunkel"]);
  });

  it("marks the stored choice with aria-pressed", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    vi.stubGlobal("matchMedia", undefined);

    render(<ThemeToggle />);

    expect(choice("Dunkel")).toHaveAttribute("aria-pressed", "true");
    expect(choice("Auto")).toHaveAttribute("aria-pressed", "false");
    expect(choice("Hell")).toHaveAttribute("aria-pressed", "false");
  });

  it("persists and applies a click on Hell", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("matchMedia", undefined);
    render(<ThemeToggle />);

    await user.click(choice("Hell"));

    expect(choice("Hell")).toHaveAttribute("aria-pressed", "true");
    expect(choice("Auto")).toHaveAttribute("aria-pressed", "false");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    await user.click(choice("Dunkel"));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.click(choice("Auto"));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("auto");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
