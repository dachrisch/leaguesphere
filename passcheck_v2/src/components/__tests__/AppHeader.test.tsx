import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, vi } from "vitest";

import AppHeader from "../AppHeader";

it("renders the title, sub and badge", () => {
  render(
    <AppHeader
      kicker="Passcheck v2"
      title="Rhein Fire"
      sub="Spieltag 1"
      badge={<span>2 warten</span>}
    />
  );

  expect(screen.getByText("Passcheck v2")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Rhein Fire" })).toBeInTheDocument();
  expect(screen.getByText("Spieltag 1")).toBeInTheDocument();
  expect(screen.getByText("2 warten")).toBeInTheDocument();
});

it("fires back and logout", async () => {
  const user = userEvent.setup();
  const onBack = vi.fn();
  const onLogout = vi.fn();
  render(
    <AppHeader
      kicker="Passcheck v2"
      title="Rhein Fire"
      onBack={onBack}
      onLogout={onLogout}
    />
  );

  await user.click(screen.getByRole("button", { name: "Zurück" }));
  await user.click(screen.getByRole("button", { name: "Abmelden" }));

  expect(onBack).toHaveBeenCalled();
  expect(onLogout).toHaveBeenCalled();
});
