import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import VerificationSheet from "../VerificationSheet";

it("blocks saving below the minimum player strength", () => {
  render(
    <VerificationSheet
      teamName="Home"
      checkedCount={5}
      minimumStrength={11}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />
  );

  expect(screen.getByRole("alert")).toHaveTextContent("Mindestspielstärke");
  expect(
    screen.getByRole("button", { name: "Passliste speichern" })
  ).toBeDisabled();
});

it("blocks saving without an official name", async () => {
  const user = userEvent.setup();

  render(
    <VerificationSheet
      teamName="Home"
      checkedCount={14}
      minimumStrength={11}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />
  );

  const save = screen.getByRole("button", { name: "Passliste speichern" });
  expect(save).toBeDisabled();

  await user.type(screen.getByLabelText("Abgenommen durch"), "M. Weber");

  expect(save).toBeEnabled();
});

it("submits the official name and note", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();

  render(
    <VerificationSheet
      teamName="Home"
      checkedCount={14}
      minimumStrength={11}
      onSave={onSave}
      onClose={vi.fn()}
    />
  );

  await user.type(screen.getByLabelText("Abgenommen durch"), "  M. Weber ");
  await user.type(screen.getByLabelText("Anmerkungen"), "Equipment ok");
  await user.click(screen.getByRole("button", { name: "Passliste speichern" }));

  expect(onSave).toHaveBeenCalledWith("M. Weber", "Equipment ok");
});

it("shows server validation errors without closing", () => {
  render(
    <VerificationSheet
      teamName="Home"
      checkedCount={14}
      minimumStrength={11}
      errors={{
        "12": "Trikotnummer #7 ist bereits vergeben.",
        team: "Mindestspielstärke 11 nicht erreicht (0 geprüft).",
      }}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />
  );

  expect(
    screen.getByText("Trikotnummer #7 ist bereits vergeben.")
  ).toBeInTheDocument();
  expect(screen.getByText(/Mindestspielstärke 11/)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Passliste speichern" })
  ).toBeInTheDocument();
});

it("explains a device conflict", () => {
  render(
    <VerificationSheet
      teamName="Home"
      checkedCount={14}
      minimumStrength={11}
      conflict="Diese Passliste wird bereits auf einem anderen Gerät geführt."
      onSave={vi.fn()}
      onClose={vi.fn()}
    />
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "anderen Gerät geführt"
  );
});

it("blocks saving while the outbox still has entries", () => {
  render(
    <VerificationSheet
      teamName="Home"
      checkedCount={14}
      minimumStrength={11}
      pendingCount={2}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />
  );

  expect(screen.getByText(/2 Einträge warten/)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Passliste speichern" })
  ).toBeDisabled();
});
