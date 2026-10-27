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
  it("starts on auto with a German label and an icon", () => {
    const { container } = render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Design: automatisch" });

    expect(button).toHaveAttribute("title", "Design: automatisch");
    expect(button).toHaveTextContent("Auto");
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
    expect(
      screen.getByRole("button", { name: "Design: hell" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button")).toHaveTextContent("Hell");

    await user.click(screen.getByRole("button", { name: "Design: hell" }));
    expect(
      screen.getByRole("button", { name: "Design: dunkel" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button")).toHaveTextContent("Dunkel");

    await user.click(screen.getByRole("button", { name: "Design: dunkel" }));
    expect(
      screen.getByRole("button", { name: "Design: automatisch" }),
    ).toBeInTheDocument();
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
