import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect } from "vitest";

import ThemeToggle from "../ThemeToggle";
import { THEME_STORAGE_KEY } from "../../theme";

beforeEach(() => {
  localStorage.clear();
});

it("cycles the theme and persists the choice", async () => {
  const user = userEvent.setup();
  render(<ThemeToggle />);

  expect(screen.getByRole("button", { name: "Design: Auto" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Design: Auto" }));
  expect(screen.getByRole("button", { name: "Design: Hell" })).toBeVisible();
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

  await user.click(screen.getByRole("button", { name: "Design: Hell" }));
  expect(screen.getByRole("button", { name: "Design: Dunkel" })).toBeVisible();
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
});
